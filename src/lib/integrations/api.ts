import { NextResponse } from "next/server";
import { IntegrationError } from "./http";
import { RateLimitUnavailableError } from "../rate-limit";

export function integrationErrorResponse(error: unknown) {
  if (error instanceof RateLimitUnavailableError) {
    return NextResponse.json({ error: "Abuse protection is temporarily unavailable.", code: "configuration" }, { status: 503 });
  }
  if (error instanceof IntegrationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: "Integration request failed.", code: "upstream" }, { status: 502 });
}

export async function parseJson(request: Request, maxBytes = 4_500_000) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new IntegrationError("invalid_response", "Request body is too large.", 413);
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return body as Record<string, unknown>;
  } catch {
    throw new IntegrationError("invalid_response", "A JSON object is required.", 400);
  }
}
