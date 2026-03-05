// === START: FILE_useBounties.ts ===
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Bounty = {
  id: string;
  code?: string | null;
  title?: string | null;

  // core
  description?: string | null;
  reward?: string | number | null;
  currency?: string | null;
  min_tier?: string | null;
  status?: "open" | "closed" | "paused" | string | null;
  published?: boolean | null;
  application_schema?: any;
  created_at?: string | null;

  // richer details (for “View details”)
  how_to?: string | null;
  instructions?: string | null; // ✅ normalized alias for UI
  rules?: string | null;
  link_url?: string | null;
  max_winners?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;

  // attribution / ownership
  project_id?: string | null;
  posted_by_type?: "veyra" | "project" | string | null;
  posted_by_name?: string | null;
};

type UseBountiesArgs = {
  initData?: string | null;
  sid?: string | null; // user session (optional)

  // admin mode (optional)
  isAdmin?: boolean;
  adminSid?: string | null;
};

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

function pickRows(json: any): Bounty[] {
  const rows: Bounty[] = Array.isArray(json)
    ? (json as any)
    : Array.isArray(json?.bounties)
    ? json.bounties
    : Array.isArray(json?.list)
    ? json.list
    : Array.isArray(json?.items)
    ? json.items
    : Array.isArray(json?.data)
    ? json.data
    : [];

  return Array.isArray(rows) ? rows : [];
}

function normalizeBountyRow(row: any): Bounty {
  const b: any = { ...(row || {}) };

  // ✅ Normalize "instructions" across your schema variants:
  // DB currently has `how_to` (seen in your table screenshots),
  // but some routes/UI use `instructions`.
  //
  // Rule:
  // - if instructions missing but how_to exists -> instructions = how_to
  // - if how_to missing but instructions exists -> how_to = instructions
  const howTo =
    typeof b.how_to === "string"
      ? b.how_to
      : typeof b.howTo === "string"
      ? b.howTo
      : typeof b.instructions === "string"
      ? b.instructions
      : null;

  const instr =
    typeof b.instructions === "string"
      ? b.instructions
      : typeof b.how_to === "string"
      ? b.how_to
      : typeof b.howTo === "string"
      ? b.howTo
      : null;

  b.how_to = howTo;
  b.instructions = instr;

  // ✅ Normalize application schema too (some endpoints might return `questions`)
  if (b.application_schema == null && b.questions != null) {
    b.application_schema = b.questions;
  }

  return b as Bounty;
}

async function readJsonSafe(res: Response) {
  const j = await res.json().catch(() => null);
  return j ?? null;
}

export function useBounties(args: UseBountiesArgs) {
  const isAdmin = !!args.isAdmin;
  const adminSid = (args.adminSid || "").trim();
  const sid = (args.sid || "").trim();

  // We intentionally DO NOT trust args.initData to always be present.
  // We'll try to grab initData from Telegram WebApp at runtime.
  const initDataProp = (args.initData || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<Bounty[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<number>(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canLoad = useMemo(() => {
    // If initData is missing but Telegram script can provide it, we still allow load.
    // We'll block only on the server (where window is undefined).
    if (typeof window === "undefined") return Boolean(initDataProp);
    return true;
  }, [initDataProp]);

  const refresh = useCallback(() => {
    setLastLoadedAt(Date.now());
  }, []);

  const getBestInitData = useCallback(async () => {
    await ensureTelegramScript();
    const tg = getTg();
    const id = (tg?.initData || initDataProp || "").toString().trim();
    return id;
  }, [initDataProp]);

  const fetchList = useCallback(
    async (mode: "admin" | "public") => {
      const id = await getBestInitData();
      if (!id) throw new Error("Telegram initData missing. Reopen the mini app.");

      const headers: Record<string, string> = {
        ...tgInitHeaders(id),
      };

      // IMPORTANT:
      // - Only attach admin headers when we are explicitly calling admin endpoint.
      // - Do NOT attach x-app-sid in public mode (some backends accidentally interpret it as admin/user session lookup).
      let url = "/api/tg/bounties";

      if (mode === "admin") {
        url = "/api/tg/admin/bounties";

        if (adminSid) {
          headers["x-admin-sid"] = adminSid;
          headers["x-app-sid"] = adminSid;
        }

        // fallback: some handlers read sid from query (harmless if ignored)
        if (adminSid) url += `?sid=${encodeURIComponent(adminSid)}`;
      }

      // optional: user scoping (only if you really use it server-side)
      // keep it mild: query param rather than forcing server joins
      if (mode === "public" && sid) {
        // if your backend ignores this, no problem
        url += `${url.includes("?") ? "&" : "?"}app_sid=${encodeURIComponent(sid)}`;
      }

      const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
      const json = await readJsonSafe(res);

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Failed to load bounties (${res.status})`);
      }

      // ✅ Normalize the rows so the UI always has `instructions`
      const rows = pickRows(json).map((r: any) => normalizeBountyRow(r));
      return rows;
    },
    [adminSid, getBestInitData, sid]
  );

  const load = useCallback(async () => {
    if (!canLoad) return;

    setLoading(true);
    setErr(null);

    try {
      // Admin panel:
      // - Prefer admin endpoint IF adminSid exists
      // - If it fails (e.g. server schema mismatch like telegram_admin_sessions / app_sessions.sid),
      //   fall back to public endpoint so the admin can still *see* bounties.
      if (isAdmin && adminSid) {
        try {
          const rows = await fetchList("admin");
          if (!mountedRef.current) return;
          setList(rows);
          setErr(null);
        } catch (e: any) {
          // fallback to public list
          const adminMsg = e?.message || "Admin bounties failed";
          try {
            const rows2 = await fetchList("public");
            if (!mountedRef.current) return;
            setList(rows2);
            setErr(`Admin list failed: ${adminMsg}`);
          } catch (e2: any) {
            if (!mountedRef.current) return;
            setList([]);
            setErr(adminMsg);
          }
        }
        return;
      }

      // Public (user mini app OR admin without adminSid yet)
      const rows = await fetchList("public");
      if (!mountedRef.current) return;
      setList(rows);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setErr(e?.message || "Failed to load bounties");
      setList([]);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [adminSid, canLoad, fetchList, isAdmin]);

  useEffect(() => {
    // initial load
    if (canLoad) load();
  }, [canLoad, load]);

  useEffect(() => {
    // manual refresh
    if (lastLoadedAt) load();
  }, [lastLoadedAt, load]);

  return {
    loading,
    err,
    list,
    refresh,
    canLoad,
  };
}
// === END: FILE_useBounties.ts ===