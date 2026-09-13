import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { verifyCosmeticPayment } from "@/lib/integrations/solana";
import { createServerSupabaseAdminClient, SupabaseConfigurationError } from "@/lib/supabase/factory";
import { claimCosmeticUnlock, getProfileWallet } from "@/lib/supabase/repository";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { recordTigerEvent } from "@/lib/integrations/tiger";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "solana-unlock", 10, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const body = await parseJson(request, 16_000);
    if (typeof body.signature !== "string" || typeof body.productId !== "string" || typeof body.checkoutId !== "string") {
      return NextResponse.json({ error: "signature, productId, and checkoutId are required", code: "invalid_response" }, { status: 400 });
    }
    const admin = createServerSupabaseAdminClient();
    const wallet = await getProfileWallet(admin, auth.student.sub);
    const verified = await verifyCosmeticPayment(body.signature, body.productId, wallet);
    const customizationId = await claimCosmeticUnlock(admin, auth.student.sub, verified.productId, verified.signature, wallet, verified.lamports, body.checkoutId);
    await recordTigerEvent({ name: "profile_item_purchased" }, auth.student.sub);
    // Signature and linked wallet are authorization data, never public response fields.
    return NextResponse.json({ verified: verified.verified, network: verified.network, productId: verified.productId, label: verified.label, lamports: verified.lamports, slot: verified.slot, customizationId });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return NextResponse.json({ error: "Cosmetic unlock is not configured.", code: "configuration" }, { status: 503 });
    return integrationErrorResponse(error);
  }
}
