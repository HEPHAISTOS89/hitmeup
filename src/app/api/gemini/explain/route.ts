import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { explainRecommendation } from "@/lib/integrations/gemini";
import { isServiceCategory, type ServiceCategory } from "@/lib/service-taxonomy";

type ExplainRequest = {
  title: string;
  category: string;
  subcategory?: string;
  approvedInterests?: string[];
  distanceBand?: "on-campus" | "nearby" | "within-campus-area" | "far";
  ratingBand?: "new" | "4+" | "4.5+" | "high";
  responseBand?: "under-15m" | "15-60m" | "over-60m" | "unknown";
  completedCountBand?: "none" | "1-10" | "11-50" | "50+";
  // Legacy clients may send these aggregate inputs. They are bucketed before any model call.
  distanceMiles?: number;
  adjustedRating?: number;
  deterministicExplanation: string;
};

function validRequest(value: unknown): value is ExplainRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.title === "string" && input.title.trim().length > 0 && input.title.length <= 160 &&
    typeof input.category === "string" && isServiceCategory(input.category.trim()) &&
    (!input.subcategory || (typeof input.subcategory === "string" && input.subcategory.length <= 100)) &&
    (input.approvedInterests === undefined || (Array.isArray(input.approvedInterests) && input.approvedInterests.length <= 8 && input.approvedInterests.every((item) => typeof item === "string" && item.length <= 48))) &&
    (input.distanceBand === undefined || ["on-campus", "nearby", "within-campus-area", "far"].includes(String(input.distanceBand))) &&
    (input.ratingBand === undefined || ["new", "4+", "4.5+", "high"].includes(String(input.ratingBand))) &&
    (input.responseBand === undefined || ["under-15m", "15-60m", "over-60m", "unknown"].includes(String(input.responseBand))) &&
    (input.completedCountBand === undefined || ["none", "1-10", "11-50", "50+"].includes(String(input.completedCountBand))) &&
    (input.distanceMiles === undefined || (typeof input.distanceMiles === "number" && Number.isFinite(input.distanceMiles) && input.distanceMiles >= 0 && input.distanceMiles <= 100)) &&
    (input.adjustedRating === undefined || (typeof input.adjustedRating === "number" && Number.isFinite(input.adjustedRating) && input.adjustedRating >= 0 && input.adjustedRating <= 5)) &&
    typeof input.deterministicExplanation === "string" && input.deterministicExplanation.length <= 500
  );
}

function coarseDistance(distanceMiles: number): ExplainRequest["distanceBand"] {
  if (distanceMiles <= 0.25) return "on-campus";
  if (distanceMiles <= 1) return "nearby";
  if (distanceMiles <= 5) return "within-campus-area";
  return "far";
}

function coarseRating(rating: number): ExplainRequest["ratingBand"] {
  if (rating >= 4.5) return "4.5+";
  if (rating >= 4) return "4+";
  return "new";
}

function hasSensitiveInput(value: Record<string, unknown>) {
  return Object.keys(value).some((key) => /email|coordinate|latitude|longitude|private|chat|message|exact.?location/i.test(key));
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const auth = await requireVerifiedStudent();
    if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
    const rate = await allowRate(auth.student.sub, "gemini-explain", 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests.", code: "rate_limited" },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
      );
    }
    const input: unknown = await parseJson(request, 32_000);
    if (!validRequest(input) || hasSensitiveInput(input as Record<string, unknown>)) return NextResponse.json({ error: "Invalid request", code: "invalid_response" }, { status: 400 });
    const result = await explainRecommendation({
      title: input.title,
      category: input.category as ServiceCategory,
      subcategory: input.subcategory,
      approvedInterests: input.approvedInterests,
      distanceBand: input.distanceBand ?? (input.distanceMiles === undefined ? undefined : coarseDistance(input.distanceMiles)),
      ratingBand: input.ratingBand ?? (input.adjustedRating === undefined ? undefined : coarseRating(input.adjustedRating)),
      responseBand: input.responseBand,
      completedCountBand: input.completedCountBand,
      deterministicExplanation: input.deterministicExplanation,
    });
    return NextResponse.json(result);
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
