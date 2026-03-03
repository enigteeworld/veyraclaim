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

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;
function normTier(t?: string | null) {
  const s = String(t || "bronze").toLowerCase().trim();
  return (TIER_ORDER as readonly string[]).includes(s) ? s : "bronze";
}
function tierGte(userTier: string, minTier: string) {
  const u = TIER_ORDER.indexOf(normTier(userTier) as any);
  const m = TIER_ORDER.indexOf(normTier(minTier) as any);
  return u >= m;
}

function getHeaders(initData: string, sid?: string | null) {
  const headers: Record<string, string> = {
    "x-telegram-init-data": initData,
    "x-init-data": initData,
    "x-tg-init-data": initData,
  };
  if (sid) headers["x-app-sid"] = String(sid);
  return headers;
}

type TgMe = {
  wallet?: string | null;
  tier?: string | null;
  fairscore?: number | null;
};

export default function BountiesTab({ initData, sid }: { initData?: string | null; sid?: string | null }) {
  const init = (initData || "").trim();
  const { loading, err, list, refresh } = useBounties({ initData: init, sid });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  // Apply sheet state
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBounty, setApplyBounty] = useState<any>(null);
  const [me, setMe] = useState<TgMe | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return (list || []).slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  useEffect(() => {
    if (!init) return;
    // Load verified wallet + tier for UX (server will still enforce)
    (async () => {
      setMeErr(null);
      try {
        const res = await fetch("/api/tg/me", { method: "GET", headers: getHeaders(init, sid), cache: "no-store" });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok || json?.ok === false) throw new Error(json?.error || `Failed to load profile (${res.status})`);

        // Flexible: support {wallet,tier} or {me:{...}} shapes
        const m = (json?.me ?? json) as any;
        setMe({
          wallet: m?.wallet ?? m?.saved_wallet ?? null,
          tier: m?.tier ?? null,
          fairscore: typeof m?.fairscore === "number" ? m.fairscore : null,
        });
      } catch (e: any) {
        setMe(null);
        setMeErr(e?.message || "Failed to load profile");
      }
    })();
  }, [init, sid]);

  function openDetails(b: Bounty) {
    setSelected(b as any);
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

  function openApply(b: Bounty) {
    setApplyBounty(b as any);
    setAnswers({});
    setSubmitErr(null);
    setSubmitOk(null);
    setApplyOpen(true);
    try {
      // @ts-ignore
      window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
    } catch {}
  }

  function closeApply() {
    setApplyOpen(false);
    setTimeout(() => setApplyBounty(null), 120);
  }

  async function submitApply() {
    if (!init || !applyBounty?.id) return;

    setSubmitLoading(true);
    setSubmitErr(null);
    setSubmitOk(null);

    try {
      // 1) Create session (server will bind verified wallet + tier)
      const sRes = await fetch(`/api/tg/bounties/${applyBounty.id}/session`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getHeaders(init, sid) },
        body: JSON.stringify({}),
      });
      const sJson = await sRes.json().catch(() => ({} as any));
      if (!sRes.ok || sJson?.ok === false) {
        throw new Error(sJson?.error || `Failed to create session (${sRes.status})`);
      }
      const sidCreated = String(sJson?.sid || "").trim();
      if (!sidCreated) throw new Error("missing sid from session");

      // 2) Apply (server enforces tier + uses verified wallet)
      const aRes = await fetch(`/api/tg/bounties/${applyBounty.id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getHeaders(init, sid) },
        body: JSON.stringify({ sid: sidCreated, answers }),
      });
      const aJson = await aRes.json().catch(() => ({} as any));
      if (!aRes.ok || aJson?.ok === false) {
        throw new Error(aJson?.error || `Failed to apply (${aRes.status})`);
      }

      setSubmitOk("Application submitted ✅");
      // optional: auto-close after a beat
      setTimeout(() => closeApply(), 650);
    } catch (e: any) {
      setSubmitErr(e?.message || "Failed to submit application");
    } finally {
      setSubmitLoading(false);
    }
  }

  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;
  const startsTxt = fmtDt(selected?.starts_at);
  const endsTxt = fmtDt(selected?.ends_at);

  const meTier = normTier(me?.tier);
  const meWallet = String(me?.wallet || "").trim();
  const applyMinTier = normTier(applyBounty?.min_tier);
  const eligible = applyBounty ? (meWallet ? tierGte(meTier, applyMinTier) : false) : false;

  const schemaFields = useMemo(() => {
    const s = applyBounty?.application_schema;
    return Array.isArray(s) ? s : [];
  }, [applyBounty]);

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              Limited-time bounties with winners, badges, and referrals. (Apply is now verified-wallet + tier-gated.)
            </div>

            {meErr ? (
              <div className="mt-2 text-xs text-yellow-200/90">{meErr}</div>
            ) : meWallet ? (
              <div className="mt-2 text-xs text-zinc-400">
                Verified wallet: <span className="font-mono text-zinc-200">{meWallet.slice(0, 6)}…{meWallet.slice(-4)}</span>{" "}
                · Tier: <span className="font-semibold text-zinc-200">{meTier}</span>
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">No verified wallet yet — verify in the bot to apply.</div>
            )}
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
              const minTier = normTier(b.min_tier);
              const okTier = meWallet ? tierGte(meTier, minTier) : false;

              return (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold break-words">{b.title || "Bounty"}</div>
                      {b.description ? <div className="mt-1 text-sm text-zinc-400 break-words">{b.description}</div> : null}

                      <div className="mt-2 text-xs text-zinc-500">
                        Code: <span className="font-mono">{b.code}</span> · Min tier:{" "}
                        <span className="font-semibold">{minTier}</span>
                        {b.posted_by_name ? (
                          <>
                            {" "}
                            · Posted by: <span className="font-semibold">{b.posted_by_name}</span>
                          </>
                        ) : null}
                      </div>

                      {meWallet ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          Your tier: <span className="font-semibold">{meTier}</span> ·{" "}
                          {okTier ? (
                            <span className="text-emerald-200">Eligible</span>
                          ) : (
                            <span className="text-yellow-200">Not eligible</span>
                          )}
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
                      onClick={() => openApply(b)}
                      disabled={!meWallet || !okTier}
                      className={[
                        "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                        !meWallet || !okTier
                          ? "cursor-not-allowed border border-white/10 bg-white/5 text-zinc-500"
                          : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110",
                      ].join(" ")}
                    >
                      {!meWallet ? "Verify wallet to apply" : !okTier ? "Tier too low" : "Apply"}
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
            <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">{selected.title || "Bounty"}</div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className={pillBase(sPill.cls)}>{sPill.label}</div>

                    {selected.min_tier ? (
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                        Min tier: {normTier(selected.min_tier)}
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

              {selected.description ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
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
                    {typeof selected.max_winners === "number" ? selected.max_winners : "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-[11px] text-zinc-500">Starts</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtDt(selected.starts_at) || "—"}</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="text-[11px] text-zinc-500">Ends</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">{fmtDt(selected.ends_at) || "—"}</div>
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
                  onClick={() => openApply(selected)}
                  disabled={!meWallet || !tierGte(meTier, normTier(selected.min_tier))}
                  className={[
                    "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                    !meWallet || !tierGte(meTier, normTier(selected.min_tier))
                      ? "cursor-not-allowed border border-white/10 bg-white/5 text-zinc-500"
                      : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110",
                  ].join(" ")}
                >
                  {!meWallet ? "Verify wallet to apply" : !tierGte(meTier, normTier(selected.min_tier)) ? "Tier too low" : "Apply"}
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
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}

      {/* === START: BOUNTY_APPLY_SHEET === */}
      {applyOpen && applyBounty ? (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            aria-label="Close apply"
            onClick={closeApply}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">Apply: {applyBounty.title || "Bounty"}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                      Verified wallet: <span className="font-mono">{meWallet ? `${meWallet.slice(0, 6)}…${meWallet.slice(-4)}` : "—"}</span>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                      Your tier: <span className="font-semibold">{meTier}</span>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                      Required: <span className="font-semibold">{applyMinTier}</span>
                    </div>
                  </div>

                  {!meWallet ? (
                    <div className="mt-2 text-xs text-yellow-200">
                      You must verify your wallet in the bot before applying.
                    </div>
                  ) : !eligible ? (
                    <div className="mt-2 text-xs text-yellow-200">
                      You are not eligible for this bounty (tier too low).
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={closeApply}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {/* Dynamic schema fields */}
              {schemaFields.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {schemaFields.map((f: any, idx: number) => {
                    const key = String(f?.key || f?.id || `q_${idx}`);
                    const label = String(f?.label || "Field");
                    const type = String(f?.type || "text").toLowerCase();
                    const placeholder = String(f?.placeholder || "");
                    const required = Boolean(f?.required);

                    if (type === "textarea") {
                      return (
                        <div key={key} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="text-xs font-semibold text-zinc-200">
                            {label} {required ? <span className="text-yellow-200">*</span> : null}
                          </div>
                          <textarea
                            value={String(answers[key] ?? "")}
                            onChange={(e) => setAnswers((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="mt-2 h-28 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="text-xs font-semibold text-zinc-200">
                          {label} {required ? <span className="text-yellow-200">*</span> : null}
                        </div>
                        <input
                          value={String(answers[key] ?? "")}
                          onChange={(e) => setAnswers((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-300">
                  No application fields set for this bounty yet.
                </div>
              )}

              {submitErr ? (
                <div className="mt-3 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  {submitErr}
                </div>
              ) : null}

              {submitOk ? (
                <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {submitOk}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={submitApply}
                  disabled={!eligible || submitLoading}
                  className={[
                    "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                    !eligible || submitLoading
                      ? "cursor-not-allowed border border-white/10 bg-white/5 text-zinc-500"
                      : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110",
                  ].join(" ")}
                >
                  {submitLoading ? "Submitting…" : "Submit application"}
                </button>

                <button
                  type="button"
                  onClick={closeApply}
                  className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_APPLY_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===