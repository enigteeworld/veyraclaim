// src/app/api/tg/admin/applications/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function required(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const BOT_TOKEN = required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  params.forEach((v, k) => (data[k] = v));
  return data;
}

function verifyInitData(initData: string) {
  const data = parseInitData(initData);
  const receivedHash = data.hash;
  if (!receivedHash) return { ok: false as const, reason: "missing hash" };

  const pairs: string[] = [];
  Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .forEach((k) => pairs.push(`${k}=${data[k]}`));

  const checkString = pairs.join("\n");

  // Telegram WebApp verification:
  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  // hash = HMAC_SHA256(check_string, secret_key) hex
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (computedHash !== receivedHash) return { ok: false as const, reason: "bad hash" };

  let user: any = null;
  try {
    user = data.user ? JSON.parse(data.user) : null;
  } catch {
    user = null;
  }

  return { ok: true as const, user };
}

function tierRank(tier: string) {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return 3;
  if (t === "silver") return 2;
  if (t === "bronze") return 1;
  return 0;
}

async function requireValidAdminSid(args: {
  sid: string;
  telegram_user_id: number;
}) {
  const { sid, telegram_user_id } = args;

  if (!sid) throw new Error("missing admin sid");
  if (!telegram_user_id) throw new Error("missing telegram user id");

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, telegram_user_id, kind, session_key, expires_at, state_json")
    .eq("id", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid admin session");

  // Must be admin session
  if (String((data as any).kind || "") !== "admin") throw new Error("invalid admin session kind");
  if (String((data as any).session_key || "") !== "admin") throw new Error("invalid admin session key");

  // Must belong to same Telegram user
  if (Number((data as any).telegram_user_id) !== telegram_user_id) {
    throw new Error("sid does not match telegram user");
  }

  // Must not be expired
  const exp = (data as any).expires_at ? new Date((data as any).expires_at).getTime() : 0;
  if (exp && Number.isFinite(exp) && exp < Date.now()) {
    throw new Error("admin session expired");
  }

  // Optional: require state_json.admin === true if present
  const adminFlag = (data as any).state_json?.admin;
  if (adminFlag === false) throw new Error("not an admin session");
}

export async function GET(req: Request) {
  try {
    const initData =
      req.headers.get("x-tg-initdata") ||
      req.headers.get("x-telegram-initdata") ||
      req.headers.get("x-tg-init-data") || // keep old header too
      "";

    // ✅ the mini app already sends this header
    const sid =
      req.headers.get("x-app-sid") ||
      req.headers.get("x-admin-sid") ||
      "";

    const { searchParams } = new URL(req.url);
    const campaign_id = String(searchParams.get("campaign_id") || "").trim();

    if (!campaign_id) return NextResponse.json({ ok: false, error: "missing campaign_id" }, { status: 400 });
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData header" }, { status: 400 });
    if (!sid) return NextResponse.json({ ok: false, error: "missing admin sid" }, { status: 401 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : 0;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    // ✅ Main fix: validate SID against app_sessions
    try {
      await requireValidAdminSid({ sid, telegram_user_id });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "unauthorized" }, { status: 403 });
    }

    // Ensure this campaign belongs to this admin
    const { data: camp, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, code, title, type, created_by_telegram_user_id")
      .eq("id", campaign_id)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!camp) return NextResponse.json({ ok: false, error: "campaign not found" }, { status: 404 });

    if ((camp as any).created_by_telegram_user_id !== telegram_user_id) {
      return NextResponse.json({ ok: false, error: "not your campaign" }, { status: 403 });
    }

    // Pull entries/applications
    const { data: rows, error: eErr } = await supabaseAdmin
      .from("campaign_entries")
      .select("id, created_at, telegram_user_id, wallet, tier, fairscore, answers")
      .eq("campaign_id", campaign_id)
      .order("created_at", { ascending: false });

    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });

    const list = (rows || []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      telegram_user_id: r.telegram_user_id,
      wallet: r.wallet,
      tier: r.tier,
      fairscore: r.fairscore,
      answers: r.answers || {},
      _tierRank: tierRank(r.tier),
    }));

    // Sort: tier (gold > silver > bronze) then fairscore desc
    list.sort((a, b) => {
      if (b._tierRank !== a._tierRank) return b._tierRank - a._tierRank;
      const bf = Number(b.fairscore || 0);
      const af = Number(a.fairscore || 0);
      if (bf !== af) return bf - af;
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    const grouped = {
      gold: list.filter((x) => (x.tier || "").toLowerCase() === "gold"),
      silver: list.filter((x) => (x.tier || "").toLowerCase() === "silver"),
      bronze: list.filter((x) => (x.tier || "").toLowerCase() === "bronze"),
      other: list.filter((x) => !["gold", "silver", "bronze"].includes((x.tier || "").toLowerCase())),
    };

    return NextResponse.json({
      ok: true,
      applications: list,
      data: {
        campaign: { id: camp.id, code: camp.code, title: camp.title, type: camp.type },
        total: list.length,
        grouped,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "applications error" }, { status: 500 });
  }
}
