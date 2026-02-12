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
      .from("campaign_questions")
      .select("*")
      .eq("campaign_id", params.id)
      .order("sort_order", { ascending: true });

    return NextResponse.json({ ok: true, questions: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "questions error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { telegram_user_id } = await authFromHeader(req);
    await requireCampaignAdmin(telegram_user_id, params.id);

    const body = await req.json();
    const key = String(body?.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
    const label = String(body?.label || "").trim().slice(0, 120);
    const help_text = body?.help_text ? String(body.help_text).slice(0, 200) : null;
    const field_type = String(body?.field_type || "text");
    const required = Boolean(body?.required ?? true);
    const options = body?.options ?? null;

    if (!key) return NextResponse.json({ ok: false, error: "missing key" }, { status: 400 });
    if (!label) return NextResponse.json({ ok: false, error: "missing label" }, { status: 400 });
    if (!["text", "textarea", "select"].includes(field_type))
      return NextResponse.json({ ok: false, error: "invalid field_type" }, { status: 400 });

    // pick next sort order
    const { data: existing } = await supabaseAdmin
      .from("campaign_questions")
      .select("sort_order")
      .eq("campaign_id", params.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? 0) + 10;

    const { data, error } = await supabaseAdmin
      .from("campaign_questions")
      .insert({
        campaign_id: params.id,
        key,
        label,
        help_text,
        field_type,
        required,
        options,
        sort_order: nextOrder,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, question: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "add question error" }, { status: 500 });
  }
}
