import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function authFromHeader(req: Request) {
  const initData = req.headers.get("x-tg-initdata") || "";
  if (!initData) throw new Error("missing initdata");
  const r = await fetch(new URL("/api/tg/auth", req.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "auth failed");
  return { telegram_user_id: Number(j.telegram_user_id) };
}

async function requireCampaignAdmin(telegram_user_id: number, campaign_id: string) {
  const { data: camp } = await supabaseAdmin
    .from("campaigns")
    .select("id, project_id")
    .eq("id", campaign_id)
    .maybeSingle();

  if (!camp?.project_id) throw new Error("campaign not found or missing project");

  const { data: admin } = await supabaseAdmin
    .from("project_admins")
    .select("*")
    .eq("telegram_user_id", telegram_user_id)
    .eq("project_id", camp.project_id)
    .maybeSingle();

  if (!admin) throw new Error("not admin");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { telegram_user_id } = await authFromHeader(req);
    await requireCampaignAdmin(telegram_user_id, params.id);

    const { data } = await supabaseAdmin
      .from("campaign_tasks")
      .select("*")
      .eq("campaign_id", params.id)
      .order("sort_order", { ascending: true });

    return NextResponse.json({ ok: true, tasks: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "tasks error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { telegram_user_id } = await authFromHeader(req);
    await requireCampaignAdmin(telegram_user_id, params.id);

    const body = await req.json();
    const task_type = String(body?.task_type || "").toLowerCase();
    const label = String(body?.label || "").trim().slice(0, 120);
    const target_url = body?.target_url ? String(body.target_url).trim().slice(0, 300) : null;
    const required = Boolean(body?.required ?? true);

    if (!["follow", "repost", "join"].includes(task_type))
      return NextResponse.json({ ok: false, error: "invalid task_type" }, { status: 400 });
    if (!label) return NextResponse.json({ ok: false, error: "missing label" }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from("campaign_tasks")
      .select("sort_order")
      .eq("campaign_id", params.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? 0) + 10;

    const { data, error } = await supabaseAdmin
      .from("campaign_tasks")
      .insert({
        campaign_id: params.id,
        task_type,
        label,
        target_url,
        required,
        sort_order: nextOrder,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, task: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "add task error" }, { status: 500 });
  }
}
