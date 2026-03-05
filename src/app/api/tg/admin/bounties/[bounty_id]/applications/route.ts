// === START: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications/route.ts ===
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
    if (!Number.isNaN(exp) && Date.now() > exp) throw new Error("Admin session expired. Reopen Admin Panel from bot.");
  }
}

function safeJson(v: any) {
  // Ensure we always return an object for answers
  if (!v) return {};
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
}

export async function GET(req: Request, ctx: { params: { bounty_id: string } }) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const bounty_id = String(ctx?.params?.bounty_id || "").trim();
    if (!bounty_id) return NextResponse.json({ ok: false, error: "missing bounty_id" }, { status: 400 });

    // Confirm bounty exists (optional but gives nicer error)
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, code, title")
      .eq("id", bounty_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("bounty_applications")
      .select("id, bounty_id, telegram_user_id, wallet, tier, fairscore, answers, created_at")
      .eq("bounty_id", bounty_id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (data || []).map((r: any) => ({
      id: r.id,
      bounty_id: r.bounty_id,
      telegram_user_id: r.telegram_user_id,
      wallet: r.wallet,
      tier: r.tier,
      fairscore: r.fairscore,
      answers: safeJson(r.answers),
      created_at: r.created_at,
    }));

    return NextResponse.json({
      ok: true,
      bounty: { id: bounty.id, code: (bounty as any).code ?? null, title: (bounty as any).title ?? null },
      applications: rows,
      count: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load applications" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications/route.ts ===