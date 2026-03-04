// === START: FILE_src/app/tg/_hooks/useBounties.ts ===
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

export type Bounty = {
  id: string;
  code?: string | null;
  title?: string | null;

  description?: string | null;
  instructions?: string | null;

  reward?: number | string | null;
  currency?: string | null;

  min_tier?: string | null;
  status?: "open" | "closed" | "paused" | string | null;

  link_url?: string | null;
  max_winners?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;

  questions?: AppQuestion[] | null;

  created_at?: string | null;

  // attribution / display
  posted_by_type?: "veyra" | "project" | string | null;
  posted_by_name?: string | null;
};

type UseBountiesArgs = {
  initData?: string | null;
  sid?: string | null;

  // ✅ IMPORTANT: admin list must use /api/tg/admin/bounties + x-admin-sid
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

function pickRows(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.bounties)) return json.bounties;
  if (Array.isArray(json?.list)) return json.list;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

export function useBounties(args: UseBountiesArgs) {
  const isAdmin = !!args.isAdmin;
  const adminSid = (args.adminSid || "").trim();

  const initDataProp = (args.initData || "").trim();
  const sid = (args.sid || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<Bounty[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<number>(0);

  // prevent double-load thrash on fast re-renders
  const inflightRef = useRef<AbortController | null>(null);

  const canLoad = useMemo(() => {
    // Admin list should still load even if initData is missing (admin route checks sid),
    // but it MUST have adminSid.
    if (isAdmin) return Boolean(adminSid);
    // User list needs initData (your /api/tg/bounties likely verifies initData)
    return Boolean(initDataProp);
  }, [isAdmin, adminSid, initDataProp]);

  const refresh = useCallback(() => {
    setLastLoadedAt(Date.now());
  }, []);

  async function getBestInitData(): Promise<string> {
    await ensureTelegramScript();
    const tg = getTg();
    const id = (tg?.initData || initDataProp || "").toString();
    return id;
  }

  const load = useCallback(async () => {
    if (!canLoad) return;

    // cancel previous inflight
    try {
      inflightRef.current?.abort();
    } catch {}
    const ac = new AbortController();
    inflightRef.current = ac;

    setLoading(true);
    setErr(null);

    try {
      const initData = await getBestInitData();

      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...tgInitHeaders(initData),
      };

      // keep for user flow / future scoping
      if (sid) headers["x-app-sid"] = sid;

      // ✅ Admin list
      let url = "/api/tg/bounties";
      if (isAdmin) {
        url = "/api/tg/admin/bounties";
        headers["x-admin-sid"] = adminSid;
        headers["x-app-sid"] = adminSid; // your backend getSid() checks both
      }

      const res = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: ac.signal,
      });

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Failed to load bounties (${res.status})`);
      }

      const rows = pickRows(json);
      if (!Array.isArray(rows)) throw new Error("Invalid bounties payload.");

      setList(rows as Bounty[]);
    } catch (e: any) {
      // ignore abort errors
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("aborted")) return;

      setErr(msg || "Failed to load bounties");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, isAdmin, adminSid, sid, initDataProp]);

  useEffect(() => {
    if (canLoad) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, load]);

  useEffect(() => {
    if (lastLoadedAt) load();
  }, [lastLoadedAt, load]);

  useEffect(() => {
    return () => {
      try {
        inflightRef.current?.abort();
      } catch {}
    };
  }, []);

  return {
    loading,
    err,
    list,
    refresh,
    canLoad,
  };
}
// === END: FILE_src/app/tg/_hooks/useBounties.ts ===