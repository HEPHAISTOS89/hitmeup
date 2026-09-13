import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { createServerSupabaseClient, SupabaseConfigurationError } from "@/lib/supabase/factory";
import { ensureProfile, DataValidationError } from "@/lib/supabase/repository";
import { allowRate, RateLimitUnavailableError } from "@/lib/rate-limit";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
  .split(",").map((value) => value.trim()).filter(Boolean);

class DataAuthorizationError extends Error {}

/** Reject cross-site state changes while allowing non-browser bearer clients with no Origin. */
export function assertSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new DataAuthorizationError("Cross-origin mutation denied.");
  if (process.env.NODE_ENV === "production" && !origin && request.headers.get("sec-fetch-site") !== "same-origin") throw new DataAuthorizationError("Mutation origin could not be verified.");
}

export async function withDataClient() {
  const auth = await requireVerifiedStudent();
  if (!auth.ok) return { response: NextResponse.json({ error: auth.code }, { status: auth.status }) };
  const rate = await allowRate(auth.student.sub, "data", 120, 60_000);
  if (!rate.allowed) return { response: NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } }) };
  const client = await createServerSupabaseClient();
  await ensureProfile(client, {
    userId: auth.student.sub,
    email: auth.student.email,
    eduDomain: auth.student.eduDomain,
    // Never turn a university email/local-part into a public marketplace name.
    // The student can explicitly choose a display name through the profile RPC.
    displayName: "Student",
  });
  return { client, student: auth.student };
}

export async function bodyObject(request: Request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 64_000) throw new DataValidationError("Request body is too large.");
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new DataValidationError("A JSON object is required."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DataValidationError("A JSON object is required.");
  return body as Record<string, unknown>;
}

export function inputError(message: string) {
  return new DataValidationError(message);
}

export function dataError(error: unknown) {
  if (error instanceof DataAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof DataValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof RateLimitUnavailableError) return NextResponse.json({ error: "Abuse protection is temporarily unavailable." }, { status: 503 });
  if (error instanceof SupabaseConfigurationError) return NextResponse.json({ error: "Data service is not configured." }, { status: 503 });
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("required bilateral rating missing")) {
    return NextResponse.json({ error: "Complete your required rating first.", code: "rating_required" }, { status: 409 });
  }
  if (message.includes("already accepted") || message.includes("duplicate key") || message.includes("already claimed")) {
    return NextResponse.json({ error: "This action conflicts with the current state.", code: "conflict" }, { status: 409 });
  }
  if (message.includes("request unavailable") || message.includes("service unavailable") || message.includes("profile unavailable")) {
    return NextResponse.json({ error: "Resource not found.", code: "not_found" }, { status: 404 });
  }
  if (message.includes("invalid ") || message.includes("unsupported transition") || message.includes("completion unavailable") || message.includes("rating unavailable") || message.includes("location sharing unavailable") || message.includes("messaging unavailable")) {
    return NextResponse.json({ error: "Action is not available in the current state.", code: "invalid_state" }, { status: 409 });
  }
  if (message.includes("mutual location consent required")) {
    return NextResponse.json({ error: "Both students must share location before meeting.", code: "consent_required" }, { status: 409 });
  }
  return NextResponse.json({ error: "Data request failed." }, { status: 500 });
}
