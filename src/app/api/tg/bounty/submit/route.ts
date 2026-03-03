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
function withinWindow(starts_at?: string | null, ends_at?: string | null) {
  const n = Date.now();
  if (starts_at) {
    const s = new Date(starts_at).getTime();
    if (!Number.isNaN(s) && n < s) return { ok: false as const, reason: "not started yet" };
  }
  if (ends_at) {
    const e = new Date(ends_at).getTime();
    if (!Number.isNaN(e) && n > e) return { ok: false as const, reason: "ended" };
  }
  return { ok: true as const };
}

type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

function extractQuestions(application_schema: any): AppQuestion[] {
  if (Array.isArray(application_schema)) return application_schema as AppQuestion[];
  if (application_schema && Array.isArray(application_schema.questions)) return application_schema.questions as AppQuestion[];
  return [];
}

function validateAnswers(qs: AppQuestion[], answers: Record<string, any>) {
  const out: Record<string, string> = {};

  for (const q of qs) {
    const id = String(q?.id || "").trim();
    if (!id) throw new Error("invalid question schema (missing id)");

    const required = q.required !== false;
    const raw = answers?.[id];

    const val = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw).trim();

    if (required && !val) throw new Error(`missing answer: ${q.label || id}`);

    if (typeof (q as any).maxLen === "number" && val.length > (q as any).maxLen) {
      throw new Error(`too long: ${q.label || id} (max ${(q as any).maxLen})`);
    }

    if (q.type === "select" && val) {
      const opts = Array.isArray(q.options) ? q.options.map(String) : [];
      if (!opts.includes(val)) throw new Error(`invalid option for: ${q.label || id}`);
    }

    // Only store known keys (prevents junk payload spam)
    out[id] = val;
  }

  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sid = String(body?.sid || "").trim();
    const answersIn = (body?.answers || {}) as Record<string, any>;

    if (!sid) return NextResponse.json({ ok: false, error: "missing sid" }, { status: 400 });
    if (!answersIn || typeof answersIn !== "object") return NextResponse.json({ ok: false, error: "missing answers" }, { status: 400 });

    const initData = pickInitDataFromReq(req, body);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    // Load session, ensure belongs to this telegram user and is bounty kind
    const { data: session, error: sErr } = await supabaseAdmin
      .from("form_sessions")
      .select("sid, kind, bounty_id, telegram_user_id, wallet, tier, fairscore, used_at, created_at")
      .eq("sid", sid)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!session?.sid) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    if (String((session as any).kind || "") !== "bounty") return NextResponse.json({ ok: false, error: "not a bounty session" }, { status: 400 });
    if (Number((session as any).telegram_user_id) !== telegram_user_id)
      return NextResponse.json({ ok: false, error: "session does not belong to this user" }, { status: 403 });
    if ((session as any).used_at) return NextResponse.json({ ok: false, error: "session already submitted" }, { status: 409 });

    const bounty_id = String((session as any).bounty_id || "").trim();
    if (!bounty_id) return NextResponse.json({ ok: false, error: "session missing bounty_id" }, { status: 500 });

    // Re-check bounty (server-side gating at submit time too)
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, published, status, starts_at, ends_at, min_tier, application_schema")
      .eq("id", bounty_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });
    if ((bounty as any).published === false) return NextResponse.json({ ok: false, error: "bounty not published" }, { status: 403 });

    const bountyStatus = String((bounty as any)?.status || "open").toLowerCase();
    if (bountyStatus !== "open") {
      return NextResponse.json({ ok: false, error: bountyStatus === "paused" ? "bounty paused" : "bounty closed" }, { status: 403 });
    }
    const w = withinWindow((bounty as any)?.starts_at ?? null, (bounty as any)?.ends_at ?? null);
    if (!w.ok) return NextResponse.json({ ok: false, error: w.reason }, { status: 403 });

    // Re-check user state from telegram_users (prevents stale session bypass)
    const { data: tu, error: tuErr } = await supabaseAdmin
      .from("telegram_users")
      .select("telegram_user_id, saved_wallet, last_known_tier, last_known_fairscore")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (tuErr) throw new Error(tuErr.message);

    const wallet = String((tu as any)?.saved_wallet || "").trim();
    const tier = normTier((tu as any)?.last_known_tier) || null;
    const fairscore =
      typeof (tu as any)?.last_known_fairscore === "number"
        ? (tu as any).last_known_fairscore
        : (tu as any)?.last_known_fairscore
          ? Number((tu as any).last_known_fairscore)
          : null;

    if (!wallet) return NextResponse.json({ ok: false, error: "no verified wallet (verify in bot first)" }, { status: 403 });
    if (!tier) return NextResponse.json({ ok: false, error: "tier not loaded yet (run Check once)" }, { status: 403 });
    if (!Number.isFinite(fairscore as any)) return NextResponse.json({ ok: false, error: "score not loaded yet (run Check once)" }, { status: 403 });

    const minTier = (bounty as any)?.min_tier ?? null;
    if (!tierMeets(tier, minTier)) {
      return NextResponse.json(
        { ok: false, error: `tier too low (requires ${String(minTier || "").toLowerCase()})` },
        { status: 403 }
      );
    }

    // Validate answers against schema (required/maxLen/select options)
    const questions = extractQuestions((bounty as any)?.application_schema);
    const answers = validateAnswers(questions, answersIn);

    // Insert application (dedupe if unique constraint exists)
    const insertPayload = {
      bounty_id,
      telegram_user_id,
      wallet,
      tier,
      fairscore,
      answers,
      created_at: new Date().toISOString(),
    };

    const { error: iErr } = await supabaseAdmin.from("bounty_applications").insert(insertPayload as any);

    if (iErr) {
      const msg = (iErr.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")) {
        await supabaseAdmin.from("form_sessions").update({ used_at: new Date().toISOString() } as any).eq("sid", sid);
        return NextResponse.json({ ok: false, error: "already applied to this bounty" }, { status: 409 });
      }
      throw new Error(iErr.message);
    }

    // Mark session used
    const { error: uErr } = await supabaseAdmin.from("form_sessions").update({ used_at: new Date().toISOString() } as any).eq("sid", sid);
    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({ ok: true, message: "✅ Bounty application submitted" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "bounty submit error" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/bounty/submit/route.ts ===