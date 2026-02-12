// src/app/api/tg/admin/session/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Permanent Admin Session Fix
 * - Primary path: Verify Telegram WebApp initData signature locally (NO internal fetch)
 * - Require recent /admin unlock event
 * - Create a REAL UUID admin session in public.app_sessions (kind = "admin")
 * - Return sid (uuid) for the Mini App to use on admin routes
 *
 * ✅ Added fallback path (optional):
 * If initData is missing/unreliable in your Mini App,
 * allow a signed uid (+ optional wallet) using HMAC:
 *   payload = `${uid}:${ts}:${wallet||""}`
 *   sig = hex(hmac_sha256(TELEGRAM_WEBAPP_FALLBACK_SECRET, payload))
 *
 * You can generate these query params from the bot webhook when building Mini App URLs.
 */

const WEBAPP_FALLBACK_SECRET =
  process.env.TELEGRAM_WEBAPP_FALLBACK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "";

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

  return { ok: true as const, user, params };
}

function safeTrim(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeWallet(input: string) {
  return (input || "").trim();
}

/**
 * Fallback verifier: { uid, ts, sig, w? }
 * - Requires TELEGRAM_WEBAPP_FALLBACK_SECRET (or TELEGRAM_WEBHOOK_SECRET)
 * - ts must be "recent" to reduce replay risk
 */
function verifyFallbackSignedUser(args: {
  uid: string;
  ts: string;
  sig: string;
  wallet?: string;
}) {
  if (!WEBAPP_FALLBACK_SECRET) {
    return { ok: false as const, error: "Fallback signing not enabled (missing TELEGRAM_WEBAPP_FALLBACK_SECRET)" };
  }

  const uid = safeTrim(args.uid);
  const ts = safeTrim(args.ts);
  const sig = safeTrim(args.sig);
  const wallet = normalizeWallet(args.wallet || "");

  if (!uid || !ts || !sig) {
    return { ok: false as const, error: "Missing fallback auth fields" };
  }

  const uidNum = Number(uid);
  if (!uidNum || !Number.isFinite(uidNum)) {
    return { ok: false as const, error: "Invalid uid" };
  }

  const tsNum = Number(ts);
  if (!tsNum || !Number.isFinite(tsNum)) {
    return { ok: false as const, error: "Invalid ts" };
  }

  // 5 minutes clock skew window
  const now = Date.now();
  const skewMs = Math.abs(now - tsNum);
  if (skewMs > 5 * 60 * 1000) {
    return { ok: false as const, error: "Fallback signature expired" };
  }

  const payload = `${uidNum}:${tsNum}:${wallet || ""}`;
  const computed = crypto.createHmac("sha256", WEBAPP_FALLBACK_SECRET).update(payload).digest("hex");

  // constant-time compare
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false as const, error: "Invalid fallback signature" };
  }

  return {
    ok: true as const,
    telegram_user_id: uidNum,
    wallet: wallet || null,
  };
}

async function ensureTelegramUser(telegram_user_id: number, user?: any) {
  // campaigns.created_by_telegram_user_id has FK -> telegram_users
  const username = user?.username || null;
  const first_name = user?.first_name || null;
  const last_name = user?.last_name || null;

  await supabaseAdmin.from("telegram_users").upsert(
    {
      telegram_user_id,
      username,
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
}

async function requireRecentAdminUnlock(telegram_user_id: number) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes

  const { data, error } = await supabaseAdmin
    .from("bot_events")
    .select("id, created_at")
    .eq("telegram_user_id", telegram_user_id)
    .eq("kind", "admin_start")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    throw new Error("Admin not unlocked. Go to the bot and run: /admin veyra_admin_2026, then tap Open Admin Panel.");
  }
}

async function createAdminSession(args: {
  telegram_user_id: number;
  chat_id?: number | null;
  message_id?: number | null;
  username?: string | null;
  wallet?: string | null;
}) {
  const sid = crypto.randomUUID(); // ✅ REAL uuid
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

  const { error } = await supabaseAdmin.from("app_sessions").insert({
    id: sid,
    telegram_user_id: args.telegram_user_id,
    session_key: "admin",
    kind: "admin",
    state_json: {
      admin: true,
      username: args.username ?? null,
    },
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
    chat_id: args.chat_id ?? null,
    message_id: args.message_id ?? null,
    wallet: args.wallet ?? null,
  });

  if (error) throw new Error(error.message);

  return { sid, expires_at: expiresAt };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({} as any))) as any;

    const initData = safeTrim(body?.initData);

    // Fallback fields (optional)
    const uid = safeTrim(body?.uid);
    const ts = safeTrim(body?.ts);
    const sig = safeTrim(body?.sig);
    const w = safeTrim(body?.w);

    let telegram_user_id: number | null = null;
    let username: string | null = null;
    let wallet: string | null = null;

    if (initData) {
      const v = verifyTelegramInitData(initData);
      if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 401 });

      telegram_user_id = Number(v.user?.id);
      if (!telegram_user_id) return NextResponse.json({ ok: false, error: "No telegram user id" }, { status: 401 });

      username = v.user?.username || null;

      await ensureTelegramUser(telegram_user_id, v.user);
    } else {
      // ✅ Fallback path: allow signed uid
      const fb = verifyFallbackSignedUser({ uid, ts, sig, wallet: w });
      if (!fb.ok) return NextResponse.json({ ok: false, error: fb.error }, { status: 401 });

      telegram_user_id = fb.telegram_user_id;
      wallet = fb.wallet;

      // Ensure FK exists even if we don't know username
      await ensureTelegramUser(telegram_user_id, {
        username: null,
        first_name: null,
        last_name: null,
      });
    }

    // Must have telegram_user_id by now
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // Still require the bot-side unlock event
    await requireRecentAdminUnlock(telegram_user_id);

    // (Optional) If you ever pass chat_id/message_id into this route later, it will store them.
    const { sid, expires_at } = await createAdminSession({
      telegram_user_id,
      username,
      chat_id: null,
      message_id: null,
      wallet,
    });

    return NextResponse.json({
      ok: true,
      data: {
        sid, // ✅ UUID
        expires_at,
        telegram_user_id,
        username,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
