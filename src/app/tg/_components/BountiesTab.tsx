// === START: FILE_BountiesTab.tsx ===
"use client";

import { useMemo } from "react";
import { useBounties } from "../_hooks/useBounties";

// If you already have cn() in your project, import it and use it.
// Keeping this file dependency-light on purpose.
function pillClass(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "open") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (s === "paused") return "border-yellow-500/25 bg-yellow-500/10 text-yellow-200";
  if (s === "closed") return "border-zinc-500/25 bg-zinc-500/10 text-zinc-200";
  return "border-white/10 bg-white/5 text-zinc-200";
}

export default function BountiesTab(props: { initData?: string | null; sid?: string | null }) {
  const { loading, err, list, refresh, canLoad } = useBounties({
    initData: props.initData,
    sid: props.sid,
  });

  const visible = useMemo(() => {
    // MVP: only show published/open-ish items; backend can also handle this
    return (list || []).filter((b) => b && b.id);
  }, [list]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold">🎯 Bounties</div>
          <div className="mt-1 text-sm text-zinc-400">
            Limited-time bounties with winners, badges, and referrals. (We’ll wire apply + leaderboard next.)
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

      {!canLoad && (
        <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
          Telegram initData not ready yet. Re-open the mini app from the bot.
        </div>
      )}

      {loading && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading bounties…</div>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">{err}</div>
      )}

      {!loading && !err && visible.length === 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
          No bounties yet.
        </div>
      )}

      {!loading && !err && visible.length > 0 && (
        <div className="mt-4 space-y-3">
          {visible.map((b) => {
            const status = (b.status || "open") as string;
            const rewardText =
              (b.reward && String(b.reward).trim()) || (b.currency ? `Reward in ${b.currency}` : "Reward available");

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
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                      {rewardText}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${pillClass(status)}`}>
                      {status.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* MVP: placeholder actions (we’ll add Apply + share/referral next) */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                    onClick={() => {
                      // Step 4 will implement view/apply modal
                      // For now: no-op
                    }}
                  >
                    View details
                  </button>

                  <button
                    type="button"
                    className="h-11 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-sm font-semibold hover:brightness-110 active:scale-[0.99]"
                    onClick={() => {
                      // Step 5 will implement apply flow + form_sessions(kind='bounty')
                      // For now: no-op
                    }}
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
  );
}
// === END: FILE_BountiesTab.tsx ===

