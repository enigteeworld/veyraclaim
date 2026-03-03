// === START: src/app/api/tg/verify/route.ts ===
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchFairScaleScore } from "@/lib/fairscale";

export const runtime = "nodejs";

function required(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const BOT_TOKEN = required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);

function normalizeWallet(input: string) {
  return (input || "").trim();
}

function isEvm(w: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(w);
}

function isSol(w: string) {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(w) && w.length >= 32 && w.length <= 44;
}

function badWallet(wallet: string) {
  if (!wallet) return "Missing wallet";
  if (!isEvm(wallet) && !isSol(wallet)) return "Invalid wallet format";
  return null;
}

/* ================================
   Telegram initData verification
   ================================ */
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

function pickInitDataFromReq(req: Request, body: any) {
  const h = req.headers;
  const candidates = [
    h.get("x-tg-initdata"),
    h.get("x-tg-init-data"),
    h.get("x-telegram-initdata"),
    h.get("x-telegram-init-data"),
    h.get("x-init-data"),
    body?.initData,
    body?.init_data,
    body?.initDataRaw,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  return candidates[0] || "";
}

function normTier(t?: any) {
  const v = String(t ?? "").trim().toLowerCase();
  return v || null;
}

async function upsertTelegramUserScore(opts: {
  telegram_user_id: number;
  user: any;
  wallet: string;
  tier: string | null;
  fairscore: number | null;
}) {
  const username = opts.user?.username || null;
  const first_name = opts.user?.first_name || null;
  const last_name = opts.user?.last_name || null;

  const payload: any = {
    telegram_user_id: opts.telegram_user_id,
    username,
    first_name,
    last_name,
    updated_at: new Date().toISOString(),

    // ✅ hydrate wallet for session gating
    saved_wallet: opts.wallet || null,

    // ✅ hydrate tier + fairscore for bounty session gating
    last_known_tier: opts.tier,
    tier: opts.tier,
    last_known_fairscore: typeof opts.fairscore === "number" ? opts.fairscore : null,
    fairscore: typeof opts.fairscore === "number" ? opts.fairscore : null,
  };

  const { error } = await supabaseAdmin
    .from("telegram_users")
    .upsert(payload, { onConflict: "telegram_user_id" });

  if (error) throw new Error(error.message);
}

/* ================================
   In-memory cache for FairScale
   ================================ */
type CacheEntry = { data: any; fetchedAtMs: number };

const CACHE_TTL_MS =
  Number(process.env.SCORE_CACHE_TTL_MS || "") > 0
    ? Number(process.env.SCORE_CACHE_TTL_MS)
    : 5 * 60 * 1000;

const CACHE_MAX_ENTRIES =
  Number(process.env.SCORE_CACHE_MAX || "") > 0 ? Number(process.env.SCORE_CACHE_MAX) : 500;

declare global {
  // eslint-disable-next-line no-var
  var __VE_YRA_SCORE_CACHE__: Map<string, CacheEntry> | undefined;
}

function getCache() {
  if (!globalThis.__VE_YRA_SCORE_CACHE__) {
    globalThis.__VE_YRA_SCORE_CACHE__ = new Map<string, CacheEntry>();
  }
  return globalThis.__VE_YRA_SCORE_CACHE__;
}

function cacheKey(wallet: string) {
  if (wallet.startsWith("0x")) return wallet.toLowerCase();
  return wallet;
}

function getCached(wallet: string) {
  const key = cacheKey(wallet);
  const cache = getCache();
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAtMs;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return { data: entry.data, ageMs: age };
}

function setCached(wallet: string, data: any) {
  const key = cacheKey(wallet);
  const cache = getCache();

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const items = Array.from(cache.entries())
      .sort((a, b) => a[1].fetchedAtMs - b[1].fetchedAtMs)
      .slice(0, 10);
    for (const [k] of items) cache.delete(k);
  }

  cache.set(key, { data, fetchedAtMs: Date.now() });
}

async function fetchWithCache(wallet: string) {
  const cached = getCached(wallet);
  if (cached) return { data: cached.data, cached: true, cacheAgeMs: cached.ageMs };

  const data = await fetchFairScaleScore(wallet);
  setCached(wallet, data);
  return { data, cached: false, cacheAgeMs: 0 };
}

/* ================================
   Handlers
   ================================ */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const wallet = normalizeWallet(body.wallet);

    const wErr = badWallet(wallet);
    if (wErr) return NextResponse.json({ ok: false, error: wErr }, { status: 400 });

    // 1) Fetch score (cached)
    const r = await fetchWithCache(wallet);

    // 2) OPTIONAL: if Telegram initData is present + valid, hydrate telegram_users
    const initData = pickInitDataFromReq(req, body);
    if (initData) {
      const v = verifyInitData(initData);
      if (v.ok) {
        const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
        if (telegram_user_id) {
          const tier = normTier(r.data?.tier);
          const fairscore = typeof r.data?.fairscore === "number" ? r.data.fairscore : null;

          await upsertTelegramUserScore({
            telegram_user_id,
            user: v.user,
            wallet,
            tier,
            fairscore,
          });
        }
      }
      // NOTE: if initData is invalid/expired, we still return score,
      // but bounty apply will fail (as it should) until initData is valid.
    }

    return NextResponse.json(
      { ok: true, data: r.data, cached: r.cached, cache_age_ms: r.cacheAgeMs },
      { status: 200, headers: { "x-veyra-cache": r.cached ? "HIT" : "MISS" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const wallet = normalizeWallet(url.searchParams.get("wallet") || "");

    const wErr = badWallet(wallet);
    if (wErr) return NextResponse.json({ ok: false, error: wErr }, { status: 400 });

    const r = await fetchWithCache(wallet);

    return NextResponse.json(
      { ok: true, data: r.data, cached: r.cached, cache_age_ms: r.cacheAgeMs },
      { status: 200, headers: { "x-veyra-cache": r.cached ? "HIT" : "MISS" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
// === END: src/app/api/tg/verify/route.ts ===