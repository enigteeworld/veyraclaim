// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useEffect, useMemo, useState } from "react";
import { useBounties, type Bounty } from "../_hooks/useBounties";

function pillBase(cls: string) {
  return `rounded-full border px-3 py-1 text-xs font-semibold ${cls}`;
}

function statusPill(status?: string | null) {
  const s = (status || "open").toLowerCase();
  if (s === "open") return { label: "OPEN", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" };
  if (s === "paused") return { label: "PAUSED", cls: "border-yellow-500/25 bg-yellow-500/10 text-yellow-200" };
  return { label: "CLOSED", cls: "border-red-500/25 bg-red-500/10 text-red-200" };
}

function fmtReward(b: any) {
  const r = (b?.reward ?? "").toString().trim();
  const c = (b?.currency ?? "USDC").toString().trim();
  if (!r) return null;
  return `${r} ${c}`;
}

function fmtDt(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function normTier(t?: string | null) {
  return (t || "").toString().trim().toLowerCase();
}

function tierRank(t?: string | null) {
  const order = ["bronze", "silver", "gold", "platinum"];
  const n = normTier(t);
  const idx = order.indexOf(n);
  return idx === -1 ? -1 : idx;
}

function meetsTier(userTier?: string | null, requiredTier?: string | null) {
  const u = tierRank(userTier);
  const r = tierRank(requiredTier);
  if (r <= -1) return true; // if bounty has no/unknown min_tier, don't block
  if (u <= -1) return false; // user tier unknown -> can't confirm eligibility
  return u >= r;
}

type TgMeResponse =
  | { ok: true; data: { telegram_user_id: number; saved_wallet: string | null } }
  | { ok: false; error: string };

export default function BountiesTab({
  initData,
  sid,
  // OPTIONAL: if your page.tsx already has these (from the Check tab),
  // pass them down and we’ll use them as source of truth.
  currentWallet,
  currentTier,
}: {
  initData?: string | null;
  sid?: string | null;
  currentWallet?: string | null;
  currentTier?: string | null;
}) {
  const { loading, err, list, refresh } = useBounties({ initData, sid });

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savedWallet, setSavedWallet] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  // --- Load verified wallet from /api/tg/me (POST) ---
  useEffect(() => {
    const id = (initData || "").trim();
    if (!id) return;

    let cancelled = false;

    (async () => {
      setProfileLoading(true);
      setProfileErr(null);

      try {
        const res = await fetch("/api/tg/me", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ initData: id }),
        });

        const json = (await res.json().catch(() => ({}))) as TgMeResponse;

        if (!res.ok || (json as any)?.ok === false) {
          throw new Error((json as any)?.error || `Failed to load profile (${res.status})`);
        }

        const w = (json as any)?.data?.saved_wallet ?? null;

        if (!cancelled) {
          setSavedWallet(w);
          // optional local cache (helps if you open Bounties first)
          try {
            if (w) localStorage.setItem("veyra:saved_wallet", w);
          } catch {}
        }
      } catch (e: any) {
        if (!cancelled) {
          setProfileErr(e?.message || "Failed to load profile");
          // fallback: local cache
          try {
            const w = localStorage.getItem("veyra:saved_wallet");
            if (w) setSavedWallet(w);
          } catch {}
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initData]);

  // Resolve wallet/tier for gating:
  const effectiveWallet = useMemo(() => {
    const w = (currentWallet || "").trim();
    if (w) return w;
    const sw = (savedWallet || "").trim();
    if (sw) return sw;

    try {
      const cached = (localStorage.getItem("veyra:last_wallet") || "").trim();
      return cached || null;
    } catch {
      return null;
    }
  }, [currentWallet, savedWallet]);

  const effectiveTier = useMemo(() => {
    const t = (currentTier || "").trim();
    if (t) return t;

    try {
      const cached = (localStorage.getItem("veyra:last_tier") || "").trim();
      return cached || null;
    } catch {
      return null;
    }
  }, [currentTier]);

  const sorted = useMemo(() => {
    return (list || []).slice().sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  function openDetails(b: any) {
    setSelected(b);
    setDetailsOpen(true);

    try {
      // @ts-ignore
      window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    } catch {}
  }

  function closeDetails() {
    setDetailsOpen(false);
    setTimeout(() => setSelected(null), 120);
  }

  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;
  const startsTxt = fmtDt(selected?.starts_at);
  const endsTxt = fmtDt(selected?.ends_at);

  const profileLine = useMemo(() => {
    if (profileLoading) return "Loading verified wallet…";
    if (profileErr) return profileErr;
    if (!effectiveWallet) return "No verified wallet yet — verify in the bot to apply.";
    if (!effectiveTier) return "Tier not loaded yet — open Check tab once to hydrate tier.";
    return `Apply is verified-wallet + tier-gated. (Wallet + tier ready.)`;
  }, [profileLoading, profileErr, effectiveWallet, effectiveTier]);

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              Limited-time bounties with winners, badges, and referrals.
            </div>

            <div className={`mt-2 text-sm ${profileErr ? "text-yellow-300" : "text-zinc-400"}`}>{profileLine}</div>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="h-10 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
            Loading bounties…
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
            {err}
          </div>
        )}

        {!loading && !err && sorted.length === 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
            No bounties yet.
          </div>
        )}

        {!loading && !err && sorted.length > 0 && (
          <div className="mt-4 space-y-3">
            {sorted.map((b: any) => {
              const sp = statusPill(b.status);
              const r = fmtReward(b);

              const reqTier = b.min_tier ?? null;
              const hasWallet = Boolean(effectiveWallet);
              const hasTier = Boolean(effectiveTier);

              const tierOk = meetsTier(effectiveTier, reqTier);
              const canApply = hasWallet && hasTier && tierOk;

              let applyLabel = "Apply";
              if (!hasWallet) applyLabel = "Verify wallet to apply";
              else if (!hasTier) applyLabel = "Check eligibility to apply";
              else if (!tierOk) applyLabel = `Requires ${normTier(reqTier) || "higher"} tier`;

              return (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold break-words">{b.title || "Bounty"}</div>

                      {b.description ? (
                        <div className="mt-1 text-sm text-zinc-400 break-words">{b.description}</div>
                      ) : null}

                      <div className="mt-2 text-xs text-zinc-500">
                        Code: <span className="font-mono">{b.code}</span>
                        {b.min_tier ? (
                          <>
                            {" "}
                            · Min tier: <span className="font-semibold">{b.min_tier}</span>
                          </>
                        ) : null}
                        {" "}
                        · Posted by: <span className="font-semibold">{b.posted_by_name || "Veyra"}</span>
                      </div>

                      {hasTier ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          Your tier: <span className="font-semibold">{effectiveTier}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className={pillBase(sp.cls)}>{sp.label}</div>
                    </div>
                  </div>

                  {r ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">
                      {r}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openDetails(b)}
                      className="h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                    >
                      View details
                    </button>

                    <button
                      type="button"
                      disabled={!canApply}
                      onClick={() => {
                        if (!hasWallet) {
                          try {
                            // @ts-ignore
                            window?.Telegram?.WebApp?.showAlert?.("Verify your wallet in the bot first, then come back.");
                          } catch {
                            alert("Verify your wallet in the bot first, then come back.");
                          }
                          return;
                        }
                        if (!hasTier) {
                          try {
                            // @ts-ignore
                            window?.Telegram?.WebApp?.showAlert?.("Open the Check tab once to load your tier, then come back.");
                          } catch {
                            alert("Open the Check tab once to load your tier, then come back.");
                          }
                          return;
                        }
                        if (!tierOk) {
                          try {
                            // @ts-ignore
                            window?.Telegram?.WebApp?.showAlert?.(`This bounty requires ${reqTier} tier or higher.`);
                          } catch {
                            alert(`This bounty requires ${reqTier} tier or higher.`);
                          }
                          return;
                        }

                        // Apply flow is next step (B): we will create form_sessions(kind='bounty') + bounty_applications insert.
                        try {
                          // @ts-ignore
                          window?.Telegram?.WebApp?.showAlert?.("Apply flow is next (we’re wiring it now).");
                        } catch {
                          alert("Apply flow is next (we’re wiring it now).");
                        }
                      }}
                      className={[
                        "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                        canApply
                          ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                          : "border border-white/10 bg-white/5 text-zinc-400",
                      ].join(" ")}
                    >
                      {applyLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* === END: BOUNTIES_PANEL === */}

      {/* === START: BOUNTY_DETAILS_SHEET === */}
      {detailsOpen && selected ? (
        <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            aria-label="Close details"
            onClick={closeDetails}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">{selected.title || "Bounty"}</div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className={pillBase(sPill.cls)}>{sPill.label}</div>

                    {selected.min_tier ? (
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                        Min tier: {selected.min_tier}
                      </div>
                    ) : null}

                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                      Code: <span className="font-mono">{selected.code}</span>
                    </div>

                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                      Posted by: <span className="font-semibold">{selected.posted_by_name || "Veyra"}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeDetails}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {/* Scroll container */}
              <div className="mt-3 max-h-[70vh] overflow-y-auto pr-1">
                {selected.description ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">About</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.description}</div>
                  </div>
                ) : null}

                {selected.how_to ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">What you need to do</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{selected.how_to}</div>
                  </div>
                ) : null}

                {selected.rules ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Rules / judging</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{selected.rules}</div>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Reward</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{rewardText || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Max winners</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {typeof selected.max_winners === "number" ? selected.max_winners : selected.max_winners ? String(selected.max_winners) : "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Starts</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{startsTxt || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Ends</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{endsTxt || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Published</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{selected.published ? "Yes" : "No"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Link</div>
                    {selected.link_url ? (
                      <a
                        href={selected.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-sm font-semibold text-purple-200 underline underline-offset-4"
                      >
                        {selected.link_url}
                      </a>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-zinc-100">—</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        // @ts-ignore
                        window?.Telegram?.WebApp?.showAlert?.("Apply flow is next (we’re wiring it now).");
                      } catch {
                        alert("Apply flow is next (we’re wiring it now).");
                      }
                    }}
                    className="h-12 rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-sm font-semibold hover:brightness-110 active:scale-[0.99]"
                  >
                    Apply (next)
                  </button>

                  <button
                    type="button"
                    onClick={closeDetails}
                    className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===