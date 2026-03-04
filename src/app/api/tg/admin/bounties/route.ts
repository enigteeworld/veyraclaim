// === START: FILE_src/app/api/tg/admin/bounties/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getSid(req: Request) {
  return (
    req.headers.get("x-admin-sid") ||
    req.headers.get("x-app-sid") ||
    "" // body may include sid too; POST handler reads it
  );
}

/**
 * IMPORTANT:
 * Replace table names below if yours differ:
 * - telegram_admin_sessions
 * - bounties
 */
// === START: ADMIN_SESSION_CHECK ===
async function assertAdminSession(adminSid: string) {
  if (!adminSid) throw new Error("Missing admin session. Reopen Admin Panel from bot.");

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, kind, expires_at")
    .eq("id", adminSid)         // ✅ the UUID in the table
    .eq("kind", "admin")        // ✅ must be an admin session
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Invalid admin session. Reopen Admin Panel from bot.");

  // Optional: expiry check (safe)
  if (data.expires_at) {
    const exp = new Date(data.expires_at).getTime();
    if (!Number.isNaN(exp) && Date.now() > exp) {
      throw new Error("Admin session expired. Reopen Admin Panel from bot.");
    }
  }
}
// === END: ADMIN_SESSION_CHECK ===

export async function GET(req: Request) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("bounties")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, bounties: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load bounties" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const sid = String(body?.sid || getSid(req) || "");
    await assertAdminSession(sid);

    const payload = {
      code: body?.code || `BNTY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      title: String(body?.title || "").trim().slice(0, 120),
      description: body?.description ?? null,
      instructions: String(body?.instructions || "").trim(),
      min_tier: body?.min_tier ?? null,
      reward: typeof body?.reward === "number" ? body.reward : body?.reward ? Number(body.reward) : null,
      currency: String(body?.currency || "USDC").trim().slice(0, 12),
      max_winners: typeof body?.max_winners === "number" ? body.max_winners : body?.max_winners ? Number(body.max_winners) : null,
      link_url: body?.link_url ?? null,
      status: String(body?.status || "open").toLowerCase(),
      starts_at: body?.starts_at ?? null,
      ends_at: body?.ends_at ?? null,
      questions: Array.isArray(body?.questions) ? body.questions : [],
    };

    if (!payload.title) throw new Error("Title is required.");
    if (!payload.instructions) throw new Error("Instructions are required.");

    const sb = supabaseAdmin;
    const { data, error } = await sb.from("bounties").insert(payload).select("*").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Create failed" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/route.ts ===