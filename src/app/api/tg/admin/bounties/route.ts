// === START: FILE_src/app/api/tg/admin/bounties/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getSid(req: Request) {
  return req.headers.get("x-admin-sid") || req.headers.get("x-app-sid") || "";
}

// === START: ADMIN_SESSION_CHECK ===
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
// === END: ADMIN_SESSION_CHECK ===

/**
 * Your DB schema (from your screenshots) uses:
 * - how_to (text)        -> instructions shown in UI
 * - application_schema (jsonb) -> questions (array or {questions:[...]})
 *
 * This route normalizes both directions so UI can keep using:
 * - instructions (string|null)
 * - questions (AppQuestion[])
 */
function normalizeQuestions(appSchema: any): any[] {
  if (Array.isArray(appSchema)) return appSchema;
  if (Array.isArray(appSchema?.questions)) return appSchema.questions;
  return [];
}

function toAppBounty(row: any) {
  const questions = normalizeQuestions(row?.application_schema ?? row?.questions ?? null);
  const instructions = String(row?.how_to ?? row?.instructions ?? "").trim() || null;

  return {
    ...row,
    // normalized fields expected by frontend/admin UI
    instructions,
    questions,

    // keep DB-native fields too (useful for debugging / backward compatibility)
    how_to: row?.how_to ?? null,
    application_schema: row?.application_schema ?? null,
  };
}

export async function GET(req: Request) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const { data, error } = await supabaseAdmin.from("bounties").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const mapped = (data ?? []).map(toAppBounty);
    return NextResponse.json({ ok: true, bounties: mapped });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load bounties" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;

    const sid = String(body?.sid || getSid(req) || "");
    await assertAdminSession(sid);

    // Accept both names from UI:
    // - instructions -> DB how_to
    // - questions -> DB application_schema
    const title = String(body?.title || "").trim().slice(0, 120);
    const description = body?.description ?? null;

    const instructionsRaw = String(body?.instructions ?? body?.how_to ?? "").trim();
    const how_to = instructionsRaw || null;

    const questionsIn =
      Array.isArray(body?.questions)
        ? body.questions
        : Array.isArray(body?.application_schema)
          ? body.application_schema
          : Array.isArray(body?.application_schema?.questions)
            ? body.application_schema.questions
            : [];

    // Store in DB as application_schema. Use {questions:[...]} for forward consistency.
    const application_schema = { questions: questionsIn };

    const payload: any = {
      // identifiers
      code: body?.code || `BNTY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,

      // core content
      title,
      description,

      // IMPORTANT: DB column is how_to
      how_to,

      // gating + reward
      min_tier: body?.min_tier ?? null,
      reward: typeof body?.reward === "number" ? body.reward : body?.reward ? Number(body.reward) : null,
      currency: String(body?.currency || "USDC").trim().slice(0, 12),

      // meta
      max_winners:
        typeof body?.max_winners === "number" ? body.max_winners : body?.max_winners ? Number(body.max_winners) : null,
      link_url: body?.link_url ?? null,
      status: String(body?.status || "open").toLowerCase(),
      starts_at: body?.starts_at ?? null,
      ends_at: body?.ends_at ?? null,

      // IMPORTANT: DB column is application_schema
      application_schema,

      // sensible defaults (your table has published boolean)
      published: typeof body?.published === "boolean" ? body.published : true,
    };

    if (!payload.title) throw new Error("Title is required.");
    if (!payload.how_to) throw new Error("Instructions are required.");

    const { data, error } = await supabaseAdmin.from("bounties").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, data: toAppBounty(data) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Create failed" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/route.ts ===