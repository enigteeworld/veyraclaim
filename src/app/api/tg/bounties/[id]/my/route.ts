// === START: FILE_src/app/api/tg/bounties/[id]/my/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getInitData(req: Request) {
  return (
    (req.headers.get("x-telegram-init-data") ||
      req.headers.get("x-init-data") ||
      req.headers.get("x-tg-init-data") ||
      "") + ""
  ).trim();
}

function getTelegramUserIdFromInitData(initData: string): number {
  const p = new URLSearchParams(initData);
  const userRaw = p.get("user");
  if (!userRaw) throw new Error("missing user in initData");
  const user = JSON.parse(userRaw);
  const id = Number(user?.id);
  if (!id) throw new Error("invalid telegram user id");
  return id;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const bountyId = String(id || "").trim();
    if (!bountyId) return NextResponse.json({ ok: false, error: "missing bounty id" }, { status: 400 });

    const initData = getInitData(req);
    if (!initData) return NextResponse.json({ ok: false, error: "missing initData" }, { status: 401 });

    const telegram_user_id = getTelegramUserIdFromInitData(initData);

    const { data, error } = await supabaseAdmin
      .from("bounty_applications")
      .select("id, created_at, wallet, answers")
      .eq("bounty_id", bountyId)
      .eq("telegram_user_id", telegram_user_id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      applied: Boolean(data),
      application: data || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to fetch my bounty application" },
      { status: 500 }
    );
  }
}
// === END: FILE_src/app/api/tg/bounties/[id]/my/route.ts ===