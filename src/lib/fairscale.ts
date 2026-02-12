type FairScaleBadge = {
  id: string;
  label: string;
  description?: string;
  tier?: string;
};

type FairScaleAction = {
  id: string;
  label: string;
  description?: string;
  priority?: string;
  cta?: string;
};

export type FairScaleScoreResponse = {
  wallet: string;
  fairscore: number;
  tier: string; // bronze | silver | gold etc (as returned)
  timestamp?: string;
  badges?: FairScaleBadge[];
  actions?: FairScaleAction[];
};

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const API_BASE = required("FAIRSCALE_API_BASE", process.env.FAIRSCALE_API_BASE);
const API_KEY = required("FAIRSCALE_API_KEY", process.env.FAIRSCALE_API_KEY);

export function normalizeTier(tier: string | null | undefined) {
  const t = (tier || "").toLowerCase().trim();
  if (t.includes("gold")) return "gold";
  if (t.includes("silver")) return "silver";
  return "bronze";
}

export async function fetchFairScaleScore(wallet: string): Promise<FairScaleScoreResponse> {
  const url = `${API_BASE}/score?wallet=${encodeURIComponent(wallet)}`;
  const res = await fetch(url, {
    headers: {
      fairkey: API_KEY,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FairScale error ${res.status}: ${text || "request failed"}`);
  }

  const data = (await res.json()) as any;

  // Expected sample:
  // { wallet, fairscore, tier, badges, actions, ... }
  if (typeof data?.fairscore !== "number" || !data?.wallet) {
    throw new Error("FairScale response format unexpected");
  }

  return {
    wallet: data.wallet,
    fairscore: data.fairscore,
    tier: normalizeTier(data.tier),
    timestamp: data.timestamp,
    badges: Array.isArray(data.badges) ? data.badges : [],
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}
