// === START: FILE_src/app/api/tg/me/route.ts ===
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

/**
 * Telegram WebApp initData verification (HMAC):
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * check_string = sorted key=value (excluding hash) joined by \n
 * hash = HMAC_SHA256(check_string, secret_key) hex
 */
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

  // Optional: freshness check (auth_date within 24h)
  const authDate = Number(data.auth_date || "0");
  if (authDate) {
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (ageSec > 60 * 60 * 24) return { ok: false as const, reason: "expired auth_date" };
  }

  let user: any = null;
  try {
    user = data.user ? JSON.parse(data.user) : null;
  } catch {
    user = null;
  }

  return { ok: true as const, data, user };
}

async function ensureTelegramUserRow(telegram_user_id: number, user: any) {
  const username = user?.username || null;
  const first_name = user?.first_name || null;
  const last_name = user?.last_name || null;

  const { error } = await supabaseAdmin.from("telegram_users").upsert(
    {
      telegram_user_id,
      username,
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );

  if (error) throw new Error(error.message);
}

/* ================================================
   === START: SHARED_HANDLER_ME ===
   Used by BOTH GET and POST.
   ================================================ */
async function handleMe(initData: string) {
  const clean = String(initData || "").trim();
  if (!clean) {
    return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });
  }

  const v = verifyInitData(clean);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });
  }

  const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
  if (!telegram_user_id) {
    return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });
  }

  // Ensure the user exists in DB (so saved_wallet lookups are stable)
  await ensureTelegramUserRow(telegram_user_id, v.user);

  const { data: row, error } = await supabaseAdmin
    .from("telegram_users")
    .select("telegram_user_id, username, first_name, last_name, saved_wallet")
    .eq("telegram_user_id", telegram_user_id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Keep response SHAPE consistent for both callers
  return NextResponse.json({
    ok: true,
    data: {
      telegram_user_id,
      username: row?.username ?? v.user?.username ?? null,
      first_name: row?.first_name ?? v.user?.first_name ?? null,
      last_name: row?.last_name ?? v.user?.last_name ?? null,
      saved_wallet: row?.saved_wallet ?? null,
    },
  });
}
/* ================================================
   === END: SHARED_HANDLER_ME ===
   ================================================ */

/* ================================================
   === START: GET_ME ===
   Supports BountiesTab calling /api/tg/me with headers.
   ================================================ */
export async function GET(req: Request) {
  try {
    const initData =
      (req.headers.get("x-telegram-init-data") || "").trim() ||
      (req.headers.get("x-init-data") || "").trim() ||
      (req.headers.get("x-tg-init-data") || "").trim();

    return await handleMe(initData);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "me error" }, { status: 500 });
  }
}
/* ================================================
   === END: GET_ME ===
   ================================================ */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const initData = String(body?.initData || "").trim();
    return await handleMe(initData);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "me error" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/me/route.ts ===