import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function authFromAdminSession(req: Request) {
  const sid = (req.headers.get("x-app-sid") || "").trim() || getBearer(req);
  if (!sid) throw new Error("missing admin session");

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, telegram_user_id, kind, expires_at, state_json")
    .eq("id", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid admin session");
  if (data.kind !== "admin") throw new Error("not an admin session");
  if (data.expires_at && String(data.expires_at) <= nowIso) throw new Error("admin session expired");
  if (data.state_json?.admin !== true) throw new Error("admin session missing admin flag");

  const telegram_user_id = Number(data.telegram_user_id);
  if (!telegram_user_id) throw new Error("invalid telegram_user_id in session");

  return { telegram_user_id };
}

async function requireAdmin(telegram_user_id: number, project_id: string) {
  const { data, error } = await supabaseAdmin
    .from("project_admins")
    .select("project_id")
    .eq("telegram_user_id", telegram_user_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("not an admin for this project");
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { telegram_user_id } = await authFromAdminSession(req);
    const { id } = await ctx.params;

    const campaignId = String(id || "").trim();
    if (!campaignId) return NextResponse.json({ ok: false, error: "missing campaign id" }, { status: 400 });

    // 1) Fetch campaign (to check project_id + creator scope)
    const { data: campaign, error: getErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, project_id, created_by_telegram_user_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (getErr) throw new Error(getErr.message);
    if (!campaign) return NextResponse.json({ ok: false, error: "campaign not found" }, { status: 404 });

    // 2) Must be an admin for that project
    await requireAdmin(Number(telegram_user_id), String(campaign.project_id));

    // 3) Safety: only allow deleting campaigns you created (matches your strict listing rule)
    if (Number(campaign.created_by_telegram_user_id) !== Number(telegram_user_id)) {
      return NextResponse.json({ ok: false, error: "not allowed to delete this campaign" }, { status: 403 });
    }

    // 4) Delete dependents first (only if your DB doesn't cascade)
    // If your DB has ON DELETE CASCADE, these deletes will be harmless but redundant.
    await supabaseAdmin.from("campaign_entries").delete().eq("campaign_id", campaignId);
    await supabaseAdmin.from("campaign_tasks").delete().eq("campaign_id", campaignId);
    await supabaseAdmin.from("campaign_questions").delete().eq("campaign_id", campaignId);

    // 5) Delete campaign
    const { error: delErr } = await supabaseAdmin.from("campaigns").delete().eq("id", campaignId);
    if (delErr) throw new Error(delErr.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "delete campaign error";
    // Use 401 for auth issues, otherwise 500
    const status = /missing admin session|invalid admin session|expired|not an admin session|missing admin flag/i.test(msg)
      ? 401
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
