import { FairTier } from "@/lib/fairscore";

export type Campaign = {
  id: string;
  title: string;
  description: string;
  baseReward: number;
  minTier: FairTier;
  startsAt: string;
  endsAt: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "genesis-drop",
    title: "Genesis TrustDrop",
    description:
      "A credibility-weighted reward drop. Higher trust, higher multiplier.",
    baseReward: 10,
    minTier: "Silver",
    startsAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "builders-bonus",
    title: "Builders Bonus",
    description:
      "Rewarding real builders. Reputation gates access, weighting boosts allocation.",
    baseReward: 20,
    minTier: "Gold",
    startsAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 36).toISOString(),
  },
];
