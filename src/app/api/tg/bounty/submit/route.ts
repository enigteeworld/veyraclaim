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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sid = String(body?.sid || "").trim();
    const answers = (body?.answers || {}) as Record<string, any>;

    if (!sid) return NextResponse.json({ ok: false, error: "missing sid" }, { status: 400 });
    if (!answers || typeof answers !== "object") return NextResponse.json({ ok: false, error: "missing answers" }, { status: 400 });

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

    // Insert application (dedupe if unique constraint exists)
    const insertPayload = {
      bounty_id,
      telegram_user_id,
      wallet: (session as any).wallet ?? null,
      tier: (session as any).tier ?? null,
      fairscore: (session as any).fairscore ?? null,
      answers,
      created_at: new Date().toISOString(),
    };

    const { error: iErr } = await supabaseAdmin.from("bounty_applications").insert(insertPayload as any);

    // If unique constraint exists, Supabase returns an error; we convert to a clean message
    if (iErr) {
      const msg = (iErr.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")) {
        // mark session as used anyway to prevent repeat spam
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