import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { appendTigerEvent, bindTigerActor, type TigerEvent } from "@/lib/integrations/tiger";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "tiger", 60, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const body = await parseJson(request, 64_000);
    // Identity is derived from the verified session, never from the browser payload.
    return NextResponse.json(await appendTigerEvent(bindTigerActor(body as unknown as TigerEvent, auth.student.sub)), { status: 202 });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
