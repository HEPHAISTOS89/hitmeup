import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { createWalletLinkChallenge } from "@/lib/solana-wallet-link";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "wallet-link", 10, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const body = await parseJson(request, 8_000);
    if (typeof body.wallet !== "string") return NextResponse.json({ error: "wallet is required", code: "invalid_response" }, { status: 400 });
    return NextResponse.json(createWalletLinkChallenge(auth.student.sub, body.wallet));
  } catch (error) { return integrationErrorResponse(error); }
}
