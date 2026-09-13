import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deterministicSuggestion,
  explainRecommendation,
  parseNaturalLanguageDiscovery,
  suggestService,
} from "./gemini";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Gemini discovery parser", () => {
  it("extracts bounded filters and exact taxonomy in deterministic mode", async () => {
    const result = await parseNaturalLanguageDiscovery("Find math tutoring within 2 miles rated 4.5 stars today");
    expect(result).toEqual(expect.objectContaining({
      category: "Tutoring",
      subcategory: "Exam prep",
      radiusMiles: 2,
      minimumRating: 4.5,
      availability: "today",
      listingKind: "temporary",
      source: "deterministic-fallback",
    }));
  });

  it("accepts only a valid model object and labels the source", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      query: "coffee", category: "Businesses", subcategory: "Coffee & snacks", radiusMiles: 1.5,
      minimumRating: 4, availability: "any", listingKind: "permanent",
    }) }] } }] }), { status: 200 })));
    await expect(parseNaturalLanguageDiscovery("coffee")).resolves.toEqual({
      query: "coffee", category: "Businesses", subcategory: "Coffee & snacks", radiusMiles: 1.5,
      minimumRating: 4, availability: "any", listingKind: "permanent", source: "gemini",
    });
  });

  it("removes structured radius, rating and time phrases from a valid model query", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      query: "calculus within 2 miles rated 4.5 stars today", category: "Tutoring", subcategory: "Exam prep",
      radiusMiles: 2, minimumRating: 4.5, availability: "today", listingKind: "temporary",
    }) }] } }] }), { status: 200 })));
    await expect(parseNaturalLanguageDiscovery("calculus near me")).resolves.toMatchObject({
      query: "calculus", radiusMiles: 2, minimumRating: 4.5, availability: "today", source: "gemini",
    });
  });

  it("removes redundant taxonomy phrases and rejects a non-string model query", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        query: "calculus tutoring exam prep", category: "Tutoring", subcategory: "Exam prep",
        radiusMiles: null, minimumRating: null, availability: null, listingKind: "temporary",
      }) }] } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        query: { unsafe: true }, category: "Tutoring", subcategory: "Exam prep",
        radiusMiles: null, minimumRating: null, availability: null, listingKind: null,
      }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(parseNaturalLanguageDiscovery("calculus tutoring exam prep")).resolves.toMatchObject({ query: "calculus", source: "gemini" });
    await expect(parseNaturalLanguageDiscovery("math tutoring")).resolves.toMatchObject({ source: "deterministic-fallback" });
  });

  it("falls back when Gemini returns malformed or out-of-range filters", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), { status: 200 })));
    await expect(parseNaturalLanguageDiscovery("a ride within 3 miles")).resolves.toMatchObject({
      radiusMiles: 3, category: "Help", subcategory: "Quick ride", source: "deterministic-fallback",
    });
    await expect(parseNaturalLanguageDiscovery("x".repeat(501))).rejects.toThrow("500 characters");
  });

  it("never emits filters beyond the service repository contract", async () => {
    const fallback = await parseNaturalLanguageDiscovery(`Find ${"quiet study help ".repeat(15)}within 90 miles`);
    expect(fallback.query.length).toBeLessThanOrEqual(120);
    expect(fallback.radiusMiles).toBe(50);

    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      query: "x".repeat(180), category: null, subcategory: null, radiusMiles: 51,
      minimumRating: null, availability: null, listingKind: null,
    }) }] } }] }), { status: 200 })));
    await expect(parseNaturalLanguageDiscovery("nearby help")).resolves.toMatchObject({
      radiusMiles: null,
      source: "deterministic-fallback",
    });
  });
});

