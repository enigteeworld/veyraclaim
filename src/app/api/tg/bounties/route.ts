
// === START: src/app/api/tg/bounties/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ProjectJoin = {
  name?: string | null;
};

type BountyRow = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  reward?: string | null;
  currency?: string | null;
  min_tier?: string | null;
  status?: string | null;
  published?: boolean | null;

  // new fields (safe if null/missing)
  project_id?: string | null;
  posted_by_type?: string | null; // 'veyra' | 'project'
  how_to?: string | null;
  rules?: string | null;
  link_url?: string | null;
  max_winners?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;

  created_at?: string | null;

  // join
  projects?: ProjectJoin | null;

  // computed
  posted_by_name?: string | null;
};

export async function GET() {
  try {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("bounties")
      .select(
        `
        id,
        code,
        title,
        description,
        reward,
        currency,
        min_tier,
        status,
        published,
        application_schema,
        created_at,
        project_id,
        posted_by_type,
        how_to,
        rules,
        link_url,
        max_winners,
        starts_at,
        ends_at,
        projects:project_id ( name )
      `
      )
      .eq("published", true)
      .eq("status", "open")
      // show only bounties that have started (or no start)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      // hide ended bounties (or no end)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows: BountyRow[] = (data ?? []).map((b: any) => {
      const postedByType = String(b?.posted_by_type || "project");
      const projectName = b?.projects?.name ? String(b.projects.name) : null;

      const posted_by_name =
        postedByType === "veyra" ? "Veyra" : projectName || "Project";

      return {
        ...b,
        posted_by_name,
      };
    });

    // Return multiple keys so any client parsing style works (bounties/list/data)
    return NextResponse.json({
      ok: true,
      bounties: rows,
      list: rows,
      data: rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to fetch bounties" },
      { status: 500 }
    );
  }
}
// === END: src/app/api/tg/bounties/route.ts ===