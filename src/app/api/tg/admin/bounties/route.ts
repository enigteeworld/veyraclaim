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
// === START: PATCH_assertAdminSession ===
async function assertAdminSession(sid: string) {
  const token = (sid || "").trim();
  if (!token) throw new Error("Missing admin session (sid).");

  const sb = supabaseAdmin;

  // Your adminSid is a session token (session_key), NOT the row id (uuid).
  const { data, error } = await sb
    .from("app_sessions")
    .select("id, session_key, kind, expires_at")
    .eq("session_key", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Invalid admin session. Reopen Admin Panel from bot.");
}

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
      code: body?.code ?? null,
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