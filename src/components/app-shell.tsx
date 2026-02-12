"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";

import { Menu, X, Sparkles } from "lucide-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" className="rounded-xl">
        Connect wallet
      </Button>
    ),
  }
);

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "group relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
        "text-muted-foreground hover:text-foreground",
        active ? "text-foreground" : "",
      ].join(" ")}
    >
      <span
        className={[
          "absolute inset-0 -z-10 rounded-xl opacity-0 transition",
          "bg-gradient-to-br from-purple-500/12 via-background/40 to-cyan-500/10",
          "ring-1 ring-purple-400/10",
          active ? "opacity-100" : "group-hover:opacity-100",
        ].join(" ")}
      />
      <Sparkles className={["h-4 w-4 opacity-0 transition", active ? "opacity-100" : "group-hover:opacity-60"].join(" ")} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Telegram Mini App routes must be fullscreen and should not render the web header/footer.
  if (pathname?.startsWith("/tg")) {
    return <>{children}</>;
  }

  const isHome = pathname === "/";
  const isHow = pathname?.startsWith("/how-it-works") ?? false;

  const logoSrc = useMemo(() => "/veyra-logo.png", []);

  const year = new Date().getFullYear();

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Global ambient background (keeps all pages visually consistent) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {/* Top wash so navbar blends into page content */}
        <div className="absolute inset-x-0 top-0 h-[340px] bg-gradient-to-b from-background/90 via-background/35 to-transparent dark:from-background/80 dark:via-background/25" />

        <div className="absolute -top-48 left-1/2 h-[760px] w-[760px] -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/18" />
        <div className="absolute top-16 left-[-140px] h-[560px] w-[560px] rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/16" />
        <div className="absolute bottom-[-260px] right-[-220px] h-[820px] w-[820px] rounded-full bg-fuchsia-500/8 blur-3xl dark:bg-fuchsia-500/14" />

        <div
          className="absolute inset-0 opacity-[0.55] dark:opacity-[0.45]"
          style={{
            background:
              "radial-gradient(70% 55% at 12% 8%, rgba(168,85,247,0.16), transparent 60%), radial-gradient(70% 55% at 88% 16%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(70% 55% at 55% 92%, rgba(245,158,11,0.10), transparent 60%)",
          }}
        />

        {/* Subtle texture to prevent banding */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.025),transparent_28%,rgba(0,0,0,0.025))] dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_28%,rgba(255,255,255,0.02))]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40">
        {/* premium translucent bar */}
        <div className="border-b border-border/60 bg-background/30 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-3">
              {/* bigger logo */}
              <div className="h-12 w-12 rounded-2xl border border-border bg-background/40 backdrop-blur-md p-2">
                <img src={logoSrc} alt="Veyra" className="h-full w-full object-contain" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight">Veyra</div>
                <div className="text-xs text-muted-foreground">Credibility-powered rewards</div>
              </div>
              <Badge variant="secondary" className="ml-2">
                beta
              </Badge>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink href="/#campaigns" label="Campaigns" active={isHome} />
              <NavLink href="/how-it-works" label="How it works" active={isHow} />
            </nav>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              <ThemeToggle />

              <div className="hidden md:block">
                <WalletMultiButton />
              </div>

              {/* Mobile menu button */}
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl md:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Mobile drawer */}
          {mobileOpen && (
            <div className="md:hidden">
              <div className="mx-auto max-w-7xl px-4 pb-4">
                <div className="rounded-2xl border border-border bg-background/40 backdrop-blur-xl p-3">
                  <div className="flex flex-col gap-1">
                    <NavLink href="/#campaigns" label="Campaigns" active={isHome} onClick={() => setMobileOpen(false)} />
                    <NavLink href="/how-it-works" label="How it works" active={isHow} onClick={() => setMobileOpen(false)} />
                  </div>

                  <div className="mt-3">
                    <WalletMultiButton />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/60">
        <div className="bg-background/30 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-10">
            <div className="grid gap-8 md:grid-cols-12 md:items-start">
              {/* Left */}
              <div className="md:col-span-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl border border-border bg-background/40 backdrop-blur-md p-2">
                    <img src={logoSrc} alt="Veyra" className="h-full w-full object-contain" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold tracking-tight">Veyra</div>
                    <div className="text-xs text-muted-foreground">Credibility-powered rewards</div>
                  </div>
                </div>

                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  Run campaigns bots can’t farm. Telegram anchors identity and wallet verification, while the mini app delivers a premium
                  application and review flow.
                </p>

                <div className="mt-4 text-xs text-muted-foreground">
                  © {year} Veyra. All rights reserved.
                </div>
              </div>

              {/* Links */}
              <div className="md:col-span-7">
                <div className="grid gap-6 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Product</div>
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      <Link href="/#campaigns" className="text-muted-foreground hover:text-foreground transition">
                        Live campaigns
                      </Link>
                      <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition">
                        How it works
                      </Link>
                      <Link href="/#product" className="text-muted-foreground hover:text-foreground transition">
                        Explore Veyra
                      </Link>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-foreground">Community</div>
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      <Link href="/how-it-works#faq" className="text-muted-foreground hover:text-foreground transition">
                        FAQ
                      </Link>
                      <Link href="/how-it-works#security" className="text-muted-foreground hover:text-foreground transition">
                        Security
                      </Link>
                      <Link href="/how-it-works#roadmap" className="text-muted-foreground hover:text-foreground transition">
                        Roadmap
                      </Link>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-foreground">Legal</div>
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      <Link href="/terms" className="text-muted-foreground hover:text-foreground transition">
                        Terms
                      </Link>
                      <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition">
                        Privacy
                      </Link>
                      <Link href="/" className="text-muted-foreground hover:text-foreground transition">
                        Contact
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-2xl border border-border bg-background/40 backdrop-blur-md p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Built for real operations</div>
                      <div className="text-sm text-muted-foreground">
                        Tier gating, duplicate prevention, admin review, and export-ready reporting.
                      </div>
                    </div>
                    <Button asChild className="rounded-xl">
                      <Link href="/#campaigns">View campaigns</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom rail */}
            <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
                <span>Telegram-first source of truth • Premium mini app UX</span>
              </div>
              <div className="text-muted-foreground/90">
                Powered by reputation signals (FairScore) and tier-based eligibility.
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
