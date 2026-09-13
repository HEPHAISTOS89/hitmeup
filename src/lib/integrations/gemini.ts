import { fetchWithTimeout, IntegrationError, readJson } from "./http";
import { CATEGORY_CATALOG, isServiceCategory, SERVICE_CATEGORIES, subcategoriesFor, type ListingKind, type ServiceCategory } from "../service-taxonomy";

export type ServiceDraft = {
  title: string;
  description: string;
  category?: ServiceCategory | string;
  subcategory?: string;
  availability?: string;
  price?: string;
  imageDataUrl?: string;
};

export type GeminiSource = "gemini" | "deterministic-fallback";

export type GeminiSuggestion = {
  category: ServiceCategory;
  subcategory: string;
  tags: string[];
  suggestedTitle: string;
  riskFlags: string[];
  searchKeywords: string[];
  suggestedPriceNote: string;
  availabilityNote: string;
  explanation: string;
  source: GeminiSource;
};

export type AvailabilityFilter = "now" | "today" | "this-week" | "any";

/** Strict, privacy-safe output for natural-language discovery. Null means unspecified. */
export type GeminiDiscoveryFilters = {
  query: string;
  category: ServiceCategory | null;
  subcategory: string | null;
  radiusMiles: number | null;
  minimumRating: number | null;
  availability: AvailabilityFilter | null;
  listingKind: ListingKind | "all" | null;
  source: GeminiSource;
};

export type ApprovedRecommendationSignals = {
  title: string;
  category: ServiceCategory;
  subcategory?: string;
  approvedInterests?: string[];
  /** Coarse, aggregate signals only. Raw coordinates, identity, and private content are not accepted. */
  distanceBand?: "on-campus" | "nearby" | "within-campus-area" | "far";
  ratingBand?: "new" | "4+" | "4.5+" | "high";
  responseBand?: "under-15m" | "15-60m" | "over-60m" | "unknown";
  completedCountBand?: "none" | "1-10" | "11-50" | "50+";
  deterministicExplanation: string;
};

export type RecommendationExplanation = {
  explanation: string;
  source: GeminiSource;
};

const FALLBACK_CATEGORIES: ReadonlyArray<readonly [string, ServiceCategory, string]> = [
  ["math", "Tutoring", "Exam prep"], ["tutoring", "Tutoring", "Tutoring"], ["programming", "Services", "Tech help"],
  ["code", "Services", "Tech help"], ["laptop", "Services", "Tech help"], ["computer", "Services", "Tech help"],
  ["ride", "Help", "Quick ride"], ["airport", "Help", "Quick ride"], ["photo", "Services", "Photography"],
  ["design", "Services", "Photography"], ["video", "Services", "Photography"], ["move", "Services", "Moving help"],
  ["moving", "Services", "Moving help"], ["clean", "Services", "Cleaning"], ["hair", "Services", "Hair & nails"],
  ["party", "Social", "Parties"], ["hangout", "Social", "Hangouts"], ["chess", "Clubs", "Chess"],
  ["basketball", "Activities", "Basketball"], ["soccer", "Activities", "Soccer"], ["restaurant", "Businesses", "Restaurants"],
  ["coffee", "Businesses", "Coffee & snacks"], ["volunteer", "Volunteer", "Community projects"], ["event", "Events", "Campus events"],
] as const;
const LEGACY_CATEGORY_ALIASES: Record<string, { category: ServiceCategory; subcategory: string }> = {
  "Tech help": { category: "Services", subcategory: "Tech help" }, Ride: { category: "Help", subcategory: "Quick ride" },
  Creative: { category: "Services", subcategory: "Photography" }, Moving: { category: "Services", subcategory: "Moving help" },
  Other: { category: "Help", subcategory: "Other request" },
};
const STOP_WORDS = new Set(["the", "and", "for", "with", "need", "find", "looking", "want", "please", "near", "around", "campus", "a", "an", "me", "show", "get", "give", "available", "today", "tonight", "now"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-])\d{3}[\s.-]\d{4}(?!\d)/g;
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const COORDINATE_PATTERN = /(?<![\w.-])[-+]?\d{1,3}\.\d{3,}\s*[,/]\s*[-+]?\d{1,3}\.\d{3,}(?![\w.-])/g;
const PRIVATE_CONTENT_PATTERN = /\bprivate\s+(?:chat|message|conversation)s?\b/gi;

