// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useEffect, useMemo, useState } from "react";
import { useBounties, type Bounty } from "../_hooks/useBounties";

function pillBase(cls: string) {
  return `rounded-full border px-3 py-1 text-xs font-semibold ${cls}`;
}

function statusPill(status?: string | null) {
  const s = (status || "open").toLowerCase();
  if (s === "open")
    return {
      label: "OPEN",
      cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
    };
  if (s === "paused")
    return {
      label: "PAUSED",
      cls: "border-yellow-500/25 bg-yellow-500/10 text-yellow-200",
    };
  return {
    label: "CLOSED",
    cls: "border-red-500/25 bg-red-500/10 text-red-200",
  };
}

function fmtReward(b: Bounty) {
  const r = (b.reward ?? "").toString().trim();
  const c = (b.currency ?? "USDC").toString().trim();
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
  const v = (t || "").toString().trim().toLowerCase();
  return v || null;
}

function tierRank(t?: string | null) {
  const v = normTier(t);
  // adjust if you have different tier names
  const order = ["bronze", "silver", "gold", "platinum", "diamond"];
  const idx = v ? order.indexOf(v) : -1;
  return idx >= 0 ? idx : -1;
}

function tierMeets(userTier?: string | null, minTier?: string | null) {
  const u = tierRank(userTier);
  const m = tierRank(minTier);
  if (m < 0) return true; // no min tier configured
  if (u < 0) return false; // user tier unknown
  return u >= m;
}

function safeGetLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLS(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

function getAnyLS(keys: string[]) {
  for (const k of keys) {
    const v = safeGetLS(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export default function BountiesTab({
  initData,
  sid,
}: {
  initData?: string | null;
  sid?: string | null;
}) {
  const { loading, err, list, refresh } = useBounties({ initData, sid });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Bounty | null>(null);

  // --- profile + tier hydration (wallet comes from /api/tg/me or cached) ---
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savedWallet, setSavedWallet] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string | null>(null);

  // localStorage fallback keys (so this works even if /me isn’t populated yet)
  const WALLET_KEYS = useMemo(
    () => [
      "veyra:saved_wallet",
      "saved_wallet",
      "telegram_saved_wallet",
      "tg_saved_wallet",
      "wallet",
      "tg_wallet",
      "verified_wallet",
    ],
    []
  );

  const TIER_KEYS = useMemo(
    () => [
      "veyra:tier",
      "eligibility:tier",
      "tier",
      "fair_tier",
      "eligibility_tier",
      "veyra:eligibility_tier",
    ],
    []
  );

  // Load cached wallet/tier immediately (fast UI)
  useEffect(() => {
    const w = getAnyLS(WALLET_KEYS);
    if (w) setSavedWallet(w);

    const t = getAnyLS(TIER_KEYS);
    if (t) setUserTier(t);
  }, [WALLET_KEYS, TIER_KEYS]);

  // Hydrate wallet from /api/tg/me (authoritative for “verified in bot”)
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
          body: JSON.stringify({ initData: id }),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({} as any));
        if (!res.ok || json?.ok === false) {
          // 401/405/500 etc
          throw new Error(json?.error || `Failed to load profile (${res.status})`);
        }

        const w = String(json?.data?.saved_wallet || "").trim();
        if (!cancelled) {
          if (w) {
            setSavedWallet(w);
            safeSetLS("veyra:saved_wallet", w);
          }
        }
      } catch (e: any) {
        if (!cancelled) setProfileErr(e?.message || "Failed to load profile");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initData]);

  // If tier becomes available later (e.g. user visits Check tab), pick it up
  useEffect(() => {
    const interval = setInterval(() => {
      const t = getAnyLS(TIER_KEYS);
      if (t && t !== userTier) setUserTier(t);
      const w = getAnyLS(WALLET_KEYS);
      if (w && w !== savedWallet) setSavedWallet(w);
    }, 1200);

    return () => clearInterval(interval);
  }, [TIER_KEYS, WALLET_KEYS, userTier, savedWallet]);

  const sorted = useMemo(() => {
    return (list || [])
      .slice()
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  function openDetails(b: Bounty) {
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

  const selectedAny = selected as any;
  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;

  const startsTxt = fmtDt(selectedAny?.starts_at);
  const endsTxt = fmtDt(selectedAny?.ends_at);

  const haveWallet = Boolean(savedWallet);
  const haveTier = Boolean(normTier(userTier));
  const canAttemptApply = haveWallet && haveTier;

  function applyLabelFor(minTier?: string | null) {
    if (!haveWallet) return "Verify wallet to apply";
    if (!haveTier) return "Check eligibility to apply";
    if (!tierMeets(userTier, minTier)) return `Requires ${minTier || "higher"} tier`;
    return "Apply";
  }

  function applyDisabledFor(b: any) {
    if (!haveWallet) return true;
    if (!haveTier) return true;
    if (!tierMeets(userTier, b?.min_tier)) return true;
    return false;
  }

  function onApplyClick(b: any) {
    // B (Apply flow) will replace this handler with the real flow.
    // For now: give correct feedback depending on what’s missing.
    if (!haveWallet) {
      try {
        // @ts-ignore
        window?.Telegram?.WebApp?.showAlert?.("No verified wallet yet. Verify inside the bot, then reopen the mini app.");
      } catch {
        alert("No verified wallet yet. Verify inside the bot, then reopen the mini app.");
      }
      return;
    }

    if (!haveTier) {
      try {
        // @ts-ignore
        window?.Telegram?.WebApp?.showAlert?.("Tier not loaded yet. Open the Check tab once (or tap Check now) to hydrate tier.");
      } catch {
        alert("Tier not loaded yet. Open the Check tab once (or tap Check now) to hydrate tier.");
      }
      return;
    }

    if (!tierMeets(userTier, b?.min_tier)) {
      try {
        // @ts-ignore
        window?.Telegram?.WebApp?.showAlert?.(
          `This bounty requires at least ${b?.min_tier}. Your tier is ${userTier || "unknown"}.`
        );
      } catch {
        alert(`This bounty requires at least ${b?.min_tier}. Your tier is ${userTier || "unknown"}.`);
      }
      return;
    }

    try {
      // @ts-ignore
      window?.Telegram?.WebApp?.showAlert?.("Apply flow is next (we’re wiring it now).");
    } catch {
      alert("Apply flow is next (we’re wiring it now).");
    }
  }

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              Limited-time bounties with winners, badges, and referrals. (Apply is verified-wallet + tier-gated.)
            </div>

            {/* small status line */}
            <div className="mt-2 text-xs text-zinc-400">
              {profileLoading ? (
                <>Loading profile…</>
              ) : profileErr ? (
                <span className="text-yellow-200">{profileErr}</span>
              ) : !haveWallet ? (
                <>No verified wallet yet — verify in the bot to apply.</>
              ) : !haveTier ? (
                <>Tier not loaded yet — open Check tab once to hydrate tier.</>
              ) : (
                <>Wallet + tier ready.</>
              )}
            </div>
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
            {sorted.map((b) => {
              const anyB = b as any;
              const sp = statusPill(b.status);
              const r = fmtReward(b);

              const postedBy = (anyB?.posted_by_name || "Veyra").toString();

              const applyDisabled = applyDisabledFor(anyB);
              const applyLabel = applyLabelFor(anyB?.min_tier);

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
                        · Posted by: <span className="font-semibold">{postedBy}</span>
                      </div>
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
                      disabled={applyDisabled}
                      onClick={() => onApplyClick(anyB)}
                      className={[
                        "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                        applyDisabled
                          ? "border border-white/10 bg-white/5 text-zinc-400"
                          : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110",
                      ].join(" ")}
                    >
                      {applyDisabled ? applyLabel : "Apply (next)"}
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
          {/* backdrop */}
          <button
            type="button"
            aria-label="Close details"
            onClick={closeDetails}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* sheet */}
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
                      Posted by:{" "}
                      <span className="font-semibold">{String((selectedAny?.posted_by_name || "Veyra") ?? "Veyra")}</span>
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

              {/* scrollable body */}
              <div
                className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain pb-4"
                style={{ WebkitOverflowScrolling: "touch" } as any}
              >
                {/* ABOUT */}
                {selected.description ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">About</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.description}</div>
                  </div>
                ) : null}

                {/* WHAT TO DO */}
                {selectedAny?.how_to ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">What you need to do</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{String(selectedAny.how_to)}</div>
                  </div>
                ) : null}

                {/* RULES */}
                {selectedAny?.rules ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Rules / judging</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{String(selectedAny.rules)}</div>
                  </div>
                ) : null}

                {/* META GRID */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Reward</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{rewardText || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Max winners</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {typeof selectedAny?.max_winners === "number" ? selectedAny.max_winners : "—"}
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
                    {selectedAny?.link_url ? (
                      <a
                        href={String(selectedAny.link_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-sm font-semibold text-purple-200 underline underline-offset-4"
                      >
                        {String(selectedAny.link_url)}
                      </a>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-zinc-100">—</div>
                    )}
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={applyDisabledFor(selectedAny)}
                    onClick={() => onApplyClick(selectedAny)}
                    className={[
                      "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                      applyDisabledFor(selectedAny)
                        ? "border border-white/10 bg-white/5 text-zinc-400"
                        : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110",
                    ].join(" ")}
                  >
                    {applyDisabledFor(selectedAny) ? applyLabelFor(selectedAny?.min_tier) : "Apply (next)"}
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
              {/* end scroll body */}
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===