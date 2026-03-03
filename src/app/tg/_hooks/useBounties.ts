// === START: FILE_useBounties.ts ===
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type Bounty = {
  id: string;
  code: string;
  title: string;

  // core
  description?: string | null;
  reward?: string | null;
  currency?: string | null;
  min_tier?: string | null;
  status?: "open" | "closed" | "paused" | string | null;
  published?: boolean | null;
  application_schema?: any;
  created_at?: string | null;

  // richer details (for “View details”)
  how_to?: string | null;
  rules?: string | null;
  link_url?: string | null;
  max_winners?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;

  // attribution / ownership
  project_id?: string | null;
  posted_by_type?: "veyra" | "project" | string | null;
  posted_by_name?: string | null; // computed on API (Veyra or project name)
};

type UseBountiesArgs = {
  initData?: string | null;
  sid?: string | null; // optional (future scoping)
};

export function useBounties(args: UseBountiesArgs) {
  const initData = (args.initData || "").trim();
  const sid = (args.sid || "").trim();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<Bounty[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<number>(0);

  const canLoad = useMemo(() => Boolean(initData), [initData]);

  const refresh = useCallback(() => {
    setLastLoadedAt(Date.now());
  }, []);

  const load = useCallback(async () => {
    if (!canLoad) return;

    setLoading(true);
    setErr(null);

    try {
      const headers: Record<string, string> = {
        // send multiple variants to match whatever your backend expects
        "x-telegram-init-data": initData,
        "x-init-data": initData,
        "x-tg-init-data": initData,
      };

      // optional (keep for future); harmless if backend ignores it
      if (sid) headers["x-app-sid"] = sid;

      const res = await fetch("/api/tg/bounties", {
        method: "GET",
        headers,
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Failed to load bounties (${res.status})`);
      }

      // ✅ API supports multiple shapes; prefer bounties
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

      setList(rows);
    } catch (e: any) {
      setErr(e?.message || "Failed to load bounties");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, initData, sid]);

  useEffect(() => {
    // initial load when initData becomes available
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