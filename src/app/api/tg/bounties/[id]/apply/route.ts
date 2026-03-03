// === START: FILE_src/app/api/tg/bounties/[id]/apply/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getInitData(req: Request) {
  return (
    (req.headers.get("x-telegram-init-data") || "").trim() ||
    (req.headers.get("x-init-data") || "").trim() ||
    (req.headers.get("x-tg-init-data") || "").trim()
  );
}

function getTelegramUserIdFromInitData(initData: string): number {
  const params = new URLSearchParams(initData);
  const userStr = params.get("user");
  if (!userStr) throw new Error("missing initData user");
  const user = JSON.parse(userStr);
  const id = Number(user?.id);
  if (!id) throw new Error("invalid telegram user id");
  return id;
}

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;

function normTier(t?: string | null) {
  const s = String(t || "bronze").toLowerCase().trim();
  return (TIER_ORDER as readonly string[]).includes(s) ? s : "bronze";
}

function tierGte(userTier: string, minTier: string) {
  const u = TIER_ORDER.indexOf(normTier(userTier) as any);
  const m = TIER_ORDER.indexOf(normTier(minTier) as any);
  return u >= m;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const bountyId = String(id || "").trim();
    if (!bountyId) return NextResponse.json({ ok: false, error: "missing bounty id" }, { status: 400 });

    const initData = getInitData(req);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 401 });

    const telegram_user_id = getTelegramUserIdFromInitData(initData);

    const body = await req.json().catch(() => ({} as any));
    const sid = String(body?.sid || "").trim();
    const answers = body?.answers ?? {};

    if (!sid) return NextResponse.json({ ok: false, error: "missing sid" }, { status: 400 });
    if (answers && typeof answers !== "object") {
      return NextResponse.json({ ok: false, error: "answers must be an object" }, { status: 400 });
    }

    // 1) Load bounty (open + published)
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, min_tier, status, published")
      .eq("id", bountyId)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });
    if (!bounty.published) return NextResponse.json({ ok: false, error: "bounty not published" }, { status: 403 });
    if (String(bounty.status || "").toLowerCase() !== "open") {
      return NextResponse.json({ ok: false, error: "bounty not open" }, { status: 403 });
    }

    // 2) Verify session belongs to this user + bounty + kind=bounty
    const { data: sess, error: sErr } = await supabaseAdmin
      .from("form_sessions")
      .select("id, kind, bounty_id, telegram_user_id, wallet")
      .eq("id", sid)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!sess) return NextResponse.json({ ok: false, error: "invalid session" }, { status: 403 });
    if (String(sess.kind) !== "bounty") return NextResponse.json({ ok: false, error: "invalid session kind" }, { status: 403 });
    if (String(sess.bounty_id) !== String(bountyId)) {
      return NextResponse.json({ ok: false, error: "session bounty mismatch" }, { status: 403 });
    }
    if (Number(sess.telegram_user_id) !== Number(telegram_user_id)) {
      return NextResponse.json({ ok: false, error: "session user mismatch" }, { status: 403 });
    }

    // 3) Load verified wallet + tier (source of truth)
    const { data: tu, error: tuErr } = await supabaseAdmin
      .from("telegram_users")
      .select("saved_wallet, tier, fairscore, badges")
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (tuErr) throw new Error(tuErr.message);

    const verifiedWallet = String(tu?.saved_wallet || "").trim();
    if (!verifiedWallet) {
      return NextResponse.json(
        { ok: false, error: "no verified wallet found. Verify your wallet in the bot first." },
        { status: 403 }
      );
    }

    const userTier = normTier(tu?.tier);
    const minTier = normTier((bounty as any).min_tier);

    // 4) Tier gating enforced here (server-side)
    if (!tierGte(userTier, minTier)) {
      return NextResponse.json(
        {
          ok: false,
          error: `not eligible: requires ${minTier} tier`,
          meta: { userTier, minTier },
        },
        { status: 403 }
      );
    }

    // 5) Insert application (dup prevented by unique index)
    const payload = {
      bounty_id: bountyId,
      telegram_user_id,
      wallet: verifiedWallet,
      sid,
      tier: userTier,
      fairscore: tu?.fairscore ?? null,
      badges: tu?.badges ?? null,
      answers,
    };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("bounty_applications")
      .insert(payload)
      .select("id, created_at")
      .single();

    if (insErr) {
      // Handle duplicate nicely (unique index)
      const msg = String(insErr.message || "");
      if (/duplicate key|unique/i.test(msg)) {
        return NextResponse.json({ ok: false, error: "you already applied to this bounty" }, { status: 409 });
      }
      throw new Error(insErr.message);
    }

    return NextResponse.json({ ok: true, application: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed to apply to bounty" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/bounties/[id]/apply/route.ts ===