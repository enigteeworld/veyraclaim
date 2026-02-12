// src/app/tg/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FairScaleBadge = {
  id?: string;
  label?: string;
  description?: string;
  tier?: string;
};

type FairScaleAction = {
  id?: string;
  label?: string;
  description?: string;
  priority?: string;
  cta?: string;
};

type FairScaleScore = {
  wallet: string;
  fairscore: number;
  tier: string;
  fairscore_base?: number;
  social_score?: number;
  badges?: FairScaleBadge[];
  actions?: FairScaleAction[];
  timestamp?: string;
  features?: Record<string, any>;
};

type AppQuestion =
  | {
      id: string;
      type: "text";
      label: string;
      required?: boolean;
      placeholder?: string;
      maxLen?: number;
    }
  | {
      id: string;
      type: "textarea";
      label: string;
      required?: boolean;
      placeholder?: string;
      maxLen?: number;
    }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

type ApplySessionPayload = {
  sid: string;
  campaign: { id: string; code: string; title?: string; description?: string; questions?: AppQuestion[] };
  profile: { wallet: string; tier: string; fairscore: number };
};

type AdminSessionPayload = {
  sid: string; // uuid from /api/tg/admin/session
  telegram_user_id: number;
  username?: string | null;
};

type TgMePayload = {
  // backend might return any of these (we normalize)
  saved_wallet?: string | null;
  savedWallet?: string | null;
  wallet?: string | null;

  last_known_tier?: string | null;
  lastKnownTier?: string | null;
  tier?: string | null;

  last_known_fairscore?: number | null;
  lastKnownFairscore?: number | null;
  fairscore?: number | null;

  telegram_user_id?: number | null;
  username?: string | null;
};

type CampaignType = "drop" | "allowlist" | "ambassador";
type Tier = "bronze" | "silver" | "gold";

type Campaign = {
  id: string;
  code: string;
  type: CampaignType;
  title?: string | null;
  description?: string | null;
  min_tier?: string | null;
  max_slots?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
  project_id?: string | null;

  // Enriched counts (your APIs may use any of these names)
  entries_count?: number | null;
  applicants_count?: number | null;
  applications_count?: number | null;
  submissions_count?: number | null;
  entriesCount?: number | null;
  applicantsCount?: number | null;
  applicationsCount?: number | null;
  submissionsCount?: number | null;

  // Optional: if your admin campaigns endpoint returns questions
  questions?: AppQuestion[] | null;
};

