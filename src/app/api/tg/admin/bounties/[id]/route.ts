// === START: FILE_src/app/api/tg/admin/bounties/[id]/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getSid(req: Request) {
  return req.headers.get("x-admin-sid") || req.headers.get("x-app-sid") || "";
}

async function assertAdminSession(sid: string) {
  if (!sid) throw new Error("Missing admin session (sid).");

  const sb = supabaseAdmin;
  const { data, error } = await sb
    .from("telegram_admin_sessions")
    .select("sid")
    .eq("sid", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.sid) throw new Error("Invalid admin session. Reopen Admin Panel from bot.");
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const { id } = await ctx.params;
    if (!id) throw new Error("Missing bounty id.");

    const sb = supabaseAdmin;

    // If you have FK relations, you may need to delete applications first.
    await sb.from("bounty_applications").delete().eq("bounty_id", id);

    const { error } = await sb.from("bounties").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Delete failed" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[id]/route.ts ===