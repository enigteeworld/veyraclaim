// === START FILE: src/app/api/tg/bounties/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Public bounties list for the mini app.
 * Matches your current bounties schema:
 * - published (boolean)
 * - status: open | closed | paused
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("bounties")
      .select(
        [
          "id",
          "code",
          "title",
          "description",
          "reward",
          "currency",
          "min_tier",
          "status",
          "published",
          "application_schema",
          "created_at",
        ].join(",")
      )
      .eq("published", true)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, bounties: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to load bounties" },
      { status: 500 }
    );
  }
}
// === END FILE: src/app/api/tg/bounties/route.ts ===