describe("Gemini listing assistant", () => {
  it("returns a useful bounded listing contract with safety flags", () => {
    const result = deterministicSuggestion({ title: "Do my exam for me", description: "Send payment by Venmo and share your email" });
    expect(result).toMatchObject({ source: "deterministic-fallback", suggestedPriceNote: expect.any(String), availabilityNote: expect.any(String), explanation: expect.any(String) });
    expect(result.riskFlags).toEqual(expect.arrayContaining(["academic-integrity-review", "payment-or-credential-safety-review", "personal-contact-info-review"]));
    expect(result.suggestedTitle).not.toContain("@");
  });

  it("redacts direct contact data from model input and accepts the richer response", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      category: "Services", subcategory: "Tech help", tags: ["python"], suggestedTitle: "Debug Python code",
      riskFlags: [], searchKeywords: ["python", "debug"], suggestedPriceNote: "Confirm amount in chat.", availabilityNote: "Today after 5 PM.", explanation: "A focused Python debugging service.",
    }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(suggestService({ title: "Debug Python (a@ttu.edu)", description: "Help at 806-555-1212; https://private.example", availability: "Today after 5 PM" })).resolves.toMatchObject({ source: "gemini", suggestedPriceNote: expect.any(String) });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.contents[0].parts[0].text).not.toContain("a@ttu.edu");
    expect(request.contents[0].parts[0].text).not.toContain("private.example");
  });

  it("redacts international contacts, addresses, named-person cues, rooms, and pasted chat lines", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      category: "Tutoring", subcategory: "Tutoring", tags: ["study"], suggestedTitle: "Study session",
      riskFlags: [], searchKeywords: ["study"], suggestedPriceNote: "Confirm the amount in chat.", availabilityNote: "Today.", explanation: "A focused study session.",
    }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await suggestService({
      title: "Meet with Jordan Lee",
      description: "Come to 2417 Broadway Avenue, Room 204. Call +44 20 7946 0958.\nJordan: paste the private answer here",
    });
    const prompt = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).contents[0].parts[0].text as string;
    expect(prompt).not.toContain("Jordan Lee");
    expect(prompt).not.toContain("Broadway Avenue");
    expect(prompt).not.toContain("Room 204");
    expect(prompt).not.toContain("7946 0958");
    expect(prompt).not.toContain("private answer here");
    expect(prompt).toContain("[name omitted]");
    expect(prompt).toContain("[address omitted]");
    expect(prompt).toContain("[phone omitted]");
    expect(prompt).toContain("[private content omitted]");
  });

  it("rejects oversized listing input before contacting Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(suggestService({ title: "x".repeat(161), description: "valid" })).rejects.toThrow("limits");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("recommendation explanation privacy contract", () => {
  const input = {
    title: "Python study help", category: "Tutoring" as const, subcategory: "Coding help",
    approvedInterests: ["coding", "study"], distanceBand: "nearby" as const, ratingBand: "4.5+" as const,
    responseBand: "under-15m" as const, completedCountBand: "11-50" as const,
    deterministicExplanation: "Matches your coding interest and is nearby.",
  };

  it("uses deterministic fallback without a key", async () => {
    await expect(explainRecommendation(input)).resolves.toEqual({ explanation: input.deterministicExplanation, source: "deterministic-fallback" });
  });

  it("enforces the promised 24-word explanation limit", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const long = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: long }) }] } }] }), { status: 200 })));
    const result = await explainRecommendation(input);
    expect(result.explanation.split(/\s+/)).toHaveLength(24);
  });

  it("sends only approved interests and coarse aggregate bands to Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ explanation: "A nearby highly rated coding option matches your interests." }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(explainRecommendation({ ...input, title: "Python study help <private chat>", deterministicExplanation: "Do not expose 33.123,-101.123 or a@ttu.edu" })).resolves.toMatchObject({ source: "gemini" });
    const prompt = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).contents[0].parts[0].text as string;
    expect(prompt).toContain("coding");
    expect(prompt).toContain("nearby");
    expect(prompt).not.toContain("33.123");
    expect(prompt).not.toContain("a@ttu.edu");
    expect(prompt).not.toContain("private chat");
  });
});
