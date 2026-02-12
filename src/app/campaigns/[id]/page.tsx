// /Users/mac/fairclaim/src/app/campaigns/[id]/page.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { scoreToTier, tierMultiplier, formatScore } from "@/lib/fairscore";
import type { Campaign } from "@/lib/campaigns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
  ArrowLeft,
  BadgeCheck,
  Crown,
  ExternalLink,
  KeyRound,
  Lock,
  MessageCircle,
  RefreshCw,
  Rocket,
  Shield,
  Sparkles,
  Timer,
} from "lucide-react";

const BOT_URL = "https://t.me/Veyraclaim_Bot";

type FairScoreResponse = {
  score: number;
  tier?: string;
  badges?: Array<{ id: string; label: string; description?: string; tier?: string }>;
  actions?: Array<{ id: string; label: string; description?: string; priority?: string; cta?: string }>;
  source?: string;
};

type CampaignResponse = {
  campaign: Campaign | null;
  source?: string;
  note?: string;
};

async function fetchFairScore(wallet: string): Promise<FairScoreResponse> {
  const res = await fetch(`/api/fairscore?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load your score.");
  return (await res.json()) as FairScoreResponse;
}

/**
 * Compatibility-friendly:
 * - tries /api/campaigns/:id first
 * - then falls back to /api/campaigns?id=:id
 */
async function fetchCampaignById(id: string): Promise<CampaignResponse> {
  // Try REST-style
  const r1 = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (r1.ok) return (await r1.json()) as CampaignResponse;

  // Fall back to query-style
  const r2 = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r2.ok) throw new Error("Could not load campaign.");
  return (await r2.json()) as CampaignResponse;
}

function statusPill(startsAt: string, endsAt: string) {
  const now = Date.now();
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (now < s) return { label: "Upcoming", variant: "secondary" as const };
  if (now > e) return { label: "Ended", variant: "outline" as const };
  return { label: "Live", variant: "default" as const };
}

function prettyEndsIn(iso: string) {
  const end = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, end - now);

  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ${hrs % 24}h left`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m left`;
  return `${mins}m left`;
}

/** Tier compare helper */
function tierRank(t?: string | null) {
  const v = (t || "").toLowerCase();
  if (!v) return 0;
  if (v.includes("gold")) return 3;
  if (v.includes("silver")) return 2;
  if (v.includes("bronze")) return 1;
  return 0;
}

function tierLabel(t?: string | null) {
  const v = (t || "").toLowerCase();
  if (v.includes("gold")) return "Gold";
  if (v.includes("silver")) return "Silver";
  if (v.includes("bronze")) return "Bronze";
  return t || "—";
}

function tierMeta(tier: string) {
  const t = tier.toLowerCase();
  if (t.includes("gold")) return { Icon: Crown, label: "Gold" };
  if (t.includes("silver")) return { Icon: Shield, label: "Silver" };
  return { Icon: Sparkles, label: "Bronze" };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";

  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || null;

  const campaignQuery = useQuery({
    queryKey: ["campaign", id, "v1"],
    queryFn: () => fetchCampaignById(id),
    enabled: !!id,
    retry: 1,
    staleTime: 1000 * 10,
    refetchOnWindowFocus: false,
  });

  const fairscoreQuery = useQuery({
    queryKey: ["fairscore", wallet, "v1"],
    queryFn: () => fetchFairScore(wallet!),
    enabled: !!wallet,
    retry: 1,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const campaign = campaignQuery.data?.campaign ?? null;

  const score = fairscoreQuery.data?.score ?? null;
  const tier = useMemo(() => (score === null ? null : scoreToTier(score)), [score]);
  const mult = tier ? tierMultiplier(tier) : null;

  const tierUI = tier ? tierMeta(tier) : null;
  const TierIcon = tierUI?.Icon ?? Sparkles;

  const eligible = useMemo(() => {
    if (!wallet) return false;
    if (!tier) return false;
    if (!campaign?.minTier) return true;
    return tierRank(tier) >= tierRank(campaign.minTier);
  }, [wallet, tier, campaign?.minTier]);

  const status = campaign ? statusPill(campaign.startsAt, campaign.endsAt) : null;

  const estRewardText = useMemo(() => {
    if (!campaign) return "—";
    if (!mult) return "—";
    // baseReward might be string (e.g. "10 USDC") — we keep it safe and only show multiplier preview.
    return `${campaign.baseReward} × ${mult.toFixed(1)} = (weighted)`;
  }, [campaign, mult]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" asChild className="rounded-xl bg-background/40 backdrop-blur-md">
          <Link href="/#campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>

        <Button asChild className="rounded-xl">
          <a href={BOT_URL} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />
            Open Telegram bot
            <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
          </a>
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-border bg-background/40 backdrop-blur-md p-6 md:p-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 -right-28 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.18] dark:opacity-[0.26]"
            style={{
              background:
                "radial-gradient(70% 60% at 22% 30%, rgba(168,85,247,0.22), transparent 60%), radial-gradient(70% 60% at 78% 40%, rgba(34,211,238,0.18), transparent 60%)",
            }}
          />
        </div>

        <div className="relative space-y-6">
          {campaignQuery.isLoading && (
            <div className="rounded-3xl border border-border bg-background/35 backdrop-blur-md p-6 animate-pulse">
              <div className="h-4 w-40 rounded bg-muted/40" />
              <div className="mt-3 h-7 w-2/3 rounded bg-muted/40" />
              <div className="mt-3 h-4 w-1/2 rounded bg-muted/40" />
            </div>
          )}

          {campaignQuery.error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <div className="text-sm font-semibold text-destructive">Could not load campaign</div>
              <div className="mt-1 text-sm text-muted-foreground">Please try again.</div>
            </div>
          )}

          {!campaignQuery.isLoading && !campaignQuery.error && !campaign && (
            <div className="rounded-3xl border border-border bg-background/35 backdrop-blur-md p-6">
              <div className="text-sm font-semibold text-foreground">Campaign not found</div>
              <div className="mt-1 text-sm text-muted-foreground">This campaign may have been removed or is unavailable.</div>
            </div>
          )}

          {campaign && (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-500 flex items-center justify-center shadow-sm ring-1 ring-white/10">
                      <Rocket className="h-5 w-5 text-white" />
                    </div>

                    {status && (
                      <Badge
                        variant={status.variant}
                        className={
                          status.label === "Live"
                            ? "border-emerald-300/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 dark:border-emerald-300/25 dark:bg-emerald-500/15"
                            : status.label === "Upcoming"
                              ? "border-slate-300/40 bg-slate-500/10 text-slate-900 dark:text-slate-100 dark:border-slate-300/25 dark:bg-slate-500/15"
                              : "border-border bg-background/40 text-muted-foreground"
                        }
                      >
                        {status.label}
                      </Badge>
                    )}

                    {status && status.label !== "Ended" && (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        {prettyEndsIn(campaign.endsAt)}
                      </span>
                    )}
                  </div>

                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{campaign.title}</h1>
                  <p className="max-w-3xl text-sm md:text-base text-muted-foreground">{campaign.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl bg-background/40 backdrop-blur-md"
                    onClick={() => {
                      campaignQuery.refetch().catch(() => {});
                      toast.message("Refreshing campaign…");
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-7 space-y-4">
                  <Card className="rounded-3xl border-border bg-background/40 backdrop-blur-md overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl">Campaign details</CardTitle>
                      <CardDescription>Requirements, base reward, and status.</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Minimum tier</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{campaign.minTier}+</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Base reward</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{campaign.baseReward}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Allocation</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">Weighted</div>
                        </div>
                      </div>

                      <Separator />

                      <div className="rounded-3xl border border-border bg-background/35 backdrop-blur-md p-5">
                        <div className="flex items-start gap-3">
                          <div className="h-11 w-11 rounded-2xl border border-border bg-background/55 backdrop-blur-md flex items-center justify-center">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">Core actions are in Telegram</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Projects create/manage campaigns in the bot + mini app. Participants typically claim or complete tasks via
                              Telegram flows.
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <Button asChild className="rounded-xl">
                            <a href={BOT_URL} target="_blank" rel="noreferrer">
                              Open bot
                              <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                            </a>
                          </Button>

                          <Button
                            variant="outline"
                            className="rounded-xl bg-background/40 backdrop-blur-md"
                            onClick={() => toast.message("Invite codes are issued by the Veyra team.")}
                          >
                            Invite code required (projects)
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="md:col-span-5 space-y-4">
                  <Card className="rounded-3xl border-border bg-background/40 backdrop-blur-md overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl">Your eligibility</CardTitle>
                      <CardDescription>Based on your FairScore tier.</CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {!wallet && (
                        <div className="rounded-3xl border border-border bg-background/55 backdrop-blur-md p-5 text-sm text-muted-foreground">
                          Connect your wallet to check eligibility and see a weighting preview.
                        </div>
                      )}

                      {wallet && (
                        <>
                          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-400 p-[1px]">
                            <div className="rounded-3xl bg-background/70 backdrop-blur-md p-5">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="relative overflow-hidden rounded-2xl bg-black/15 dark:bg-white/10 p-4">
                                  <div className="text-xs text-white/80">FairScore</div>
                                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
                                    {fairscoreQuery.isFetching ? "—" : score === null ? "—" : formatScore(score)}
                                  </div>
                                  <div className="mt-1 text-xs text-white/80">Used for tiering + eligibility gating.</div>
                                </div>

                                <div className="relative overflow-hidden rounded-2xl bg-black/15 dark:bg-white/10 p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs text-white/80">Tier</div>
                                    <div className="h-9 w-9 rounded-2xl bg-white/15 flex items-center justify-center">
                                      <TierIcon className="h-4 w-4 text-white" />
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-baseline justify-between gap-3">
                                    <div className="text-xl font-semibold text-white">{tierUI?.label ?? (tier ?? "—")}</div>
                                    <div className="text-4xl font-semibold text-white">{mult ? `${mult.toFixed(1)}×` : "—"}</div>
                                  </div>

                                  <div className="mt-1 text-xs text-white/80">Used to weight allocations when eligible.</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">Required</div>
                            <div className="text-sm font-semibold text-foreground">{campaign.minTier}+ tier</div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">Your tier</div>
                            <div className="text-sm font-semibold text-foreground">{tier ? tierLabel(tier) : "—"}</div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">Preview</div>
                            <div className="text-sm font-semibold text-foreground">{estRewardText}</div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 pt-2">
                            {eligible ? (
                              <Button
                                className="rounded-xl"
                                onClick={() => {
                                  if (status?.label === "Ended") return toast.message("This campaign has ended.");
                                  toast.message("Eligible. Open Telegram to continue.");
                                  window.open(BOT_URL, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                Continue in Telegram
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                className="rounded-xl bg-background/40 backdrop-blur-md"
                                onClick={() => {
                                  if (status?.label === "Ended") return toast.message("This campaign has ended.");
                                  if (!tier) return toast.message("Eligibility is still loading — try again in a moment.");
                                  return toast.message(`Locked. Requires ${campaign.minTier}+ tier.`);
                                }}
                              >
                                <Lock className="mr-2 h-4 w-4" />
                                Locked
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              className="rounded-xl bg-background/40 backdrop-blur-md"
                              onClick={() => fairscoreQuery.refetch().catch(() => {})}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Refresh score
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-border bg-background/40 backdrop-blur-md overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl">Notes</CardTitle>
                      <CardDescription>Operational defaults.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-4 w-4" />
                        <span>Eligibility is computed from external wallet signals — not created by Veyra.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4" />
                        <span>Higher tiers can unlock gated campaigns and increase allocations.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MessageCircle className="mt-0.5 h-4 w-4" />
                        <span>Campaign creation + management runs in Telegram (invite code required for projects).</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