function cleanText(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function privacySafeText(value: unknown, max: number) {
  return cleanText(value, max).replace(EMAIL_PATTERN, "[email omitted]").replace(PHONE_PATTERN, "[phone omitted]").replace(URL_PATTERN, "[link omitted]").replace(COORDINATE_PATTERN, "[location omitted]").replace(PRIVATE_CONTENT_PATTERN, "[private content omitted]");
}

function canonicalCategory(value: unknown): ServiceCategory | undefined {
  const raw = cleanText(value, 80);
  if (isServiceCategory(raw)) return raw;
  const found = SERVICE_CATEGORIES.find((category) => category.toLowerCase() === raw.toLowerCase());
  return found ?? LEGACY_CATEGORY_ALIASES[raw]?.category;
}

function canonicalSubcategory(category: ServiceCategory, value: unknown) {
  const raw = cleanText(value, 100);
  return subcategoriesFor(category).find((item) => item.label.toLowerCase() === raw.toLowerCase())?.label;
}

function safeTitle(value: unknown) {
  const title = privacySafeText(value, 100).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return title || "Student service";
}

function words(value: string) {
  return value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
}

function riskFlagsFor(draft: { title: string; description: string; price?: string }) {
  const text = `${draft.title} ${draft.description} ${draft.price ?? ""}`.toLowerCase();
  const flags: string[] = [];
  if (/exam|quiz|homework|assignment|answer key|take.*test|cheat/.test(text) && /do(?: it| my)?|complete|submit|answers?|take.*for me|guarantee/.test(text)) flags.push("academic-integrity-review");
  if (/cashapp|venmo|zelle|crypto|wire|gift card|password|login|account credentials/.test(text)) flags.push("payment-or-credential-safety-review");
  if (/weapon|firearm|drug|pill|illegal|escort|adult service/.test(text)) flags.push("prohibited-or-unsafe-content-review");
  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || URL_PATTERN.test(text) || /\b(?:email|phone|text|call)\b/.test(text)) flags.push("personal-contact-info-review");
  EMAIL_PATTERN.lastIndex = PHONE_PATTERN.lastIndex = URL_PATTERN.lastIndex = 0;
  return flags;
}

function notesFor(draft: ServiceDraft) {
  return {
    suggestedPriceNote: cleanText(draft.price, 160)
      ? "Keep the amount clearly labeled as a suggestion and confirm payment details in chat."
      : "Say whether the offer is free or paid; agree on any amount in chat.",
    availabilityNote: cleanText(draft.availability, 160) || "Add a specific time window so students know when this is available.",
  };
}

export function deterministicSuggestion(draft: ServiceDraft): GeminiSuggestion {
  const title = privacySafeText(draft.title, 160);
  const description = privacySafeText(draft.description, 2_000);
  const haystack = `${title} ${description}`.toLowerCase();
  const explicitCategory = canonicalCategory(draft.category);
  const explicitSubcategory = explicitCategory ? canonicalSubcategory(explicitCategory, draft.subcategory) : undefined;
  const match = FALLBACK_CATEGORIES.find(([keyword]) => haystack.includes(keyword));
  const category = explicitCategory ?? match?.[1] ?? "Help";
  const subcategory = explicitSubcategory ?? (explicitCategory ? subcategoriesFor(explicitCategory)[0].label : match?.[2] ?? "Other request");
  const tagWords = words(haystack).filter((word) => !STOP_WORDS.has(word));
  const tags = [...new Set([subcategory.toLowerCase(), ...tagWords])].slice(0, 8);
  const searchKeywords = [...new Set([category.toLowerCase(), subcategory.toLowerCase(), ...tags])].slice(0, 12);
  const notes = notesFor(draft);
  return {
    category, subcategory, tags: tags.length ? tags : [subcategory.toLowerCase()], suggestedTitle: safeTitle(title),
    riskFlags: riskFlagsFor({ title, description, price: draft.price }), searchKeywords,
    ...notes,
    explanation: `Matched ${category} / ${subcategory} from the offer text. Review the title, scope, price and availability before publishing.`,
    source: "deterministic-fallback",
  };
}

