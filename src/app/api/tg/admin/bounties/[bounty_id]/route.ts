// === START: FILE_src/app/api/tg/admin/bounties/[bounty_id]/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getSid(req: Request) {
  return req.headers.get("x-admin-sid") || req.headers.get("x-app-sid") || "";
}

async function assertAdminSession(adminSid: string) {
  if (!adminSid) throw new Error("Missing admin session. Reopen Admin Panel from bot.");

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, kind, expires_at")
    .eq("id", adminSid)
    .eq("kind", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Invalid admin session. Reopen Admin Panel from bot.");

  if (data.expires_at) {
    const exp = new Date(data.expires_at).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      throw new Error("Admin session expired. Reopen Admin Panel from bot.");
    }
  }
}

/**
 * NOTE (Next 16 route typing):
 * ctx.params is typed as a Promise in your project.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ bounty_id: string }> }
) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const { bounty_id } = await ctx.params;
    const bountyId = String(bounty_id || "").trim();
    if (!bountyId) {
      return NextResponse.json({ ok: false, error: "missing bounty_id" }, { status: 400 });
    }

    // Ensure exists
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, code, title")
      .eq("id", bountyId)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) {
      return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });
    }

    // Delete children first (safe even if empty)
    const { error: aErr } = await supabaseAdmin
      .from("bounty_applications")
      .delete()
      .eq("bounty_id", bountyId);

    if (aErr) throw new Error(aErr.message);

    const { error: sErr } = await supabaseAdmin
      .from("form_sessions")
      .delete()
      .eq("bounty_id", bountyId)
      .eq("kind", "bounty");

    if (sErr) throw new Error(sErr.message);

    // Delete bounty
    const { error: dErr } = await supabaseAdmin
      .from("bounties")
      .delete()
      .eq("id", bountyId);

    if (dErr) throw new Error(dErr.message);

    return NextResponse.json({
      ok: true,
      message: "✅ Bounty deleted",
      deleted: {
        id: bounty.id,
        code: (bounty as any).code ?? null,
        title: (bounty as any).title ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Delete failed" },
      { status: 400 }
    );
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[bounty_id]/route.ts ===