import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { getCosmeticQuote } from "@/lib/integrations/solana";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { createServerSupabaseAdminClient, SupabaseConfigurationError } from "@/lib/supabase/factory";
import { reserveCosmeticQuote } from "@/lib/supabase/repository";

export function solanaQuoteFailureResponse(error: unknown) {
  if (error instanceof Error && error.message === "cosmetic already owned") {
    return NextResponse.json(
      { error: "This cosmetic is already owned.", code: "already_owned" },
      { status: 409 },
    );
  }
  if (error instanceof Error && error.message === "invalid cosmetic quote") {
    return NextResponse.json(
      { error: "The Devnet catalog is not synchronized.", code: "configuration" },
      { status: 503 },
    );
  }
  if (error instanceof Error && error.message === "purchase already in progress") {
    return NextResponse.json(
      {
        error: "A Devnet checkout is already active for this account. Continue in the original tab or try again after the quote expires.",
        code: "checkout_in_progress",
      },
      { status: 409 },
    );
  }

  console.error(JSON.stringify({
    level: "error",
    message: "solana_quote_failed",
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message : "Unknown failure",
  }));
  return integrationErrorResponse(error);
}

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
    if (typeof body.productId !== "string" || typeof body.checkoutKey !== "string") {
      return NextResponse.json({ error: "productId and checkoutKey are required", code: "invalid_response" }, { status: 400 });
    }
    const quote = getCosmeticQuote(body.productId);
    const admin = createServerSupabaseAdminClient();
    // The SECURITY DEFINER reservation RPC validates the active product,
    // immutable amount, profile and existing ownership atomically. Keeping
    // these checks inside that transaction avoids broad service-role table
    // grants and removes a race between preflight reads and reservation.
    const checkoutId = await reserveCosmeticQuote(admin, auth.student.sub, body.productId, quote.lamports, body.checkoutKey);
    return NextResponse.json({ ...quote, checkoutId });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return NextResponse.json({ error: "Cosmetic quotes are not configured.", code: "configuration" }, { status: 503 });
    return solanaQuoteFailureResponse(error);
  }
}
