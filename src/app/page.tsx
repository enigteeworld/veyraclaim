// /Users/mac/fairclaim/src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import Hero3D from "@/components/hero-3d";
import { scoreToTier, tierMultiplier, formatScore } from "@/lib/fairscore";
import type { Campaign } from "@/lib/campaigns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
  BadgeCheck,
  Crown,
  Shield,
  Sparkles,
  Zap,
  Flame,
  ArrowUpRight,
  Rocket,
  Users,
  CheckCircle2,
  Workflow,
  Lock,
  FileText,
  Coins,
  Timer,
  ClipboardCheck,
  Database,
  ArrowRight,
  ChevronDown,
  Share2,
  RefreshCw,
  CalendarClock,
  Activity,
  Layers3,
  ExternalLink,
  MessageCircle,
  KeyRound,
  ScrollText,
} from "lucide-react";

const BOT_URL = "https://t.me/Veyraclaim_Bot";

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
  priority?: "high" | "medium" | "low" | string;
  cta?: string;
};

type FairScoreResponse = {
  score: number;
  tier?: string;
  badges?: FairScaleBadge[];
  actions?: FairScaleAction[];
  source?: string;
};

type CampaignsResponse = {
  campaigns: Campaign[];
  source?: string;
  note?: string;
};

async function fetchFairScore(wallet: string): Promise<FairScoreResponse> {
  const res = await fetch(`/api/fairscore?wallet=${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    // Keep UI safe; don’t surface raw server text
    throw new Error("Could not load your score.");
  }

  return (await res.json()) as FairScoreResponse;
}

async function fetchLiveCampaigns(): Promise<CampaignsResponse> {
  const res = await fetch(`/api/campaigns?onlyLive=1`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load campaigns.");
  return (await res.json()) as CampaignsResponse;
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

function priorityPill(p?: string) {
  const pr = (p || "").toLowerCase();
  if (pr === "high") return { label: "High impact", variant: "default" as const };
  if (pr === "medium") return { label: "Medium impact", variant: "secondary" as const };
  if (pr === "low") return { label: "Low lift", variant: "outline" as const };
  return { label: "Recommended", variant: "secondary" as const };
}

function tierMeta(tier: string) {
  const t = tier.toLowerCase();
  if (t.includes("gold")) {
    return {
      Icon: Crown,
      badgeClass:
        "border-amber-300/40 bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/30 ring-1 ring-amber-400/15",
      dotClass: "bg-amber-500 dark:bg-amber-300/80",
      label: "Gold",
    };
  }
  if (t.includes("silver")) {
    return {
      Icon: Shield,
      badgeClass:
        "border-slate-300/50 bg-slate-500/10 text-slate-800 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-300/25 ring-1 ring-slate-200/10",
      dotClass: "bg-slate-500 dark:bg-slate-200/80",
      label: "Silver",
    };
  }
  return {
    Icon: Sparkles,
    badgeClass:
      "border-fuchsia-300/40 bg-fuchsia-500/10 text-fuchsia-800 dark:bg-fuchsia-500/12 dark:text-fuchsia-200 dark:border-fuchsia-300/25 ring-1 ring-fuchsia-300/10",
    dotClass: "bg-fuchsia-500 dark:bg-fuchsia-300/80",
    label: "Bronze",
  };
}

/**
 * IMPORTANT: Make icons pop in LIGHT MODE.
 * In the previous version, we used mostly dark-mode color tokens (text-emerald-200, etc.)
 * This version uses light + dark variants.
 */
function badgeIconAndTone(b: FairScaleBadge) {
  const raw = `${b.label} ${b.tier ?? ""}`.toLowerCase();

  if (raw.includes("verified") || raw.includes("verification")) {
    return {
      Icon: BadgeCheck,
      chip:
        "border-emerald-300/40 bg-emerald-500/10 text-emerald-800 dark:bg-emerald-500/12 dark:text-emerald-200 dark:border-emerald-300/25",
      iconWrap:
        "border-emerald-300/40 bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm dark:from-emerald-500/70 dark:to-emerald-400/50",
      icon: "text-white",
      rowGlow:
        "before:absolute before:inset-0 before:rounded-2xl before:bg-emerald-500/10 before:opacity-40 before:blur-2xl before:-z-10",
    };
  }

  if ((b.tier || "").toLowerCase().includes("gold")) {
    return {
      Icon: Crown,
      chip:
        "border-amber-300/40 bg-amber-500/10 text-amber-900 dark:bg-amber-500/12 dark:text-amber-200 dark:border-amber-300/25",
      iconWrap:
        "border-amber-300/40 bg-gradient-to-br from-amber-500 to-orange-500 shadow-sm dark:from-amber-500/70 dark:to-orange-400/50",
      icon: "text-white",
      rowGlow:
        "before:absolute before:inset-0 before:rounded-2xl before:bg-amber-500/10 before:opacity-40 before:blur-2xl before:-z-10",
    };
  }

  if ((b.tier || "").toLowerCase().includes("silver")) {
    return {
      Icon: Shield,
      chip:
        "border-slate-300/50 bg-slate-500/10 text-slate-900 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-300/25",
      iconWrap:
        "border-slate-300/50 bg-gradient-to-br from-slate-500 to-zinc-500 shadow-sm dark:from-slate-400/60 dark:to-zinc-300/40",
      icon: "text-white",
      rowGlow:
        "before:absolute before:inset-0 before:rounded-2xl before:bg-slate-500/10 before:opacity-35 before:blur-2xl before:-z-10",
    };
  }

  return {
    Icon: Sparkles,
    chip:
      "border-purple-300/45 bg-purple-500/10 text-purple-900 dark:bg-purple-500/12 dark:text-purple-200 dark:border-purple-300/25",
    iconWrap:
      "border-purple-300/45 bg-gradient-to-br from-purple-600 to-fuchsia-500 shadow-sm dark:from-purple-500/70 dark:to-fuchsia-400/50",
    icon: "text-white",
    rowGlow:
      "before:absolute before:inset-0 before:rounded-2xl before:bg-purple-500/10 before:opacity-35 before:blur-2xl before:-z-10",
  };
}

/** Screenshot-style icon tile for action rows (always vibrant in light mode) */
function actionIconTone(a: FairScaleAction) {
  const pr = (a.priority || "").toLowerCase();
  const text = `${a.label} ${a.description ?? ""}`.toLowerCase();

  // Keyword-based icons (so it feels “designed” like the screenshot)
  let Icon = pr === "high" ? Flame : pr === "medium" ? Zap : ArrowUpRight;
  if (text.includes("wallet age") || text.includes("months") || text.includes("age")) Icon = CalendarClock;
  if (text.includes("transaction") || text.includes("history") || text.includes("active")) Icon = Activity;
  if (text.includes("divers") || text.includes("multi") || text.includes("on-chain")) Icon = Layers3;

  if (pr === "high") {
    return {
      Icon,
      tile: "bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-500",
      ring: "ring-1 ring-purple-500/20",
      pill:
        "border-purple-300/50 bg-purple-500/10 text-purple-900 dark:text-purple-100 dark:border-purple-300/25 dark:bg-purple-500/15",
    };
  }
  if (pr === "medium") {
    return {
      Icon,
      tile: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500",
      ring: "ring-1 ring-orange-500/20",
      pill:
        "border-orange-300/50 bg-orange-500/10 text-orange-950 dark:text-orange-100 dark:border-orange-300/25 dark:bg-orange-500/15",
    };
  }
  if (pr === "low") {
    return {
      Icon,
      tile: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
      ring: "ring-1 ring-emerald-500/20",
      pill:
        "border-emerald-300/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 dark:border-emerald-300/25 dark:bg-emerald-500/15",
    };
  }
  return {
    Icon,
    tile: "bg-gradient-to-br from-slate-600 via-zinc-600 to-slate-500",
    ring: "ring-1 ring-white/10",
    pill:
      "border-slate-300/50 bg-slate-500/10 text-slate-950 dark:text-slate-100 dark:border-slate-300/25 dark:bg-slate-500/15",
  };
}

/** Tier compare helper (for eligibility messaging) */
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

type HomeTab = "overview" | "usecases" | "ops";

export default function HomePage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() || null;

  const [tab, setTab] = useState<HomeTab>("overview");

  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Campaigns refresh UX (same “production-safe” feel as score)
  const [campaignCooldownUntil, setCampaignCooldownUntil] = useState<number>(0);
  const [campaignsUpdatedAt, setCampaignsUpdatedAt] = useState<number | null>(null);

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

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", "onlyLive", "v1"],
    queryFn: fetchLiveCampaigns,
    retry: 1,
    staleTime: 1000 * 20,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (wallet) fairscoreQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  useEffect(() => {
    if (fairscoreQuery.data && !fairscoreQuery.isFetching && !fairscoreQuery.error) {
      setLastUpdatedAt(Date.now());
    }
  }, [fairscoreQuery.data, fairscoreQuery.isFetching, fairscoreQuery.error]);

  useEffect(() => {
    if (campaignsQuery.data && !campaignsQuery.isFetching && !campaignsQuery.error) {
      setCampaignsUpdatedAt(Date.now());
    }
  }, [campaignsQuery.data, campaignsQuery.isFetching, campaignsQuery.error]);

  const data = fairscoreQuery.data;
  const score = data?.score ?? null;
  const tier = useMemo(() => (score === null ? null : scoreToTier(score)), [score]);
  const mult = tier ? tierMultiplier(tier) : null;

  const tierUI = tier ? tierMeta(tier) : null;
  const TierIcon = tierUI?.Icon ?? Sparkles;

  const badges = data?.badges ?? [];
  const actions = data?.actions ?? [];
  const campaigns = campaignsQuery.data?.campaigns ?? [];

  const canRefreshScore = !!wallet && Date.now() >= cooldownUntil && !fairscoreQuery.isFetching;
  const canRefreshCampaigns = Date.now() >= campaignCooldownUntil && !campaignsQuery.isFetching;

  async function onRefreshScore() {
    if (!wallet) return;
    const now = Date.now();
    if (now < cooldownUntil) return;

    setCooldownUntil(now + 12_000);

    try {
      const res = await fairscoreQuery.refetch();
      if (res.data?.score !== undefined) {
        setLastUpdatedAt(Date.now());
        toast.success("Updated");
      }
    } catch {
      toast.error("Could not refresh right now");
    }
  }

  async function onRefreshCampaigns() {
    const now = Date.now();
    if (now < campaignCooldownUntil) return;

    setCampaignCooldownUntil(now + 10_000);

    try {
      await campaignsQuery.refetch();
      setCampaignsUpdatedAt(Date.now());
      toast.success("Updated");
    } catch {
      toast.error("Could not refresh right now");
    }
  }

  // Buttons + surfaces (fairscale-like: calm, glassy, premium)
  const tabBtnBase =
    "rounded-2xl border border-border bg-background/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-background/60 transition backdrop-blur-md";
  const tabBtnActive =
    "rounded-2xl border border-border bg-gradient-to-br from-purple-500/14 via-background/55 to-cyan-500/12 px-4 py-2 text-sm text-foreground ring-1 ring-purple-400/15 backdrop-blur-md";

  const panelCard =
    "rounded-2xl border border-border bg-gradient-to-br from-muted/30 via-background/55 to-muted/25 dark:from-white/6 dark:via-background/40 dark:to-white/6 backdrop-blur-md";

  const softCard = "rounded-2xl border border-border bg-background/40 backdrop-blur-md";

  const lastUpdatedText = useMemo(() => {
    if (!wallet) return null;
    if (!lastUpdatedAt) return "Not updated yet";
    const mins = Math.floor((Date.now() - lastUpdatedAt) / 60000);
    if (mins <= 0) return "Just now";
    if (mins === 1) return "1 minute ago";
    return `${mins} minutes ago`;
  }, [wallet, lastUpdatedAt]);

  const campaignsUpdatedText = useMemo(() => {
    if (!campaignsUpdatedAt) return "Not updated yet";
    const mins = Math.floor((Date.now() - campaignsUpdatedAt) / 60000);
    if (mins <= 0) return "Just now";
    if (mins === 1) return "1 minute ago";
    return `${mins} minutes ago`;
  }, [campaignsUpdatedAt]);

  return (
    <div className="relative">
      {/* NOTE:
          We DO NOT put a fixed full-page background here anymore.
          The global ambient background should live in AppShell so every route matches fairscale.
      */}

      {/* HERO (full-bleed) */}
      <section className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
        <div className="relative overflow-hidden">
          {/* Hero-only glows (subtle) */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-36 left-1/2 h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-purple-500/12 blur-3xl dark:bg-purple-500/16" />
            <div className="absolute top-12 right-[-220px] h-[560px] w-[560px] rounded-full bg-fuchsia-500/10 blur-3xl dark:bg-fuchsia-500/14" />
            <div className="absolute bottom-[-240px] left-[-240px] h-[620px] w-[620px] rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/14" />
            <div
              className="absolute inset-0 opacity-[0.22] dark:opacity-[0.32]"
              style={{
                background:
                  "radial-gradient(85% 70% at 12% 20%, rgba(34,211,238,0.14), transparent 60%), radial-gradient(70% 60% at 85% 38%, rgba(168,85,247,0.18), transparent 60%), radial-gradient(70% 70% at 52% 92%, rgba(245,158,11,0.10), transparent 60%)",
              }}
            />
          </div>

          {/* Hero surface so text stays readable on any global background */}
          <div className="absolute inset-0 bg-background/10 dark:bg-background/8 backdrop-blur-[2px]" />

          {/* Content */}
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-10 md:pt-14 md:pb-14">
            <div className="grid gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-purple-500/12 text-purple-200 border-purple-300/20" variant="outline">
                    Production-grade
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                    Anti-bot gating
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                    Weighted rewards
                  </Badge>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl border border-border bg-background/40 backdrop-blur-md p-2">
                    <img src="/veyra-logo.png" alt="Veyra" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Veyra</div>
                    <div className="text-base font-semibold text-foreground">Credibility-powered reward rails</div>
                  </div>
                </div>

                <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                  Run campaigns bots can’t farm.
                  <span className="block gradient-text">Credibility decides access.</span>
                </h1>

                <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                  Core operations happen inside the Telegram bot + mini app (invite-code access for projects). This site shows live
                  campaigns, eligibility, and campaign details.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button asChild className="rounded-xl">
                    <Link href="#campaigns">View live campaigns</Link>
                  </Button>

                  <Button variant="outline" asChild className="rounded-xl bg-background/40 backdrop-blur-md">
                    <Link href="#product">Explore Veyra</Link>
                  </Button>

                  <Button variant="outline" asChild className="rounded-xl bg-background/40 backdrop-blur-md">
                    <Link href="/how-it-works">How it works</Link>
                  </Button>

                  {/* NEW: Telegram bot CTA (projects) */}
                  <Button
                    variant="outline"
                    asChild
                    className="rounded-xl bg-background/40 backdrop-blur-md border-purple-300/25 hover:border-purple-300/40"
                  >
                    <a href={BOT_URL} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Open Telegram bot
                      <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                    </a>
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      Access control
                    </div>
                    <div className="mt-1 text-base font-semibold text-foreground">Tier gating</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Coins className="h-4 w-4" />
                      Distribution
                    </div>
                    <div className="mt-1 text-base font-semibold text-foreground">Weighted rewards</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Auditability
                    </div>
                    <div className="mt-1 text-base font-semibold text-foreground">Receipts</div>
                  </div>
                </div>

                {/* NEW: micro callout (projects) */}
                <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-2xl border border-border bg-background/55 backdrop-blur-md flex items-center justify-center">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">Projects: create campaigns in Telegram</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        You’ll receive an invite code, unlock the bot, then use the mini app to configure campaigns and export ops
                        reports.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right visual */}
              <div className="relative">
                <div className="pointer-events-none absolute -inset-6 rounded-[32px] bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 blur-2xl" />
                <div className="relative rounded-[28px] border border-border bg-background/30 backdrop-blur-md p-3 md:p-4">
                  <Hero3D />
                </div>
              </div>
            </div>
          </div>

          {/* Smooth transition into content */}
          <div className="h-14 w-full bg-gradient-to-b from-transparent via-background/20 to-background/35 dark:via-background/16 dark:to-background/28" />
        </div>
      </section>

      {/* Content rails */}
      <div className="mx-auto -mt-8 md:-mt-12 max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12 pb-16">
        {/* Ops-first */}
        <section className="relative overflow-hidden rounded-[28px] border border-border bg-background/40 backdrop-blur-md p-6 md:p-10">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 right-24 h-72 w-72 rounded-full bg-emerald-500/8 blur-3xl dark:bg-emerald-500/12" />
            <div className="absolute -bottom-32 left-10 h-[520px] w-[520px] rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/14" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Built for real operations</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Create campaigns, accept applications, prevent duplicates, review submissions, and export clean reports.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                  Anti-duplicate
                </Badge>
                <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                  Admin review
                </Badge>
                <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                  CSV export
                </Badge>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className={panelCard + " p-5"}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Workflow className="h-4 w-4" />
                  Create and configure
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Projects create campaigns with tier requirements, time windows, and caps (via Telegram mini app).
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="h-4 w-4" />
                  Campaigns appear automatically when live.
                </div>
              </div>

              <div className={panelCard + " p-5"}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ClipboardCheck className="h-4 w-4" />
                  Collect applications
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Applicants apply once; eligibility can be checked using credibility signals.
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="h-4 w-4" />
                  Duplicate submissions are blocked by design.
                </div>
              </div>

              <div className={panelCard + " p-5"}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Database className="h-4 w-4" />
                  Review and export
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Review entries quickly, view answers, and export professional reports.
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="h-4 w-4" />
                  Claims can produce verifiable receipts.
                </div>
              </div>
            </div>

            {/* NEW: Telegram rail */}
            <div className="mt-6 rounded-3xl border border-border bg-background/35 backdrop-blur-md p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl border border-border bg-background/55 backdrop-blur-md flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Projects run campaigns in Telegram</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Invite code → bot unlock → mini app → create campaigns, review applicants, export CSV.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild className="rounded-xl">
                    <a href={BOT_URL} target="_blank" rel="noreferrer">
                      Open bot
                      <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    className="rounded-xl bg-background/40 backdrop-blur-md"
                    onClick={() => toast.message("Invite codes are issued by the Veyra team.")}
                  >
                    <span className="inline-flex items-center">
                      <KeyRound className="mr-2 h-4 w-4" />
                      Invite code required
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product */}
        <section
          id="product"
          className="relative overflow-hidden rounded-[28px] border border-border bg-background/40 backdrop-blur-md p-6 md:p-10"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/12" />
            <div className="absolute -bottom-32 right-10 h-[520px] w-[520px] rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/14" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">A production-grade rewards stack</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Campaigns, applications, verification, and exports — with credibility gating at the core.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className={tab === "overview" ? tabBtnActive : tabBtnBase} onClick={() => setTab("overview")}>
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> Overview
                  </span>
                </button>
                <button type="button" className={tab === "usecases" ? tabBtnActive : tabBtnBase} onClick={() => setTab("usecases")}>
                  <span className="inline-flex items-center gap-2">
                    <Rocket className="h-4 w-4" /> Use cases
                  </span>
                </button>
                <button type="button" className={tab === "ops" ? tabBtnActive : tabBtnBase} onClick={() => setTab("ops")}>
                  <span className="inline-flex items-center gap-2">
                    <Workflow className="h-4 w-4" /> Operations
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-12">
              <div className="md:col-span-7 space-y-4">
                {tab === "overview" && (
                  <>
                    <Card className="rounded-2xl border border-border bg-gradient-to-br from-purple-500/10 via-background/55 to-cyan-500/10 backdrop-blur-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5" />
                          What Veyra does
                        </CardTitle>
                        <CardDescription>A modern rewards layer that is credibility-aware by default.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>
                            <span className="text-foreground font-medium">Gates access</span> using reputation tiers (e.g. Silver+).
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>
                            <span className="text-foreground font-medium">Weights allocations</span> so credible participants receive more.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>
                            <span className="text-foreground font-medium">Runs via Telegram</span>: invite code, mini app, review, export.
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card className={softCard}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Timer className="h-4 w-4" />
                            Faster launches
                          </CardTitle>
                          <CardDescription>Standardized flows reduce time to campaign.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          Create, gate, and run campaigns with operational defaults.
                        </CardContent>
                      </Card>

                      <Card className={softCard}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Coins className="h-4 w-4" />
                            Better outcomes
                          </CardTitle>
                          <CardDescription>Less farming, more real participation.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          Credibility signals keep rewards aligned with real contributors.
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}

                {tab === "usecases" && (
                  <>
                    <Card className="rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-background/55 to-purple-500/10 backdrop-blur-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Rocket className="h-5 w-5" />
                          Use cases
                        </CardTitle>
                        <CardDescription>Designed for production workflows, not demos.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                          <div className="text-sm font-semibold text-foreground">Community bounties</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Ambassador programs, content tasks, referrals, moderation incentives.
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                          <div className="text-sm font-semibold text-foreground">Builder programs</div>
                          <div className="mt-1 text-sm text-muted-foreground">Dev tasks, integrations, bug bounties, growth missions.</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                          <div className="text-sm font-semibold text-foreground">Launch campaigns</div>
                          <div className="mt-1 text-sm text-muted-foreground">Tier-gated drops and early access that stays clean.</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                          <div className="text-sm font-semibold text-foreground">Waitlist gating</div>
                          <div className="mt-1 text-sm text-muted-foreground">Allowlist users by credibility and prevent duplicates.</div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={softCard}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Why credibility matters
                        </CardTitle>
                        <CardDescription>Reduce spam without adding a manual moderation team.</CardDescription>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground space-y-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>Reduce wallet farms and scripted submissions.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>Align distribution with long-term signals.</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                          <span>Keep ops export-ready for partners and reporting.</span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {tab === "ops" && (
                  <Card className="rounded-2xl border border-border bg-gradient-to-br from-purple-500/10 via-background/55 to-amber-500/10 backdrop-blur-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Workflow className="h-5 w-5" />
                        Operational flow
                      </CardTitle>
                      <CardDescription>Built for day-to-day campaign operations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <KeyRound className="h-4 w-4" />
                          0) Invite code unlock
                        </div>
                        <div className="mt-1">Projects receive an invite code to access campaign creation in Telegram.</div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <BadgeCheck className="h-4 w-4" />
                          1) Create a campaign
                        </div>
                        <div className="mt-1">Set requirements, windows, and caps (mini app).</div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <Users className="h-4 w-4" />
                          2) Collect applications
                        </div>
                        <div className="mt-1">One submission per wallet, with credibility checks available.</div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <Database className="h-4 w-4" />
                          3) Review and export
                        </div>
                        <div className="mt-1">Review answers quickly and export clean operational CSVs.</div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/35 backdrop-blur-md p-4">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <ScrollText className="h-4 w-4" />
                          4) Receipts
                        </div>
                        <div className="mt-1">Claims can generate verifiable receipts for audit trails.</div>
                      </div>

                      <div className="pt-2">
                        <Button asChild className="rounded-xl">
                          <a href={BOT_URL} target="_blank" rel="noreferrer">
                            Open Telegram bot
                            <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="md:col-span-5 space-y-4">
                <Card className="rounded-2xl border border-border bg-background/35 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Integrity primitives
                    </CardTitle>
                    <CardDescription>What makes Veyra production-safe.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <Lock className="mt-0.5 h-4 w-4" />
                      <span>Tier gating reduces farms and low-quality participation.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Zap className="mt-0.5 h-4 w-4" />
                      <span>Weighted allocation supports fair distribution.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4" />
                      <span>Receipts support auditability and reporting.</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border bg-background/35 backdrop-blur-md">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Rocket className="h-4 w-4" />
                      Designed to scale
                    </CardTitle>
                    <CardDescription>Clear UX, clear rules, clean exports.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                      <span>Professional messaging and production polish.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                      <span>Ops-first admin tooling for review and export.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300/80" />
                      <span>Credibility-first defaults that reduce spam.</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Credibility + Boost (Screenshot-inspired) */}
        <section className="grid gap-4 md:grid-cols-2">
          {/* LEFT: Your credibility */}
          <Card className="rounded-3xl border-border bg-background/40 backdrop-blur-md overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl md:text-3xl">Your credibility</CardTitle>
                  <CardDescription>Your reputation signals determine access and how much you can earn in gated campaigns.</CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefreshScore}
                    disabled={!canRefreshScore}
                    className="rounded-2xl bg-background/50 backdrop-blur-md"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {fairscoreQuery.isFetching ? "Refreshing" : "Refresh"}
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
                  Status:{" "}
                  <span className="text-foreground">
                    {!wallet ? "Connect wallet" : fairscoreQuery.isFetching ? "Updating…" : fairscoreQuery.error ? "Unavailable" : "Ready"}
                  </span>
                </span>
                {wallet && (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground">Last updated:</span>
                    <span className="text-foreground">{lastUpdatedText}</span>
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {!wallet && (
                <div className="rounded-3xl border border-border bg-background/55 backdrop-blur-md p-5 text-sm text-muted-foreground">
                  Connect your wallet to view your FairScore, tier, and credibility badges.
                </div>
              )}

              {wallet && (
                <>
                  {/* Big gradient capsule (matches screenshot structure) */}
                  <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-400 p-[1px]">
                    <div className="rounded-3xl bg-background/70 backdrop-blur-md">
                      <div className="grid gap-3 p-5 sm:grid-cols-2">
                        {/* FairScore side */}
                        <div className="relative overflow-hidden rounded-2xl bg-black/15 dark:bg-white/10 p-4">
                          <div className="text-xs text-white/80 dark:text-white/80">FairScore</div>
                          <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
                            {fairscoreQuery.isLoading ? "—" : score === null ? "—" : formatScore(score)}
                          </div>
                          <div className="mt-1 text-xs text-white/80">Reputation signal for anti-bot gating and trust weighting.</div>

                          {/* Soft glow */}
                          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                        </div>

                        {/* Tier + Multiplier side */}
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

                          <div className="mt-1 text-xs text-white/80">Higher tiers unlock gated campaigns and can increase allocations.</div>

                          <div className="pointer-events-none absolute -left-14 -bottom-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Wallet line (small) */}
                  <div className="flex flex-col gap-1">
                    <div className="text-xs text-muted-foreground">Wallet</div>
                    <div className="truncate rounded-2xl border border-border bg-background/50 backdrop-blur-md px-4 py-2 text-sm">
                      {wallet}
                    </div>
                  </div>

                  <Separator />

                  {/* Badges list (screenshot-like) */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-foreground">Your badges</div>
                      <div className="text-sm text-muted-foreground">Badges summarize signals that influence tiering and eligibility.</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {badges.length > 0 ? `${badges.length} badge${badges.length === 1 ? "" : "s"}` : "No badges yet"}
                    </div>
                  </div>

                  {fairscoreQuery.error && (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                      <div className="text-sm font-semibold text-destructive">Could not load credibility</div>
                      <div className="mt-1 text-sm text-muted-foreground">Try again in a moment.</div>
                    </div>
                  )}

                  {badges.length === 0 && !fairscoreQuery.error && (
                    <div className="rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4 text-sm text-muted-foreground">
                      As your wallet activity grows, credibility badges will appear here automatically.
                    </div>
                  )}

                  {badges.length > 0 && (
                    <div className="space-y-3">
                      {badges.map((b) => {
                        const meta = badgeIconAndTone(b);
                        const Icon = meta.Icon;

                        return (
                          <div
                            key={b.id}
                            className={`relative overflow-hidden rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4 ${meta.rowGlow}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center ${meta.iconWrap}`}>
                                  <Icon className={`h-5 w-5 ${meta.icon}`} />
                                </div>

                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-foreground">{b.label}</div>
                                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {b.description ? b.description : "A credibility signal used for tiering and eligibility."}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {b.tier && (
                                  <span className={`hidden sm:inline-flex rounded-full border px-3 py-1 text-xs ${meta.chip}`}>{b.tier}</span>
                                )}

                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl bg-background/50 backdrop-blur-md"
                                  onClick={() => toast.message("Coming soon")}
                                >
                                  <Share2 className="mr-2 h-4 w-4" />
                                  Share
                                </Button>

                                <button
                                  type="button"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/50 backdrop-blur-md hover:bg-background/70 transition"
                                  onClick={() => toast.message("Coming soon")}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Boost your score */}
          <Card className="rounded-3xl border-border bg-background/40 backdrop-blur-md overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-2xl md:text-3xl">Boost your score</CardTitle>
              <CardDescription>
                Complete recommended actions to improve credibility over time and unlock higher-tier campaigns.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {!wallet && (
                <div className="rounded-3xl border border-border bg-background/55 backdrop-blur-md p-5 text-sm text-muted-foreground">
                  Connect your wallet to see personalized recommendations (and what to improve next).
                </div>
              )}

              {wallet && score === null && !fairscoreQuery.isFetching && !fairscoreQuery.error && (
                <div className="rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4 text-sm text-muted-foreground">
                  Fetching your credibility recommendations…
                </div>
              )}

              {wallet && fairscoreQuery.isFetching && (
                <div className="rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4 text-sm text-muted-foreground">
                  Updating recommendations…
                </div>
              )}

              {wallet && !fairscoreQuery.isFetching && !fairscoreQuery.error && actions.length === 0 && (
                <div className="rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4 text-sm text-muted-foreground">
                  No recommendations right now. Keep building healthy on-chain activity and signals will update automatically.
                </div>
              )}

              {wallet && actions.length > 0 && (
                <div className="space-y-3">
                  {actions.map((a) => {
                    const tone = actionIconTone(a);
                    const Icon = tone.Icon;
                    const pill = priorityPill(a.priority);

                    return (
                      <div key={a.id} className="rounded-2xl border border-border bg-background/55 backdrop-blur-md p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {/* Strong icon tile (light mode friendly) */}
                            <div className={`h-12 w-12 rounded-2xl ${tone.tile} ${tone.ring} flex items-center justify-center shadow-sm`}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>

                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground">{a.label}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {a.description ? a.description : "Improving this signal can increase your credibility tier over time."}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                Tip: Your tier updates as signals strengthen — it’s not instant, but it’s consistent.
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${tone.pill}`}>{pill.label}</span>
                          </div>
                        </div>

                        {a.cta && (
                          <div className="mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl bg-background/50 backdrop-blur-md"
                              onClick={() => toast.message("Coming soon")}
                            >
                              {a.cta}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Campaigns */}
        <section id="campaigns" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Live campaigns</h2>
              <p className="text-sm text-muted-foreground">Campaigns currently active on the platform.</p>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
                  Status:{" "}
                  <span className="text-foreground">
                    {campaignsQuery.isFetching ? "Updating…" : campaignsQuery.error ? "Unavailable" : "Ready"}
                  </span>
                </span>

                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Last updated:</span>
                  <span className="text-foreground">{campaignsUpdatedText}</span>
                </span>

                {wallet && tier && (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground">Your tier:</span>
                    <span className="text-foreground">{tierLabel(tier)}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                Tier gating
              </Badge>
              <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
                Weighted rewards
              </Badge>

              <Button
                variant="outline"
                size="sm"
                className="rounded-xl bg-background/40 backdrop-blur-md"
                onClick={onRefreshCampaigns}
                disabled={!canRefreshCampaigns}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {campaignsQuery.isFetching ? "Updating…" : "Refresh"}
              </Button>
            </div>
          </div>

          {/* NEW: Premium Telegram callout (matches screenshot tone) */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-background/40 backdrop-blur-md p-5">
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

            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-2xl border border-border bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-500 flex items-center justify-center shadow-sm">
                  <MessageCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Campaign creation lives in Telegram</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Projects use an invite code to unlock the bot + mini app to create campaigns and manage operations.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-xl">
                  <a href={BOT_URL} target="_blank" rel="noreferrer">
                    Open bot
                    <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl bg-background/40 backdrop-blur-md"
                  onClick={() => toast.message("Invite code access is required for campaign creation.")}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Invite code required
                </Button>
              </div>
            </div>
          </div>

          {/* Loading skeletons (more premium, less “blank”) */}
          {campaignsQuery.isLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative h-[270px] overflow-hidden rounded-3xl border border-border bg-background/35 backdrop-blur-md animate-pulse">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10" />
              </div>
              <div className="relative h-[270px] overflow-hidden rounded-3xl border border-border bg-background/35 backdrop-blur-md animate-pulse">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-purple-500/10" />
              </div>
            </div>
          )}

          {campaignsQuery.error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <div className="text-sm font-semibold text-destructive">Could not load campaigns</div>
              <div className="mt-1 text-sm text-muted-foreground">Please try again.</div>
            </div>
          )}

          {!campaignsQuery.isLoading && !campaignsQuery.error && campaigns.length === 0 && (
            <div className="rounded-3xl border border-border bg-background/35 backdrop-blur-md p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl border border-border bg-background/50 backdrop-blur-md flex items-center justify-center">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">No live campaigns right now</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Check back soon — campaigns appear automatically when they go live.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* UPDATED DESIGN: screenshot-inspired “glassy capsule + side tiles” cards */}
          {!campaignsQuery.isLoading && !campaignsQuery.error && campaigns.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.map((c) => {
                const pill = statusPill(c.startsAt, c.endsAt);

                const userRank = tierRank(tier);
                const minRank = tierRank(c.minTier);
                const hasWallet = !!wallet;
                const knownTier = !!tier;
                const eligible = hasWallet && knownTier && userRank >= minRank;

                const eligibilityChip = !hasWallet
                  ? {
                      label: "Connect wallet to check",
                      className:
                        "border-border bg-background/50 text-muted-foreground dark:bg-background/40 dark:text-muted-foreground",
                      Icon: Lock,
                    }
                  : !knownTier
                    ? {
                        label: "Checking eligibility…",
                        className:
                          "border-border bg-background/50 text-muted-foreground dark:bg-background/40 dark:text-muted-foreground",
                        Icon: Shield,
                      }
                    : eligible
                      ? {
                          label: "Eligible",
                          className:
                            "border-emerald-300/45 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 dark:border-emerald-300/25 dark:bg-emerald-500/15",
                          Icon: BadgeCheck,
                        }
                      : {
                          label: `Locked · ${c.minTier}+`,
                          className:
                            "border-amber-300/45 bg-amber-500/10 text-amber-950 dark:text-amber-100 dark:border-amber-300/25 dark:bg-amber-500/15",
                          Icon: Lock,
                        };

                const canOpen = pill.label !== "Ended";

                const statusTone =
                  pill.label === "Live"
                    ? {
                        tile: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
                        badge:
                          "border-emerald-300/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 dark:border-emerald-300/25 dark:bg-emerald-500/15",
                      }
                    : pill.label === "Upcoming"
                      ? {
                          tile: "bg-gradient-to-br from-slate-600 via-zinc-600 to-slate-500",
                          badge:
                            "border-slate-300/40 bg-slate-500/10 text-slate-900 dark:text-slate-100 dark:border-slate-300/25 dark:bg-slate-500/15",
                        }
                      : {
                          tile: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500",
                          badge: "border-border bg-background/40 text-muted-foreground",
                        };

                return (
                  <Card key={c.id} className="group relative overflow-hidden rounded-3xl border-border bg-background/40 backdrop-blur-md">
                    {/* premium ambient */}
                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition">
                      <div className="absolute -top-28 -right-28 h-72 w-72 rounded-full bg-purple-500/12 blur-3xl" />
                      <div className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-cyan-500/12 blur-3xl" />
                    </div>

                    {/* top gradient hairline like the screenshot */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-70" />

                    <CardHeader className="relative pb-3">
                      <div className="flex items-start gap-3">
                        {/* Icon tile (screenshot-like) */}
                        <div className={`h-12 w-12 rounded-2xl ${statusTone.tile} flex items-center justify-center shadow-sm ring-1 ring-white/10`}>
                          <Rocket className="h-5 w-5 text-white" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-xl leading-tight">{c.title}</CardTitle>
                              <CardDescription className="mt-1">{c.description}</CardDescription>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant={pill.variant} className={statusTone.badge}>
                                {pill.label}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${eligibilityChip.className}`}>
                              <eligibilityChip.Icon className="h-3.5 w-3.5" />
                              {eligibilityChip.label}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              {pill.label === "Ended" ? "Campaign ended" : prettyEndsIn(c.endsAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="relative space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Minimum tier</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{c.minTier}+</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Base reward</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{c.baseReward}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/50 backdrop-blur-md p-3">
                          <div className="text-xs text-muted-foreground">Allocation</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">Weighted</div>
                        </div>
                      </div>

                      {/* CTA: keep logic intact, but give it a premium two-button layout */}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {eligible && canOpen ? (
                          <Button asChild className="w-full rounded-xl">
                            <Link href={`/campaigns/${c.id}`}>View details</Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full rounded-xl bg-background/40 backdrop-blur-md"
                            onClick={() => {
                              if (!hasWallet) return toast.message("Connect your wallet to check eligibility.");
                              if (!knownTier) return toast.message("Eligibility is still loading — try again in a moment.");
                              if (!canOpen) return toast.message("This campaign has ended.");
                              return toast.message(`This campaign requires ${c.minTier}+ tier.`);
                            }}
                          >
                            {pill.label === "Ended" ? "Ended" : eligible ? "View details" : `Locked · Requires ${c.minTier}+`}
                          </Button>
                        )}

                        {/* Always show the Telegram rail (since core ops happen there) */}
                        <Button variant="outline" asChild className="w-full rounded-xl bg-background/40 backdrop-blur-md">
                          <a href={BOT_URL} target="_blank" rel="noreferrer">
                            Open bot
                            <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