type ApplicationRow = {
  id: string;
  created_at?: string | null;
  telegram_user_id?: number | null;
  username?: string | null;
  wallet?: string | null;
  tier?: string | null;
  fairscore?: number | null;
  answers?: Record<string, any> | null;
  proof_links?: any[] | null;

  // optional if backend later provides it
  is_duplicate?: boolean | null;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isEvm(w: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(w);
}

function isSol(w: string) {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(w) && w.length >= 32 && w.length <= 44;
}

function detectKind(w: string): "evm" | "sol" | "unknown" {
  const x = (w || "").trim();
  if (isEvm(x)) return "evm";
  if (isSol(x)) return "sol";
  return "unknown";
}

function shortWallet(w: string) {
  const x = (w || "").trim();
  if (!x) return "";
  if (x.startsWith("0x")) return `${x.slice(0, 6)}…${x.slice(-4)}`;
  return `${x.slice(0, 4)}…${x.slice(-4)}`;
}

function tierPill(tier: string) {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return { label: "Gold", cls: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30" };
  if (t === "silver") return { label: "Silver", cls: "bg-zinc-200/10 text-zinc-100 border-zinc-200/20" };
  return { label: "Bronze", cls: "bg-orange-500/15 text-orange-200 border-orange-500/30" };
}

function badgeTierDot(tier: string) {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return "🟡";
  if (t === "silver") return "⚪️";
  return "🟤";
}

function priorityIcon(p: string) {
  const v = (p || "").toLowerCase();
  if (v === "high") return "🔥";
  if (v === "medium") return "✨";
  return "➕";
}

function getTg() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

function getQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

function makeId(prefix = "q") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
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
    s.dataset.tgWebapp = "1";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

type Tab = "eligibility" | "reputation" | "campaigns" | "onboarding";
type AdminCampaignType = "drop" | "allowlist" | "ambassador";

type AdminQuestionDraft = {
  id: string;
  type: "text" | "textarea" | "select";
  label: string;
  required: boolean;
  placeholder: string;
  maxLen: string; // keep as string for input
  optionsCsv: string; // for select
};

function safeNum(n: any): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x;
}

function isEnded(c: Campaign) {
  if (!c?.ends_at) return false;
  const t = new Date(c.ends_at).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function getFilledCount(c: Campaign): number | null {
  const v =
    c.entries_count ??
    c.entriesCount ??
    c.applicants_count ??
    c.applicantsCount ??
    c.applications_count ??
    c.applicationsCount ??
    c.submissions_count ??
    c.submissionsCount;
  return safeNum(v);
}

function getMaxSlots(c: Campaign): number | null {
  return safeNum(c?.max_slots);
}

function isFull(c: Campaign) {
  const max = getMaxSlots(c);
  const filled = getFilledCount(c);
  if (!max || max <= 0) return false;
  if (filled === null) return false;
  return filled >= max;
}

function statusPill(c: Campaign) {
  if (isEnded(c)) return { label: "Ended", cls: "bg-zinc-200/10 text-zinc-100 border-zinc-200/20" };
  if (isFull(c)) return { label: "Full", cls: "bg-red-500/10 text-red-200 border-red-500/25" };
  return { label: "Open", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/25" };
}

function typePill(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "ambassador") return { label: "Ambassador", cls: "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/25" };
  if (x === "allowlist") return { label: "Allowlist", cls: "bg-blue-500/10 text-blue-200 border-blue-500/25" };
  return { label: "Drop", cls: "bg-purple-500/10 text-purple-200 border-purple-500/25" };
}

function escapeCsvCell(v: any) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") return;

  // Add UTF-8 BOM for Excel friendliness when exporting CSV
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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

/** Always send Telegram initData using multiple header spellings (server may accept different ones). */
function tgInitHeaders(initData: string) {
  const id = (initData || "").toString();
  if (!id) return {};
  return {
    "x-tg-initdata": id,
    "x-tg-init-data": id,
    "x-telegram-initdata": id,
    "x-telegram-init-data": id,
  } as Record<string, string>;
}

function normalizeCampaign(raw: any): Campaign {
  const filled =
    raw?.entries_count ??
    raw?.entriesCount ??
    raw?.applicants_count ??
    raw?.applicantsCount ??
    raw?.applications_count ??
    raw?.applicationsCount ??
    raw?.submissions_count ??
    raw?.submissionsCount;

  const max = raw?.max_slots ?? raw?.maxSlots ?? raw?.slots ?? raw?.max;

  return {
    id: String(raw?.id || ""),
    code: String(raw?.code || ""),
    type: (String(raw?.type || "drop").toLowerCase() as CampaignType) || "drop",
    title: raw?.title ?? null,
    description: raw?.description ?? null,
    min_tier: raw?.min_tier ?? raw?.minTier ?? null,
    max_slots: safeNum(max),
    starts_at: raw?.starts_at ?? raw?.startsAt ?? null,
    ends_at: raw?.ends_at ?? raw?.endsAt ?? null,
    created_at: raw?.created_at ?? raw?.createdAt ?? null,
    project_id: raw?.project_id ?? raw?.projectId ?? null,
    entries_count: safeNum(filled),
    applicants_count: safeNum(raw?.applicants_count ?? raw?.applicantsCount),
    applications_count: safeNum(raw?.applications_count ?? raw?.applicationsCount),
    submissions_count: safeNum(raw?.submissions_count ?? raw?.submissionsCount),
    entriesCount: safeNum(raw?.entriesCount),
    applicantsCount: safeNum(raw?.applicantsCount),
    applicationsCount: safeNum(raw?.applicationsCount),
    submissionsCount: safeNum(raw?.submissionsCount),
    questions: Array.isArray(raw?.questions) ? raw.questions : null,
  };
}

function formatSlotsText(c: Campaign) {
  const filled = getFilledCount(c);
  const max = getMaxSlots(c);

  // If backend doesn't provide filled, show 0/max instead of "—/max" (cleaner + consistent)
  const filledSafe = filled === null ? 0 : filled;

  if (typeof max === "number" && max > 0) return `${filledSafe}/${max}`;
  if (filled !== null) return String(filled);
  return "0";
}

export default function TgMiniAppPage() {
  const [tab, setTab] = useState<Tab>("eligibility");

  const [wallet, setWallet] = useState("");
  const [walletTouched, setWalletTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FairScaleScore | null>(null);
  const [err, setErr] = useState<string>("");

  const [showWalletSheet, setShowWalletSheet] = useState(false);
  const [showMenuSheet, setShowMenuSheet] = useState(false);

  const walletInputRef = useRef<HTMLInputElement | null>(null);

  const kind = useMemo(() => detectKind(wallet), [wallet]);
  const activeWallet = useMemo(() => (result?.wallet || wallet || "").trim(), [result?.wallet, wallet]);
  const headerWalletLabel = useMemo(() => {
    if (result?.wallet) return shortWallet(result.wallet);
    if (wallet.trim()) return shortWallet(wallet);
    return "Wallet";
  }, [result?.wallet, wallet]);

  // Telegram initData
  const [initData, setInitData] = useState<string>("");
  const [meLoading, setMeLoading] = useState(false);
  const [meErr, setMeErr] = useState<string>("");
  const [me, setMe] = useState<TgMePayload | null>(null);

  // Prevent repeated auto-check loops
  const didAutoScoreRef = useRef(false);

  // User Apply Session
  const [sid, setSid] = useState<string>("");
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyErr, setApplyErr] = useState<string>("");
  const [applyOk, setApplyOk] = useState<string>("");
  const [applySession, setApplySession] = useState<ApplySessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Admin Mode
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminErr, setAdminErr] = useState("");
  const [adminSession, setAdminSession] = useState<AdminSessionPayload | null>(null);

  const showAdminTabs = isAdmin; // admin-only tabs are visible only when opened in admin mode

  // Admin: create campaign form
  const [cType, setCType] = useState<AdminCampaignType>("ambassador");
  const [cTitle, setCTitle] = useState("Veyra Ambassador Program");
  const [cMinTier, setCMinTier] = useState<Tier>("bronze");
  const [cMaxSlots, setCMaxSlots] = useState<string>("150");
  const [cDesc, setCDesc] = useState<string>("Apply to represent Veyra in community growth and campaigns.");

  const [qDrafts, setQDrafts] = useState<AdminQuestionDraft[]>([
    {
      id: makeId("q"),
      type: "text",
      label: "Your X (Twitter) handle",
      required: true,
      placeholder: "@yourhandle",
      maxLen: "60",
      optionsCsv: "",
    },
    {
      id: makeId("q"),
      type: "textarea",
      label: "Why should we select you?",
      required: true,
      placeholder: "Short and specific. What makes you a strong fit?",
      maxLen: "400",
      optionsCsv: "",
    },
    {
      id: makeId("q"),
      type: "textarea",
      label: "Relevant experience (roles, communities, campaigns)",
      required: false,
      placeholder: "Communities you’ve contributed to, campaign experience, roles, etc.",
      maxLen: "300",
      optionsCsv: "",
    },
  ]);

  const [createMsg, setCreateMsg] = useState<string>("");
  const [createOk, setCreateOk] = useState<string>("");

  // Campaign listing
  const [campLoading, setCampLoading] = useState(false);
  const [campErr, setCampErr] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campLastLoadedAt, setCampLastLoadedAt] = useState<number | null>(null);

  // Applications Modal (Admin)
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsCampaign, setAppsCampaign] = useState<Campaign | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsErr, setAppsErr] = useState("");
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [appsSort, setAppsSort] = useState<"recent" | "tier" | "fairscore">("recent");
  const [appsQuery, setAppsQuery] = useState<string>("");

  // Questions for this campaign (for pretty answer rendering + CSV columns)
  const [appsQuestions, setAppsQuestions] = useState<AppQuestion[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await ensureTelegramScript();
      if (cancelled) return;

      const tg = getTg();
      if (!tg) return;

      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("secondary_bg_color");
      tg.setBackgroundColor?.("bg_color");
      tg.disableVerticalSwipes?.();

      const id = (tg?.initData || "").toString();
      setInitData(id);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const s = getQueryParam("sid") || getQueryParam("session");
    if (s) {
      setSid(s);
      setTab("campaigns");
    }

    const adminFlag = getQueryParam("admin");
    if (adminFlag === "1" || adminFlag.toLowerCase() === "true") {
      setIsAdmin(true);
      setTab("campaigns");
    }
  }, []);

  /**
   * Hydrate Mini App wallet from Telegram user profile.
   * Fixes “bot verified wallet not showing” by:
   * 1) Sending initData in BOTH headers and body (covers backend expectations)
   * 2) Supporting multiple payload field names
   * 3) Auto-loading score once (so wallet + tier/score appear immediately)
   */
  useEffect(() => {
    if (!initData) return;

    let cancelled = false;
    async function loadMe() {
      setMeErr("");
      setMeLoading(true);

      try {
        const tg = getTg();
        const id = (tg?.initData || initData || "").toString();

        const res = await fetch("/api/tg/me", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...tgInitHeaders(id),
          },
          body: JSON.stringify({
            initData: id,
            init_data: id,
            initDataRaw: id,
          }),
        });

        const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: TgMePayload; error?: string } | null;
        if (!res.ok || !j?.ok) {
          const msg = j?.error || `Profile unavailable (${res.status})`;
          throw new Error(msg);
        }

        if (cancelled) return;

        const payload = j.data || {};
        setMe(payload);

        // Normalize wallet field (covers old + new shapes)
        const saved = String(payload.saved_wallet || payload.savedWallet || payload.wallet || "").trim();

        if (saved && !walletTouched) {
          setWallet(saved);

          // Auto-load score ONCE so the UI reflects verified wallet immediately
          if (!didAutoScoreRef.current && !result) {
            didAutoScoreRef.current = true;
            setTimeout(() => {
              // do not hijack the user’s current tab
              void checkNow(saved, { goTo: null });
            }, 80);
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setMeErr(e?.message || "Could not load your profile.");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, walletTouched]);

  // Load user apply session
  useEffect(() => {
    if (!sid) return;

    let cancelled = false;
    async function loadSession() {
      setApplyErr("");
      setApplyOk("");
      setApplySession(null);
      setAnswers({});
      setApplyLoading(true);

      try {
        await ensureTelegramScript();
        const tg = getTg();
        const id = (tg?.initData || initData || "").toString();

        const res = await fetch("/api/tg/apply/session", {
          method: "POST",
          headers: { "content-type": "application/json", ...tgInitHeaders(id) },
          body: JSON.stringify({ sid, initData: id, init_data: id }),
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Session unavailable (${res.status})`);
        }

        const data = (await res.json()) as { ok: boolean; data?: ApplySessionPayload; error?: string };
        if (!data?.ok || !data?.data) throw new Error(data?.error || "Invalid session.");

        if (cancelled) return;
        setApplySession(data.data);

        const sessionWallet = (data.data?.profile?.wallet || "").trim();
        if (sessionWallet) {
          setWallet(sessionWallet);
          setWalletTouched(false);
        }

        const qs = data.data.campaign.questions || [];
        const init: Record<string, string> = {};
        for (const q of qs) init[q.id] = "";
        setAnswers(init);

        getTg()?.HapticFeedback?.notificationOccurred?.("success");
      } catch (e: any) {
        if (cancelled) return;
        setApplyErr(e?.message || "Could not load application session.");
        getTg()?.HapticFeedback?.notificationOccurred?.("error");
      } finally {
        if (!cancelled) setApplyLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sid, initData]);

  // Load admin session
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    async function loadAdmin() {
      setAdminErr("");
      setAdminSession(null);
      setAdminLoading(true);

      try {
        await ensureTelegramScript();
        const tg = getTg();
        const id = (tg?.initData || initData || "").toString();

        const res = await fetch("/api/tg/admin/session", {
          method: "POST",
          headers: { "content-type": "application/json", ...tgInitHeaders(id) },
          body: JSON.stringify({ initData: id, init_data: id }),
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Admin unavailable (${res.status})`);
        }

        const data = (await res.json()) as { ok: boolean; data?: AdminSessionPayload; error?: string };
        if (!data?.ok || !data?.data) throw new Error(data?.error || "Invalid admin session.");

        if (cancelled) return;
        setAdminSession(data.data);
        getTg()?.HapticFeedback?.notificationOccurred?.("success");
      } catch (e: any) {
        if (cancelled) return;
        setAdminErr(e?.message || "Could not load admin session.");
        getTg()?.HapticFeedback?.notificationOccurred?.("error");
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    }

    loadAdmin();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, initData]);

  // Load campaigns
  useEffect(() => {
    if (!tab || tab !== "campaigns") return;
    if (campLastLoadedAt && Date.now() - campLastLoadedAt < 10_000) return;

    let cancelled = false;
    async function loadCampaigns() {
      setCampErr("");
      setCampLoading(true);

      try {
        await ensureTelegramScript();
        const tg = getTg();
        const id = (tg?.initData || initData || "").toString();

        const url = isAdmin && adminSession ? "/api/tg/admin/campaigns" : "/api/tg/campaigns";

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...tgInitHeaders(id),
            ...(adminSession?.sid ? { "x-app-sid": adminSession.sid, "x-admin-sid": adminSession.sid } : {}),
          },
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Campaigns unavailable (${res.status})`);
        }

        const j = (await res.json().catch(() => null)) as any;
        if (!j?.ok) throw new Error(j?.error || "Campaigns unavailable.");

        const list = (j.campaigns || j.data || []) as any[];
        if (!Array.isArray(list)) throw new Error("Invalid campaigns payload.");

        const normalized = list.map(normalizeCampaign).filter((c) => c.id && c.code);

        if (cancelled) return;
        setCampaigns(normalized);
        setCampLastLoadedAt(Date.now());
      } catch (e: any) {
        if (cancelled) return;
        setCampErr(String(e?.message || "Could not load campaigns."));
      } finally {
        if (!cancelled) setCampLoading(false);
      }
    }

    loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, [tab, isAdmin, adminSession, initData, campLastLoadedAt]);

  async function checkNow(
    w: string,
    opts?: {
      goTo?: Tab | null; // null = don't change tab
    }
  ) {
    const input = (w || "").trim();
    setErr("");
    setResult(null);

    const k = detectKind(input);
    if (k === "unknown") {
      setErr("Paste a valid wallet (Solana base58 or EVM 0x...).");
      return;
    }

    try {
      getTg()?.HapticFeedback?.impactOccurred?.("light");
      setLoading(true);

      const id = (getTg()?.initData || initData || "").toString();

      const res = await fetch("/api/tg/verify", {
        method: "POST",
        headers: { "content-type": "application/json", ...tgInitHeaders(id) },
        body: JSON.stringify({ wallet: input, initData: id, init_data: id }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { ok: boolean; data?: FairScaleScore; error?: string };
      if (!data?.ok || !data?.data) throw new Error(data?.error || "No data returned.");

      setResult(data.data);

      // only change tab if requested (default behavior from buttons is to go to score)
      const goTo = opts?.goTo;
      if (goTo) setTab(goTo);

      getTg()?.HapticFeedback?.notificationOccurred?.("success");
    } catch (e: any) {
      setErr(e?.message || "Failed to fetch score.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setLoading(false);
    }
  }

  async function submitApplication() {
    if (!applySession) return;

    setApplyErr("");
    setApplyOk("");
    setApplyLoading(true);

    try {
      const qs = applySession.campaign.questions || [];
      for (const q of qs) {
        const v = (answers[q.id] || "").trim();
        if (q.required && !v) {
          throw new Error(`Please answer: ${q.label}`);
        }
        const maxLen = (q as any).maxLen;
        if (typeof maxLen === "number" && v.length > maxLen) {
          throw new Error(`Too long: ${q.label} (max ${maxLen})`);
        }
      }

      await ensureTelegramScript();
      const tg = getTg();
      const id = (tg?.initData || initData || "").toString();

      const res = await fetch("/api/tg/apply/submit", {
        method: "POST",
        headers: { "content-type": "application/json", ...tgInitHeaders(id) },
        body: JSON.stringify({
          sid: applySession.sid,
          initData: id,
          init_data: id,
          answers,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Submit failed (${res.status})`);
      }

      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!data?.ok) throw new Error(data?.error || "Could not submit.");

      setApplyOk(data?.message || "✅ Application submitted");
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (e: any) {
      setApplyErr(e?.message || "Failed to submit application.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setApplyLoading(false);
    }
  }

  function asQuestionsForDb(): AppQuestion[] {
    return qDrafts
      .slice(0, 12)
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

  async function createCampaign() {
    setCreateMsg("");
    setCreateOk("");

    if (!adminSession) {
      setCreateMsg("Admin session not available. Open the Admin Panel from the bot and try again.");
      return;
    }

    if (!cTitle.trim()) {
      setCreateMsg("Title is required.");
      return;
    }

    const qs = cType === "ambassador" ? asQuestionsForDb() : [];
    if (cType === "ambassador" && qs.length === 0) {
      setCreateMsg("Add at least 1 question for ambassador campaigns.");
      return;
    }

    setAdminLoading(true);
    try {
      await ensureTelegramScript();
      const tg = getTg();
      const id = (tg?.initData || initData || "").toString();

      const res = await fetch("/api/tg/admin/create-campaign", {
        method: "POST",
        headers: { "content-type": "application/json", ...tgInitHeaders(id) },
        body: JSON.stringify({
          sid: adminSession.sid,
          initData: id,
          init_data: id,
          type: cType,
          title: cTitle.trim(),
          description: cDesc.trim() || null,
          min_tier: cMinTier,
          max_slots: cMaxSlots.trim() ? Number(cMaxSlots.trim()) : null,
          questions: qs,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Create failed (${res.status})`);
      }

      const data = (await res.json()) as { ok: boolean; data?: any; error?: string };
      if (!data.ok) throw new Error(data.error || "Could not create campaign.");

      setCreateOk(`✅ Campaign created: ${data.data.code}`);
      getTg()?.HapticFeedback?.notificationOccurred?.("success");

      setCampLastLoadedAt(null);
      setTimeout(() => setTab("campaigns"), 50);
    } catch (e: any) {
      setCreateMsg(e?.message || "Create failed.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleCopyCommand(cmd: string) {
    const ok = await copyText(cmd);
    if (ok) {
      getTg()?.HapticFeedback?.notificationOccurred?.("success");
      getTg()?.showAlert?.(`Copied:\n${cmd}\n\nPaste it in the bot chat.`);
    } else {
      getTg()?.showAlert?.(`Copy this command:\n${cmd}`);
    }
  }

  function openAppsModal(c: Campaign) {
    setAppsCampaign(c);
    setAppsOpen(true);
    setAppsErr("");
    setApps([]);
    setAppsQuestions(Array.isArray(c.questions) ? (c.questions as AppQuestion[]) : []);
    setAppsQuery("");
    setAppsSort("recent");
    void loadApplications(c);
  }

  function closeAppsModal() {
    setAppsOpen(false);
    setAppsCampaign(null);
    setAppsErr("");
    setApps([]);
    setAppsQuestions([]);
    setAppsQuery("");
  }

  function buildQuestionMap(qs: AppQuestion[]) {
    const m = new Map<string, AppQuestion>();
    for (const q of qs || []) m.set(q.id, q);
    return m;
  }

  /**
   * Admin applications list:
   * - sid via headers (x-app-sid / x-admin-sid)
   * - initData via accepted header variants
   */
  async function loadApplications(c: Campaign, silent = false): Promise<{ list: ApplicationRow[]; questions: AppQuestion[] }> {
    if (!adminSession) {
      setAppsErr("Admin session missing. Reopen Admin Panel from the bot and try again.");
      return { list: [], questions: [] };
    }
    if (!c?.id) {
      setAppsErr("Missing campaign id.");
      return { list: [], questions: [] };
    }

    if (!silent) setAppsLoading(true);
    setAppsErr("");

    try {
      await ensureTelegramScript();
      const tg = getTg();
      const id = (tg?.initData || initData || "").toString();

      const url = `/api/tg/admin/applications?campaign_id=${encodeURIComponent(c.id)}`;

      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...tgInitHeaders(id),
        "x-app-sid": adminSession.sid,
        "x-admin-sid": adminSession.sid,
      };

      const res = await fetch(url, { method: "GET", headers });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Failed to load applications (${res.status})`);
      }

      const j = (await res.json().catch(() => null)) as any;
      if (!j?.ok) throw new Error(j?.error || "Could not load applications.");

      const list = (j.applications || j.data || []) as ApplicationRow[];
      if (!Array.isArray(list)) throw new Error("Invalid applications payload.");

      const apiQs =
        (j?.data?.campaign?.questions as AppQuestion[] | undefined) ||
        (j?.campaign?.questions as AppQuestion[] | undefined) ||
        (c.questions as AppQuestion[] | undefined) ||
        [];

      setApps(list);
      setAppsQuestions(Array.isArray(apiQs) ? apiQs : []);

      return { list, questions: Array.isArray(apiQs) ? apiQs : [] };
    } catch (e: any) {
      setAppsErr(String(e?.message || "Could not load applications."));
      return { list: [], questions: [] };
    } finally {
      if (!silent) setAppsLoading(false);
    }
  }

  function formatAnswerValue(v: any) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") return v.trim() ? v : "—";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : safeStringify(x))).join(", ");
    return safeStringify(v);
  }

  function renderAnswersPretty(row: ApplicationRow) {
    const a = row.answers || {};
    const qs = appsQuestions || [];
    const qMap = buildQuestionMap(qs);

    const orderedKeys: string[] = [];
    for (const q of qs) {
      if (q?.id && Object.prototype.hasOwnProperty.call(a, q.id)) orderedKeys.push(q.id);
    }
    for (const k of Object.keys(a)) {
      if (!orderedKeys.includes(k)) orderedKeys.push(k);
    }

    if (orderedKeys.length === 0) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">No answers captured.</div>
      );
    }

    return (
      <div className="space-y-3">
        {orderedKeys.map((key) => {
          const q = qMap.get(key);
          const label = q?.label || prettifyKey(key);
          const value = formatAnswerValue((a as any)[key]);

          return (
            <div key={key} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs font-semibold text-zinc-200">{label}</div>
              <div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">{value}</div>
              {q?.required ? <div className="mt-2 text-[11px] text-zinc-500">Required</div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  async function exportApplicationsCsv(c: Campaign) {
    try {
      const { list, questions } = await loadApplications(c, true);

      if (!list.length) {
        getTg()?.showAlert?.("No applications to export yet.");
        return;
      }

      const qs = Array.isArray(questions) ? questions : [];
      const qColumns = qs.slice(0, 24).map((q, idx) => {
        const label = (q.label || `Question ${idx + 1}`).trim();
        const n = String(idx + 1).padStart(2, "0");
        return { id: q.id, header: `Q${n} - ${label}` };
      });

      const headers = [
        "campaign_code",
        "campaign_title",
        "campaign_type",
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

      for (const r of list) {
        const answersObj = r.answers || {};
        const rowCells: any[] = [
          c.code || "",
          c.title || "",
          c.type || "",
          r.id,
          r.created_at ? new Date(r.created_at).toISOString() : "",
          r.telegram_user_id ?? "",
          r.username ? `@${r.username}` : "",
          r.wallet ?? "",
          r.tier ?? "",
          typeof r.fairscore === "number" ? r.fairscore.toFixed(1) : r.fairscore ?? "",
        ];

        for (const qc of qColumns) {
          rowCells.push(formatAnswerValue((answersObj as any)[qc.id]));
        }

        rowCells.push(r.answers ? JSON.stringify(r.answers) : "");
        lines.push(rowCells.map(escapeCsvCell).join(","));
      }

      const filename = `veyra_${(c.code || "campaign").toLowerCase()}_applications.csv`;
const csv = lines.join("\n");

// ✅ Telegram WebView-friendly export:
// - First try local download (works in normal browsers / desktop Telegram)
// - If blocked, show a copy option + open a new tab with a data URL fallback
try {
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  getTg()?.HapticFeedback?.notificationOccurred?.("success");
} catch {
  // ignore and fall through
}

setTimeout(async () => {
  // If Telegram blocks downloads, user sees nothing. Provide fallback actions.
  const tg = getTg();

  // 1) Copy CSV to clipboard (so they can paste into Google Sheets / Notes)
  const copied = await copyText(csv);

  // ✅ Telegram does NOT support data: URLs. Use server export instead.
try {
  if (!adminSession?.sid) throw new Error("Missing admin session.");

  const origin = window.location.origin;
  const url =
    `${origin}/api/tg/admin/export-csv` +
    `?campaign_id=${encodeURIComponent(c.id)}` +
    `&sid=${encodeURIComponent(adminSession.sid)}`;

  if (tg?.openLink) tg.openLink(url);
  else window.location.href = url;
} catch {
  // ignore
}


  tg?.showAlert?.(
    copied
      ? "CSV copied to clipboard. Paste into Google Sheets/Excel if download didn’t start."
      : "If download didn’t start, Telegram may block it. Use Export via server (recommended) or copy from a desktop browser."
  );
}, 250);

    } catch (e: any) {
      getTg()?.showAlert?.(e?.message || "Export failed.");
      getTg()?.HapticFeedback?.notificationOccurred?.("error");
    }
  }

  const sortedFilteredApps = useMemo(() => {
    const q = (appsQuery || "").trim().toLowerCase();
    let list = apps.slice();

    if (q) {
      list = list.filter((r) => {
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

    const tierRank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

    list.sort((a, b) => {
      if (appsSort === "tier") {
        const ta = tierRank[String(a.tier || "").toLowerCase()] || 0;
        const tb = tierRank[String(b.tier || "").toLowerCase()] || 0;
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

    return list;
  }, [apps, appsQuery, appsSort]);

  // Apply UI helpers
  const applyCampaign = applySession?.campaign;
  const applyQs = (applyCampaign?.questions || []) as AppQuestion[];

  const userVisibleCampaigns = useMemo(() => {
    return campaigns.filter((c) => !isEnded(c));
  }, [campaigns]);

  const topSubTitle = useMemo(() => {
    if (adminSession) return "Admin Panel";
    if (sid) return "Application";
    return showAdminTabs ? "Eligibility • Score • Campaigns • Onboarding" : "Eligibility • Score • Campaigns";
  }, [adminSession, sid, showAdminTabs]);

  const onboardingKit = useMemo(() => {
    return [
      {
        title: "1) Access & eligibility",
        body: "Participants must have a verified wallet and a valid tier. Invite codes are shared privately to prevent spam.",
      },
      {
        title: "2) Application quality",
        body: "Keep questions short and specific. Prefer 3–6 questions with clear expected answers. Use max length limits for clean exports.",
      },
      {
        title: "3) Anti-spam controls",
        body: "Invite-code gating + wallet verification reduces spam significantly. For additional protection, enforce one application per Telegram user per campaign and flag duplicates.",
      },
      {
        title: "4) Review workflow",
        body: "Export CSV after every batch. Share only the campaign code publicly; do not post session links. Keep internal review notes off-chain.",
      },
    ];
  }, []);

  const tabColsClass = showAdminTabs ? "grid-cols-4" : "grid-cols-3";

  return (
    <div className="min-h-[100dvh] w-full bg-[#070A0D] text-zinc-100">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-purple-500/18 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070A0D]/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
  src="/veyra-logo.png"
  alt="Veyra"
  className="h-9 w-9 shrink-0 rounded-2xl border border-white/10 bg-black/20 p-1 object-contain shadow-[0_10px_25px_rgba(0,0,0,0.25)]"
/>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">Veyra</div>
              <div className="truncate text-xs text-zinc-400 leading-tight">{topSubTitle}</div>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMenuSheet(true)}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-2xl",
                "border border-white/10 bg-white/5 text-zinc-200",
                "hover:bg-white/10 active:scale-[0.99]"
              )}
              title="Menu"
            >
              ☰
            </button>

            <button
              type="button"
              onClick={() => {
                setShowWalletSheet(true);
                setTimeout(() => walletInputRef.current?.focus(), 60);
              }}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3",
                "bg-gradient-to-r from-purple-600 to-fuchsia-600",
                "shadow-[0_10px_30px_rgba(168,85,247,0.18)]",
                "hover:brightness-110 active:scale-[0.99]"
              )}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-black/20">🪪</span>
              <span className="max-w-[92px] truncate text-xs font-semibold leading-none">{headerWalletLabel}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-3xl px-3 pb-3 sm:px-4">
          <div className={cn("grid rounded-2xl border border-white/10 bg-white/5 p-1", tabColsClass)}>
            <button
              type="button"
              onClick={() => setTab("eligibility")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                tab === "eligibility"
                  ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 shadow text-white"
                  : "text-zinc-300 hover:bg-white/5"
              )}
            >
              ✅ <span className="hidden sm:inline">Eligibility</span>
              <span className="sm:hidden">Check</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("reputation")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                tab === "reputation"
                  ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 shadow text-white"
                  : "text-zinc-300 hover:bg-white/5"
              )}
            >
              📊 <span className="hidden sm:inline">Score</span>
              <span className="sm:hidden">Score</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("campaigns")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                tab === "campaigns"
                  ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 shadow text-white"
                  : "text-zinc-300 hover:bg-white/5"
              )}
            >
              🎯 <span className="hidden sm:inline">Campaigns</span>
              <span className="sm:hidden">Camp</span>
            </button>

            {showAdminTabs && (
              <button
                type="button"
                onClick={() => setTab("onboarding")}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  tab === "onboarding"
                    ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 shadow text-white"
                    : "text-zinc-300 hover:bg-white/5"
                )}
              >
                🧭 <span className="hidden sm:inline">Onboarding</span>
                <span className="sm:hidden">Kit</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-4">
        {/* Profile hints */}
        {(meLoading || meErr) && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm font-semibold">🔐 Telegram profile</div>
            {meLoading ? (
              <div className="mt-2 text-sm text-zinc-400">Loading your saved wallet…</div>
            ) : meErr ? (
              <div className="mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{meErr}</div>
            ) : null}
          </div>
        )}

        {/* Onboarding (Admin-only tab) */}
        {tab === "onboarding" && showAdminTabs && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold">🧭 Onboarding Kit</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Internal rollout checklist for smooth campaign launches, clean applications, and reliable exports.
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                  Admin-only
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {onboardingKit.map((x) => (
                  <div key={x.title} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-sm font-semibold">{x.title}</div>
                    <div className="mt-1 text-sm text-zinc-400">{x.body}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                Tip: keep invite codes private; it materially reduces spam and keeps sessions secure.
              </div>
            </div>
          </section>
        )}

        {/* Eligibility */}
        {tab === "eligibility" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Check eligibility</div>
                  <div className="mt-1 text-sm text-zinc-400">Paste a wallet. We’ll fetch tier + FairScore from FairScale.</div>
                </div>

                <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                  {kind === "sol" ? "🟣 Solana" : kind === "evm" ? "🟦 EVM" : "🔎 Detecting…"}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <div className="mb-1 text-xs text-zinc-400">Wallet</div>
                  <input
                    value={wallet}
                    onChange={(e) => {
                      setWalletTouched(true);
                      setWallet(e.target.value);
                    }}
                    placeholder="Paste wallet address…"
                    className={cn(
                      "h-11 w-full rounded-xl border bg-black/30 px-3 text-sm outline-none",
                      "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                    )}
                  />
                </label>

                {err && (
                  <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => checkNow(wallet, { goTo: "reputation" })}
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold",
                      "bg-gradient-to-r from-purple-600 to-fuchsia-600",
                      "hover:brightness-110 active:scale-[0.99]",
                      loading && "opacity-70"
                    )}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                        Checking…
                      </span>
                    ) : (
                      "Check now"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWalletTouched(false);
                      setWallet("");
                      setErr("");
                      setResult(null);
                      didAutoScoreRef.current = false;
                    }}
                    className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                  >
                    Clear
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                  Verified wallets saved in the bot should auto-load here.
                </div>
              </div>
            </div>

            {result && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-400">Wallet</div>
                    <div className="truncate text-sm font-semibold">{result.wallet}</div>
                  </div>

                  <div className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", tierPill(result.tier).cls)}>
                    {tierPill(result.tier).label}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-xs text-zinc-400">FairScore</div>
                    <div className="mt-1 text-2xl font-bold">{Number(result.fairscore).toFixed(1)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-xs text-zinc-400">Tier</div>
                    <div className="mt-1 text-2xl font-bold">{tierPill(result.tier).label}</div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("reputation")}
                    className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
                  >
                    View score →
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("campaigns")}
                    className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
                  >
                    View campaigns →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Score */}
        {tab === "reputation" && (
          <section className="space-y-4">
            {!result ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-base font-semibold">No score yet</div>
                <div className="mt-1 text-sm text-zinc-400">Run an eligibility check first, then your score breakdown will show here.</div>
                <button
                  type="button"
                  onClick={() => setTab("eligibility")}
                  className="mt-4 h-11 w-full rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-sm font-semibold hover:brightness-110 active:scale-[0.99]"
                >
                  Go to eligibility
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-400">Wallet</div>
                      <div className="truncate text-sm font-semibold">{result.wallet}</div>
                      {result.timestamp ? <div className="mt-1 text-xs text-zinc-500">Updated: {result.timestamp}</div> : null}
                    </div>

                    <div className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", tierPill(result.tier).cls)}>
                      {tierPill(result.tier).label}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="text-xs text-zinc-400">FairScore</div>
                      <div className="mt-1 text-2xl font-bold">{Number(result.fairscore).toFixed(1)}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        base {typeof result.fairscore_base === "number" ? result.fairscore_base.toFixed(1) : "—"} · social{" "}
                        {typeof result.social_score === "number" ? result.social_score.toFixed(1) : "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="text-xs text-zinc-400">Detected</div>
                      <div className="mt-1 text-2xl font-bold">{detectKind(result.wallet) === "evm" ? "EVM" : "Solana"}</div>
                      <div className="mt-1 text-xs text-zinc-500">Wallet format check</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold">🏅 Signals</div>
                    <div className="text-xs text-zinc-500">{(result.badges || []).length || 0}</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(result.badges || []).slice(0, 8).map((b, idx) => (
                      <div key={b.id || idx} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="pt-[1px]">{badgeTierDot(b.tier || "")}</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{b.label || "Badge"}</div>
                            <div className="text-xs text-zinc-400">{b.description || ""}</div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(result.badges || []).length === 0 && <div className="text-sm text-zinc-400">No signals returned for this wallet yet.</div>}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold">🚀 Boost ideas</div>
                    <div className="text-xs text-zinc-500">{(result.actions || []).length || 0}</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(result.actions || []).slice(0, 8).map((a, idx) => (
                      <div key={a.id || idx} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="pt-[1px]">{priorityIcon(a.priority || "")}</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{a.label || "Action"}</div>
                            <div className="text-xs text-zinc-400">{a.description || ""}</div>
                            {a.cta ? <div className="mt-1 text-xs text-zinc-500">{a.cta}</div> : null}
                          </div>
                        </div>
                      </div>
                    ))}

                    {(result.actions || []).length === 0 && <div className="text-sm text-zinc-400">No boost ideas returned for this wallet yet.</div>}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* Campaigns */}
        {tab === "campaigns" && (
          <section className="space-y-4">
            {/* USER CAMPAIGNS LIST */}
            {!sid && !isAdmin && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">🎯 Available campaigns</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      Ongoing campaigns show here. Invite codes are shared privately by the project/admin.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCampLastLoadedAt(null)}
                    className="h-10 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>

                {campLoading && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading campaigns…</div>
                )}

                {campErr && (
                  <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">{campErr}</div>
                )}

                {!campLoading && !campErr && userVisibleCampaigns.length === 0 && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
                    No ongoing campaigns found yet.
                  </div>
                )}

                {!campLoading && userVisibleCampaigns.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {userVisibleCampaigns.map((c) => {
                      const st = statusPill(c);
                      const tp = typePill(c.type);
                      const min = tierPill(String(c.min_tier || "bronze")).label;

                      return (
                        <div key={c.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div className="min-w-0">
    <div className="text-sm font-semibold break-words">{c.title || "Campaign"}</div>
    {c.description ? <div className="mt-1 text-sm text-zinc-400 break-words">{c.description}</div> : null}

    <div className="mt-2 text-xs text-zinc-500">
      Min tier: <span className="font-semibold">{min}</span> · Slots:{" "}
      <span className="font-semibold">{formatSlotsText(c)}</span>
      {c.starts_at ? (
        <>
          {" "}
          · Starts: <span className="font-mono">{new Date(c.starts_at).toLocaleString()}</span>
        </>
      ) : null}
      {c.ends_at ? (
        <>
          {" "}
          · Ends: <span className="font-mono">{new Date(c.ends_at).toLocaleString()}</span>
        </>
      ) : null}
    </div>

                              
                              

                              {/* Lightweight project profile panel */}
                              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <div className="text-xs font-semibold text-zinc-200">Project profile</div>
  <div className="flex flex-wrap items-center gap-2">
    <div className={cn("rounded-full border px-2 py-[2px] text-[11px] font-semibold", tp.cls)}>{tp.label}</div>
    <div className={cn("rounded-full border px-2 py-[2px] text-[11px] font-semibold", st.cls)}>{st.label}</div>
  </div>
</div>


                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">

                                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="text-[11px] text-zinc-500">Title</div>
                                    <div className="mt-1 truncate text-xs font-semibold text-zinc-200">{c.title || c.code}</div>
                                  </div>
                                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="text-[11px] text-zinc-500">Type</div>
                                    <div className="mt-1 text-xs font-semibold text-zinc-200">{tp.label}</div>
                                  </div>
                                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="text-[11px] text-zinc-500">Min tier</div>
                                    <div className="mt-1 text-xs font-semibold text-zinc-200">{min}</div>
                                  </div>
                                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="text-[11px] text-zinc-500">Slots</div>
                                    <div className="mt-1 text-xs font-semibold text-zinc-200">{formatSlotsText(c)}</div>
                                  </div>
                                </div>

                                {c.description ? (
                                  <div className="mt-2 rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="text-[11px] text-zinc-500">Description</div>
                                    <div className="mt-1 text-xs text-zinc-300">{c.description}</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-col sm:items-end">
  <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tp.cls)}>{tp.label}</div>
  <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", st.cls)}>{st.label}</div>
</div>

                          </div>

                          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                            Request an invite code from the project/admin to join or apply.
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ADMIN DASHBOARD */}
            {isAdmin ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">Admin Dashboard</div>
                      <div className="mt-1 text-sm text-zinc-400">Manage campaigns, review applications, and export CSV.</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCampLastLoadedAt(null)}
                      className="h-10 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                    >
                      Refresh
                    </button>
                  </div>

                  {adminLoading && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading admin…</div>
                  )}

                  {adminErr && (
                    <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">{adminErr}</div>
                  )}

                  {!adminErr && !adminLoading && !adminSession && (
                    <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
                      Admin not verified. Open the Admin Panel from the bot and try again.
                    </div>
                  )}

                  {adminSession ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Your campaigns</div>
                        <div className="text-xs text-zinc-500">{campaigns.length}</div>
                      </div>

                      {campLoading && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading campaigns…</div>
                      )}

                      {campErr && (
                        <div className="mt-3 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">{campErr}</div>
                      )}

                      {!campLoading && !campErr && campaigns.length === 0 && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">
                          No campaigns yet. Create your first one below.
                        </div>
                      )}

                      {!campLoading && campaigns.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {campaigns.map((c) => {
                            const st = statusPill(c);
                            const tp = typePill(c.type);
                            const min = tierPill(String(c.min_tier || "bronze")).label;

                            const filled = getFilledCount(c);
                            const max = getMaxSlots(c);
                            const progress =
                              typeof max === "number" && max > 0 ? Math.min(100, Math.round(((filled ?? 0) / max) * 100)) : null;

                            return (
                              <div key={c.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{c.title || c.code}</div>
                                    {c.description ? <div className="mt-1 text-sm text-zinc-400">{c.description}</div> : null}

                                    <div className="mt-2 text-xs text-zinc-500">
                                      Code: <span className="font-mono">{c.code}</span> · Min tier:{" "}
                                      <span className="font-semibold">{min}</span> · Slots:{" "}
                                      <span className="font-semibold">{formatSlotsText(c)}</span>
                                    </div>

                                    {progress !== null ? (
                                      <div className="mt-3">
                                        <div className="h-2 w-full rounded-full bg-white/10">
                                          <div className="h-2 rounded-full bg-white/40" style={{ width: `${progress}%` }} />
                                        </div>
                                        <div className="mt-1 text-[11px] text-zinc-500">{progress}% filled</div>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="flex shrink-0 flex-col items-end gap-2">
                                    <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tp.cls)}>{tp.label}</div>
                                    <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", st.cls)}>{st.label}</div>
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openAppsModal(c)}
                                    className="h-11 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-sm font-semibold hover:brightness-110 active:scale-[0.99]"
                                  >
                                    View applicants
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => exportApplicationsCsv(c)}
                                    className="h-11 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                                  >
                                    Export CSV
                                  </button>
                                </div>

                                <div className="mt-2 text-xs text-zinc-500">
                                  Share the code in Telegram. Users will run{" "}
                                  <span className="font-mono">{c.type === "ambassador" ? `/apply ${c.code}` : `/join ${c.code}`}</span>.
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* ADMIN: Create campaign */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">Create campaign</div>
                      <div className="mt-1 text-sm text-zinc-400">
                        Create a campaign and share its code. Users will use <span className="font-mono">/join</span> or{" "}
                        <span className="font-mono">/apply</span> in the bot.
                      </div>
                    </div>
                  </div>

                  {createMsg && (
                    <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">{createMsg}</div>
                  )}

                  {createOk && (
                    <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">{createOk}</div>
                  )}

                  <div className="mt-4 space-y-3">
                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Type</div>
                      <select
                        value={cType}
                        onChange={(e) => setCType(e.target.value as AdminCampaignType)}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      >
                        <option value="drop">Drop (join)</option>
                        <option value="allowlist">Allowlist (join)</option>
                        <option value="ambassador">Ambassador (apply)</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Title</div>
                      <input
                        value={cTitle}
                        onChange={(e) => setCTitle(e.target.value)}
                        className={cn(
                          "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <div className="mb-1 text-xs text-zinc-400">Minimum tier</div>
                        <select
                          value={cMinTier}
                          onChange={(e) => setCMinTier(e.target.value as any)}
                          className={cn(
                            "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                            "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                          )}
                        >
                          <option value="bronze">Bronze</option>
                          <option value="silver">Silver</option>
                          <option value="gold">Gold</option>
                        </select>
                      </label>

                      <label className="block">
                        <div className="mb-1 text-xs text-zinc-400">Max slots (optional)</div>
                        <input
                          value={cMaxSlots}
                          onChange={(e) => setCMaxSlots(e.target.value)}
                          inputMode="numeric"
                          className={cn(
                            "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                            "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                          )}
                        />
                      </label>
                    </div>

                    <label className="block">
                      <div className="mb-1 text-xs text-zinc-400">Description (optional)</div>
                      <textarea
                        value={cDesc}
                        onChange={(e) => setCDesc(e.target.value)}
                        rows={4}
                        className={cn(
                          "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm outline-none",
                          "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                        )}
                        maxLength={240}
                      />
                      <div className="mt-1 text-xs text-zinc-500">{Math.min(cDesc.length, 240)}/240</div>
                    </label>

                    {cType === "ambassador" && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">Custom questions</div>
                          <button
                            type="button"
                            onClick={() =>
                              setQDrafts((p) => [
                                ...p,
                                { id: makeId("q"), type: "text", label: "", required: false, placeholder: "", maxLen: "", optionsCsv: "" },
                              ])
                            }
                            className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                          >
                            + Add
                          </button>
                        </div>

                        <div className="mt-3 space-y-3">
                          {qDrafts.map((q, idx) => (
                            <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-zinc-400">Question {idx + 1}</div>
                                <button
                                  type="button"
                                  onClick={() => setQDrafts((p) => p.filter((x) => x.id !== q.id))}
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
                                      setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, type: e.target.value as any } : x)))
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
                                    onClick={() => setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, required: !x.required } : x)))}
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
                                  onChange={(e) => setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)))}
                                  placeholder="e.g. Why should we select you?"
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
                                    onChange={(e) => setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, optionsCsv: e.target.value } : x)))}
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
                                      onChange={(e) => setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, placeholder: e.target.value } : x)))}
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
                                      onChange={(e) => setQDrafts((p) => p.map((x) => (x.id === q.id ? { ...x, maxLen: e.target.value } : x)))}
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

                        <div className="mt-3 text-xs text-zinc-400">
                          These questions appear in the <span className="font-mono">/apply CODE</span> form.
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={adminLoading || !adminSession}
                      onClick={createCampaign}
                      className={cn(
                        "h-12 w-full rounded-2xl text-sm font-semibold",
                        "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]",
                        adminLoading && "opacity-70"
                      )}
                    >
                      {adminLoading ? "Creating…" : "Create campaign"}
                    </button>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                      After creation, share the code. Users will use <span className="font-mono">/join CODE</span> or{" "}
                      <span className="font-mono">/apply CODE</span>.
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* USER APPLY FORM (sid present) */}
            {sid && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">📝 Application</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      Session: <span className="font-mono">{sid}</span>
                    </div>
                  </div>

                  {applySession?.profile?.tier ? (
                    <div className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", tierPill(applySession.profile.tier).cls)}>
                      {tierPill(applySession.profile.tier).label}
                    </div>
                  ) : null}
                </div>

                {applyLoading && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading form…</div>
                )}

                {applyErr && (
                  <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">{applyErr}</div>
                )}

                {applyOk && (
                  <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">{applyOk}</div>
                )}

                {applySession && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="text-sm font-semibold">{applyCampaign?.title || `Campaign ${applyCampaign?.code}`}</div>
                      {applyCampaign?.description ? <div className="mt-1 text-sm text-zinc-400">{applyCampaign.description}</div> : null}

                      <div className="mt-3 text-xs text-zinc-500">
                        Wallet: <span className="font-mono">{shortWallet(applySession.profile.wallet)}</span> · FairScore:{" "}
                        <span className="font-mono">{Number(applySession.profile.fairscore).toFixed(1)}</span>
                      </div>
                    </div>

                    {applyQs.length === 0 ? (
                      <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">
                        No questions configured for this campaign.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {applyQs.map((q) => {
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
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={applyLoading || !applySession}
                      onClick={submitApplication}
                      className={cn(
                        "h-12 w-full rounded-2xl text-sm font-semibold",
                        "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]",
                        applyLoading && "opacity-70"
                      )}
                    >
                      {applyLoading ? "Submitting…" : "Submit application"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!sid && !isAdmin ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-semibold">How campaigns work</div>
                <div className="mt-1 text-sm text-zinc-400">
                  Campaigns can be browsed here, but invite codes are shared privately by the project/admin. This reduces spam and protects sessions.
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                  You’ll receive a code in Telegram when you’re eligible.
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>

      {/* Bottom nav */}
<nav className="fixed bottom-0 left-0 right-0 z-40">
  {/* Glass background */}
  <div className="border-t border-white/10 bg-[#070A0D]/80 backdrop-blur-xl">
    <div className="mx-auto w-full max-w-3xl px-3 py-2 sm:px-4">
      {/* Premium pill container */}
      <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_-10px_30px_rgba(0,0,0,0.35)]">
        {/* Tabs group (fills space) */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("eligibility")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition",
              "border border-transparent",
              tab === "eligibility"
                ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 text-white shadow-[0_10px_25px_rgba(168,85,247,0.18)] border-white/10"
                : "text-zinc-300 hover:bg-white/5 hover:border-white/10"
            )}
          >
            <span className="text-base leading-none">✅</span>
            <span className="truncate hidden sm:inline">Eligibility</span>
            <span className="truncate sm:hidden">Check</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("reputation")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition",
              "border border-transparent",
              tab === "reputation"
                ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 text-white shadow-[0_10px_25px_rgba(168,85,247,0.18)] border-white/10"
                : "text-zinc-300 hover:bg-white/5 hover:border-white/10"
            )}
          >
            <span className="text-base leading-none">📊</span>
            <span className="truncate hidden sm:inline">Score</span>
            <span className="truncate sm:hidden">Score</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("campaigns")}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition",
              "border border-transparent",
              tab === "campaigns"
                ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 text-white shadow-[0_10px_25px_rgba(168,85,247,0.18)] border-white/10"
                : "text-zinc-300 hover:bg-white/5 hover:border-white/10"
            )}
          >
            <span className="text-base leading-none">🎯</span>
            <span className="truncate hidden sm:inline">Campaigns</span>
            <span className="truncate sm:hidden">Camp</span>
          </button>

          {showAdminTabs && (
            <button
              type="button"
              onClick={() => setTab("onboarding")}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition",
                "border border-transparent",
                tab === "onboarding"
                  ? "bg-gradient-to-r from-purple-600/70 to-fuchsia-600/70 text-white shadow-[0_10px_25px_rgba(168,85,247,0.18)] border-white/10"
                  : "text-zinc-300 hover:bg-white/5 hover:border-white/10"
              )}
            >
              <span className="text-base leading-none">🧭</span>
              <span className="truncate hidden sm:inline">Onboarding</span>
              <span className="truncate sm:hidden">Kit</span>
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="mx-1 h-8 w-px bg-white/10" />

        {/* Premium Top button (fixed size, doesn’t stretch) */}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
            "border border-white/10 bg-white/5 text-zinc-200",
            "hover:bg-white/10 active:scale-[0.99] transition"
          )}
          title="Top"
        >
          ⬆️
        </button>
      </div>
    </div>
  </div>
</nav>


      {/* Applications modal (Admin) */}
      {appsOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/70" onClick={closeAppsModal} />

          {/* ✅ Make modal a single scroll container: header fixed, body scrolls with iOS momentum */}
          <div className="absolute left-0 right-0 top-6 bottom-6 mx-auto w-[min(960px,94vw)] rounded-3xl border border-white/10 bg-[#0B0F14] shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">📥 Applicants</div>
                <div className="mt-1 truncate text-sm text-zinc-400">
                  {appsCampaign ? (
                    <>
                      <span className="font-mono">{appsCampaign.code}</span> · {appsCampaign.title || "Campaign"} ·{" "}
                      <span className={cn("rounded-full border px-2 py-[2px] text-xs font-semibold", typePill(appsCampaign.type).cls)}>
                        {typePill(appsCampaign.type).label}
                      </span>
                    </>
                  ) : (
                    "Campaign"
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {appsCampaign ? (
                  <button
                    type="button"
                    onClick={() => exportApplicationsCsv(appsCampaign)}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Export CSV
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

            <div
              className="p-4 overflow-auto"
              style={{ WebkitOverflowScrolling: "touch" as any }}
            >
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
                    onClick={() => (appsCampaign ? loadApplications(appsCampaign) : null)}
                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {appsLoading && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">Loading applications…</div>
              )}

              {appsErr && (
                <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-200">{appsErr}</div>
              )}

              {!appsLoading && !appsErr && sortedFilteredApps.length === 0 && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-300">No applications found.</div>
              )}

              {!appsLoading && sortedFilteredApps.length > 0 && (
                <div className="mt-4 space-y-3">
                  {sortedFilteredApps.map((r) => {
                    const tier = String(r.tier || "").toLowerCase() || "bronze";
                    const tp = tierPill(tier);
                    const score = typeof r.fairscore === "number" ? r.fairscore : safeNum(r.fairscore) ?? null;

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
                                Wallet: <span className="font-mono">{shortWallet(String(r.wallet || "")) || "—"}</span>
                                {r.created_at ? (
                                  <>
                                    {" "}
                                    · Submitted: <span className="font-mono">{new Date(r.created_at).toLocaleString()}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", tp.cls)}>{tp.label}</div>
                              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                                {score !== null ? `FairScore ${score.toFixed(1)}` : "FairScore —"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-zinc-500 group-open:hidden">Tap to view answers</div>
                        </summary>

                        <div className="mt-4 space-y-3">
                          {renderAnswersPretty(r)}

                          <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
                            <summary className="cursor-pointer text-xs font-semibold text-zinc-300">View raw data</summary>
                            <pre className="mt-2 max-h-[240px] overflow-auto rounded-xl bg-black/30 p-3 text-xs text-zinc-200">
                              {r.answers ? JSON.stringify(r.answers, null, 2) : "No answers captured."}
                            </pre>
                          </details>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyCommand(r.wallet ? String(r.wallet) : "")}
                              className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                              disabled={!r.wallet}
                            >
                              Copy wallet
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand(r.username ? `@${r.username}` : r.telegram_user_id ? String(r.telegram_user_id) : r.id)}
                              className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                            >
                              Copy handle / id
                            </button>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Wallet sheet */}
      {showWalletSheet && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowWalletSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl rounded-t-3xl border border-white/10 bg-[#0B0F14] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">🪪 Wallet</div>
              <button
                type="button"
                onClick={() => setShowWalletSheet(false)}
                className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-3 text-sm text-zinc-400">
              Paste a wallet address used inside the mini app.
              {(() => {
                const saved = String(me?.saved_wallet || me?.savedWallet || me?.wallet || "").trim();
                return saved ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    Saved from bot: <span className="font-mono">{shortWallet(saved)}</span>
                  </div>
                ) : null;
              })()}
            </div>

            <div className="mt-4 space-y-3">
              <input
                ref={walletInputRef}
                value={wallet}
                onChange={(e) => {
                  setWalletTouched(true);
                  setWallet(e.target.value);
                }}
                placeholder="Paste wallet address…"
                className={cn(
                  "h-12 w-full rounded-2xl border bg-black/30 px-4 text-sm outline-none",
                  "border-white/10 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/15"
                )}
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setShowWalletSheet(false);
                    await checkNow(wallet, { goTo: "reputation" });
                  }}
                  className={cn(
                    "h-12 flex-1 rounded-2xl text-sm font-semibold",
                    "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.99]",
                    loading && "opacity-70"
                  )}
                >
                  {loading ? "Checking…" : "Save & check"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWalletTouched(false);
                    setWallet("");
                    didAutoScoreRef.current = false;
                  }}
                  className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10 active:scale-[0.99]"
                >
                  Clear
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-300">
                🟣 Solana: base58 (32–44 chars) · 🟦 EVM: <span className="font-mono">0x</span> + 40 hex chars
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu sheet */}
      {showMenuSheet && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMenuSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-3xl rounded-t-3xl border border-white/10 bg-[#0B0F14] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">☰ Menu</div>
              <button
                type="button"
                onClick={() => setShowMenuSheet(false)}
                className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab("eligibility");
                  setShowMenuSheet(false);
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                ✅ Eligibility
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab("reputation");
                  setShowMenuSheet(false);
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                📊 Score
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab("campaigns");
                  setShowMenuSheet(false);
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                🎯 Campaigns
              </button>

              {showAdminTabs && (
                <button
                  type="button"
                  onClick={() => {
                    setTab("onboarding");
                    setShowMenuSheet(false);
                  }}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
                >
                  🧭 Onboarding Kit
                </button>
              )}

              <div className="my-2 h-px bg-white/10" />

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                🔄 Refresh
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenuSheet(false);
                  getTg()?.showAlert?.(
                    "Help:\n\n• Eligibility: check a wallet\n• Score: view breakdown\n• Campaigns: browse ongoing campaigns\n\nInvite codes are shared privately by the project/admin."
                  );
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                ℹ️ Help
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMenuSheet(false);
                  getTg()?.close?.();
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                ✖️ Close app
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
