// === START: FILE_src/app/api/tg/bounties/[id]/session/route.ts ===
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Deprecated endpoint. Use POST /api/tg/bounty/session",
    },
    { status: 410 }
  );
}
// === END: FILE_src/app/api/tg/bounties/[id]/session/route.ts ===