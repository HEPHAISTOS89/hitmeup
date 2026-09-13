import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequest, getCosmeticQuote, getServices, postMessage, submitRating, suggestServiceDraft, unlockCosmetic } from "./client-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("frontend API contract", () => {
  it("normalizes the public service DTO without inventing an exact position", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      services: [{
        id: "service-1",
        provider: { name: "Alex P.", initials: "AP", verified: true, rating: 4.9, ratingCount: 12, completed: 8 },
        title: "Python debugging",
        description: "Trace one failing assignment.",
        category: "Tech help",
        priceNote: "$18 / hour",
        availability: "Today after 5 PM",
        scheduledFor: null,
        distanceMiles: 0.6,
        approximatePosition: [33.584, -101.878],
        type: "One-off",
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [service] = await getServices({ category: "Tech help", maxDistanceMiles: 3 });

    expect(fetchMock).toHaveBeenCalledWith("/api/data/services?category=Tech+help&maxDistanceMiles=3", expect.objectContaining({ credentials: "same-origin" }));
    expect(service).toMatchObject({ price: "$18 / hour", accent: "#1d7a67", tags: ["One-off", "Available"] });
    expect(service).not.toHaveProperty("exactPoint");
  });

  it("preserves backend status and error codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Complete your required rating first.", code: "rating_required" }, 409)));

    await expect(createRequest("service-1")).rejects.toEqual(expect.objectContaining({
      name: "ApiError",
      message: "Complete your required rating first.",
      status: 409,
      code: "rating_required",
    }));
  });

  it("posts request messages to the participant-scoped route", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "message-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await postMessage("request-1", "Meet by the engineering key?");

    expect(fetchMock).toHaveBeenCalledWith("/api/data/requests/request-1/messages", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ body: "Meet by the engineering key?" }),
    }));
  });

  it("submits the optional rating comment through the participant-scoped route", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "rating-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await submitRating("request-1", 5, "Helpful and respectful.");
    expect(fetchMock).toHaveBeenCalledWith("/api/data/requests/request-1/ratings", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ score: 5, comment: "Helpful and respectful." }),
    }));
  });

  it("requests an authenticated Devnet quote for the selected catalog SKU", async () => {
    const quote = {
      network: "devnet",
      productId: "profile-frame",
      label: "Profile frame",
      lamports: 10_000_000,
      treasury: "11111111111111111111111111111111",
    } as const;
    const fetchMock = vi.fn(async () => jsonResponse(quote));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCosmeticQuote("profile-frame")).resolves.toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/solana/quote", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ productId: "profile-frame" }),
    }));
  });

  it("keeps the backend configuration state when a Devnet quote is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      error: "A Devnet treasury is not configured.",
      code: "configuration",
    }, 503)));

    await expect(getCosmeticQuote("profile-frame")).rejects.toEqual(expect.objectContaining({
      status: 503,
      code: "configuration",
      message: "A Devnet treasury is not configured.",
    }));
  });

  it("submits only the selected SKU and user-provided signature for server verification", async () => {
    const result = {
      verified: true,
      network: "devnet",
      productId: "profile-frame",
      label: "Profile frame",
      lamports: 10_000_000,
      slot: 42,
      customizationId: "customization-1",
    } as const;
    const fetchMock = vi.fn(async () => jsonResponse(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(unlockCosmetic("profile-frame", "real-wallet-signature")).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/solana/unlock", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ productId: "profile-frame", signature: "real-wallet-signature" }),
    }));
  });

  it("preserves the server label for Gemini or its deterministic fallback", async () => {
    const suggestion = {
      category: "Tech help",
      tags: ["python"],
      suggestedTitle: "Debug one Python assignment",
      riskFlags: [],
      searchKeywords: ["python", "debug"],
      source: "deterministic-fallback",
    } as const;
    const fetchMock = vi.fn(async () => jsonResponse(suggestion));
    vi.stubGlobal("fetch", fetchMock);

    await expect(suggestServiceDraft({ title: "Python", description: "Help debug code" })).resolves.toEqual(suggestion);
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/gemini", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Python", description: "Help debug code" }),
    }));
  });
});