function parseModelText(value: unknown): unknown {
  if (typeof value !== "string") return null;
  const withoutFence = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(withoutFence); } catch { return null; }
}

function stringArray(value: unknown, max: number, itemMax = 80) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => privacySafeText(item, itemMax)).filter(Boolean))].slice(0, max);
}

function validateSuggestion(value: unknown, fallback: GeminiSuggestion): GeminiSuggestion {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const category = canonicalCategory(candidate.category);
  const subcategory = category && canonicalSubcategory(category, candidate.subcategory);
  const rawSuggestedTitle = privacySafeText(candidate.suggestedTitle, 100);
  const suggestedTitle = safeTitle(rawSuggestedTitle);
  const tags = stringArray(candidate.tags, 12);
  const riskFlags = stringArray(candidate.riskFlags, 12);
  const searchKeywords = stringArray(candidate.searchKeywords, 12);
  // The first generation of this endpoint did not ask for notes/explanation. Keep
  // accepting that response shape while the richer prompt rolls out everywhere.
  const suggestedPriceNote = privacySafeText(candidate.suggestedPriceNote, 180) || fallback.suggestedPriceNote;
  const availabilityNote = privacySafeText(candidate.availabilityNote, 180) || fallback.availabilityNote;
  const explanation = privacySafeText(candidate.explanation, 300) || fallback.explanation;
  if (!category || !subcategory || !rawSuggestedTitle || tags.length === 0 || searchKeywords.length === 0) return fallback;
  return { category, subcategory, suggestedTitle, tags, riskFlags, searchKeywords, suggestedPriceNote, availabilityNote, explanation, source: "gemini" };
}

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
function modelText(body: GeminiResponse) { return body.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text; }

function validateDraft(draft: ServiceDraft) {
  if (!draft || typeof draft !== "object") throw new IntegrationError("invalid_response", "A JSON object is required.", 400);
  if ((draft.title !== undefined && typeof draft.title !== "string") || (draft.description !== undefined && typeof draft.description !== "string") ||
      (typeof draft.title === "string" && draft.title.length > 160) || (typeof draft.description === "string" && draft.description.length > 2_000) ||
      (draft.category !== undefined && typeof draft.category !== "string") || (draft.subcategory !== undefined && typeof draft.subcategory !== "string") ||
      (draft.availability !== undefined && typeof draft.availability !== "string") || (draft.price !== undefined && typeof draft.price !== "string")) {
    throw new IntegrationError("invalid_response", "Listing fields exceed their limits or have an invalid type.", 400);
  }
  const title = cleanText(draft.title, 160);
  const description = cleanText(draft.description, 2_000);
  if (!title && !description) throw new IntegrationError("invalid_response", "A title or description is required.", 400);
  if (draft.imageDataUrl !== undefined && (typeof draft.imageDataUrl !== "string" || !draft.imageDataUrl.startsWith("data:image/") || draft.imageDataUrl.length > 4_000_000)) {
    throw new IntegrationError("invalid_response", "The image must be a small data URL.", 400);
  }
  return { ...draft, title, description, category: cleanText(draft.category, 80), subcategory: cleanText(draft.subcategory, 100), availability: cleanText(draft.availability, 160), price: cleanText(draft.price, 160) };
}

async function callGemini(prompt: string, responseSchema: Record<string, unknown>, extraParts: Array<Record<string, unknown>> = []) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...extraParts] }], generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 } }),
    }, 6_000);
    const body = await readJson<GeminiResponse>(response);
    const raw = modelText(body);
    // Listing/discovery use JSON, while older explanation deployments returned
    // a plain sentence. Preserve that harmless response for compatibility.
    return parseModelText(raw) ?? (typeof raw === "string" ? raw : null);
  } catch { return null; }
}

