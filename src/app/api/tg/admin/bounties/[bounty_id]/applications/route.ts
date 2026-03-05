// === START: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications/route.ts ===
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getSid(req: NextRequest) {
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

export async function GET(
  req: NextRequest,
  // ✅ Next 16 (your build) expects params as Promise
  { params }: { params: Promise<{ bounty_id: string }> }
) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const { bounty_id } = await params;
    const id = String(bounty_id || "").trim();
    if (!id) throw new Error("Missing bounty_id");

    const { data, error, count } = await supabaseAdmin
      .from("bounty_applications")
      .select("id, bounty_id, telegram_user_id, wallet, tier, fairscore, answers, created_at", {
        count: "exact",
      })
      .eq("bounty_id", id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      bounty: { id },
      applications: Array.isArray(data) ? data : [],
      count: typeof count === "number" ? count : (Array.isArray(data) ? data.length : 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load applications" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications/route.ts ===