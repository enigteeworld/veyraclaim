import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { shortCode } from "@/lib/telegram";

export const runtime = "nodejs";

/**
 * Admin create campaign (PERMANENTLY STABLE)
 * - Does NOT require "code" from client (server generates it)
 * - Accepts title OR name
 * - Auth:
 *    1) sid (app_sessions.kind="admin")   ✅ most reliable
 *    2) initData (Telegram WebApp)        ✅ verified locally (NO internal fetch)
 * - Requires recent /admin unlock (bot_events.kind="admin_start")
 */

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** Telegram initData verification (LOCAL, no network calls) */
function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return { hash, dataCheckString, params };
}

function verifyTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) return { ok: false as const, error: "Missing TELEGRAM_BOT_TOKEN" };

  const { hash, dataCheckString, params } = parseInitData(initData);
  if (!hash || !dataCheckString) return { ok: false as const, error: "Missing initData hash" };

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computed !== hash) return { ok: false as const, error: "Invalid initData signature" };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false as const, error: "Missing user in initData" };

  let user: any = null;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return { ok: false as const, error: "Invalid user JSON in initData" };
  }

  return { ok: true as const, user };
}

async function requireRecentAdminUnlock(telegram_user_id: number) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15min

  const { data, error } = await supabaseAdmin
    .from("bot_events")
    .select("id,created_at")
    .eq("telegram_user_id", telegram_user_id)
    .eq("kind", "admin_start")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Admin not unlocked. Run /admin veyra_admin_2026 in the bot, then open Admin Panel again.");
  }
}

function safeType(t: string): "drop" | "allowlist" | "ambassador" {
  const x = (t || "").toLowerCase();
  if (x === "drop") return "drop";
  if (x === "allowlist") return "allowlist";
  return "ambassador";
}

function safeTier(t: string): "bronze" | "silver" | "gold" {
  const x = (t || "").toLowerCase();
  if (x === "silver") return "silver";
  if (x === "gold") return "gold";
  return "bronze";
}

function safeFieldType(t: string): "text" | "textarea" | "select" {
  const x = (t || "").toLowerCase();
  if (x === "textarea") return "textarea";
  if (x === "select") return "select";
  return "text";
}

function slugKey(input: string) {
  const s = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return s || `q_${crypto.randomUUID().slice(0, 8)}`;
}

