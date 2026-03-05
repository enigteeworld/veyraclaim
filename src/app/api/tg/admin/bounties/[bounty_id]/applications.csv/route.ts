// === START: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications.csv/route.ts ===
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getSid(req: NextRequest) {
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
    if (!Number.isNaN(exp) && Date.now() > exp) {
      throw new Error("Admin session expired. Reopen Admin Panel from bot.");
    }
  }
}

function csvEscape(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  req: NextRequest,
  // ✅ Your Next 16 build expects params to be a Promise for route handlers
  { params }: { params: Promise<{ bounty_id: string }> }
) {
  try {
    const sid = getSid(req);
    await assertAdminSession(sid);

    // ✅ must await params
    const { bounty_id } = await params;

    const id = String(bounty_id || "").trim();
    if (!id) throw new Error("Missing bounty_id");

    const { data, error } = await supabaseAdmin
      .from("bounty_applications")
      .select("id, bounty_id, telegram_user_id, wallet, tier, fairscore, answers, created_at")
      .eq("bounty_id", id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data : [];

    // Stable pro CSV columns
    const baseCols = ["created_at", "telegram_user_id", "wallet", "tier", "fairscore"];
    const answerKeys = new Set<string>();

    for (const r of rows) {
      const a = (r as any)?.answers;
      if (a && typeof a === "object") {
        Object.keys(a).forEach((k) => answerKeys.add(k));
      }
    }

    const answerCols = Array.from(answerKeys).sort();
    const cols = [...baseCols, ...answerCols];

    const header = cols.map(csvEscape).join(",");
    const lines = [header];

    for (const r of rows) {
      const a = (r as any)?.answers && typeof (r as any).answers === "object" ? (r as any).answers : {};

      const line = cols
        .map((c) => {
          if (c in a) return csvEscape(a[c]);
          return csvEscape((r as any)?.[c]);
        })
        .join(",");

      lines.push(line);
    }

    const csv = lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bounty_${id}_applications.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "CSV export failed" }, { status: 400 });
  }
}
// === END: FILE_src/app/api/tg/admin/bounties/[bounty_id]/applications.csv/route.ts ===