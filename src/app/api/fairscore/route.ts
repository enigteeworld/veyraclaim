import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonError(status: number, message: string, detail?: unknown) {
  return NextResponse.json(
    { error: message, detail },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");

  if (!wallet) {
    return jsonError(400, "Missing wallet. Call /api/fairscore?wallet=<pubkey>");
  }

  const apiKey = process.env.FAIRSCALE_API_KEY;
  const baseUrl = process.env.FAIRSCALE_BASE_URL || "https://api2.fairscale.xyz";

  if (!apiKey) {
    return jsonError(500, "Missing FAIRSCALE_API_KEY in .env.local");
  }

  const endpoint = `${baseUrl}/score?wallet=${encodeURIComponent(wallet)}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        fairkey: apiKey, // ✅ correct header
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return jsonError(res.status, "FairScale error", data);
    }

    // ✅ Canonical fields from FairScale
    const score = data?.fairscore;
    const tier = data?.tier;

    if (typeof score !== "number") {
      return jsonError(502, "Invalid FairScale response format", data);
    }

    return NextResponse.json(
      {
        score,                 // 17.9
        tier,                  // bronze
        badges: data.badges,   // optional (future UI)
        actions: data.actions, // optional (UX hints)
        raw: data,             // keep full payload for expansion
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return jsonError(500, "Failed to fetch FairScore", String(err?.message || err));
  }
}
