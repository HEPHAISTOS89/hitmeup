import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";
import { allowRate } from "@/lib/rate-limit";
import { assertSameOriginMutation } from "@/lib/security";
import { integrationErrorResponse, parseJson } from "@/lib/integrations/api";
import { fetchWithTimeout, readJson } from "@/lib/integrations/http";

type ExplainRequest = {
  title: string;
  category: string;
  distanceMiles: number;
  adjustedRating: number;
  deterministicExplanation: string;
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function validRequest(value: unknown): value is ExplainRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.title === "string" && input.title.length <= 160 &&
    typeof input.category === "string" && input.category.length <= 80 &&
    typeof input.distanceMiles === "number" && Number.isFinite(input.distanceMiles) && input.distanceMiles >= 0 && input.distanceMiles <= 100 &&
    typeof input.adjustedRating === "number" && Number.isFinite(input.adjustedRating) && input.adjustedRating >= 0 && input.adjustedRating <= 5 &&
    typeof input.deterministicExplanation === "string" && input.deterministicExplanation.length <= 500
  );
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
    if (!validRequest(input)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const fallback = input.deterministicExplanation.slice(0, 180);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ explanation: fallback, source: "deterministic" });

    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: [
                "Rewrite this campus marketplace recommendation in one factual sentence under 24 words.",
                "Do not add claims, names, prices, or safety guarantees.",
                `Service: ${input.title}`,
                `Category: ${input.category}`,
                `Distance: ${input.distanceMiles.toFixed(1)} miles`,
                `Adjusted rating: ${input.adjustedRating.toFixed(1)}`,
                `Source explanation: ${fallback}`,
              ].join("\n"),
            }],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 60 },
        }),
      },
      4_500,
    );
    if (!response.ok) return NextResponse.json({ explanation: fallback, source: "deterministic" });
    const payload = await readJson<GeminiPayload>(response);
    const generated = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const safe = generated && generated.length <= 180 ? generated : fallback;
    return NextResponse.json({ explanation: safe, source: safe === fallback ? "deterministic" : "gemini" });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
