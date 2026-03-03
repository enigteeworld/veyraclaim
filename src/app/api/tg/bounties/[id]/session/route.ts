// === START: FILE_src/app/api/tg/bounties/[id]/session/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Minimal initData -> telegram_user_id parser (MVP).
 * Expects initData to contain `user=` JSON (Telegram WebApp).
 * NOTE: This does not verify the hash signature. For production, add hash verification.
 */
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

function normTier(t?: string | null) {
  return String(t || "bronze").toLowerCase().trim();
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const bountyId = String(id || "").trim();
    if (!bountyId) return NextResponse.json({ ok: false, error: "missing bounty id" }, { status: 400 });

    const initData = getInitData(req);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 401 });

    const telegram_user_id = getTelegramUserIdFromInitData(initData);

    // 1) Load bounty (must exist + open + published)
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

    // 2) Load verified user wallet + tier
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

    // 3) Create form session (kind=bounty)
    const { data: sess, error: sErr } = await supabaseAdmin
      .from("form_sessions")
      .insert({
        kind: "bounty",
        bounty_id: bountyId,
        campaign_id: null,
        telegram_user_id,
        wallet: verifiedWallet,
        tier: normTier(tu?.tier),
        fairscore: tu?.fairscore ?? null,
        badges: tu?.badges ?? null,
        // answers stays empty until submit (if you have such column, ignore if not)
      })
      .select("id")
      .single();

    if (sErr) throw new Error(sErr.message);

    return NextResponse.json({
      ok: true,
      sid: sess.id,
      wallet: verifiedWallet,
      tier: normTier(tu?.tier),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed to create bounty session" }, { status: 500 });
  }
}
// === END: FILE_src/app/api/tg/bounties/[id]/session/route.ts ===