// src/app/api/campaigns/route.ts
import { NextResponse } from "next/server";
import type { Campaign } from "@/lib/campaigns";

export const runtime = "nodejs";

/**
 * Public Campaigns API (Web)
 *
 * Uses Supabase REST directly (server-side) to avoid supabase-js fetch failures.
 *
 * Query params:
 * - onlyLive=1 -> campaigns that are currently active
 * - id=<string> -> fetch a single campaign by id OR code
 */

// ✅ Tie tier type to your Campaign type so TS stays happy even if you change the union later.
type FairTier = Campaign["minTier"];

function normalizeTier(t: any): FairTier {
  const v = String(t || "bronze").toLowerCase();
  if (v === "gold" || v === "silver" || v === "bronze") return v as FairTier;
  return "bronze" as FairTier;
}

function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeRow(row: any): Campaign {
  const title = String(row?.title || "Untitled campaign").slice(0, 120);
  const description = row?.description ? String(row.description).slice(0, 300) : "";

  const startsAt =
    toIsoOrNull(row?.starts_at) ||
    toIsoOrNull(row?.startsAt) ||
    toIsoOrNull(row?.created_at) ||
    new Date().toISOString();

  let endsAt = toIsoOrNull(row?.ends_at) || toIsoOrNull(row?.endsAt) || null;

  if (!endsAt) {
    const s = new Date(startsAt).getTime();
    endsAt = new Date(s + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  // ✅ Now correctly typed as FairTier
  const minTier: FairTier = normalizeTier(row?.min_tier || row?.minTier);

  const baseRewardRaw = row?.base_reward ?? row?.baseReward ?? 0;
  const baseReward = Number.isFinite(Number(baseRewardRaw)) ? Number(baseRewardRaw) : 0;

  const code = row?.code ? String(row.code) : "";
  const uuid = row?.id ? String(row.id) : "";

  return {
    id: (code || uuid || "unknown").trim(),
    title,
    description,
    startsAt,
    endsAt,
    minTier,
    baseReward,
  };
}

function isLive(row: any, nowMs: number) {
  // Treat starts_at NULL as "started"
  const s = row?.starts_at ? new Date(String(row.starts_at)).getTime() : -Infinity;
  // Treat ends_at NULL as "no end"
  const e = row?.ends_at ? new Date(String(row.ends_at)).getTime() : Infinity;

  return s <= nowMs && nowMs < e;
}

async function fetchCampaignRows(): Promise<any[]> {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (!rawUrl) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL). Add it to your .env.local and restart dev server."
    );
  }

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (server-only). Add it to .env.local and restart. (Do NOT expose it in client.)"
    );
  }

  const base = rawUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/campaigns`);

  // safest: select everything, because your schema is evolving
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "200");

  // prefer starts_at ordering if present; if it's null, it will just be grouped
  url.searchParams.set("order", "starts_at.desc.nullslast");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      // include body for visibility
      throw new Error(`Supabase REST ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = text ? JSON.parse(text) : [];
    return Array.isArray(json) ? json : [];
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyLive = searchParams.get("onlyLive") === "1";
    const id = (searchParams.get("id") || "").trim();

    const rows = await fetchCampaignRows();
    const nowMs = Date.now();

    let filtered = rows;

    if (id) {
      filtered = filtered.filter(
        (r) => String(r?.id || "") === id || String(r?.code || "") === id
      );
    }

    if (onlyLive) {
      filtered = filtered.filter((r) => isLive(r, nowMs));
    }

    const campaigns = filtered.map(normalizeRow);

    return NextResponse.json(
      {
        campaigns,
        source: "supabase.rest.campaigns",
        note: campaigns.length === 0 ? "No matching campaigns found in DB." : undefined,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        campaigns: [],
        source: "supabase.rest.campaigns",
        note: e?.message || "campaigns error",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
