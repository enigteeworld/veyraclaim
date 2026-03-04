// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useEffect, useMemo, useState } from "react";

type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

type Bounty = {
  id: string;
  code?: string | null;
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
  questions?: AppQuestion[] | null;
  created_at?: string | null;
  posted_by_name?: string | null;
};

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

type HydratedProfile = {
  wallet: string;
  tier: string;
  fairscore: number | null;
};

type AdminQuestionDraft = {
  id: string;
  type: "text" | "textarea" | "select";
  label: string;
  required: boolean;
  placeholder: string;
  maxLen: string;
  optionsCsv: string;
};

type AdminBountyDraft = {
  code: string;
  title: string;
  description: string;
  instructions: string;
  minTier: string;
  reward: string;
  currency: string;
  maxWinners: string;
  linkUrl: string;
  status: "open" | "paused" | "closed";
  startsAt: string; // ISO-local (datetime-local)
  endsAt: string; // ISO-local
  questions: AdminQuestionDraft[];
};

type AdminBountyApplicationRow = {
  id: string;
  created_at?: string | null;
  telegram_user_id?: number | null;
  username?: string | null;
  wallet?: string | null;
  tier?: string | null;
  fairscore?: number | null;
  answers?: Record<string, any> | null;
  is_duplicate?: boolean | null;
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
 * Backend parser checks:
 * - x-telegram-init-data
 * - x-init-data
 * - x-tg-init-data
 */
function tgInitHeaders(initData: string) {
  const id = (initData || "").toString();
  if (!id) return {};
  return {
    "x-telegram-init-data": id,
    "x-init-data": id,
    "x-tg-init-data": id,

    // extra variants (harmless)
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

function tierRank(t?: string | null) {
  const s = String(t || "").toLowerCase();
  const order = ["none", "bronze", "silver", "gold", "platinum", "diamond"];
  const i = order.indexOf(s);
  return i === -1 ? 0 : i;
}

function nowMs() {
  return Date.now();
}

function withinWindow(starts_at?: string | null, ends_at?: string | null) {
  const n = nowMs();
  if (starts_at) {
    const s = new Date(starts_at).getTime();
    if (!Number.isNaN(s) && n < s) return { ok: false, reason: "Not started yet" };
  }
  if (ends_at) {
    const e = new Date(ends_at).getTime();
    if (!Number.isNaN(e) && n > e) return { ok: false, reason: "Ended" };
  }
  return { ok: true as const };
}

function shortAddr(addr: string, head = 6, tail = 4) {
  const a = String(addr || "").trim();
  if (!a) return "";
  if (a.length <= head + tail + 3) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

async function tryCopy(text: string) {
  try {
    if (!text) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function parseScoreAny(v: any): number | null {
  const scoreRaw =
    v?.data?.fairscore ??
    v?.data?.fairScore ??
    v?.data?.fair_score ??
    v?.data?.score ??
    v?.data?.value ??
    v?.fairscore ??
    v?.fairScore ??
    v?.fair_score ??
    v?.score ??
    v?.value ??
    v?.data?.data?.fairscore ??
    v?.data?.data?.fairScore ??
    v?.data?.data?.fair_score ??
    v?.data?.data?.score ??
    v?.data?.data?.value ??
    null;

  const n =
    typeof scoreRaw === "number" ? scoreRaw : typeof scoreRaw === "string" ? Number(scoreRaw) : Number(scoreRaw ?? NaN);

  return Number.isFinite(n) ? n : null;
}

function makeId(prefix = "q") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function escapeCsvCell(v: any) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") return;

  const bom = mime.startsWith("text/csv") ? "\ufeff" : "";
  const blob = new Blob([bom + content], { type: mime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function prettifyKey(k: string) {
  const x = String(k || "").trim();
  if (!x) return "Answer";
  const clean = x.replace(/^q[_-]?/i, "").replace(/[_-]+/g, " ").trim();
  return clean
    .split(" ")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
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

function formatAnswerValue(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.trim() ? v : "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : safeStringify(x))).join(", ");
  return safeStringify(v);
}

function defaultBountyQuestionDrafts(): AdminQuestionDraft[] {
  return [
    {
      id: makeId("q"),
      type: "text",
      label: "Project link",
      required: true,
      placeholder: "https://…",
      maxLen: "240",
      optionsCsv: "",
    },
    {
      id: makeId("q"),
      type: "text",
      label: "Anything else",
      required: true,
      placeholder: "Type your answer…",
      maxLen: "240",
      optionsCsv: "",
    },
  ];
}

export default function BountiesTab({
  initData,
  sid,
  isAdmin,
  adminSid,
}: {
  initData?: string | null;
  sid?: string | null;
  isAdmin?: boolean;
  adminSid?: string | null;
}) {
  const adminMode = !!isAdmin;

  // list state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [list, setList] = useState<Bounty[]>([]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Bounty | null>(null);

  // Profile hydration (wallet + tier + fairscore) - only needed for user apply gating
  const [profile, setProfile] = useState<HydratedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Apply flow (user)
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyErr, setApplyErr] = useState<string>("");
  const [applyOk, setApplyOk] = useState<string>("");
  const [applySession, setApplySession] = useState<BountyApplySession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Admin create sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createErr, setCreateErr] = useState<string>("");
  const [createOkMsg, setCreateOkMsg] = useState<string>("");

  const [draft, setDraft] = useState<AdminBountyDraft>({
    code: "BNTY-",
    title: "New bounty",
    description: "Describe this bounty in one line.",
    instructions: "Describe exactly what participants must do and what proof they should submit.",
    minTier: "bronze",
    reward: "",
    currency: "USDC",
    maxWinners: "10",
    linkUrl: "",
    status: "open",
    startsAt: "",
    endsAt: "",
    questions: defaultBountyQuestionDrafts(),
  });

  // Admin: applications modal
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsBounty, setAppsBounty] = useState<Bounty | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsErr, setAppsErr] = useState("");
  const [apps, setApps] = useState<AdminBountyApplicationRow[]>([]);
  const [appsQuery, setAppsQuery] = useState("");
  const [appsSort, setAppsSort] = useState<"recent" | "tier" | "fairscore">("recent");

  const sorted = useMemo(() => {
    return (list || [])
      .slice()
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  const sortedFilteredApps = useMemo(() => {
    const q = (appsQuery || "").trim().toLowerCase();
    let rows = apps.slice();

    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.id,
          r.username,
          r.wallet,
          r.tier,
          typeof r.fairscore === "number" ? String(r.fairscore) : r.fairscore ? String(r.fairscore) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const rank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

    rows.sort((a, b) => {
      if (appsSort === "tier") {
        const ta = rank[String(a.tier || "").toLowerCase()] || 0;
        const tb = rank[String(b.tier || "").toLowerCase()] || 0;
        if (tb !== ta) return tb - ta;

        const fa = typeof a.fairscore === "number" ? a.fairscore : Number(a.fairscore || 0);
        const fb = typeof b.fairscore === "number" ? b.fairscore : Number(b.fairscore || 0);
        return fb - fa;
      }

      if (appsSort === "fairscore") {
        const fa = typeof a.fairscore === "number" ? a.fairscore : Number(a.fairscore || 0);
        const fb = typeof b.fairscore === "number" ? b.fairscore : Number(b.fairscore || 0);
        return fb - fa;
      }

      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return rows;
  }, [apps, appsQuery, appsSort]);

  async function getBestInitData(): Promise<string> {
    await ensureTelegramScript();
    const tg = getTg();
    const id = (tg?.initData || initData || "").toString();
    return id;
  }

  async function refresh() {
    setErr("");
    setLoading(true);

    try {
      const id = await getBestInitData();
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...tgInitHeaders(id),
      };

      // Admin list uses adminSid headers to prevent leaking public/user list
      const url = adminMode ? "/api/tg/admin/bounties" : "/api/tg/bounties";

      if (adminMode && adminSid) {
        headers["x-admin-sid"] = adminSid;
        headers["x-app-sid"] = adminSid;
      }

      const res = await fetch(url, { method: "GET", headers });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Bounties unavailable (${res.status})`);

      const rows = (j.bounties || j.data || []) as any[];
      if (!Array.isArray(rows)) throw new Error("Invalid bounties payload.");

      setList(rows as Bounty[]);
    } catch (e: any) {
      setErr(e?.message || "Could not load bounties.");
    } finally {
      setLoading(false);
    }
  }

  async function hydrateProfile(opts?: { forceVerify?: boolean }) {
    if (adminMode) return; // admin doesn’t need user gating profile

    setProfileErr("");
    setProfileLoading(true);
    setCopied(false);

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen the mini app.");

      // 1) Get wallet + cached tier/score from /api/tg/me (fast path)
      const meRes = await fetch("/api/tg/me", { method: "GET", headers: { ...tgInitHeaders(id) } });
      const meJson = (await meRes.json().catch(() => null)) as any;
      if (!meRes.ok || !meJson?.ok) throw new Error(meJson?.error || `Failed to load profile (${meRes.status})`);

      const wallet =
        (meJson?.data?.saved_wallet ||
          meJson?.data?.wallet ||
          meJson?.wallet ||
          meJson?.data?.savedWallet ||
          "")?.toString() || "";

      const tierRaw = meJson?.data?.last_known_tier ?? meJson?.data?.tier ?? meJson?.tier ?? "bronze";
      const tier = String(tierRaw || "bronze").toLowerCase();

      // Try get score from /api/tg/me
      let fairscore = parseScoreAny(meJson);

      if (!wallet) {
        setProfile(null);
        return;
      }

      // 2) If score missing OR user pressed "Recheck score", call /api/tg/verify to refresh score
      if (opts?.forceVerify || fairscore === null) {
        const vRes = await fetch("/api/tg/verify", {
          method: "POST",
          headers: { "content-type": "application/json", ...tgInitHeaders(id) },
          body: JSON.stringify({ wallet }),
        });

        const vJson = (await vRes.json().catch(() => null)) as any;
        if (vRes.ok && vJson?.ok) {
          const fs2 = parseScoreAny(vJson);
          if (fs2 !== null) fairscore = fs2;
        } else {
          const msg = vJson?.error || `Score lookup failed (${vRes.status})`;
          if (opts?.forceVerify) setProfileErr(msg);
        }
      }

      setProfile({ wallet, tier, fairscore });
    } catch (e: any) {
      setProfileErr(e?.message || "Could not hydrate profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
    hydrateProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, adminMode, adminSid]);

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

  function closeCreate() {
    setCreateOpen(false);
    setCreateErr("");
    setCreateOkMsg("");
  }

  function openAppsModal(b: Bounty) {
    setAppsBounty(b);
    setAppsOpen(true);
    setAppsErr("");
    setApps([]);
    setAppsQuery("");
    setAppsSort("recent");
    void loadBountyApplications(b);
  }

  function closeAppsModal() {
    setAppsOpen(false);
    setAppsBounty(null);
    setAppsErr("");
    setApps([]);
    setAppsQuery("");
  }

  function canApply(b: any): { ok: boolean; reason?: string } {
    const status = String(b?.status || "open").toLowerCase();
    if (status !== "open") return { ok: false, reason: status === "paused" ? "Paused" : "Closed" };

    const w = withinWindow(b?.starts_at, b?.ends_at);
    if (!w.ok) return { ok: false, reason: w.reason };

    if (!profile?.wallet) return { ok: false, reason: "Verify wallet first" };

    const minTier = String(b?.min_tier || "").trim();
    if (minTier) {
      if (tierRank(profile.tier) < tierRank(minTier)) return { ok: false, reason: `Requires ${minTier}+` };
    }

    if (profile.fairscore === null) return { ok: false, reason: "Score unavailable" };

    return { ok: true };
  }

  async function startApply(b: any) {
    setApplyErr("");
    setApplyOk("");
    setApplyLoading(true);
    setApplySession(null);
    setAnswers({});

    try {
      const gate = canApply(b);
      if (!gate.ok) throw new Error(gate.reason || "Not eligible to apply.");

      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen the mini app.");

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
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Could not start apply (${res.status})`);

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
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Submit failed (${res.status})`);

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

  function asQuestionsForDb(qs: AdminQuestionDraft[]): AppQuestion[] {
    return qs
      .slice(0, 24)
      .map((q) => {
        const base = {
          id: q.id,
          label: q.label.trim().slice(0, 120) || "Question",
          required: !!q.required,
        };

        const maxLenNum = Number(q.maxLen);
        const maxLen = Number.isFinite(maxLenNum) && maxLenNum > 0 ? Math.floor(maxLenNum) : undefined;

        if (q.type === "select") {
          const options = q.optionsCsv
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 24);
          return { ...base, type: "select", options } as AppQuestion;
        }

        if (q.type === "textarea") {
          return {
            ...base,
            type: "textarea",
            placeholder: q.placeholder.trim().slice(0, 140) || undefined,
            maxLen,
          } as AppQuestion;
        }

        return {
          ...base,
          type: "text",
          placeholder: q.placeholder.trim().slice(0, 140) || undefined,
          maxLen,
        } as AppQuestion;
      })
      .filter((q) => q.label.trim().length > 0);
  }

  function normalizeLocalToIso(dtLocal: string) {
    const x = (dtLocal || "").trim();
    if (!x) return null;
    const d = new Date(x);
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  }

  async function createBounty() {
    setCreateErr("");
    setCreateOkMsg("");

    if (!adminSid) {
      setCreateErr("Admin session not ready yet. Open Admin Panel from the bot and try again.");
      return;
    }
    if (!draft.title.trim()) {
      setCreateErr("Title is required.");
      return;
    }
    if (!draft.instructions.trim()) {
      setCreateErr("Instructions are required.");
      return;
    }

    const rewardNum = draft.reward.trim() ? Number(draft.reward.trim()) : null;
    if (draft.reward.trim() && (!Number.isFinite(rewardNum as any) || (rewardNum as any) <= 0)) {
      setCreateErr("Reward must be a positive number (or leave it empty).");
      return;
    }

    const maxWinnersNum = draft.maxWinners.trim() ? Number(draft.maxWinners.trim()) : null;
    if (draft.maxWinners.trim() && (!Number.isFinite(maxWinnersNum as any) || (maxWinnersNum as any) <= 0)) {
      setCreateErr("Max winners must be a positive number (or leave it empty).");
      return;
    }

    const qPayload = asQuestionsForDb(draft.questions);

    setCreateLoading(true);
    try {
      const id = await getBestInitData();

      const res = await fetch("/api/tg/admin/bounties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
        body: JSON.stringify({
          sid: adminSid,
          initData: id,
          init_data: id,
          code: draft.code.trim() || null,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          instructions: draft.instructions.trim(),
          min_tier: draft.minTier.trim() || null,
          reward: rewardNum,
          currency: (draft.currency || "USDC").trim(),
          max_winners: maxWinnersNum,
          link_url: draft.linkUrl.trim() || null,
          status: draft.status,
          starts_at: normalizeLocalToIso(draft.startsAt),
          ends_at: normalizeLocalToIso(draft.endsAt),
          questions: qPayload,
        }),
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Create failed (${res.status})`);

      setCreateOkMsg(`✅ Bounty created${j?.data?.code ? `: ${j.data.code}` : ""}`);
      getTg()?.HapticFeedback?.notificationOccurred?.("success");

      // refresh list
      await refresh();
      setTimeout(() => {
        setCreateOpen(false);
        setCreateOkMsg("");
        setCreateErr("");
      }, 450);
    } catch (e: any) {
      setCreateErr(e?.message || "Create failed.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setCreateLoading(false);
    }
  }

  async function deleteBounty(b: Bounty) {
    if (!adminSid) {
      getTg()?.showAlert?.("Admin session missing. Reopen Admin Panel from the bot and try again.");
      return;
    }
    if (!b?.id) return;

    const ok = window.confirm(`Delete this bounty?\n\n${b.title || b.code || b.id}\n\nThis cannot be undone.`);
    if (!ok) return;

    try {
      const id = await getBestInitData();

      const res = await fetch(`/api/tg/admin/bounties/${encodeURIComponent(b.id)}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Delete failed (${res.status})`);

      setList((prev) => prev.filter((x) => x.id !== b.id));
      getTg()?.HapticFeedback?.notificationOccurred?.("success");
      getTg()?.showAlert?.("✅ Bounty deleted");
    } catch (e: any) {
      const msg = e?.message || "Delete failed.";
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
      getTg()?.showAlert?.(msg);
    }
  }

  async function loadBountyApplications(b: Bounty, silent = false) {
    if (!adminSid) {
      setAppsErr("Admin session missing. Reopen Admin Panel from the bot and try again.");
      return;
    }
    if (!b?.id) {
      setAppsErr("Missing bounty id.");
      return;
    }

    if (!silent) setAppsLoading(true);
    setAppsErr("");

    try {
      const id = await getBestInitData();

      const url = `/api/tg/admin/bounties/applications?bounty_id=${encodeURIComponent(b.id)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Failed to load applications (${res.status})`);

      const rows = (j.applications || j.data || []) as any[];
      if (!Array.isArray(rows)) throw new Error("Invalid applications payload.");

      setApps(rows as AdminBountyApplicationRow[]);
    } catch (e: any) {
      setAppsErr(String(e?.message || "Could not load applications."));
    } finally {
      if (!silent) setAppsLoading(false);
    }
  }

  async function exportBountyApplicationsCsv(b: Bounty) {
    try {
      await loadBountyApplications(b, true);

      if (!apps.length) {
        getTg()?.showAlert?.("No applications to export yet.");
        return;
      }

      const qs = (b.questions || []) as AppQuestion[];
      const qColumns = (qs || []).slice(0, 24).map((q, idx) => {
        const label = (q.label || `Question ${idx + 1}`).trim();
        const n = String(idx + 1).padStart(2, "0");
        return { id: q.id, header: `Q${n} - ${label}` };
      });

      const headers = [
        "bounty_code",
        "bounty_title",
        "application_id",
        "submitted_at",
        "telegram_user_id",
        "username",
        "wallet",
        "tier",
        "fairscore",
        ...qColumns.map((x) => x.header),
        "answers_json",
      ];

      const lines: string[] = [];
      lines.push(headers.map(escapeCsvCell).join(","));

      for (const r of apps) {
        const answersObj = r.answers || {};
        const rowCells: any[] = [
          b.code || "",
          b.title || "",
          r.id,
          r.created_at ? new Date(r.created_at).toISOString() : "",
          r.telegram_user_id ?? "",
          r.username ? `@${r.username}` : "",
          r.wallet ?? "",
          r.tier ?? "",
          typeof r.fairscore === "number" ? r.fairscore.toFixed(1) : r.fairscore ?? "",
        ];

        for (const qc of qColumns) rowCells.push(formatAnswerValue((answersObj as any)[qc.id]));

        rowCells.push(r.answers ? JSON.stringify(r.answers) : "");
        lines.push(rowCells.map(escapeCsvCell).join(","));
      }

      const filename = `veyra_${(b.code || "bounty").toLowerCase()}_applications.csv`;
      const csv = lines.join("\n");

      // client download
      downloadTextFile(filename, csv, "text/csv;charset=utf-8");
      getTg()?.HapticFeedback?.notificationOccurred?.("success");

      // server export fallback (Telegram sometimes blocks)
      setTimeout(() => {
        try {
          const origin = window.location.origin;
          const url =
            `${origin}/api/tg/admin/bounties/export-csv` +
            `?bounty_id=${encodeURIComponent(b.id)}` +
            `&sid=${encodeURIComponent(adminSid || "")}`;

          const tg = getTg();
          if (tg?.openLink) tg.openLink(url);
          else window.location.href = url;
        } catch {
          // ignore
        }
      }, 250);
    } catch (e: any) {
      getTg()?.showAlert?.(e?.message || "Export failed.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
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
              {adminMode
                ? "Admin mode: create bounties here. Users apply from the user mini app."
                : "Limited-time bounties with winners, badges, and referrals. Apply is verified-wallet + tier-gated."}
            </div>

            {/* === START: PROFILE_STRIP (USER) === */}
            {!adminMode ? (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300 overflow-hidden">
                {profileLoading ? (
                  <span className="text-zinc-400">Hydrating profile…</span>
                ) : profile ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate">
                        Wallet:{" "}
                        <span className="font-mono" title={profile.wallet} style={{ WebkitTextSizeAdjust: "100%" }}>
                          {shortAddr(profile.wallet)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-zinc-400">
                        Tier: <span className="font-semibold text-zinc-200">{profile.tier}</span>
                        {typeof profile.fairscore === "number" ? (
                          <>
                            {" "}
                            · FairScore: <span className="font-mono text-zinc-200">{profile.fairscore.toFixed(1)}</span>
                          </>
                        ) : (
                          <>
                            {" "}
                            · <span className="text-yellow-200">Score unavailable</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await tryCopy(profile.wallet);
                        setCopied(ok);
                        try {
                          getTg()?.HapticFeedback?.notificationOccurred?.(ok ? "success" : "error");
                        } catch {}
                        if (ok) setTimeout(() => setCopied(false), 900);
                      }}
                      className={cn(
                        "shrink-0 h-9 rounded-xl border px-3 text-xs font-semibold",
                        "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                      )}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <span className="text-yellow-200">No verified wallet yet (verify in bot)</span>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                {adminSid ? "Admin session active." : "Admin session loading… (open Admin Panel from bot if this persists)"}
              </div>
            )}
            {/* === END: PROFILE_STRIP (USER) === */}

            {!adminMode && profileErr ? (
              <div className="mt-2 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                {profileErr}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                refresh();
                hydrateProfile().catch(() => {});
              }}
              className="h-10 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Refresh
            </button>

            {!adminMode ? (
              <button
                type="button"
                disabled={profileLoading}
                onClick={() => hydrateProfile({ forceVerify: true }).catch(() => {})}
                className={cn(
                  "h-10 shrink-0 rounded-2xl border px-3 text-xs font-semibold",
                  profileLoading
                    ? "border-white/10 bg-white/5 text-zinc-400"
                    : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                )}
              >
                {profileLoading ? "Checking…" : "Recheck score"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!adminSid}
                onClick={() => {
                  setCreateErr("");
                  setCreateOkMsg("");
                  setCreateOpen(true);
                }}
                className={cn(
                  "h-10 shrink-0 rounded-2xl border px-3 text-xs font-semibold",
                  !adminSid ? "border-white/10 bg-white/5 text-zinc-400" : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                )}
              >
                + Create
              </button>
            )}
          </div>
        </div>

        {!applyOpen && applyErr ? (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">
            {applyErr}
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
            Loading bounties…
          </div>
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
              const gate = canApply(b);

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

                    {adminMode ? (
                      <button
                        type="button"
                        disabled={!adminSid}
                        onClick={() => openAppsModal(b)}
                        className={cn(
                          "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                          !adminSid
                            ? "border border-white/10 bg-white/5 text-zinc-400"
                            : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                        )}
                      >
                        Manage
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={applyLoading || !gate.ok}
                        onClick={() => startApply(b)}
                        className={cn(
                          "h-11 rounded-xl text-sm font-semibold active:scale-[0.99]",
                          applyLoading || !gate.ok
                            ? "border border-white/10 bg-white/5 text-zinc-400"
                            : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                        )}
                        title={!gate.ok ? gate.reason : undefined}
                      >
                        {applyLoading ? "Starting…" : !gate.ok ? gate.reason || "Not eligible" : "Apply"}
                      </button>
                    )}
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
                  {adminMode ? (
                    <>
                      <button
                        type="button"
                        disabled={!adminSid}
                        onClick={() => openAppsModal(selected)}
                        className={cn(
                          "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                          !adminSid
                            ? "border border-white/10 bg-white/5 text-zinc-400"
                            : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                        )}
                      >
                        Manage
                      </button>

                      <button
                        type="button"
                        onClick={closeDetails}
                        className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={applyLoading || !canApply(selectedAny).ok}
                        onClick={() => startApply(selectedAny)}
                        className={cn(
                          "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                          applyLoading || !canApply(selectedAny).ok
                            ? "border border-white/10 bg-white/5 text-zinc-400"
                            : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110"
                        )}
                      >
                        {applyLoading ? "Starting…" : canApply(selectedAny).ok ? "Apply" : canApply(selectedAny).reason || "Not eligible"}
                      </button>

                      <button
                        type="button"
                        onClick={closeDetails}
                        className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                      >
                        Back
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}

      {/* === START: APPLY_SHEET (USER) === */}
      {!adminMode && applyOpen && applySession ? (
        <div className="fixed inset-0 z-[90]">
          <button type="button" aria-label="Close apply" onClick={closeApply} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">{applySession.bounty.title || "Bounty application"}</div>
                  <div className="mt-1 text-xs text-zinc-500 break-words">
                    Wallet:{" "}
                    <span className="font-mono" title={applySession.profile.wallet}>
                      {shortAddr(applySession.profile.wallet)}
                    </span>{" "}
                    · Tier: <span className="font-semibold">{applySession.profile.tier}</span>
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
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: APPLY_SHEET (USER) === */}

      {/* === START: ADMIN_CREATE_SHEET === */}
      {adminMode && createOpen ? (
        <div className="fixed inset-0 z-[90]">
          <button type="button" aria-label="Close create" onClick={closeCreate} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold break-words">➕ Create bounty</div>
                  <div className="mt-1 text-xs text-zinc-500 break-words">Admin creates. Users apply in user mini app.</div>
                </div>

                <button
                  type="button"
                  onClick={closeCreate}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {createErr ? (
                <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{createErr}</div>
              ) : null}

              {createOkMsg ? (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{createOkMsg}</div>
              ) : null}

              <div className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
                <div className="space-y-3">
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Code (optional)</div>
                    <input
                      value={draft.code}
                      onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))}
                      placeholder="e.g. BNTY-TEST1"
                      className={cn(
                        "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Title</div>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                      className={cn(
                        "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Description (one-liner)</div>
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className={cn(
                        "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                      maxLength={240}
                    />
                    <div className="mt-1 text-xs text-zinc-500">{Math.min(draft.description.length, 240)}/240</div>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Instructions</div>
                    <textarea
                      value={draft.instructions}
                      onChange={(e) => setDraft((p) => ({ ...p, instructions: e.target.value }))}
                      rows={4}
                      className={cn(
                        "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                      maxLength={1200}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Min tier</div>
                      <select
                        value={draft.minTier}
                        onChange={(e) => setDraft((p) => ({ ...p, minTier: e.target.value }))}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      >
                        <option value="bronze">Bronze</option>
                        <option value="silver">Silver</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                        <option value="diamond">Diamond</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Status</div>
                      <select
                        value={draft.status}
                        onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as any }))}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      >
                        <option value="open">Open</option>
                        <option value="paused">Paused</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Reward (optional)</div>
                      <input
                        value={draft.reward}
                        onChange={(e) => setDraft((p) => ({ ...p, reward: e.target.value }))}
                        inputMode="decimal"
                        placeholder="e.g. 10"
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Currency</div>
                      <select
                        value={draft.currency}
                        onChange={(e) => setDraft((p) => ({ ...p, currency: e.target.value }))}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      >
                        <option value="USDC">USDC</option>
                        <option value="SOL">SOL</option>
                        <option value="FLR">FLR</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Max winners (optional)</div>
                      <input
                        value={draft.maxWinners}
                        onChange={(e) => setDraft((p) => ({ ...p, maxWinners: e.target.value }))}
                        inputMode="numeric"
                        placeholder="e.g. 10"
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Link URL (optional)</div>
                      <input
                        value={draft.linkUrl}
                        onChange={(e) => setDraft((p) => ({ ...p, linkUrl: e.target.value }))}
                        placeholder="https://…"
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Starts at (optional)</div>
                      <input
                        type="datetime-local"
                        value={draft.startsAt}
                        onChange={(e) => setDraft((p) => ({ ...p, startsAt: e.target.value }))}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Ends at (optional)</div>
                      <input
                        type="datetime-local"
                        value={draft.endsAt}
                        onChange={(e) => setDraft((p) => ({ ...p, endsAt: e.target.value }))}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>
                  </div>

                  {/* Questions builder */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Questions</div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            questions: [
                              ...p.questions,
                              { id: makeId("q"), type: "text", label: "", required: true, placeholder: "", maxLen: "", optionsCsv: "" },
                            ],
                          }))
                        }
                        className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                      >
                        + Add
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-zinc-400">These questions appear in the bounty application form.</div>

                    <div className="mt-3 space-y-3">
                      {draft.questions.map((q, idx) => (
                        <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-400">Question {idx + 1}</div>
                            <button
                              type="button"
                              onClick={() => setDraft((p) => ({ ...p, questions: p.questions.filter((x) => x.id !== q.id) }))}
                              className="h-8 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="block">
                              <div className="mb-1 text-xs text-zinc-400">Type</div>
                              <select
                                value={q.type}
                                onChange={(e) =>
                                  setDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, type: e.target.value as any } : x)),
                                  }))
                                }
                                className={cn(
                                  "h-11 w-full rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                                  "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                )}
                              >
                                <option value="text">Text</option>
                                <option value="textarea">Textarea</option>
                                <option value="select">Select</option>
                              </select>
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs text-zinc-400">Required</div>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, required: !x.required } : x)),
                                  }))
                                }
                                className={cn(
                                  "h-11 w-full rounded-2xl border px-3 text-sm font-semibold",
                                  "border-white/10 bg-black/30 hover:bg-white/5",
                                  q.required ? "text-emerald-200" : "text-zinc-200"
                                )}
                              >
                                {q.required ? "Yes (required)" : "No (optional)"}
                              </button>
                            </label>
                          </div>

                          <label className="mt-3 block">
                            <div className="mb-1 text-xs text-zinc-400">Label</div>
                            <input
                              value={q.label}
                              onChange={(e) =>
                                setDraft((p) => ({
                                  ...p,
                                  questions: p.questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)),
                                }))
                              }
                              placeholder="e.g. Your X post link"
                              className={cn(
                                "h-11 w-full rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                                "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                              )}
                            />
                          </label>

                          {q.type === "select" ? (
                            <label className="mt-3 block">
                              <div className="mb-1 text-xs text-zinc-400">Options (comma separated)</div>
                              <input
                                value={q.optionsCsv}
                                onChange={(e) =>
                                  setDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, optionsCsv: e.target.value } : x)),
                                  }))
                                }
                                placeholder="Option A, Option B, Option C"
                                className={cn(
                                  "h-11 w-full rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                                  "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                )}
                              />
                            </label>
                          ) : (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <label className="block">
                                <div className="mb-1 text-xs text-zinc-400">Placeholder</div>
                                <input
                                  value={q.placeholder}
                                  onChange={(e) =>
                                    setDraft((p) => ({
                                      ...p,
                                      questions: p.questions.map((x) => (x.id === q.id ? { ...x, placeholder: e.target.value } : x)),
                                    }))
                                  }
                                  placeholder="Type your answer…"
                                  className={cn(
                                    "h-11 w-full rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                                    "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                  )}
                                />
                              </label>

                              <label className="block">
                                <div className="mb-1 text-xs text-zinc-400">Max length (optional)</div>
                                <input
                                  value={q.maxLen}
                                  onChange={(e) =>
                                    setDraft((p) => ({
                                      ...p,
                                      questions: p.questions.map((x) => (x.id === q.id ? { ...x, maxLen: e.target.value } : x)),
                                    }))
                                  }
                                  inputMode="numeric"
                                  placeholder="e.g. 240"
                                  className={cn(
                                    "h-11 w-full rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                                    "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                  )}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 text-xs text-zinc-400">Tip: keep questions 2–6 and short for cleaner CSV exports.</div>
                  </div>

                  <button
                    type="button"
                    disabled={createLoading || !adminSid}
                    onClick={createBounty}
                    className={cn(
                      "h-12 w-full rounded-2xl text-sm font-semibold",
                      "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]",
                      createLoading && "opacity-70"
                    )}
                  >
                    {createLoading ? "Creating…" : "Create bounty"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: ADMIN_CREATE_SHEET === */}

      {/* === START: ADMIN_APPS_MODAL === */}
      {adminMode && appsOpen ? (
        <div className="fixed inset-0 z-[95]">
          <div className="absolute inset-0 bg-black/70" onClick={closeAppsModal} />

          <div className="absolute left-0 right-0 top-6 bottom-6 mx-auto w-[min(960px,94vw)] rounded-3xl border border-white/10 bg-[#0B0F14] shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">📥 Bounty applications</div>
                <div className="mt-1 truncate text-sm text-zinc-400">
                  {appsBounty ? (
                    <>
                      <span className="font-mono">{appsBounty.code || appsBounty.id.slice(0, 8)}</span> ·{" "}
                      {appsBounty.title || "Bounty"}
                    </>
                  ) : (
                    "Bounty"
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {appsBounty ? (
                  <button
                    type="button"
                    onClick={() => exportBountyApplicationsCsv(appsBounty)}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Export CSV
                  </button>
                ) : null}

                {appsBounty ? (
                  <button
                    type="button"
                    onClick={() => deleteBounty(appsBounty)}
                    className="h-10 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 text-xs font-semibold text-red-200 hover:bg-red-500/15"
                  >
                    Delete
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={closeAppsModal}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto" style={{ WebkitOverflowScrolling: "touch" as any }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <input
                    value={appsQuery}
                    onChange={(e) => setAppsQuery(e.target.value)}
                    placeholder="Search username / wallet / tier / score…"
                    className={cn(
                      "h-11 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                      "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                    )}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={appsSort}
                    onChange={(e) => setAppsSort(e.target.value as any)}
                    className={cn(
                      "h-11 rounded-2xl border bg-black/30 px-3 text-sm outline-none",
                      "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                    )}
                  >
                    <option value="recent">Sort: Recent</option>
                    <option value="tier">Sort: Tier</option>
                    <option value="fairscore">Sort: FairScore</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => (appsBounty ? loadBountyApplications(appsBounty) : null)}
                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {appsLoading ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading applications…</div>
              ) : null}

              {appsErr ? (
                <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">{appsErr}</div>
              ) : null}

              {!appsLoading && !appsErr && sortedFilteredApps.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">No applications found.</div>
              ) : null}

              {!appsLoading && !appsErr && sortedFilteredApps.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {sortedFilteredApps.map((r) => {
                    const score = typeof r.fairscore === "number" ? r.fairscore : Number(r.fairscore || 0);
                    return (
                      <details key={r.id} className="group rounded-2xl border border-white/10 bg-black/25 p-4">
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {r.username ? `@${r.username}` : "Applicant"}{" "}
                                <span className="ml-2 text-xs font-normal text-zinc-500">#{r.id.slice(0, 8)}</span>
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                Wallet: <span className="font-mono">{shortAddr(String(r.wallet || "")) || "—"}</span>
                                {r.created_at ? (
                                  <>
                                    {" "}
                                    · Submitted: <span className="font-mono">{new Date(r.created_at).toLocaleString()}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                                Tier {String(r.tier || "—")}
                              </div>
                              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                                {Number.isFinite(score) ? `FairScore ${score.toFixed(1)}` : "FairScore —"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-zinc-500 group-open:hidden">Tap to view answers</div>
                        </summary>

                        <div className="mt-4 space-y-3">
                          {(() => {
                            const a = r.answers || {};
                            const keys = Object.keys(a || {});
                            if (!keys.length) {
                              return (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
                                  No answers captured.
                                </div>
                              );
                            }

                            return (
                              <div className="space-y-3">
                                {keys.map((k) => (
                                  <div key={k} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <div className="text-xs font-semibold text-zinc-200">{prettifyKey(k)}</div>
                                    <div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">
                                      {formatAnswerValue((a as any)[k])}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
                            <summary className="cursor-pointer text-xs font-semibold text-zinc-300">View raw data</summary>
                            <pre className="mt-2 max-h-[240px] overflow-auto rounded-xl bg-black/30 p-3 text-xs text-zinc-200">
                              {r.answers ? JSON.stringify(r.answers, null, 2) : "No answers captured."}
                            </pre>
                          </details>
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: ADMIN_APPS_MODAL === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===