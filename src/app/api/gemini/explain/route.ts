import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { explainRecommendation } from "@/lib/integrations/gemini";
import { createServerSupabaseClient, SupabaseConfigurationError } from "@/lib/supabase/factory";
import { getMyProfile, listRecommendedServices } from "@/lib/supabase/repository";
import { isServiceCategory } from "@/lib/service-taxonomy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function distanceBand(distance: number) {
  return distance <= 0.25 ? "on-campus" as const : distance <= 1 ? "nearby" as const : distance <= 5 ? "within-campus-area" as const : "far" as const;
}

function ratingBand(rating: number) {
  return rating >= 4.5 ? "4.5+" as const : rating >= 4 ? "4+" as const : "new" as const;
}

function completedBand(completed: number) {
  return completed <= 0 ? "none" as const : completed <= 10 ? "1-10" as const : completed <= 50 ? "11-50" as const : "50+" as const;
}

/** Gemini receives only server-projected public signals for the requested service. */
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "gemini-explain", 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests.", code: "rate_limited" }, {
        status: 429,
        headers: { "retry-after": String(rate.retryAfterSeconds) },
      });
    }
    const input = await parseJson(request, 8_000);
    if (input.geminiConsent !== true) {
      return NextResponse.json({ error: "Gemini consent is required.", code: "consent_required" }, { status: 400 });
    }
    if (typeof input.serviceId !== "string" || !UUID.test(input.serviceId) || Object.keys(input).some((key) => !["serviceId", "geminiConsent"].includes(key))) {
      return NextResponse.json({ error: "A valid serviceId is required.", code: "invalid_response" }, { status: 400 });
    }
    const client = await createServerSupabaseClient();
    const [services, profile] = await Promise.all([listRecommendedServices(client), getMyProfile(client)]);
    const service = services.find((candidate) => candidate.id === input.serviceId);
    if (!service || !isServiceCategory(service.category)) return NextResponse.json({ error: "Service is unavailable.", code: "not_found" }, { status: 404 });
    const result = await explainRecommendation({
      title: service.title,
      category: service.category,
      subcategory: service.subcategory ?? undefined,
      approvedInterests: profile?.interests.slice(0, 8),
      distanceBand: distanceBand(service.distanceMiles),
      ratingBand: ratingBand(service.provider.rating),
      responseBand: "unknown",
      completedCountBand: completedBand(service.provider.completed),
      deterministicExplanation: service.explanation,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json({ error: "Recommendation data is not configured.", code: "configuration" }, { status: 503 });
    }
    return integrationErrorResponse(error);
  }
}
