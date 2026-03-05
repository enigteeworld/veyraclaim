// === START: FILE_src/app/tg/_components/BountiesTab.tsx ===
"use client";

import { useEffect, useMemo, useState } from "react";
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

type HydratedProfile = {
  wallet: string;
  tier: string; // bronze/silver/gold...
  fairscore: number | null;
};

type AdminDraftQuestion = {
  id: string;
  type: "text" | "textarea" | "select";
  label: string;
  required: boolean;
  placeholder: string;
  maxLen: string;
  optionsCsv: string; // for select
};

type AdminBountyDraft = {
  title: string;
  description: string;
  instructions: string;
  minTier: string;
  reward: string;
  currency: string;
  startsAt: string; // datetime-local
  endsAt: string; // datetime-local
  linkUrl: string;
  maxWinners: string;
  questions: AdminDraftQuestion[];
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

/** Tier comparison for gating */
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

function defaultAdminDraft(): AdminBountyDraft {
  return {
    title: "",
    description: "",
    instructions: "",
    minTier: "bronze",
    reward: "10",
    currency: "USDC",
    startsAt: "",
    endsAt: "",
    linkUrl: "",
    maxWinners: "10",
    questions: [
      {
        id: makeId("q"),
        type: "text",
        label: "Proof link",
        required: true,
        placeholder: "https://…",
        maxLen: "240",
        optionsCsv: "",
      },
    ],
  };
}

function safeNum(n: any): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x;
}

function adminDraftToQuestions(qs: AdminDraftQuestion[]): AppQuestion[] {
  return (qs || [])
    .slice(0, 20)
    .map((q) => {
      const label = (q.label || "").trim().slice(0, 120) || "Question";
      const required = !!q.required;

      const maxLenNum = Number(q.maxLen);
      const maxLen = Number.isFinite(maxLenNum) && maxLenNum > 0 ? Math.floor(maxLenNum) : undefined;

      if (q.type === "select") {
        const options = (q.optionsCsv || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 24);
        return { id: q.id, type: "select", label, required, options };
      }

      if (q.type === "textarea") {
        return {
          id: q.id,
          type: "textarea",
          label,
          required,
          placeholder: (q.placeholder || "").trim().slice(0, 140) || undefined,
          maxLen,
        };
      }

      return {
        id: q.id,
        type: "text",
        label,
        required,
        placeholder: (q.placeholder || "").trim().slice(0, 140) || undefined,
        maxLen,
      };
    });
}

/** Parse questions from ANY likely bounty field (handles backend mismatches) */
function normalizeQuestionsAny(value: any): AppQuestion[] {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;

    // Some backends store as { questions: [...] } or directly [...]
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.questions) ? raw.questions : [];

    const out: AppQuestion[] = [];
    for (const q of arr) {
      const id = String(q?.id || "").trim();
      const type = String(q?.type || "").toLowerCase();
      const label = String(q?.label || "").trim();

      if (!id || !label) continue;

      const required = q?.required === undefined ? true : !!q.required;

      if (type === "select") {
        const options = Array.isArray(q?.options) ? q.options.map((x: any) => String(x).trim()).filter(Boolean) : [];
        out.push({ id, type: "select", label, required, options: options.slice(0, 24) });
      } else if (type === "textarea") {
        const maxLen = Number.isFinite(Number(q?.maxLen)) ? Math.floor(Number(q.maxLen)) : undefined;
        const placeholder = q?.placeholder ? String(q.placeholder).slice(0, 140) : undefined;
        out.push({ id, type: "textarea", label, required, placeholder, maxLen });
      } else {
        const maxLen = Number.isFinite(Number(q?.maxLen)) ? Math.floor(Number(q.maxLen)) : undefined;
        const placeholder = q?.placeholder ? String(q.placeholder).slice(0, 140) : undefined;
        out.push({ id, type: "text", label, required, placeholder, maxLen });
      }
    }

    return out.slice(0, 20);
  } catch {
    return [];
  }
}

function asObj(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v as any;
  try {
    const p = typeof v === "string" ? JSON.parse(v) : v;
    if (p && typeof p === "object" && !Array.isArray(p)) return p;
    return {};
  } catch {
    return {};
  }
}

