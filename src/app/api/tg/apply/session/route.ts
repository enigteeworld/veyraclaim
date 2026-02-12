// src/app/api/tg/apply/session/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchFairScaleScore } from "@/lib/fairscale";
import { tierMeets } from "@/lib/telegram";

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

  // freshness (optional): auth_date within 24h
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

function asQuestionType(t: string): "text" | "textarea" | "select" {
  const x = String(t || "").toLowerCase();
  if (x === "textarea") return "textarea";
  if (x === "select") return "select";
  return "text";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sid = String(body?.sid || body?.session || "").trim();
    const initData = String(body?.initData || "").trim();

    if (!sid) return NextResponse.json({ ok: false, error: "Missing sid" }, { status: 400 });
    if (!initData) return NextResponse.json({ ok: false, error: "Missing initData" }, { status: 401 });

    const v = verifyInitData(initData);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 401 });

    const telegram_user_id = v.user?.id ? Number(v.user.id) : null;
    if (!telegram_user_id) return NextResponse.json({ ok: false, error: "missing user id" }, { status: 401 });

    // 1) Load session from YOUR table: form_sessions
    const { data: sess, error: sessErr } = await supabaseAdmin
      .from("form_sessions")
      .select("id,campaign_id,telegram_user_id,expires_at,used_at")
      .eq("id", sid)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ ok: false, error: sessErr.message }, { status: 500 });
    if (!sess) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });

    if (Number(sess.telegram_user_id) !== Number(telegram_user_id)) {
      return NextResponse.json({ ok: false, error: "wrong user for session" }, { status: 403 });
    }

    if (sess.used_at) {
      return NextResponse.json({ ok: false, error: "session already used" }, { status: 400 });
    }

    if (sess.expires_at && Date.now() > new Date(sess.expires_at).getTime()) {
      return NextResponse.json({ ok: false, error: "session expired" }, { status: 400 });
    }

    // 2) Load user's saved wallet (source of truth)
    const { data: u, error: uErr } = await supabaseAdmin
      .from("telegram_users")
      .select("saved_wallet,last_known_tier,last_known_fairscore")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

    const wallet = String(u?.saved_wallet || "").trim();
    if (!wallet) {
      return NextResponse.json(
        { ok: false, error: "No wallet saved for this Telegram user. Verify wallet in the bot first." },
        { status: 400 }
      );
    }

    // 3) Load campaign
    const { data: camp, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id,code,title,description,min_tier,type")
      .eq("id", sess.campaign_id)
      .maybeSingle();

    if (campErr) return NextResponse.json({ ok: false, error: campErr.message }, { status: 500 });
    if (!camp) return NextResponse.json({ ok: false, error: "campaign not found" }, { status: 404 });

    if (String(camp.type) !== "ambassador") {
      return NextResponse.json({ ok: false, error: "not an ambassador campaign" }, { status: 400 });
    }

    // 4) Score + eligibility (server truth)
    const score = await fetchFairScaleScore(wallet);

    if (!tierMeets(String(camp.min_tier || "bronze"), String(score.tier || "bronze"))) {
      return NextResponse.json(
        { ok: false, error: `Not eligible. Requires ${camp.min_tier}, your tier is ${score.tier}.` },
        { status: 403 }
      );
    }

    // 5) Load campaign questions (YOUR schema)
    const { data: qs, error: qErr } = await supabaseAdmin
      .from("campaign_questions")
      .select("key,label,help_text,field_type,required,options,sort_order")
      .eq("campaign_id", camp.id)
      .order("sort_order", { ascending: true });

    if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });

    const questions =
      (qs || []).map((q: any) => {
        const type = asQuestionType(q.field_type);
        const base = {
          id: String(q.key || ""), // IMPORTANT: your UI uses q.id as the key
          label: String(q.label || "Question"),
          required: q.required === false ? false : true,
        };

        if (type === "select") {
          const options = Array.isArray(q.options) ? q.options.map((x: any) => String(x)) : [];
          return { ...base, type: "select" as const, options: options.length ? options : ["Option 1", "Option 2"] };
        }

        if (type === "textarea") {
          return {
            ...base,
            type: "textarea" as const,
            placeholder: q.help_text ? String(q.help_text).slice(0, 140) : undefined,
          };
        }

        return {
          ...base,
          type: "text" as const,
          placeholder: q.help_text ? String(q.help_text).slice(0, 140) : undefined,
        };
      }) || [];

    return NextResponse.json({
      ok: true,
      data: {
        sid,
        campaign: {
          id: String(camp.id),
          code: String(camp.code),
          title: camp.title ?? null,
          description: camp.description ?? null,
          questions,
        },
        profile: {
          wallet,
          tier: String(score.tier || "bronze"),
          fairscore: Number(score.fairscore || 0),
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
