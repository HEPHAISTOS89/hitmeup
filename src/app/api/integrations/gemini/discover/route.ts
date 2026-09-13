import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { parseNaturalLanguageDiscovery } from "@/lib/integrations/gemini";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";

/** Parse a search sentence without exposing identity, exact location, or private content to Gemini. */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "gemini-discover", 20, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests.", code: "rate_limited" }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const body = await parseJson(request, 16_000);
    if (typeof body.query !== "string") return NextResponse.json({ error: "query is required", code: "invalid_response" }, { status: 400 });
    return NextResponse.json(await parseNaturalLanguageDiscovery(body.query));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
