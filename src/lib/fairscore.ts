export type FairTier = "Bronze" | "Silver" | "Gold" | "Platinum";

export function scoreToTier(score: number): FairTier {
  if (score >= 800) return "Platinum";
  if (score >= 650) return "Gold";
  if (score >= 500) return "Silver";
  return "Bronze";
}

export function tierRank(tier: FairTier): number {
  return ["Bronze", "Silver", "Gold", "Platinum"].indexOf(tier);
}

export function meetsMinTier(userTier: FairTier, minTier: FairTier): boolean {
  return tierRank(userTier) >= tierRank(minTier);
}

export function tierMultiplier(tier: FairTier): number {
  switch (tier) {
    case "Bronze":
      return 1.0;
    case "Silver":
      return 1.15;
    case "Gold":
      return 1.35;
    case "Platinum":
      return 1.6;
    default:
      return 1.0;
  }
}

export function formatScore(score: number): string {
  return Math.max(0, Math.min(1000, Math.round(score))).toString();
}
