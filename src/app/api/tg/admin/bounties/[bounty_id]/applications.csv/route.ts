// === START: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications.csv/route.ts ===
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
  if (!v) return {};
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
}

function csvEscape(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  // Always escape if special chars
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toSafeFilename(s: string) {
  return (s || "bounty")
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

type AppQuestion =
  | { id: string; type: "text"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "textarea"; label: string; required?: boolean; placeholder?: string; maxLen?: number }
  | { id: string; type: "select"; label: string; required?: boolean; options: string[] };

function extractQuestions(application_schema: any): AppQuestion[] {
  if (Array.isArray(application_schema)) return application_schema as AppQuestion[];
  if (application_schema && Array.isArray(application_schema.questions)) return application_schema.questions as AppQuestion[];
  return [];
}

export async function GET(req: Request, ctx: { params: { bounty_id: string } }) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    const bounty_id = String(ctx?.params?.bounty_id || "").trim();
    if (!bounty_id) return NextResponse.json({ ok: false, error: "missing bounty_id" }, { status: 400 });

    // Get bounty code/title + schema so we can create stable columns
    const { data: bounty, error: bErr } = await supabaseAdmin
      .from("bounties")
      .select("id, code, title, application_schema")
      .eq("id", bounty_id)
      .maybeSingle();

    if (bErr) throw new Error(bErr.message);
    if (!bounty?.id) return NextResponse.json({ ok: false, error: "bounty not found" }, { status: 404 });

    const questions = extractQuestions((bounty as any).application_schema);
    const qCols = questions.map((q) => ({
      id: String((q as any)?.id || "").trim(),
      label: String((q as any)?.label || (q as any)?.id || "Question").trim().slice(0, 120),
    }));

    const { data, error } = await supabaseAdmin
      .from("bounty_applications")
      .select("telegram_user_id, wallet, tier, fairscore, answers, created_at")
      .eq("bounty_id", bounty_id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Header
    const header = [
      "created_at",
      "wallet",
      "tier",
      "fairscore",
      "telegram_user_id",
      ...qCols.map((c, i) => `q${i + 1}_${c.label}`),
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const row of data || []) {
      const ans = safeJson((row as any).answers);
      const cells = [
        (row as any).created_at || "",
        (row as any).wallet || "",
        (row as any).tier || "",
        (row as any).fairscore ?? "",
        (row as any).telegram_user_id ?? "",
        ...qCols.map((c) => (c.id ? (ans as any)[c.id] ?? "" : "")),
      ];
      lines.push(cells.map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const code = String((bounty as any).code || "bounty").trim() || "bounty";
    const title = String((bounty as any).title || "").trim();
    const fileBase = toSafeFilename(`${code}_${title}`) || "bounty_applications";
    const filename = `${fileBase}_applications.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "CSV export failed" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications.csv/route.ts ===