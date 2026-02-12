import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/** CSV helpers */
function escapeCsvCell(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safeFilename(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function requireValidAdminSid(sid: string) {
  if (!sid) throw new Error("missing admin sid");

  const { data, error } = await supabaseAdmin
    .from("app_sessions")
    .select("id, telegram_user_id, kind, session_key, expires_at, state_json")
    .eq("id", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid admin session");

  if (String((data as any).kind || "") !== "admin") throw new Error("invalid admin session kind");
  if (String((data as any).session_key || "") !== "admin") throw new Error("invalid admin session key");

  const exp = (data as any).expires_at ? new Date((data as any).expires_at).getTime() : 0;
  if (exp && Number.isFinite(exp) && exp < Date.now()) throw new Error("admin session expired");

  const adminFlag = (data as any).state_json?.admin;
  if (adminFlag === false) throw new Error("not an admin session");

  const telegram_user_id = Number((data as any).telegram_user_id || 0);
  if (!telegram_user_id) throw new Error("invalid telegram_user_id in session");

  return { telegram_user_id };
}

async function requireProjectAdmin(telegram_user_id: number, project_id: string) {
  // ✅ FIX: your project_admins table doesn't have "id" — so don't select it.
  // Select any existing column just to confirm membership.
  const { data, error } = await supabaseAdmin
    .from("project_admins")
    .select("project_id")
    .eq("telegram_user_id", telegram_user_id)
    .eq("project_id", project_id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("not an admin for this project");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const campaign_id = String(searchParams.get("campaign_id") || "").trim();

    // Downloads: query param sid is most reliable.
    const sid =
      String(searchParams.get("sid") || "").trim() ||
      String(req.headers.get("x-app-sid") || "").trim() ||
      String(req.headers.get("x-admin-sid") || "").trim() ||
      "";

    if (!campaign_id) return NextResponse.json({ ok: false, error: "missing campaign_id" }, { status: 400 });
    if (!sid) return NextResponse.json({ ok: false, error: "missing admin sid" }, { status: 401 });

    // ✅ Auth via SID only (no initData required)
    const { telegram_user_id } = await requireValidAdminSid(sid);

    // Load campaign (+ project_id for project admin check)
    const { data: camp, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, code, title, type, project_id, created_by_telegram_user_id")
      .eq("id", campaign_id)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!camp) return NextResponse.json({ ok: false, error: "campaign not found" }, { status: 404 });

    // ✅ Authorization:
    // If campaign has project_id, require project admin; else fall back to creator check.
    const project_id = (camp as any).project_id ? String((camp as any).project_id) : "";
    if (project_id) {
      await requireProjectAdmin(telegram_user_id, project_id);
    } else {
      if (Number((camp as any).created_by_telegram_user_id) !== telegram_user_id) {
        return NextResponse.json({ ok: false, error: "not your campaign" }, { status: 403 });
      }
    }

    // Pull entries/applications (no username column on campaign_entries)
    const { data: rows, error: eErr } = await supabaseAdmin
      .from("campaign_entries")
      .select("id, created_at, telegram_user_id, wallet, tier, fairscore, answers")
      .eq("campaign_id", campaign_id)
      .order("created_at", { ascending: false });

    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });

    const list = rows || [];

    // Enrich with telegram_users
    const ids = Array.from(new Set(list.map((r: any) => Number(r.telegram_user_id)).filter(Boolean)));
    const userMap = new Map<
      number,
      { username: string | null; first_name: string | null; last_name: string | null }
    >();

    if (ids.length) {
      const { data: users } = await supabaseAdmin
        .from("telegram_users")
        .select("telegram_user_id, username, first_name, last_name")
        .in("telegram_user_id", ids);

      for (const u of (users || []) as any[]) {
        userMap.set(Number(u.telegram_user_id), {
          username: u.username ?? null,
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
        });
      }
    }

    const headers = [
      "campaign_code",
      "campaign_title",
      "campaign_type",
      "application_id",
      "submitted_at",
      "telegram_user_id",
      "username",
      "name",
      "wallet",
      "tier",
      "fairscore",
      "answers_json",
    ];

    const lines: string[] = [];
    lines.push(headers.map(escapeCsvCell).join(","));

    for (const r of list as any[]) {
      const u = userMap.get(Number(r.telegram_user_id)) || null;
      const username = u?.username ? `@${u.username}` : "";
      const name = [u?.first_name || "", u?.last_name || ""].filter(Boolean).join(" ").trim();

      lines.push(
        [
          (camp as any).code || "",
          (camp as any).title || "",
          (camp as any).type || "",
          r.id || "",
          r.created_at ? new Date(r.created_at).toISOString() : "",
          r.telegram_user_id ?? "",
          username,
          name,
          r.wallet ?? "",
          r.tier ?? "",
          typeof r.fairscore === "number" ? r.fairscore.toFixed(1) : r.fairscore ?? "",
          r.answers ? JSON.stringify(r.answers) : "",
        ]
          .map(escapeCsvCell)
          .join(",")
      );
    }

    const csv = "\ufeff" + lines.join("\n");
    const filename = `veyra_${safeFilename((camp as any).code || "campaign")}_applications.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "export csv error" }, { status: 500 });
  }
}
