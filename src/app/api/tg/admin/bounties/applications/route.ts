// === START: FILE_src/app/api/tg/admin/bounties/applications/route.ts ===
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

export async function GET(req: Request) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const u = new URL(req.url);
    const bountyId = u.searchParams.get("bounty_id") || "";
    if (!bountyId) throw new Error("Missing bounty_id.");

    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("bounty_applications")
      .select("*")
      .eq("bounty_id", bountyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, applications: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load applications" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/applications/route.ts ===