export async function suggestService(draft: ServiceDraft): Promise<GeminiSuggestion> {
  const valid = validateDraft(draft);
  const fallback = deterministicSuggestion(valid);
  const taxonomy = Object.fromEntries(CATEGORY_CATALOG.map((item) => [item.id, item.subcategories.map((subcategory) => subcategory.label)]));
  const prompt = [
    "You are a cautious campus marketplace listing assistant. Return JSON only.",
    "Create a safe concise title (no email, phone, URL, private contact, or unsupported promises), exact taxonomy pair, useful tags/search keywords, risk flags, a price note, availability note, and a factual explanation.",
    "Never complete graded work, ask for credentials, or invent prices, times, ratings, or safety guarantees.",
    `Taxonomy: ${JSON.stringify(taxonomy)}`,
    `Title: ${privacySafeText(valid.title, 160)}`, `Description: ${privacySafeText(valid.description, 2_000)}`,
    `Existing category: ${privacySafeText(valid.category, 80)}`, `Existing subcategory: ${privacySafeText(valid.subcategory, 100)}`,
    `Availability: ${privacySafeText(valid.availability, 160)}`, `Price: ${privacySafeText(valid.price, 160)}`,
  ].join("\n");
  const schema = { type: "OBJECT", properties: {
    category: { type: "STRING", enum: [...SERVICE_CATEGORIES] }, subcategory: { type: "STRING" },
    tags: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 }, suggestedTitle: { type: "STRING" },
    riskFlags: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 }, searchKeywords: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 },
    suggestedPriceNote: { type: "STRING" }, availabilityNote: { type: "STRING" }, explanation: { type: "STRING" },
  }, required: ["category", "subcategory", "tags", "suggestedTitle", "riskFlags", "searchKeywords", "suggestedPriceNote", "availabilityNote", "explanation"] };
  const value = await callGemini(prompt, schema, valid.imageDataUrl && /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.test(valid.imageDataUrl)
    ? [{ inline_data: { mime_type: valid.imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1], data: valid.imageDataUrl.split(",", 2)[1] } }]
    : []);
  return validateSuggestion(value, fallback);
}

function emptyDiscovery(): Omit<GeminiDiscoveryFilters, "source"> {
  return { query: "", category: null, subcategory: null, radiusMiles: null, minimumRating: null, availability: null, listingKind: null };
}

// Keep Gemini's structured output inside the exact repository filter contract.
// A model response must never produce a value that the service-list RPC rejects.
const DISCOVERY_QUERY_MAX_LENGTH = 120;
const DISCOVERY_RADIUS_MAX_MILES = 50;

function categoryFromText(text: string) {
  const lower = text.toLowerCase();
  const direct = CATEGORY_CATALOG.find((item) => lower.includes(item.id.toLowerCase()) || lower.includes(item.label.toLowerCase()));
  const match = FALLBACK_CATEGORIES.find(([keyword]) => lower.includes(keyword));
  return direct?.id ?? match?.[1] ?? null;
}

function subcategoryFromText(text: string, category: ServiceCategory | null) {
  if (category) {
    const lower = text.toLowerCase();
    const keyword = FALLBACK_CATEGORIES.find(([word, mappedCategory]) => lower.includes(word) && mappedCategory === category);
    if (keyword) return keyword[2];
    const direct = subcategoriesFor(category).find((item) => lower.includes(item.label.toLowerCase()));
    if (direct) return direct.label;
  }
  const match = FALLBACK_CATEGORIES.find(([keyword]) => text.toLowerCase().includes(keyword));
  return match && (!category || match[1] === category) ? match[2] : null;
}

