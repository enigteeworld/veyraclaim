// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useMemo, useState } from "react";
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

  const sorted = useMemo(() => {
    return (list || []).slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
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

  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;
  const startsTxt = fmtDt((selected as any)?.starts_at);
  const endsTxt = fmtDt((selected as any)?.ends_at);

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              Limited-time bounties with winners, badges, and referrals. (We&apos;ll wire apply + leaderboard next.)
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
              const sp = statusPill(b.status);
              const r = fmtReward(b);

              return (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold break-words">{b.title || "Bounty"}</div>
                      {b.description ? <div className="mt-1 text-sm text-zinc-400 break-words">{b.description}</div> : null}

                      <div className="mt-2 text-xs text-zinc-500">
                        Code: <span className="font-mono">{b.code}</span>
                        {b.min_tier ? (
                          <>
                            {" "}
                            · Min tier: <span className="font-semibold">{b.min_tier}</span>
                          </>
                        ) : null}
                        {(b as any).posted_by_name ? (
                          <>
                            {" "}
                            · Posted by: <span className="font-semibold">{(b as any).posted_by_name}</span>
                          </>
                        ) : null}
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
                      onClick={() => {
                        try {
                          // @ts-ignore
                          window?.Telegram?.WebApp?.showAlert?.("Apply flow is next. We’re starting with details UI first.");
                        } catch {
                          alert("Apply flow is next. We’re starting with details UI first.");
                        }
                      }}
                      className="h-11 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-sm font-semibold hover:brightness-110 active:scale-[0.99]"
                    >
                      Apply (next)
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
          {/* Backdrop (click to close) */}
          <button
            type="button"
            aria-label="Close details"
            onClick={closeDetails}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            {/* ✅ scroll container */}
            <div
              className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 shadow-2xl max-h-[82vh] overflow-y-auto overscroll-contain"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
            >
              <div className="p-4">
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
                        Posted by: <span className="font-semibold">{(selected as any).posted_by_name || "Veyra"}</span>
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

                {/* ABOUT */}
                {selected.description ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">About</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.description}</div>
                  </div>
                ) : null}

                {/* WHAT TO DO */}
                {(selected as any).how_to ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">What you need to do</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{(selected as any).how_to}</div>
                  </div>
                ) : null}

                {/* RULES */}
                {(selected as any).rules ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Rules / judging</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{(selected as any).rules}</div>
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
                      {typeof (selected as any).max_winners === "number" ? (selected as any).max_winners : "—"}
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
                    {(selected as any).link_url ? (
                      <a
                        href={(selected as any).link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-sm font-semibold text-purple-200 underline underline-offset-4"
                      >
                        {(selected as any).link_url}
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
                        window?.Telegram?.WebApp?.showAlert?.("Apply flow is next. We’re starting with details UI first.");
                      } catch {
                        alert("Apply flow is next. We’re starting with details UI first.");
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
            {/* ✅ end scroll container */}
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===