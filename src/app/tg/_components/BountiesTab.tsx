// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useMemo, useState } from "react";
import { useBounties, type Bounty } from "../_hooks/useBounties";

type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

type BountyApplySession = {
  sid: string;
  bounty: {
    id: string;
    title?: string | null;
    description?: string | null;
    instructions?: string | null;
    min_tier?: string | null;
    reward?: number | null;
    currency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    status?: string | null;
    link_url?: string | null;
    max_winners?: number | null;
    questions?: AppQuestion[];
  };
  profile: { wallet: string; tier: string; fairscore: number | null };
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getTg() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

/** Ensure Telegram WebApp script is loaded (fixes missing initData on some clients) */
function ensureTelegramScript(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();

    // @ts-ignore
    if (window.Telegram?.WebApp) return resolve();

    const existing = document.querySelector('script[data-tg-webapp="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => resolve());
      return;
    }

    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.defer = true;
    // @ts-ignore
    s.dataset.tgWebapp = "1";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

/**
 * IMPORTANT:
 * Your backend parser (per screenshot) checks these keys:
 * - x-telegram-init-data
 * - x-init-data
 * - x-tg-init-data
 *
 * Previously this file sent "x-telegram-initdata" / "x-tg-initdata" (missing hyphen),
 * so the backend often read empty initData -> session fails -> Apply loops.
 */
function tgInitHeaders(initData: string) {
  const id = (initData || "").toString();
  if (!id) return {};
  return {
    // ✅ exact keys backend reads
    "x-telegram-init-data": id,
    "x-init-data": id,
    "x-tg-init-data": id,

    // ✅ keep a couple extra variants (harmless)
    "x-telegram-initdata": id,
    "x-tg-initdata": id,
  } as Record<string, string>;
}

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

function safeStringify(v: any) {
  try {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  } catch {
    return String(v ?? "");
  }
}

export default function BountiesTab({ initData, sid }: { initData?: string | null; sid?: string | null }) {
  const { loading, err, list, refresh } = useBounties({ initData, sid });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Bounty | null>(null);

  // Apply flow state
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyErr, setApplyErr] = useState<string>("");
  const [applyOk, setApplyOk] = useState<string>("");
  const [applySession, setApplySession] = useState<BountyApplySession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const sorted = useMemo(() => {
    return (list || [])
      .slice()
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  async function getBestInitData(): Promise<string> {
    await ensureTelegramScript();
    const tg = getTg();
    const id = (tg?.initData || initData || "").toString();
    return id;
  }

  function openDetails(b: Bounty) {
    setSelected(b);
    setDetailsOpen(true);
    try {
      getTg()?.HapticFeedback?.impactOccurred?.("light");
    } catch {}
  }

  function closeDetails() {
    setDetailsOpen(false);
    setTimeout(() => setSelected(null), 120);
  }

  function closeApply() {
    setApplyOpen(false);
    setApplyErr("");
    setApplyOk("");
    setApplySession(null);
    setAnswers({});
  }

  async function startApply(b: any) {
    setApplyErr("");
    setApplyOk("");
    setApplyLoading(true);
    setApplySession(null);
    setAnswers({});

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen the mini app.");

      // ✅ A: session endpoint
      const res = await fetch("/api/tg/bounty/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...tgInitHeaders(id) },
        body: JSON.stringify({
          bounty_id: b?.id,
          initData: id,
          init_data: id,
          initDataRaw: id,
        }),
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `Could not start apply (${res.status})`);
      }

      const session = j.data as BountyApplySession;
      setApplySession(session);

      const qs = (session?.bounty?.questions || []) as AppQuestion[];
      const init: Record<string, string> = {};
      for (const q of qs) init[q.id] = "";
      setAnswers(init);

      setApplyOpen(true);
      getTg()?.HapticFeedback?.notificationOccurred?.("success");
    } catch (e: any) {
      setApplyErr(e?.message || "Could not start apply.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setApplyLoading(false);
    }
  }

  async function submitBountyApplication() {
    if (!applySession?.sid) return;

    setApplyErr("");
    setApplyOk("");
    setApplyLoading(true);

    try {
      // Basic client validation (required + maxLen)
      const qs = (applySession?.bounty?.questions || []) as AppQuestion[];
      for (const q of qs) {
        const v = (answers[q.id] || "").trim();
        const required = q.required !== false;
        if (required && !v) throw new Error(`Please answer: ${q.label}`);
        if (typeof (q as any).maxLen === "number" && v.length > (q as any).maxLen) {
          throw new Error(`Too long: ${q.label} (max ${(q as any).maxLen})`);
        }
      }

      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen the mini app.");

      // ✅ A: submit endpoint
      const res = await fetch("/api/tg/bounty/submit", {
        method: "POST",
        headers: { "content-type": "application/json", ...tgInitHeaders(id) },
        body: JSON.stringify({
          sid: applySession.sid,
          initData: id,
          init_data: id,
          initDataRaw: id,
          answers,
        }),
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `Submit failed (${res.status})`);
      }

      setApplyOk(j?.message || "✅ Submitted");
      getTg()?.HapticFeedback?.notificationOccurred?.("success");
      setTimeout(() => closeApply(), 700);
    } catch (e: any) {
      setApplyErr(e?.message || "Failed to submit.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setApplyLoading(false);
    }
  }

  const selectedAny = selected as any;
  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              Limited-time bounties with winners, badges, and referrals. Apply is verified-wallet + tier-gated.
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

        {err ? (
          <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading bounties…</div>
        ) : null}

        {!loading && !err && sorted.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
            No bounties yet.
          </div>
        ) : null}

        {!loading && !err && sorted.length > 0 ? (
          <div className="mt-4 space-y-3">
            {sorted.map((b: any) => {
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
                            · Min tier: <span className="font-semibold">{String(b.min_tier)}</span>
                          </>
                        ) : null}
                        {b.posted_by_name ? (
                          <>
                            {" "}
                            · Posted by: <span className="font-semibold">{String(b.posted_by_name)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className={pillBase(sp.cls)}>{sp.label}</div>
                    </div>
                  </div>

                  {r ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100">{r}</div>
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
                      disabled={applyLoading}
                      onClick={() => startApply(b)}
                      className={cn(
                        "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                        applyLoading ? "border border-white/10 bg-white/5 text-zinc-400" : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                      )}
                    >
                      {applyLoading ? "Starting…" : "Apply"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
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
                    {selectedAny?.min_tier ? (
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                        Min tier: {String(selectedAny.min_tier)}
                      </div>
                    ) : null}
                    {selectedAny?.code ? (
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                        Code: <span className="font-mono">{String(selectedAny.code)}</span>
                      </div>
                    ) : null}
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

              <div className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
                {selected.description ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">About</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.description}</div>
                  </div>
                ) : null}

                {selectedAny?.instructions ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Instructions</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{String(selectedAny.instructions)}</div>
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
                      {typeof selectedAny?.max_winners === "number" ? selectedAny.max_winners : "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Starts</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtDt(selectedAny?.starts_at) || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Ends</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtDt(selectedAny?.ends_at) || "—"}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:col-span-2">
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

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={applyLoading}
                    onClick={() => startApply(selectedAny)}
                    className={cn(
                      "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                      applyLoading ? "border border-white/10 bg-white/5 text-zinc-400" : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                    )}
                  >
                    {applyLoading ? "Starting…" : "Apply"}
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

      {/* === START: APPLY_SHEET === */}
      {applyOpen && applySession ? (
        <div className="fixed inset-0 z-[90]">
          <button type="button" aria-label="Close apply" onClick={closeApply} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">{applySession.bounty.title || "Bounty application"}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Wallet: <span className="font-mono">{applySession.profile.wallet}</span> · Tier:{" "}
                    <span className="font-semibold">{applySession.profile.tier}</span>
                    {typeof applySession.profile.fairscore === "number" ? (
                      <>
                        {" "}
                        · FairScore: <span className="font-mono">{applySession.profile.fairscore.toFixed(1)}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeApply}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {applyErr ? (
                <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{applyErr}</div>
              ) : null}

              {applyOk ? (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{applyOk}</div>
              ) : null}

              <div className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
                {applySession.bounty.instructions ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Instructions</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{applySession.bounty.instructions}</div>
                  </div>
                ) : null}

                <div className="mt-3 space-y-3">
                  {((applySession.bounty.questions || []) as AppQuestion[]).length === 0 ? (
                    <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
                      No application questions configured for this bounty.
                    </div>
                  ) : (
                    (applySession.bounty.questions || []).map((q) => {
                      const v = answers[q.id] ?? "";
                      const required = q.required !== false;

                      if (q.type === "select") {
                        return (
                          <label key={q.id} className="block">
                            <div className="mb-1 text-xs text-zinc-400">
                              {q.label} {required ? <span className="text-red-300">*</span> : null}
                            </div>
                            <select
                              value={v}
                              onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                              className={cn(
                                "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                                "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                              )}
                            >
                              <option value="">Select…</option>
                              {(q.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      }

                      if (q.type === "textarea") {
                        return (
                          <label key={q.id} className="block">
                            <div className="mb-1 text-xs text-zinc-400">
                              {q.label} {required ? <span className="text-red-300">*</span> : null}
                            </div>
                            <textarea
                              value={v}
                              onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                              rows={4}
                              placeholder={q.placeholder || "Type your answer…"}
                              className={cn(
                                "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm outline-none",
                                "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                              )}
                              maxLength={typeof q.maxLen === "number" ? q.maxLen : undefined}
                            />
                            {typeof q.maxLen === "number" ? (
                              <div className="mt-1 text-xs text-zinc-500">
                                {Math.min(v.length, q.maxLen)}/{q.maxLen}
                              </div>
                            ) : null}
                          </label>
                        );
                      }

                      return (
                        <label key={q.id} className="block">
                          <div className="mb-1 text-xs text-zinc-400">
                            {q.label} {required ? <span className="text-red-300">*</span> : null}
                          </div>
                          <input
                            value={v}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                            placeholder={q.placeholder || "Type your answer…"}
                            className={cn(
                              "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                              "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                            )}
                            maxLength={typeof q.maxLen === "number" ? q.maxLen : undefined}
                          />
                          {typeof q.maxLen === "number" ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {Math.min(v.length, q.maxLen)}/{q.maxLen}
                            </div>
                          ) : null}
                        </label>
                      );
                    })
                  )}

                  <button
                    type="button"
                    disabled={applyLoading}
                    onClick={submitBountyApplication}
                    className={cn(
                      "h-12 w-full rounded-2xl text-sm font-semibold",
                      "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]",
                      applyLoading && "opacity-70"
                    )}
                  >
                    {applyLoading ? "Submitting…" : "Submit application"}
                  </button>

                  <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-300">Debug</summary>
                    <pre className="mt-2 max-h-[240px] overflow-auto rounded-xl bg-black/30 p-3 text-xs text-zinc-200">
                      {safeStringify({ sid: applySession.sid, answers })}
                    </pre>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: APPLY_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===

