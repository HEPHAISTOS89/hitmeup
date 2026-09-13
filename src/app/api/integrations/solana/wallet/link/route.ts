import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { verifyWalletLinkChallenge } from "@/lib/solana-wallet-link";
import { createServerSupabaseAdminClient, SupabaseConfigurationError } from "@/lib/supabase/factory";
import { linkVerifiedProfileWallet } from "@/lib/supabase/repository";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "wallet-link", 10, 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const body = await parseJson(request, 32_000);
    if ([body.wallet, body.token, body.message, body.signature].some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "wallet challenge fields are required", code: "invalid_response" }, { status: 400 });
    }
    const verified = verifyWalletLinkChallenge({ subject: auth.student.sub, wallet: body.wallet as string, token: body.token as string, message: body.message as string, signature: body.signature as string });
    await linkVerifiedProfileWallet(createServerSupabaseAdminClient(), auth.student.sub, verified.wallet);
    return NextResponse.json({ linked: true, wallet: verified.wallet });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return NextResponse.json({ error: "Wallet linking is not configured.", code: "configuration" }, { status: 503 });
    return integrationErrorResponse(error);
  }
}
