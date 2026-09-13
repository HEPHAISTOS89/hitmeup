import { fetchWithTimeout, IntegrationError, readJson } from "./http";
import { isServiceCategory, subcategoriesFor, type ServiceCategory } from "../service-taxonomy";

export type ServiceDraft = {
  title: string;
  description: string;
  imageDataUrl?: string;
};

export type GeminiSuggestion = {
  category: ServiceCategory;
  subcategory: string;
  tags: string[];
  suggestedTitle: string;
  riskFlags: string[];
  searchKeywords: string[];
  source: "gemini" | "deterministic-fallback";
};

const FALLBACK_CATEGORIES: ReadonlyArray<readonly [string, ServiceCategory, string]> = [
  ["tutoring", "Tutoring", "Tutoring"],
  ["math", "Tutoring", "Exam prep"],
  ["programming", "Services", "Tech help"],
  ["code", "Services", "Tech help"],
  ["laptop", "Services", "Tech help"],
  ["computer", "Services", "Tech help"],
  ["ride", "Help", "Quick ride"],
  ["airport", "Help", "Quick ride"],
  ["photo", "Services", "Photography"],
  ["design", "Services", "Photography"],
  ["video", "Services", "Photography"],
  ["move", "Services", "Moving help"],
  ["moving", "Services", "Moving help"],
] as const;
const LEGACY_CATEGORY_ALIASES: Record<string, { category: ServiceCategory; subcategory: string }> = {
  "Tech help": { category: "Services", subcategory: "Tech help" },
  Ride: { category: "Help", subcategory: "Quick ride" },
  Creative: { category: "Services", subcategory: "Photography" },
  Moving: { category: "Services", subcategory: "Moving help" },
  Other: { category: "Help", subcategory: "Other request" },
};

function cleanText(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function deterministicSuggestion(draft: ServiceDraft): GeminiSuggestion {
  const haystack = `${draft.title} ${draft.description}`.toLowerCase();
  const match = FALLBACK_CATEGORIES.find(([keyword]) => haystack.includes(keyword));
  const category = match?.[1] ?? "Help";
  const subcategory = match?.[2] ?? "Other request";
  const words = haystack.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const tags = [...new Set(words.filter((word) => !["the", "and", "for", "with"].includes(word)))]
    .slice(0, 5);
  return {
    category,
    subcategory,
    tags,
    suggestedTitle: cleanText(draft.title) || "Student service",
    riskFlags: [],
    searchKeywords: [...new Set([category.toLowerCase(), subcategory.toLowerCase(), ...tags])].slice(0, 8),
    source: "deterministic-fallback",
  };
}

function parseModelText(value: unknown): unknown {
  if (typeof value !== "string") return null;
  const withoutFence = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    return null;
  }
}

function validateSuggestion(value: unknown, fallback: GeminiSuggestion): GeminiSuggestion {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const rawCategory = cleanText(candidate.category, 80);
  const category = isServiceCategory(rawCategory)
    ? rawCategory
    : LEGACY_CATEGORY_ALIASES[rawCategory]?.category;
  const legacySubcategory = LEGACY_CATEGORY_ALIASES[rawCategory]?.subcategory;
  const rawSubcategory = cleanText(candidate.subcategory, 80);
  const subcategory = rawSubcategory || legacySubcategory;
  const suggestedTitle = cleanText(candidate.suggestedTitle, 160);
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  const riskFlags = Array.isArray(candidate.riskFlags)
    ? candidate.riskFlags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  const searchKeywords = Array.isArray(candidate.searchKeywords)
    ? candidate.searchKeywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  if (!category || !subcategory || !subcategoriesFor(category).some((item) => item.label === subcategory) || !suggestedTitle || tags.length === 0 || searchKeywords.length === 0) return fallback;
  return { category, subcategory, suggestedTitle, tags, riskFlags, searchKeywords, source: "gemini" };
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function validateDraft(draft: ServiceDraft) {
  const title = cleanText(draft.title, 160);
  const description = cleanText(draft.description, 2_000);
  if (!title && !description) throw new IntegrationError("invalid_response", "A title or description is required.", 400);
  if (draft.imageDataUrl && (!draft.imageDataUrl.startsWith("data:image/") || draft.imageDataUrl.length > 4_000_000)) {
    throw new IntegrationError("invalid_response", "The image must be a small data URL.", 400);
  }
  return { title, description, imageDataUrl: draft.imageDataUrl };
}

export async function suggestService(draft: ServiceDraft): Promise<GeminiSuggestion> {
  const valid = validateDraft(draft);
  const fallback = deterministicSuggestion(valid);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback;

  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts: Array<Record<string, unknown>> = [{ text: `Classify this student service. Return JSON only with category, subcategory, tags, suggestedTitle, riskFlags, searchKeywords. Use only the provided student marketplace taxonomy. Title: ${valid.title}\nDescription: ${valid.description}` }];
  if (valid.imageDataUrl) {
    const match = valid.imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: { type: "STRING", enum: ["Social", "Services", "Tutoring", "Jobs", "Volunteer", "Clubs", "Activities", "Events", "Help"] },
              subcategory: { type: "STRING" },
              tags: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 },
              suggestedTitle: { type: "STRING" },
              riskFlags: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 },
              searchKeywords: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 },
            },
            required: ["category", "subcategory", "tags", "suggestedTitle", "riskFlags", "searchKeywords"],
          },
        },
      }),
    });
    const body = await readJson<GeminiResponse>(response);
    const text = body.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    return validateSuggestion(parseModelText(text), fallback);
  } catch {
    return fallback;
  }
}
