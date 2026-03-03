// === START: FILE_useBounties.ts ===
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type Bounty = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  reward?: string | null;
  currency?: string | null;
  min_tier?: string | null;
  status?: "open" | "closed" | "paused" | string | null;
  published?: boolean | null;
  application_schema?: any;
  created_at?: string | null;
};

type UseBountiesArgs = {
  initData?: string | null;
  sid?: string | null; // optional (if you ever want to scope bounties by project/admin later)
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
        // we send multiple variants to match whatever your backend expects
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

      const rows: Bounty[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.list)
        ? json.list
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