function normalizeDiscoveryQuery(text: string, category: ServiceCategory | null, subcategory: string | null) {
  let query = privacySafeText(text, DISCOVERY_QUERY_MAX_LENGTH)
    .replace(/(?:within|under|less than|near)\s*\d+(?:\.\d+)?\s*(?:miles|mile|mi)?/gi, " ")
    .replace(/(?:at least|minimum|min|over|above|rated)?\s*\d(?:\.\d+)?\s*(?:\+?\s*)?(?:stars?|\/\s*5)/gi, " ")
    .replace(/\b(?:available now|right now|asap|immediately|today|tonight|this evening|this week|weekend)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  if (category && subcategory) {
    const categoryLabel = CATEGORY_CATALOG.find((item) => item.id === category)?.label;
    const taxonomyPhrases = [category, categoryLabel, subcategory]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.length - left.length);
    for (const phrase of taxonomyPhrases) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query = query.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
    }
    query = query.split(/\s+/).filter((word) => !STOP_WORDS.has(word.toLowerCase())).join(" ");
  }
  return query.replace(/\s+/g, " ").trim().slice(0, DISCOVERY_QUERY_MAX_LENGTH);
}

function deterministicDiscovery(query: string): GeminiDiscoveryFilters {
  const text = privacySafeText(query, 500);
  const result = emptyDiscovery();
  const radius = text.match(/(?:within|under|less than|near)\s*(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)?/i);
  const rating = text.match(/(?:at least|minimum|min|over|above|rated)\s*(\d(?:\.\d+)?)\s*(?:stars?|\/\s*5)?/i) ?? text.match(/(\d(?:\.\d+)?)\s*\+?\s*stars?/i);
  const lower = text.toLowerCase();
  result.category = categoryFromText(lower);
  result.subcategory = subcategoryFromText(lower, result.category);
  result.query = normalizeDiscoveryQuery(text, result.category, result.subcategory);
  result.radiusMiles = radius ? Math.min(DISCOVERY_RADIUS_MAX_MILES, Math.max(0, Number(radius[1]))) : null;
  result.minimumRating = rating ? Math.min(5, Math.max(0, Number(rating[1]))) : null;
  result.availability = /available now|right now|asap|immediately/.test(lower) ? "now" : /today|tonight|this evening/.test(lower) ? "today" : /this week|weekend/.test(lower) ? "this-week" : null;
  result.listingKind = /permanent|business|restaurant|shop|store|coffee/.test(lower) ? "permanent" : /temporary|one[- ]off|gig|event|today|tonight/.test(lower) ? "temporary" : null;
  return { ...result, source: "deterministic-fallback" };
}

function validateDiscovery(value: unknown, fallback: GeminiDiscoveryFilters): GeminiDiscoveryFilters {
  if (!value || typeof value !== "object") return fallback;
  const input = value as Record<string, unknown>;
  const requiredFields = ["query", "category", "subcategory", "radiusMiles", "minimumRating", "availability", "listingKind"];
  if (!requiredFields.every((field) => Object.prototype.hasOwnProperty.call(input, field))) return fallback;
  if (typeof input.query !== "string") return fallback;
  const category: ServiceCategory | null = input.category === null || input.category === undefined || input.category === "" ? null : canonicalCategory(input.category) ?? null;
  const subcategory: string | null = category && input.subcategory ? canonicalSubcategory(category, input.subcategory) ?? null : null;
  const query = normalizeDiscoveryQuery(input.query, category, subcategory);
  const radius = input.radiusMiles === null || input.radiusMiles === undefined || input.radiusMiles === "" ? null : typeof input.radiusMiles === "number" ? input.radiusMiles : NaN;
  const rating = input.minimumRating === null || input.minimumRating === undefined || input.minimumRating === "" ? null : typeof input.minimumRating === "number" ? input.minimumRating : NaN;
  const availability = input.availability === null || input.availability === undefined || input.availability === "" ? null : input.availability;
  const listingKind = input.listingKind === null || input.listingKind === undefined || input.listingKind === "" ? null : input.listingKind;
  if ((radius !== null && (!Number.isFinite(radius) || radius < 0 || radius > DISCOVERY_RADIUS_MAX_MILES)) || (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) || (availability !== null && !["now", "today", "this-week", "any"].includes(String(availability))) || (listingKind !== null && !["temporary", "permanent", "all"].includes(String(listingKind))) || (input.category != null && input.category !== "" && !category) || (input.subcategory != null && input.subcategory !== "" && !subcategory)) return fallback;
  return { query, category, subcategory, radiusMiles: radius === null ? null : Number(radius.toFixed(2)), minimumRating: rating === null ? null : Number(rating.toFixed(1)), availability: availability as AvailabilityFilter | null, listingKind: listingKind as ListingKind | "all" | null, source: "gemini" };
}

