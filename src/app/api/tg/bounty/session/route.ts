// === START: FILE_src/app/api/tg/bounty/session/route.ts ===
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

/**
 * Telegram WebApp initData verification (HMAC):
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * check_string = sorted key=value (excluding hash) joined by \n
 * hash = HMAC_SHA256(check_string, secret_key) hex
 */
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
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  if (computedHash !== receivedHash) return { ok: false as const, reason: "bad hash" };

  const authDate = Number(data.auth_date || "0");
  if (authDate) {
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (ageSec > 60 * 60 * 24) return { ok: false as const, reason: "expired auth_date" };
  }

  let user: any = null;
  try {
    user = data.user ? JSON.parse(data.user) : null;
  } catch {
    user = null;
  }

  return { ok: true as const, data, user };
}

function normTier(t?: string | null) {
  const v = (t || "").toString().trim().toLowerCase();
  return v || null;
}
function tierRank(t?: string | null) {
  const v = normTier(t);
  const order = ["bronze", "silver", "gold", "platinum", "diamond"];
  const idx = v ? order.indexOf(v) : -1;
  return idx >= 0 ? idx : -1;
}
function tierMeets(userTier?: string | null, minTier?: string | null) {
  const m = tierRank(minTier);
  if (m < 0) return true;
  const u = tierRank(userTier);
  if (u < 0) return false;
  return u >= m;
}

function pickInitDataFromReq(req: Request, body: any) {
  const h = req.headers;
  const candidates = [
    h.get("x-tg-initdata"),
    h.get("x-tg-init-data"),
    h.get("x-telegram-initdata"),
    h.get("x-telegram-init-data"),
    body?.initData,
    body?.init_data,
    body?.initDataRaw,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);

  return candidates[0] || "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const bounty_id = String(body?.bounty_id || body?.bountyId || "").trim();
    if (!bounty_id) return NextResponse.json({ ok: false, error: "missing bounty_id" }, { status: 400 });

    const initData = pickInitDataFromReq(req, body);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 400 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    // Pull bounty + schema
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select(
        "id, title, description, instructions, min_tier, reward, currency, starts_at, ends_at, published, status, link_url, max_winners, application_schema"
      )
      .eq("id", bounty_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });
    if (bounty.published === false) return NextResponse.json({ ok: false, error: "bounty not published" }, { status: 403 });

    // Pull saved wallet + latest tier/fairscore from telegram_users
    const { data: tu, error: tuErr } = await supabaseAdmin
      .from("telegram_users")
      .select("telegram_user_id, saved_wallet, last_known_tier, last_known_fairscore, tier, fairscore")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (tuErr) throw new Error(tuErr.message);

    const wallet =
      String((tu as any)?.saved_wallet || "").trim() ||
      String((tu as any)?.wallet || "").trim() ||
      "";

    const tier =
      normTier((tu as any)?.last_known_tier) ||
      normTier((tu as any)?.lastKnownTier) ||
      normTier((tu as any)?.tier) ||
      null;

    const fairscore =
      typeof (tu as any)?.last_known_fairscore === "number"
        ? (tu as any).last_known_fairscore
        : typeof (tu as any)?.fairscore === "number"
          ? (tu as any).fairscore
          : null;

    if (!wallet) {
      return NextResponse.json({ ok: false, error: "no verified wallet (verify in bot first)" }, { status: 403 });
    }
    if (!tier) {
      return NextResponse.json({ ok: false, error: "tier not loaded yet (run Check once)" }, { status: 403 });
    }
    if (!tierMeets(tier, bounty.min_tier || null)) {
      return NextResponse.json(
        { ok: false, error: `tier too low (requires ${String(bounty.min_tier || "").toLowerCase()})` },
        { status: 403 }
      );
    }

    // Create a session (sid uuid generated by Postgres if default exists OR we generate manually)
    const sid = crypto.randomUUID();

    const { error: sErr } = await supabaseAdmin.from("form_sessions").insert({
      sid,
      kind: "bounty",
      bounty_id: bounty.id,
      telegram_user_id,
      wallet,
      tier,
      fairscore,
      created_at: new Date().toISOString(),
    } as any);

    if (sErr) throw new Error(sErr.message);

    // Questions schema (same shape as your campaign apply questions)
    const questions = Array.isArray((bounty as any)?.application_schema)
      ? (bounty as any).application_schema
      : Array.isArray((bounty as any)?.application_schema?.questions)
        ? (bounty as any).application_schema.questions
        : [];

    return NextResponse.json({
      ok: true,
      data: {
        sid,
        bounty: {
          id: bounty.id,
          title: bounty.title ?? null,
          description: (bounty as any).description ?? null,
          how_to: (bounty as any).how_to ?? null,
          min_tier: bounty.min_tier ?? null,
          reward: (bounty as any).reward ?? null,
          currency: (bounty as any).currency ?? null,
          starts_at: (bounty as any).starts_at ?? null,
          ends_at: (bounty as any).ends_at ?? null,
          status: (bounty as any).status ?? null,
          link_url: (bounty as any).link_url ?? null,
          max_winners: (bounty as any).max_winners ?? null,
          questions,
        },
        profile: {
          wallet,
          tier,
          fairscore,
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "bounty session error" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/bounty/session/route.ts ===