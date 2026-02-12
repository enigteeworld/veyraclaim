"use client";

import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, KeyRound, Lock, MessageCircle, Sparkles, Workflow } from "lucide-react";

const BOT_URL = "https://t.me/Veyraclaim_Bot";

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
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

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
              Telegram-first ops
            </Badge>
            <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
              Tier gating
            </Badge>
            <Badge variant="outline" className="border-border bg-background/40 backdrop-blur-md">
              Weighted rewards
            </Badge>
          </div>

          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">How it works</h1>
            <p className="mt-2 text-muted-foreground">
              Veyra uses FairScore as core logic: gating eligibility + weighting allocation — with the operational workflow living in
              Telegram (bot + mini app).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-xl">
              <a href={BOT_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Open Telegram bot
                <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
              </a>
            </Button>

            <Button
              variant="outline"
              className="rounded-xl bg-background/40 backdrop-blur-md"
              onClick={() => toast.message("Invite codes are issued by the Veyra team.")}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Invite code for projects
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background/60 backdrop-blur-md p-5 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">Key idea:</span> We don’t create reputation. We read an external reputation signal
        derived from your wallet’s existing on-chain history. That means a first-time visitor can already be high-tier (or low-tier),
        depending on their wallet activity.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              0) Project access
            </CardTitle>
            <CardDescription>Invite-code gated.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Projects receive an invite code, unlock the Telegram bot, then use the mini app to create campaigns and manage applicants.
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              1) Reputation gate
            </CardTitle>
            <CardDescription>Keep farmers out.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Each campaign can require a minimum tier (e.g., Silver+). If you don’t meet it, you can’t participate.
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              2) Reputation weighting
            </CardTitle>
            <CardDescription>Reward credible users more.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Eligible users receive a multiplier based on tier. Allocation = base × multiplier.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              3) Telegram workflow
            </CardTitle>
            <CardDescription>Bot + mini app.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Applications, duplicate protection, review, and CSV export are handled in the Telegram flows (the ops-first system).
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              4) Site visibility
            </CardTitle>
            <CardDescription>Clear, public-facing view.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This website shows live campaigns, eligibility previews, and campaign details — with clean, production-grade UX.
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-background/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              5) Proof (next)
            </CardTitle>
            <CardDescription>Public receipts.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Next step: record claims as receipts so results are verifiable and export-friendly for partners.
          </CardContent>
        </Card>
      </div>

      <div className="rounded-3xl border border-border bg-background/40 backdrop-blur-md p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-500 flex items-center justify-center shadow-sm ring-1 ring-white/10">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Ready to run a campaign?</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Open the bot to start the Telegram-first flow (invite code required for campaign creation).
              </div>
            </div>
          </div>

          <Button asChild className="rounded-xl">
            <a href={BOT_URL} target="_blank" rel="noreferrer">
              Open Telegram bot
              <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