function prettyVal(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Supports:
 *   <BountiesTab initData={...} sid={...} />
 *   <BountiesTab initData={...} sid={...} isAdmin adminSid={...} />
 */
export default function BountiesTab({
  initData,
  sid,
  isAdmin = false,
  adminSid = "",
}: {
  initData?: string | null;
  sid?: string | null;
  isAdmin?: boolean;
  adminSid?: string;
}) {
  const { loading, err, list, refresh } = useBounties({
    initData,
    sid,
    isAdmin,
    adminSid,
  });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Bounty | null>(null);

  // Profile hydration (wallet + tier + fairscore) — USER ONLY
  const [profile, setProfile] = useState<HydratedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Apply flow state — USER ONLY
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyErr, setApplyErr] = useState<string>("");
  const [applyOk, setApplyOk] = useState<string>("");
  const [applySession, setApplySession] = useState<BountyApplySession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Admin create — ADMIN ONLY
  const [adminCreateOpen, setAdminCreateOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState<AdminBountyDraft>(defaultAdminDraft());
  const [adminCreateLoading, setAdminCreateLoading] = useState(false);
  const [adminCreateErr, setAdminCreateErr] = useState<string>("");
  const [adminCreateOk, setAdminCreateOk] = useState<string>("");

  // Admin applications — ADMIN ONLY
  const [adminAppsOpen, setAdminAppsOpen] = useState(false);
  const [adminAppsLoading, setAdminAppsLoading] = useState(false);
  const [adminAppsErr, setAdminAppsErr] = useState("");
  const [adminApps, setAdminApps] = useState<any[]>([]);
  const [adminAppsCount, setAdminAppsCount] = useState<number>(0);

  // Admin actions
  const [adminExporting, setAdminExporting] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);
  const [adminDeleteErr, setAdminDeleteErr] = useState("");
  const [adminDeleteOk, setAdminDeleteOk] = useState("");

  const sorted = useMemo(() => {
    return (list || [])
      .slice()
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [list]);

  const selectedAny = selected as any;

  const selectedQuestions: AppQuestion[] = useMemo(() => {
    const q1 = normalizeQuestionsAny(selectedAny?.questions);
    if (q1.length) return q1;
    const q2 =
      normalizeQuestionsAny(selectedAny?.application_schema) ||
      normalizeQuestionsAny(selectedAny?.applicationSchema) ||
      normalizeQuestionsAny(selectedAny?.application_schema_json) ||
      [];
    return q2;
  }, [selectedAny?.questions, selectedAny?.application_schema, selectedAny?.applicationSchema, selectedAny?.application_schema_json]);

  const questionLabelById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const q of selectedQuestions) m[q.id] = q.label;
    return m;
  }, [selectedQuestions]);

  async function getBestInitData(): Promise<string> {
    await ensureTelegramScript();
    const tg = getTg();
    const id = (tg?.initData || initData || "").toString();
    return id;
  }

  async function hydrateProfile(opts?: { forceVerify?: boolean }) {
    // ADMIN SHOULD NOT HYDRATE / APPLY
    if (isAdmin) {
      setProfile(null);
      setProfileErr("");
      setProfileLoading(false);
      return;
    }

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
          body: JSON.stringify({ wallet }), // send full wallet
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

  // Hydrate once when tab mounts / initData changes
  useEffect(() => {
    hydrateProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, isAdmin]);

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

  function closeAdminCreate() {
    setAdminCreateOpen(false);
    setAdminCreateErr("");
    setAdminCreateOk("");
    setAdminCreateLoading(false);
  }

  function closeAdminApps() {
    setAdminAppsOpen(false);
    setAdminAppsErr("");
    setAdminAppsLoading(false);
    setAdminApps([]);
    setAdminAppsCount(0);
  }

  function canApply(b: any): { ok: boolean; reason?: string } {
    // Never allow apply in Admin mode
    if (isAdmin) return { ok: false, reason: "Admin mode" };

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
    if (isAdmin) return;

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

      // If backend session response forgot bounty.questions, fall back to bounty object
      const sessionQs = Array.isArray(session?.bounty?.questions) ? session.bounty.questions : [];
      const fallbackQs =
        sessionQs.length > 0
          ? sessionQs
          : normalizeQuestionsAny((b as any)?.questions) ||
            normalizeQuestionsAny((b as any)?.application_schema) ||
            normalizeQuestionsAny((b as any)?.applicationSchema) ||
            normalizeQuestionsAny((b as any)?.application_schema_json) ||
            [];

      const patchedSession: BountyApplySession = {
        ...session,
        bounty: {
          ...session.bounty,
          questions: fallbackQs,
        },
      };

      setApplySession(patchedSession);

      const qs = (patchedSession?.bounty?.questions || []) as AppQuestion[];
      const initAns: Record<string, string> = {};
      for (const q of qs) initAns[q.id] = "";
      setAnswers(initAns);

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
    if (isAdmin) return;
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

  async function adminCreateBounty() {
    setAdminCreateErr("");
    setAdminCreateOk("");

    if (!isAdmin) return;
    if (!adminSid) {
      setAdminCreateErr("Admin session missing. Open Admin Panel from the bot again.");
      return;
    }

    const title = adminDraft.title.trim();
    if (!title) {
      setAdminCreateErr("Title is required.");
      return;
    }

    const reward = safeNum(adminDraft.reward);
    const maxWinners = safeNum(adminDraft.maxWinners);

    const startsAtIso = adminDraft.startsAt ? new Date(adminDraft.startsAt).toISOString() : null;
    const endsAtIso = adminDraft.endsAt ? new Date(adminDraft.endsAt).toISOString() : null;

    const payload = {
      title,
      description: adminDraft.description.trim() || null,
      instructions: adminDraft.instructions.trim() || null,
      min_tier: adminDraft.minTier.trim() || null,
      reward,
      currency: (adminDraft.currency || "USDC").trim(),
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      link_url: adminDraft.linkUrl.trim() || null,
      max_winners: maxWinners,
      questions: adminDraftToQuestions(adminDraft.questions),
    };

    setAdminCreateLoading(true);

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen Admin Panel from bot.");

      const res = await fetch("/api/tg/admin/bounties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
        body: JSON.stringify({
          ...payload,
          initData: id,
          init_data: id,
          initDataRaw: id,
        }),
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Create failed (${res.status})`);

      setAdminCreateOk(j?.message || "✅ Bounty created");
      getTg()?.HapticFeedback?.notificationOccurred?.("success");

      // reset + refresh list
      setAdminDraft(defaultAdminDraft());
      setAdminCreateOpen(false);
      refresh();
    } catch (e: any) {
      setAdminCreateErr(e?.message || "Create failed.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setAdminCreateLoading(false);
    }
  }

  // ✅ IMPORTANT: Admin routes must use bounty.id (NOT bounty.code).
  async function adminLoadApplications(bountyId: string) {
    if (!isAdmin) return;
    if (!adminSid) {
      setAdminAppsErr("Admin session missing. Open Admin Panel from the bot again.");
      return;
    }

    setAdminAppsErr("");
    setAdminAppsLoading(true);
    setAdminApps([]);
    setAdminAppsCount(0);

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen Admin Panel from bot.");

      const res = await fetch(`/api/tg/admin/bounties/${encodeURIComponent(bountyId)}/applications`, {
        method: "GET",
        headers: {
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Failed to load (${res.status})`);

      setAdminApps(Array.isArray(j.applications) ? j.applications : []);
      setAdminAppsCount(typeof j.count === "number" ? j.count : Array.isArray(j.applications) ? j.applications.length : 0);
      setAdminAppsOpen(true);

      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("success");
      } catch {}
    } catch (e: any) {
      setAdminAppsErr(e?.message || "Failed to load applications.");
      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("error");
      } catch {}
    } finally {
      setAdminAppsLoading(false);
    }
  }

  async function adminExportCsv(bountyId: string) {
    if (!isAdmin) return;
    if (!adminSid) {
      setAdminAppsErr("Admin session missing. Open Admin Panel from the bot again.");
      return;
    }

    setAdminExporting(true);
    setAdminAppsErr("");

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen Admin Panel from bot.");

      const res = await fetch(`/api/tg/admin/bounties/${encodeURIComponent(bountyId)}/applications.csv`, {
        method: "GET",
        headers: {
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as any;
        throw new Error(j?.error || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `bounty_${bountyId}_applications.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);

      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("success");
      } catch {}
    } catch (e: any) {
      setAdminAppsErr(e?.message || "CSV export failed.");
      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("error");
      } catch {}
    } finally {
      setAdminExporting(false);
    }
  }

  async function adminDeleteBounty(bountyId: string) {
    if (!isAdmin) return;
    if (!adminSid) {
      setAdminDeleteErr("Admin session missing. Open Admin Panel from the bot again.");
      return;
    }

    setAdminDeleteErr("");
    setAdminDeleteOk("");

    const ok = typeof window !== "undefined" ? window.confirm("Delete this bounty and ALL applications? This cannot be undone.") : false;
    if (!ok) return;

    setAdminDeleting(true);

    try {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen Admin Panel from bot.");

      const res = await fetch(`/api/tg/admin/bounties/${encodeURIComponent(bountyId)}`, {
        method: "DELETE",
        headers: {
          ...tgInitHeaders(id),
          "x-admin-sid": adminSid,
          "x-app-sid": adminSid,
        },
      });

      const j = (await res.json().catch(() => null)) as any;
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Delete failed (${res.status})`);

      setAdminDeleteOk(j?.message || "✅ Deleted");
      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("success");
      } catch {}

      // Close sheets + refresh list
      closeAdminApps();
      closeDetails();
      refresh();
    } catch (e: any) {
      setAdminDeleteErr(e?.message || "Delete failed.");
      try {
        getTg()?.HapticFeedback?.notificationOccurred?.("error");
      } catch {}
    } finally {
      setAdminDeleting(false);
    }
  }

  const sPill = statusPill(selected?.status);
  const rewardText = selected ? fmtReward(selected) : null;

  // iOS “shake/zoom” fix: ensure 16px font-size on inputs to prevent Safari auto-zoom
  const input16 = "text-[16px] [font-size:16px]";

  return (
    <>
      {/* === START: BOUNTIES_PANEL === */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">🎯 Bounties</div>
            <div className="mt-1 text-sm text-zinc-400">
              {isAdmin
                ? "Admin mode: create/manage bounties here. Users apply from the user mini app."
                : "Limited-time bounties with winners, badges, and referrals. Apply is verified-wallet + tier-gated."}
            </div>

            {/* === START: PROFILE_STRIP (USER ONLY) === */}
            {!isAdmin ? (
              <>
                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
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

                {profileErr ? (
                  <div className="mt-2 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                    {profileErr}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {!adminSid ? (
                  <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                    Admin session not ready. Open Admin Panel from the bot to get adminSid.
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                    Admin session active.
                  </div>
                )}
              </>
            )}
            {/* === END: PROFILE_STRIP === */}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                refresh();
                if (!isAdmin) hydrateProfile().catch(() => {});
              }}
              className="h-10 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Refresh
            </button>

            {!isAdmin ? (
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
                  setAdminCreateErr("");
                  setAdminCreateOk("");
                  setAdminDraft(defaultAdminDraft());
                  setAdminCreateOpen(true);
                }}
                className={cn(
                  "h-10 shrink-0 rounded-2xl px-3 text-xs font-semibold",
                  !adminSid
                    ? "border border-white/10 bg-white/5 text-zinc-400"
                    : "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:brightness-110"
                )}
              >
                + Create
              </button>
            )}
          </div>
        </div>

        {!isAdmin && !applyOpen && applyErr ? (
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
                      <div className="break-words text-sm font-semibold">{b.title || "Bounty"}</div>
                      {b.description ? <div className="mt-1 break-words text-sm text-zinc-400">{b.description}</div> : null}

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

                    {!isAdmin ? (
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
                    ) : (
                      <button
                        type="button"
                        onClick={() => openDetails(b)}
                        className="h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                        title="Admin mode: apply disabled"
                      >
                        Manage
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

      {/* === START: ADMIN_CREATE_SHEET === */}
      {adminCreateOpen && isAdmin ? (
        <div className="fixed inset-0 z-[85]">
          <button
            type="button"
            aria-label="Close admin create"
            onClick={closeAdminCreate}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold">➕ Create bounty</div>
                  <div className="mt-1 text-xs text-zinc-500">Admin creates. Users apply in user mini app.</div>
                </div>

                <button
                  type="button"
                  onClick={closeAdminCreate}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {adminCreateErr ? (
                <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {adminCreateErr}
                </div>
              ) : null}

              {adminCreateOk ? (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {adminCreateOk}
                </div>
              ) : null}

              <div className="mt-3 max-h-[72vh] overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
                <div className="space-y-3">
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Title *</div>
                    <input
                      value={adminDraft.title}
                      onChange={(e) => setAdminDraft((p) => ({ ...p, title: e.target.value }))}
                      className={cn(
                        input16,
                        "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Description</div>
                    <textarea
                      value={adminDraft.description}
                      onChange={(e) => setAdminDraft((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className={cn(
                        input16,
                        "w-full rounded-2xl border bg-black/30 px-4 py-3 outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                      maxLength={500}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Instructions</div>
                    <textarea
                      value={adminDraft.instructions}
                      onChange={(e) => setAdminDraft((p) => ({ ...p, instructions: e.target.value }))}
                      rows={4}
                      className={cn(
                        input16,
                        "w-full rounded-2xl border bg-black/30 px-4 py-3 outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                      maxLength={1500}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Min tier</div>
                      <select
                        value={adminDraft.minTier}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, minTier: e.target.value }))}
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      >
                        <option value="">None</option>
                        <option value="bronze">Bronze</option>
                        <option value="silver">Silver</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                        <option value="diamond">Diamond</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Max winners</div>
                      <input
                        value={adminDraft.maxWinners}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, maxWinners: e.target.value }))}
                        inputMode="numeric"
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Reward</div>
                      <input
                        value={adminDraft.reward}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, reward: e.target.value }))}
                        inputMode="decimal"
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Currency</div>
                      <input
                        value={adminDraft.currency}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, currency: e.target.value }))}
                        placeholder="USDC"
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>
                  </div>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Link URL</div>
                    <input
                      value={adminDraft.linkUrl}
                      onChange={(e) => setAdminDraft((p) => ({ ...p, linkUrl: e.target.value }))}
                      placeholder="https://…"
                      className={cn(
                        input16,
                        "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                        "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                      )}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Starts (optional)</div>
                      <input
                        value={adminDraft.startsAt}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, startsAt: e.target.value }))}
                        type="datetime-local"
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Ends (optional)</div>
                      <input
                        value={adminDraft.endsAt}
                        onChange={(e) => setAdminDraft((p) => ({ ...p, endsAt: e.target.value }))}
                        type="datetime-local"
                        className={cn(
                          input16,
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>
                  </div>

                  {/* Questions */}
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Application questions</div>
                      <button
                        type="button"
                        onClick={() =>
                          setAdminDraft((p) => ({
                            ...p,
                            questions: [
                              ...p.questions,
                              {
                                id: makeId("q"),
                                type: "text",
                                label: "",
                                required: false,
                                placeholder: "",
                                maxLen: "",
                                optionsCsv: "",
                              },
                            ],
                          }))
                        }
                        className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                      >
                        + Add
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {(adminDraft.questions || []).map((q, idx) => (
                        <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-400">Question {idx + 1}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setAdminDraft((p) => ({ ...p, questions: p.questions.filter((x) => x.id !== q.id) }))
                              }
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
                                  setAdminDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, type: e.target.value as any } : x)),
                                  }))
                                }
                                className={cn(
                                  input16,
                                  "h-11 w-full rounded-2xl border bg-black/30 px-3 outline-none",
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
                                  setAdminDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, required: !x.required } : x)),
                                  }))
                                }
                                className={cn(
                                  input16,
                                  "h-11 w-full rounded-2xl border px-3 font-semibold",
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
                                setAdminDraft((p) => ({
                                  ...p,
                                  questions: p.questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)),
                                }))
                              }
                              placeholder="e.g. Proof link"
                              className={cn(
                                input16,
                                "h-11 w-full rounded-2xl border bg-black/30 px-3 outline-none",
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
                                  setAdminDraft((p) => ({
                                    ...p,
                                    questions: p.questions.map((x) => (x.id === q.id ? { ...x, optionsCsv: e.target.value } : x)),
                                  }))
                                }
                                placeholder="Option A, Option B"
                                className={cn(
                                  input16,
                                  "h-11 w-full rounded-2xl border bg-black/30 px-3 outline-none",
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
                                    setAdminDraft((p) => ({
                                      ...p,
                                      questions: p.questions.map((x) => (x.id === q.id ? { ...x, placeholder: e.target.value } : x)),
                                    }))
                                  }
                                  placeholder="Type your answer…"
                                  className={cn(
                                    input16,
                                    "h-11 w-full rounded-2xl border bg-black/30 px-3 outline-none",
                                    "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                  )}
                                />
                              </label>

                              <label className="block">
                                <div className="mb-1 text-xs text-zinc-400">Max length</div>
                                <input
                                  value={q.maxLen}
                                  onChange={(e) =>
                                    setAdminDraft((p) => ({
                                      ...p,
                                      questions: p.questions.map((x) => (x.id === q.id ? { ...x, maxLen: e.target.value } : x)),
                                    }))
                                  }
                                  inputMode="numeric"
                                  placeholder="e.g. 240"
                                  className={cn(
                                    input16,
                                    "h-11 w-full rounded-2xl border bg-black/30 px-3 outline-none",
                                    "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                                  )}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!adminSid || adminCreateLoading}
                    onClick={adminCreateBounty}
                    className={cn(
                      "h-12 w-full rounded-2xl text-sm font-semibold",
                      !adminSid || adminCreateLoading
                        ? "border border-white/10 bg-white/5 text-zinc-400"
                        : "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]"
                    )}
                  >
                    {adminCreateLoading ? "Creating…" : "Create bounty"}
                  </button>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                    Uses <span className="font-mono">/api/tg/admin/bounties</span> with headers{" "}
                    <span className="font-mono">x-admin-sid</span> / <span className="font-mono">x-app-sid</span>.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: ADMIN_CREATE_SHEET === */}

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
                  <div className="break-words text-base font-semibold">{selected.title || "Bounty"}</div>
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

                {(selectedAny?.instructions || selectedAny?.how_to) ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-zinc-500">Instructions</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                      {String(selectedAny?.instructions || selectedAny?.how_to)}
                    </div>
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

                {/* Buttons */}
                {!isAdmin ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                      {applyLoading
                        ? "Starting…"
                        : canApply(selectedAny).ok
                        ? "Apply"
                        : canApply(selectedAny).reason || "Not eligible"}
                    </button>

                    <button
                      type="button"
                      onClick={closeDetails}
                      className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {adminDeleteErr ? (
                      <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {adminDeleteErr}
                      </div>
                    ) : null}
                    {adminDeleteOk ? (
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                        {adminDeleteOk}
                      </div>
                    ) : null}
                    {adminAppsErr ? (
                      <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                        {adminAppsErr}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={!adminSid || adminAppsLoading}
                        onClick={() => adminLoadApplications(String(selectedAny?.id || ""))}
                        className={cn(
                          "h-12 rounded-2xl border text-sm font-semibold active:scale-[0.99]",
                          !adminSid || adminAppsLoading
                            ? "border-white/10 bg-white/5 text-zinc-400"
                            : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                        )}
                      >
                        {adminAppsLoading ? "Loading…" : `View applications`}
                      </button>

                      <button
                        type="button"
                        disabled={!adminSid || adminExporting}
                        onClick={() => adminExportCsv(String(selectedAny?.id || ""))}
                        className={cn(
                          "h-12 rounded-2xl border text-sm font-semibold active:scale-[0.99]",
                          !adminSid || adminExporting
                            ? "border-white/10 bg-white/5 text-zinc-400"
                            : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                        )}
                      >
                        {adminExporting ? "Exporting…" : "Export CSV"}
                      </button>

                      <button
                        type="button"
                        disabled={!adminSid || adminDeleting}
                        onClick={() => adminDeleteBounty(String(selectedAny?.id || ""))}
                        className={cn(
                          "h-12 rounded-2xl text-sm font-semibold active:scale-[0.99]",
                          !adminSid || adminDeleting
                            ? "border border-white/10 bg-white/5 text-zinc-400"
                            : "bg-red-950/60 text-red-100 hover:bg-red-900/60 border border-red-500/20"
                        )}
                      >
                        {adminDeleting ? "Deleting…" : "Delete bounty"}
                      </button>

                      <button
                        type="button"
                        onClick={closeDetails}
                        className="h-12 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                      >
                        Back
                      </button>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                      Admin: Manage bounties here. Users apply in the user mini app.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: BOUNTY_DETAILS_SHEET === */}

      {/* === START: ADMIN_APPS_SHEET === */}
      {adminAppsOpen && isAdmin ? (
        <div className="fixed inset-0 z-[92]">
          <button
            type="button"
            aria-label="Close applications"
            onClick={closeAdminApps}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold">📥 Applications ({adminAppsCount})</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Showing applicants + answers (scrollable).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeAdminApps}
                  className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {adminAppsErr ? (
                <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                  {adminAppsErr}
                </div>
              ) : null}

              <div className="mt-3 max-h-[70vh] overflow-y-auto overscroll-contain pb-4" style={{ WebkitOverflowScrolling: "touch" as any }}>
                {adminApps.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
                    No applications yet.
                    <div className="mt-1 text-xs text-zinc-500">
                      If you *did* submit, this usually means the UI called the endpoint with the bounty <span className="font-mono">code</span> instead of <span className="font-mono">id</span>. This tab now calls using <span className="font-mono">bounty.id</span>.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adminApps.map((a: any) => {
                      const ans = asObj(a?.answers);
                      const keys = Object.keys(ans);
                      const created = a?.created_at ? fmtDt(a.created_at) : null;

                      return (
                        <div key={String(a?.id || Math.random())} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-100">
                                {a?.wallet ? shortAddr(String(a.wallet)) : "Applicant"}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                Tier: <span className="text-zinc-200">{String(a?.tier || "—")}</span>
                                {" · "}
                                FairScore:{" "}
                                <span className="text-zinc-200">
                                  {typeof a?.fairscore === "number" ? a.fairscore.toFixed(1) : String(a?.fairscore ?? "—")}
                                </span>
                                {created ? (
                                  <>
                                    {" · "}
                                    <span className="text-zinc-400">{created}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await tryCopy(String(a?.wallet || ""));
                                try {
                                  getTg()?.HapticFeedback?.notificationOccurred?.(ok ? "success" : "error");
                                } catch {}
                              }}
                              className="h-9 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                            >
                              Copy
                            </button>
                          </div>

                          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[11px] text-zinc-500">Answers</div>

                            {keys.length === 0 ? (
                              <div className="mt-2 text-sm text-zinc-300">No answers stored.</div>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {keys.map((k) => {
                                  const label = questionLabelById[k] || k;
                                  const v = prettyVal(ans[k]);

                                  return (
                                    <div key={k} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                      <div className="text-xs font-semibold text-zinc-200">{label}</div>
                                      <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{v || "—"}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* === END: ADMIN_APPS_SHEET === */}

      {/* === START: APPLY_SHEET (USER ONLY) === */}
      {applyOpen && applySession && !isAdmin ? (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            aria-label="Close apply"
            onClick={closeApply}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl">
            <div className="rounded-t-3xl border border-white/10 bg-[#070A0D]/95 p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-base font-semibold">{applySession.bounty.title || "Bounty application"}</div>
                  <div className="mt-1 break-words text-xs text-zinc-500">
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
                <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {applyErr}
                </div>
              ) : null}

              {applyOk ? (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {applyOk}
                </div>
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
                                input16,
                                "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
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
                                input16,
                                "w-full rounded-2xl border bg-black/30 px-4 py-3 outline-none",
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
                              input16,
                              "h-12 w-full rounded-2xl border bg-black/30 px-4 outline-none",
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
      {/* === END: APPLY_SHEET === */}
    </>
  );
}
// === END: FILE_src/app/tg/_components/BountiesTab.tsx ===