// === START: FILE_src/app/api/tg/admin/bounties/export-csv/route.ts ===
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function assertAdminSession(sid: string) {
  if (!sid) throw new Error("Missing admin session (sid).");

  const sb = supabaseAdmin;
  const { data, error } = await sb
    .from("telegram_admin_sessions")
    .select("sid")
    .eq("sid", sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.sid) throw new Error("Invalid admin session. Reopen Admin Panel from bot.");
}

function escapeCsvCell(v: any) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const sid = u.searchParams.get("sid") || "";
    const bountyId = u.searchParams.get("bounty_id") || "";
    if (!bountyId) throw new Error("Missing bounty_id.");

    await assertAdminSession(sid);

    const sb = supabaseAdmin;

    const { data: bounty, error: bErr } = await sb.from("bounties").select("*").eq("id", bountyId).single();
    if (bErr) throw new Error(bErr.message);

    const { data: apps, error: aErr } = await sb
      .from("bounty_applications")
      .select("*")
      .eq("bounty_id", bountyId)
      .order("created_at", { ascending: false });

    if (aErr) throw new Error(aErr.message);

    const qs = Array.isArray((bounty as any)?.questions) ? ((bounty as any).questions as any[]) : [];
    const qColumns = qs.slice(0, 24).map((q: any, idx: number) => {
      const label = (q?.label || `Question ${idx + 1}`).trim();
      const n = String(idx + 1).padStart(2, "0");
      return { id: q.id, header: `Q${n} - ${label}` };
    });

    const headers = [
      "bounty_code",
      "bounty_title",
      "application_id",
      "submitted_at",
      "telegram_user_id",
      "username",
      "wallet",
      "tier",
      "fairscore",
      ...qColumns.map((x) => x.header),
      "answers_json",
    ];

    const lines: string[] = [];
    lines.push(headers.map(escapeCsvCell).join(","));

    for (const r of apps || []) {
      const answersObj = (r as any).answers || {};
      const rowCells: any[] = [
        (bounty as any)?.code || "",
        (bounty as any)?.title || "",
        (r as any).id,
        (r as any).created_at ? new Date((r as any).created_at).toISOString() : "",
        (r as any).telegram_user_id ?? "",
        (r as any).username ? `@${(r as any).username}` : "",
        (r as any).wallet ?? "",
        (r as any).tier ?? "",
        typeof (r as any).fairscore === "number" ? (r as any).fairscore.toFixed(1) : (r as any).fairscore ?? "",
      ];

      for (const qc of qColumns) rowCells.push(answersObj?.[qc.id] ?? "");
      rowCells.push((r as any).answers ? JSON.stringify((r as any).answers) : "");

      lines.push(rowCells.map(escapeCsvCell).join(","));
    }

    const csv = "\ufeff" + lines.join("\n");
    const filename = `veyra_${String((bounty as any)?.code || "bounty").toLowerCase()}_applications.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "Export failed", { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/export-csv/route.ts ===