async function ensureTelegramUser(telegram_user_id: number, user?: any) {
  // campaigns.created_by_telegram_user_id has FK -> telegram_users
  await supabaseAdmin.from("telegram_users").upsert(
    {
      telegram_user_id,
      username: user?.username || null,
      first_name: user?.first_name || null,
      last_name: user?.last_name || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
}

async function getOrCreateDefaultProject() {
  const DEFAULT_PROJECT_NAME = process.env.VEYRA_DEFAULT_PROJECT || "Veyra";

  const { data: existing, error: selErr } = await supabaseAdmin
    .from("projects")
    .select("id,name")
    .eq("name", DEFAULT_PROJECT_NAME)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (existing?.id) return existing.id as string;

  const { data: created, error: insErr } = await supabaseAdmin
    .from("projects")
    .insert({ name: DEFAULT_PROJECT_NAME })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  return created.id as string;
}

async function ensureProjectAdmin(project_id: string, telegram_user_id: number) {
  const { error } = await supabaseAdmin.from("project_admins").upsert(
    {
      project_id,
      telegram_user_id,
      created_at: new Date().toISOString(),
    },
    { onConflict: "project_id,telegram_user_id" }
  );

  if (error) throw new Error(error.message);
}

/**
 * Validate admin session by sid (app_sessions.kind="admin")
 * IMPORTANT: only query if sid is a UUID (prevents "invalid input syntax for type uuid")
 */
async function requireAdminSessionSid(sid: string) {
  if (!sid) throw new Error("Missing sid");
  if (!isUuid(sid)) throw new Error("Invalid sid. Run /admin again and reopen Admin Panel.");

  const { data: sess, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id,telegram_user_id,kind,expires_at")
    .eq("id", sid)
    .eq("kind", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!sess) throw new Error("Admin session not found. Run /admin again.");

  if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) {
    throw new Error("Admin session expired. Run /admin again.");
  }

  const telegram_user_id = Number(sess.telegram_user_id);
  if (!telegram_user_id) throw new Error("Admin session missing telegram_user_id");

  return { telegram_user_id };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const sidRaw = String(body?.sid || "").trim();
    const sid = sidRaw && isUuid(sidRaw) ? sidRaw : ""; // ✅ ignore stateless_admin / garbage safely

    const initData = String(req.headers.get("x-tg-initdata") || body?.initData || "").trim();

    // Auth preference:
    // 1) sid (best)
    // 2) initData (verified locally)
    let telegram_user_id: number | null = null;
    let tgUser: any = null;

    if (sid) {
      const s = await requireAdminSessionSid(sid);
      telegram_user_id = s.telegram_user_id;

      // optional extra protection: if initData exists, it must match same user
      if (initData) {
        const v = verifyTelegramInitData(initData);
        if (!v.ok) throw new Error(v.error);
        const id2 = Number(v.user?.id);
        if (!id2) throw new Error("No telegram user id in initData");
        if (Number(id2) !== Number(telegram_user_id)) throw new Error("Session user mismatch");
        tgUser = v.user;
      }
    } else if (initData) {
      const v = verifyTelegramInitData(initData);
      if (!v.ok) throw new Error(v.error);
      telegram_user_id = Number(v.user?.id);
      if (!telegram_user_id) throw new Error("No telegram user id in initData");
      tgUser = v.user;
    } else {
      return NextResponse.json({ ok: false, error: "Missing sid or initData" }, { status: 400 });
    }

    if (!telegram_user_id) {
      return NextResponse.json({ ok: false, error: "telegram_user_id is required" }, { status: 401 });
    }

    await ensureTelegramUser(telegram_user_id, tgUser);
    await requireRecentAdminUnlock(telegram_user_id);

    const type = safeType(String(body?.type || ""));
    const title = String(body?.title || body?.name || "").trim().slice(0, 80); // ✅ title OR name
    const description = body?.description ? String(body.description).trim().slice(0, 240) : null;
    const min_tier = safeTier(String(body?.min_tier || "bronze"));

    const max_slots =
      body?.max_slots === null || body?.max_slots === undefined || String(body?.max_slots).trim() === ""
        ? null
        : Number(body.max_slots);

    const rawQuestions = Array.isArray(body?.questions) ? body.questions : [];

    if (!title) return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 });
    if (max_slots !== null && (!Number.isFinite(max_slots) || max_slots <= 0)) {
      return NextResponse.json({ ok: false, error: "Invalid max_slots" }, { status: 400 });
    }

    const project_id = await getOrCreateDefaultProject();
    await ensureProjectAdmin(project_id, telegram_user_id);

    // ✅ Generate campaign code server-side
    const code = shortCode(type === "ambassador" ? "AMB" : type === "allowlist" ? "ALW" : "DRP");

    // 1) Create campaign
    const { data: created, error: createErr } = await supabaseAdmin
      .from("campaigns")
      .insert({
        code,
        type,
        title,
        description,
        min_tier,
        max_slots: max_slots ? Math.floor(max_slots) : null,
        starts_at: new Date().toISOString(),
        ends_at: null,
        created_by_telegram_user_id: telegram_user_id,
        project_id,
      })
      .select("id,code,type,project_id")
      .single();

    if (createErr || !created) {
      return NextResponse.json({ ok: false, error: createErr?.message || "Failed to create campaign" }, { status: 500 });
    }

    // 2) Store custom questions ONLY for ambassador campaigns
    if (type === "ambassador" && rawQuestions.length) {
      const rows = rawQuestions
        .slice(0, 25)
        .map((q: any, idx: number) => {
          const label = String(q?.label || "").trim().slice(0, 120);
          if (!label) return null;

          const field_type = safeFieldType(String(q?.field_type || q?.type || "text"));
          const key = slugKey(String(q?.key || label));
          const required = q?.required === false ? false : true;

          let help_text: string | null = null;
          if (q?.help_text) help_text = String(q.help_text).trim().slice(0, 200);
          else if (q?.placeholder) help_text = String(q.placeholder).trim().slice(0, 200);

          let options: any = null;
          if (field_type === "select") {
            const raw = Array.isArray(q?.options) ? q.options : [];
            const cleaned = raw.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 20);
            options = cleaned.length ? cleaned : ["Option 1", "Option 2"];
          }

          const sort_order = Number.isFinite(Number(q?.sort_order)) ? Number(q.sort_order) : idx * 10;

          return {
            campaign_id: created.id,
            key,
            label,
            help_text,
            field_type,
            required,
            options,
            sort_order,
            created_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (rows.length) {
        const { error: qErr } = await supabaseAdmin.from("campaign_questions").insert(rows as any[]);
        if (qErr) {
          return NextResponse.json(
            {
              ok: false,
              error: `Campaign created but questions failed: ${qErr.message}`,
              data: { id: created.id, code: created.code, type: created.type },
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, data: { id: created.id, code: created.code, type: created.type } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