export async function parseNaturalLanguageDiscovery(query: string): Promise<GeminiDiscoveryFilters> {
  if (typeof query !== "string" || query.length > 500) throw new IntegrationError("invalid_response", "The discovery query is limited to 500 characters.", 400);
  const input = cleanText(query, 500);
  if (!input) throw new IntegrationError("invalid_response", "A discovery query is required.", 400);
  const fallback = deterministicDiscovery(input);
  const taxonomy = Object.fromEntries(CATEGORY_CATALOG.map((item) => [item.id, item.subcategories.map((subcategory) => subcategory.label)]));
  const value = await callGemini(["Parse this campus marketplace search into strict filters. Return JSON only.", "Do not infer identity, exact location, email, phone, or private conversation data. Use null for unspecified fields.", `Taxonomy: ${JSON.stringify(taxonomy)}`, `Search: ${privacySafeText(input, 500)}`].join("\n"), {
    type: "OBJECT", properties: { query: { type: "STRING" }, category: { type: "STRING", nullable: true }, subcategory: { type: "STRING", nullable: true }, radiusMiles: { type: "NUMBER", nullable: true }, minimumRating: { type: "NUMBER", nullable: true }, availability: { type: "STRING", nullable: true, enum: ["now", "today", "this-week", "any"] }, listingKind: { type: "STRING", nullable: true, enum: ["temporary", "permanent", "all"] } }, required: ["query", "category", "subcategory", "radiusMiles", "minimumRating", "availability", "listingKind"]
  });
  return validateDiscovery(value, fallback);
}

function validApprovedInterests(interests: unknown) {
  if (!Array.isArray(interests)) return [];
  return [...new Set(interests.filter((item): item is string => typeof item === "string").map((item) => privacySafeText(item, 48)).filter(Boolean))].slice(0, 8);
}

function limitWords(value: string, maximum: number) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, maximum).join(" ");
}

export async function explainRecommendation(input: ApprovedRecommendationSignals): Promise<RecommendationExplanation> {
  const fallback = limitWords(privacySafeText(input.deterministicExplanation, 180) || `A ${input.category.toLowerCase()} option matched your selected preferences.`, 24);
  const interests = validApprovedInterests(input.approvedInterests);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { explanation: fallback, source: "deterministic-fallback" };
  const prompt = [
    "Write one factual campus recommendation explanation under 24 words.",
    "Use only the approved coarse interests and aggregate bands below. Never mention identity, email, exact coordinates, or confidential conversation content.",
    `Title: ${safeTitle(input.title)}`, `Category: ${input.category}`, `Subcategory: ${privacySafeText(input.subcategory, 100)}`,
    `Approved coarse interests: ${JSON.stringify(interests)}`, `Distance band: ${input.distanceBand ?? "unknown"}`,
    `Rating band: ${input.ratingBand ?? "unknown"}`, `Response band: ${input.responseBand ?? "unknown"}`, `Completed band: ${input.completedCountBand ?? "unknown"}`,
    `Fallback explanation: ${fallback}`,
  ].join("\n");
  const value = await callGemini(prompt, { type: "OBJECT", properties: { explanation: { type: "STRING", maxLength: 180 } }, required: ["explanation"] });
  const generated = typeof value === "string"
    ? privacySafeText(value, 180)
    : value && typeof value === "object" && typeof (value as Record<string, unknown>).explanation === "string"
      ? privacySafeText((value as Record<string, unknown>).explanation, 180)
      : "";
  return generated ? { explanation: limitWords(generated, 24), source: "gemini" } : { explanation: fallback, source: "deterministic-fallback" };
}

export { deterministicDiscovery, validateDiscovery, validateDraft };
