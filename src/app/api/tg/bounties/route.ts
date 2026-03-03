// === START: src/app/api/tg/bounties/route.ts ===
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("bounties")
      .select("*")
      .eq("published", true)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      bounties: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed to fetch bounties" },
      { status: 500 }
    );
  }
}
// === END: src/app/api/tg/bounties/route.ts ===