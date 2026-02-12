// src/app/api/tg/campaigns/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function json(ok: boolean, payload: any, status = 200) {
  return NextResponse.json({ ok, ...payload }, { status });
}

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

/**
 * ✅ Telegram WebApp initData verification (correct method):
 * secretKey = HMAC_SHA256("WebAppData", bot_token)
 * computed = HMAC_SHA256(data_check_string, secretKey) hex
 */
function verifyTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) return { ok: false as const, error: "Missing TELEGRAM_BOT_TOKEN" };

  const { hash, dataCheckString, params } = parseInitData(initData);
  if (!hash || !dataCheckString) return { ok: false as const, error: "Missing initData hash" };

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // timing-safe compare
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return { ok: false as const, error: "Bad initData hash" };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false as const, error: "Bad initData hash" };

  const userRaw = params.get("user");
  let user: any = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch {
    user = null;
  }

  const telegram_user_id = user?.id ? Number(user.id) : null;
  if (!telegram_user_id) return { ok: false as const, error: "Missing user id in initData" };

  // Optional freshness check (auth_date <= 24h old)
  const authDate = Number(params.get("auth_date") || "0");
  if (authDate) {
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (ageSec > 60 * 60 * 24) return { ok: false as const, error: "Expired initData" };
  }

  return { ok: true as const, telegram_user_id, user };
}

export async function GET(req: Request) {
  try {
    const initData =
      req.headers.get("x-tg-initdata") ||
      req.headers.get("x-telegram-initdata") ||
      "";

    const v = verifyTelegramInitData(initData);
    if (!v.ok) return json(false, { error: `Unauthorized (${v.error}).` }, 401);

    // ✅ SAFE SELECT (won't crash if extra cols exist)
    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return json(false, { error: error.message }, 500);

    const campaigns = (data || []).map((c: any) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      title: c.title ?? null,
      description: c.description ?? null,
      min_tier: c.min_tier ?? null,
      max_slots: c.max_slots ?? null,
      starts_at: c.starts_at ?? null,
      ends_at: c.ends_at ?? null,
      created_at: c.created_at ?? null,
    }));

    return json(true, { campaigns }, 200);
  } catch (e: any) {
    return json(false, { error: e?.message || "Server error" }, 500);
  }
}
