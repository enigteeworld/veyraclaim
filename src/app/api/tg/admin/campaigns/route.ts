// src/app/api/tg/admin/campaigns/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Admin Campaigns API (Mini App)
 *
 * ✅ Fixes:
 * 1) Removes internal fetch to /api/tg/auth (can be flaky/slow in serverless)
 * 2) Supports admin session auth via UUID sid (recommended)
 *    - Header: x-app-sid: <uuid>
 *    - or Authorization: Bearer <uuid>
 * 3) Still supports legacy x-tg-initdata auth (Telegram WebApp initData) with local signature verify
 * 4) GET fallback: if no project_admins rows exist, still returns campaigns created by this admin
 * 5) ✅ Adds entries_count (computed from campaign_entries) so UI shows 1/15 instead of 0/15
 */

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return { hash, dataCheckString, params };
}

function verifyTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) return { ok: false as const, error: "Missing TELEGRAM_BOT_TOKEN" };

  const { hash, dataCheckString, params } = parseInitData(initData);
  if (!hash || !dataCheckString) return { ok: false as const, error: "Missing initData hash" };

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computed !== hash) return { ok: false as const, error: "Invalid initData signature" };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false as const, error: "Missing user in initData" };

  let user: any = null;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return { ok: false as const, error: "Invalid user JSON in initData" };
  }

  return { ok: true as const, user, params };
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function ensureTelegramUser(telegram_user_id: number, user?: any) {
  const username = user?.username || null;
  const first_name = user?.first_name || null;
  const last_name = user?.last_name || null;

  await supabaseAdmin.from("telegram_users").upsert(
    {
      telegram_user_id,
      username,
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
}

/**
 * Preferred auth: app_sessions sid (UUID) created by /api/tg/admin/session
 */
async function authFromAdminSession(req: Request) {
  const sid = (req.headers.get("x-app-sid") || "").trim() || getBearer(req);
  if (!sid) throw new Error("missing admin session");

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, telegram_user_id, kind, expires_at, state_json")
    .eq("id", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid admin session");
  if (data.kind !== "admin") throw new Error("not an admin session");
  if (data.expires_at && String(data.expires_at) <= nowIso) throw new Error("admin session expired");
  if (data.state_json?.admin !== true) throw new Error("admin session missing admin flag");

  const telegram_user_id = Number(data.telegram_user_id);
  if (!telegram_user_id) throw new Error("invalid telegram_user_id in session");

  return { telegram_user_id, sid };
}

/**
 * Legacy auth: initData header (Telegram WebApp)
 */
async function authFromInitData(req: Request) {
  const initData =
    (req.headers.get("x-tg-initdata") || "").trim() ||
    (req.headers.get("x-telegram-initdata") || "").trim() ||
    (req.headers.get("x-tg-init-data") || "").trim() ||
    (req.headers.get("x-telegram-init-data") || "").trim();

  if (!initData) throw new Error("missing initdata");

  const v = verifyTelegramInitData(initData);
  if (!v.ok) throw new Error(v.error);

  const telegram_user_id = Number(v.user?.id);
  if (!telegram_user_id) throw new Error("no telegram user id");

  await ensureTelegramUser(telegram_user_id, v.user);

  return { telegram_user_id, initData };
}

/**
 * Unified auth:
 * - Try admin session sid first (recommended)
 * - Fallback to initData
 */
async function auth(req: Request) {
  try {
    return await authFromAdminSession(req);
  } catch {
    return await authFromInitData(req);
  }
}

async function requireAdmin(telegram_user_id: number, project_id: string) {
  const { data, error } = await supabaseAdmin
    .from("project_admins")
    .select("id")
    .eq("telegram_user_id", telegram_user_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("not an admin for this project");
}

function normalizeTier(t: string) {
  const v = String(t || "").toLowerCase();
  if (v === "gold" || v === "silver" || v === "bronze") return v;
  return "bronze";
}

function generateAmbCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `AMB-${rand()}`;
}

/**
 * ✅ Compute entries_count per campaign from campaign_entries table.
 * Uses head:true so no row payload is returned (fast).
 */
async function attachEntriesCount(campaigns: any[]) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  if (!list.length) return [];

  const counts = await Promise.all(
    list.map(async (c) => {
      const id = String(c?.id || "");
      if (!id) return { id: "", count: 0 };

      const { count, error } = await supabaseAdmin
        .from("campaign_entries")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id);

      if (error) return { id, count: 0 };
      return { id, count: typeof count === "number" ? count : 0 };
    })
  );

  const map = new Map<string, number>();
  for (const x of counts) map.set(x.id, x.count);

  return list.map((c) => ({
    ...c,
    entries_count: map.get(String(c?.id || "")) ?? 0,
  }));
}

export async function GET(req: Request) {
  try {
    const { telegram_user_id } = await auth(req);

    // Projects where this user is an admin
    const { data: admins, error: adminsErr } = await supabaseAdmin
      .from("project_admins")
      .select("project_id")
      .eq("telegram_user_id", telegram_user_id);

    if (adminsErr) throw new Error(adminsErr.message);

    const projectIds = (admins || []).map((a: any) => a.project_id).filter(Boolean);

    // ✅ Fallback: if project_admins is not set up (or empty), still show campaigns created by this admin
    if (!projectIds.length) {
      const { data: campaigns, error } = await supabaseAdmin
        .from("campaigns")
        .select("*")
        .eq("created_by_telegram_user_id", telegram_user_id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const withCounts = await attachEntriesCount(campaigns || []);
      return NextResponse.json({ ok: true, campaigns: withCounts });
    }

    // Normal path: campaigns across projects this user admins
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (campErr) throw new Error(campErr.message);

    const withCounts = await attachEntriesCount(campaigns || []);
    return NextResponse.json({ ok: true, campaigns: withCounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "campaigns error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { telegram_user_id } = await auth(req);
    const body = await req.json().catch(() => ({} as any));

    const project_id = String(body?.project_id || "").trim();
    const title = String(body?.title || "").trim().slice(0, 80);
    const description = body?.description ? String(body.description).slice(0, 300) : null;
    const min_tier = normalizeTier(body?.min_tier || "bronze");
    const max_slots =
      body?.max_slots === 0
        ? 0
        : body?.max_slots
          ? Number(body.max_slots)
          : null;

    if (!project_id) return NextResponse.json({ ok: false, error: "missing project_id" }, { status: 400 });
    if (!title) return NextResponse.json({ ok: false, error: "missing title" }, { status: 400 });

    await requireAdmin(telegram_user_id, project_id);

    // Code generator (same style you already use)
    const code = generateAmbCode();

    const { data: created, error } = await supabaseAdmin
      .from("campaigns")
      .insert({
        code,
        type: "ambassador",
        title,
        description,
        min_tier,
        max_slots,
        starts_at: new Date().toISOString(),
        ends_at: null,
        created_by_telegram_user_id: telegram_user_id,
        project_id,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, campaign: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "create campaign error" }, { status: 500 });
  }
}
