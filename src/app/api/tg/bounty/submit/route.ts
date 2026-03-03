// === START: FILE_src/app/api/tg/bounty/submit/route.ts ===
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function required(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const BOT_TOKEN = required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

function verifyInitData(initData: string) {
  const data = parseInitData(initData);
  const receivedHash = data.hash;
  if (!receivedHash) return { ok: false as const, reason: "missing hash" };

  const pairs: string[] = [];
  Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${data[k]}`));

  const checkString = pairs.join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  if (computedHash !== receivedHash) return { ok: false as const, reason: "bad hash" };

  let user: any = null;
  try {
    user = data.user ? JSON.parse(data.user) : null;
  } catch {
    user = null;
  }

  return { ok: true as const, data, user };
}

function pickInitDataFromReq(req: Request, body: any) {
  const h = req.headers;
  const candidates = [
    h.get("x-tg-initdata"),
    h.get("x-tg-init-data"),
    h.get("x-telegram-initdata"),
    h.get("x-telegram-init-data"),
    body?.initData,
    body?.init_data,
    body?.initDataRaw,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  return candidates[0] || "";
}

// ---- Gating helpers ----
function normTier(t?: string | null) {
  const v = (t || "").toString().trim().toLowerCase();
  return v || null;
}
function tierRank(t?: string | null) {
  const v = normTier(t);
  const order = ["bronze", "silver", "gold", "platinum", "diamond"];
  const idx = v ? order.indexOf(v) : -1;
  return idx >= 0 ? idx : -1;
}
function tierMeets(userTier?: string | null, minTier?: string | null) {
  const m = tierRank(minTier);
  if (m < 0) return true;
  const u = tierRank(userTier);
  if (u < 0) return false;
  return u >= m;
}
function asMs(d: any): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

// ---- Questions / schema validation ----
type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

function extractQuestions(application_schema: any): AppQuestion[] {
  if (Array.isArray(application_schema)) return application_schema as AppQuestion[];
  if (application_schema && Array.isArray(application_schema.questions)) return application_schema.questions as AppQuestion[];
  return [];
}

function cleanString(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function validateAnswers(questions: AppQuestion[], answers: Record<string, any>) {
  const cleaned: Record<string, string> = {};

  // only accept keys that exist in schema
  const byId = new Map<string, AppQuestion>();
  for (const q of questions) byId.set(q.id, q);

  for (const q of questions) {
    const raw = answers?.[q.id];
    const v = cleanString(raw);
    const required = q.required !== false;

    if (required && !v) throw new Error(`Please answer: ${q.label}`);

    if (typeof (q as any).maxLen === "number" && v.length > (q as any).maxLen) {
      throw new Error(`Too long: ${q.label} (max ${(q as any).maxLen})`);
    }

    if (q.type === "select" && v) {
      const opts = Array.isArray(q.options) ? q.options : [];
      if (!opts.includes(v)) throw new Error(`Invalid option for: ${q.label}`);
    }

    cleaned[q.id] = v;
  }

  // If client sent unknown keys, ignore them silently (prevents schema drift issues)
  return cleaned;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sid = String(body?.sid || "").trim();
    const answers = (body?.answers || {}) as Record<string, any>;

    if (!sid) return NextResponse.json({ ok: false, error: "missing sid" }, { status: 400 });
    if (!answers || typeof answers !== "object")
      return NextResponse.json({ ok: false, error: "missing answers" }, { status: 400 });

    const initData = pickInitDataFromReq(req, body);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    // Load session, ensure belongs to this telegram user and is bounty kind
    const { data: session, error: sErr } = await supabaseAdmin
      .from("form_sessions")
      .select("sid, kind, bounty_id, telegram_user_id, wallet, tier, fairscore, used_at, created_at, expires_at")
      .eq("sid", sid)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!session?.sid) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    if (String((session as any).kind || "") !== "bounty")
      return NextResponse.json({ ok: false, error: "not a bounty session" }, { status: 400 });
    if (Number((session as any).telegram_user_id) !== telegram_user_id)
      return NextResponse.json({ ok: false, error: "session does not belong to this user" }, { status: 403 });
    if ((session as any).used_at) return NextResponse.json({ ok: false, error: "session already submitted" }, { status: 409 });

    // Optional: expire sessions (if you have expires_at)
    const expMs = asMs((session as any).expires_at);
    if (expMs !== null && Date.now() > expMs) {
      return NextResponse.json({ ok: false, error: "session expired — please apply again" }, { status: 410 });
    }

    const bounty_id = String((session as any).bounty_id || "").trim();
    if (!bounty_id) return NextResponse.json({ ok: false, error: "session missing bounty_id" }, { status: 500 });

    // Load bounty schema for validation + server-side gating at submit time
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, published, status, starts_at, ends_at, min_tier, application_schema")
      .eq("id", bounty_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });
    if (bounty.published === false) return NextResponse.json({ ok: false, error: "bounty not published" }, { status: 403 });

    const status = String((bounty as any)?.status || "open").toLowerCase();
    if (status !== "open") {
      return NextResponse.json(
        { ok: false, error: status === "paused" ? "bounty paused" : "bounty closed" },
        { status: 403 }
      );
    }

    const now = Date.now();
    const startsMs = asMs((bounty as any)?.starts_at);
    const endsMs = asMs((bounty as any)?.ends_at);
    if (startsMs !== null && now < startsMs) return NextResponse.json({ ok: false, error: "bounty not started yet" }, { status: 403 });
    if (endsMs !== null && now > endsMs) return NextResponse.json({ ok: false, error: "bounty ended" }, { status: 403 });

    const tier = normTier((session as any)?.tier || null);
    if (!tier) return NextResponse.json({ ok: false, error: "tier missing — apply again" }, { status: 403 });

    if (!tierMeets(tier, (bounty as any)?.min_tier || null)) {
      return NextResponse.json(
        { ok: false, error: `tier too low (requires ${String((bounty as any)?.min_tier || "").toLowerCase()})` },
        { status: 403 }
      );
    }

    const fairscore =
      typeof (session as any)?.fairscore === "number"
        ? (session as any).fairscore
        : (session as any)?.fairscore
          ? Number((session as any).fairscore)
          : null;

    // If you want score gating: require non-null (or add a threshold)
    if (fairscore === null || !Number.isFinite(fairscore)) {
      return NextResponse.json({ ok: false, error: "score missing — run Check and apply again" }, { status: 403 });
    }

    // Validate answers against schema
    const questions = extractQuestions((bounty as any)?.application_schema);
    const cleanedAnswers = validateAnswers(questions, answers);

    // Insert application (dedupe if unique constraint exists)
    const insertPayload = {
      bounty_id,
      telegram_user_id,
      wallet: (session as any).wallet ?? null,
      tier: (session as any).tier ?? null,
      fairscore: (session as any).fairscore ?? null,
      answers: cleanedAnswers,
      created_at: new Date().toISOString(),
    };

    const { error: iErr } = await supabaseAdmin.from("bounty_applications").insert(insertPayload as any);

    // If unique constraint exists, Supabase returns an error; convert to clean message
    if (iErr) {
      const msg = (iErr.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")) {
        await supabaseAdmin.from("form_sessions").update({ used_at: new Date().toISOString() } as any).eq("sid", sid);
        return NextResponse.json({ ok: false, error: "already applied to this bounty" }, { status: 409 });
      }
      throw new Error(iErr.message);
    }

    // Mark session used
    const { error: uErr } = await supabaseAdmin
      .from("form_sessions")
      .update({ used_at: new Date().toISOString() } as any)
      .eq("sid", sid);

    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({ ok: true, message: "✅ Bounty application submitted" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "bounty submit error" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/bounty/submit/route.ts ===