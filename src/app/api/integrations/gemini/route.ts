import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { suggestService, type ServiceDraft } from "@/lib/integrations/gemini";
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
    const stringFields = ["title", "description", "category", "subcategory", "availability", "price", "imageDataUrl"] as const;
    if (stringFields.some((field) => body[field] !== undefined && typeof body[field] !== "string")) {
      return NextResponse.json({ error: "listing fields must be strings", code: "invalid_response" }, { status: 400 });
    }
    const draft = Object.fromEntries(stringFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])) as ServiceDraft;
    return NextResponse.json(await suggestService(draft));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
