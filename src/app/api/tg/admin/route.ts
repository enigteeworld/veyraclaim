import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function tgAuth(req: Request) {
  const { initData } = await req.json();
  const r = await fetch(new URL("/api/tg/auth", req.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "auth failed");
  return j as { ok: true; telegram_user_id: number; user: any };
}

export async function GET(req: Request) {
  try {
    const initData = req.headers.get("x-tg-initdata") || "";
    if (!initData) return NextResponse.json({ ok: false, error: "missing initdata" }, { status: 400 });

    // call internal auth
    const r = await fetch(new URL("/api/tg/auth", req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const j = await r.json();
    if (!j.ok) return NextResponse.json({ ok: false, error: j.error }, { status: 401 });

    const telegram_user_id = Number(j.telegram_user_id);

    const { data: admins } = await supabaseAdmin
      .from("project_admins")
      .select("project_id, projects:project_id(id,name)")
      .eq("telegram_user_id", telegram_user_id);

    const projects = (admins || [])
      .map((a: any) => a.projects)
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      telegram_user_id,
      is_admin: projects.length > 0,
      projects,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "admin error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { initData, inviteCode } = await req.json();
    if (!inviteCode) return NextResponse.json({ ok: false, error: "missing inviteCode" }, { status: 400 });

    const r = await fetch(new URL("/api/tg/auth", req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const j = await r.json();
    if (!j.ok) return NextResponse.json({ ok: false, error: j.error }, { status: 401 });

    const telegram_user_id = Number(j.telegram_user_id);
    const code = String(inviteCode).trim();

    const { data: inv } = await supabaseAdmin
      .from("project_invite_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!inv) return NextResponse.json({ ok: false, error: "Invalid invite code" }, { status: 400 });

    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())
      return NextResponse.json({ ok: false, error: "Invite code expired" }, { status: 400 });

    if (inv.max_uses !== null && inv.uses >= inv.max_uses)
      return NextResponse.json({ ok: false, error: "Invite code max uses reached" }, { status: 400 });

    // Create (or find) project by name
    const { data: existingProject } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("name", inv.project_name)
      .maybeSingle();

    let project = existingProject;

    if (!project) {
      const { data: createdProject, error: pErr } = await supabaseAdmin
        .from("projects")
        .insert({ name: inv.project_name })
        .select("*")
        .single();
      if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
      project = createdProject;
    }

    // Add admin mapping
    const { error: aErr } = await supabaseAdmin.from("project_admins").insert({
      project_id: project.id,
      telegram_user_id,
    });

    // If already admin, ignore unique conflict
    if (aErr && !String(aErr.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: aErr.message }, { status: 400 });
    }

    // Increment uses
    await supabaseAdmin
      .from("project_invite_codes")
      .update({ uses: (inv.uses || 0) + 1 })
      .eq("code", code);

    return NextResponse.json({ ok: true, project });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "redeem error" }, { status: 500 });
  }
}
