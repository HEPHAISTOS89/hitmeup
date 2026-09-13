import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { suggestService } from "@/lib/integrations/gemini";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "gemini", 20, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const body = await parseJson(request);
    if ((body.title !== undefined && typeof body.title !== "string") || (body.description !== undefined && typeof body.description !== "string") || (body.imageDataUrl !== undefined && typeof body.imageDataUrl !== "string")) {
      return NextResponse.json({ error: "title, description and imageDataUrl must be strings", code: "invalid_response" }, { status: 400 });
    }
    return NextResponse.json(await suggestService({ title: body.title ?? "", description: body.description ?? "", imageDataUrl: body.imageDataUrl }));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
