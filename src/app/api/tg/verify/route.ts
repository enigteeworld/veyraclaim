// src/app/api/tg/verify/route.ts
import { NextResponse } from "next/server";
import { fetchFairScaleScore } from "@/lib/fairscale";

export const runtime = "nodejs";

function normalizeWallet(input: string) {
  return (input || "").trim();
}

function isEvm(w: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(w);
}

function isSol(w: string) {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(w) && w.length >= 32 && w.length <= 44;
}

/**
 * ✅ In-memory cache (safe + no schema assumptions)
 * - Works great for "recently checked" wallets (bot/mini-app feel instant)
 * - TTL default: 5 minutes (tweakable via env)
 * - On serverless, cache may reset between cold starts (still helpful)
 */
type CacheEntry = {
  data: any;
  fetchedAtMs: number;
};

const CACHE_TTL_MS = Number(process.env.SCORE_CACHE_TTL_MS || "") > 0
  ? Number(process.env.SCORE_CACHE_TTL_MS)
  : 5 * 60 * 1000; // 5 minutes default

// Keep cache from growing forever (best-effort)
const CACHE_MAX_ENTRIES = Number(process.env.SCORE_CACHE_MAX || "") > 0
  ? Number(process.env.SCORE_CACHE_MAX)
  : 500;

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
  // Normalize key so EVM is case-insensitive; Solana is case-sensitive
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

  // naive pruning if too large
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // delete ~10 oldest (best-effort)
    const items = Array.from(cache.entries())
      .sort((a, b) => a[1].fetchedAtMs - b[1].fetchedAtMs)
      .slice(0, 10);
    for (const [k] of items) cache.delete(k);
  }

  cache.set(key, { data, fetchedAtMs: Date.now() });
}

function badWallet(wallet: string) {
  if (!wallet) return "Missing wallet";
  if (!isEvm(wallet) && !isSol(wallet)) return "Invalid wallet format";
  return null;
}

async function fetchWithCache(wallet: string) {
  const cached = getCached(wallet);
  if (cached) {
    return { data: cached.data, cached: true, cacheAgeMs: cached.ageMs };
  }

  const data = await fetchFairScaleScore(wallet);
  setCached(wallet, data);
  return { data, cached: false, cacheAgeMs: 0 };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const wallet = normalizeWallet(body.wallet);

    const err = badWallet(wallet);
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });

    const r = await fetchWithCache(wallet);

    return NextResponse.json(
      { ok: true, data: r.data, cached: r.cached, cache_age_ms: r.cacheAgeMs },
      {
        status: 200,
        headers: {
          // Helps you debug quickly in network tab
          "x-veyra-cache": r.cached ? "HIT" : "MISS",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const wallet = normalizeWallet(url.searchParams.get("wallet") || "");

    const err = badWallet(wallet);
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });

    const r = await fetchWithCache(wallet);

    return NextResponse.json(
      { ok: true, data: r.data, cached: r.cached, cache_age_ms: r.cacheAgeMs },
      {
        status: 200,
        headers: {
          "x-veyra-cache": r.cached ? "HIT" : "MISS",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
