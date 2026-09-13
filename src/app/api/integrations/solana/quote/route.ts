import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { getCosmeticQuote } from "@/lib/integrations/solana";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "solana-quote", 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
      );
    }
    const body = await parseJson(request, 8_000);
    if (typeof body.productId !== "string") {
      return NextResponse.json({ error: "productId is required", code: "invalid_response" }, { status: 400 });
    }
    return NextResponse.json(getCosmeticQuote(body.productId));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
