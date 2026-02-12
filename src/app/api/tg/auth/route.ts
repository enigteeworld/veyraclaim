import { NextResponse } from "next/server";
import crypto from "crypto";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const initData = String(body?.initData || "");

    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    const username = v.user?.username || null;
    const first_name = v.user?.first_name || null;
    const last_name = v.user?.last_name || null;

    return NextResponse.json({
      ok: true,
      telegram_user_id,
      username, // ✅ added for other admin routes that expect it
      user: {
        id: telegram_user_id,
        username,
        first_name,
        last_name,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "auth error" }, { status: 500 });
  }
}
