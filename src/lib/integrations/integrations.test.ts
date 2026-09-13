import { afterEach, describe, expect, it, vi } from "vitest";
import { isVerifiedStudent, sanitizeSessionUser, verifiedStudentFromSessionClaims } from "../auth0";
import { deterministicSuggestion, suggestService } from "./gemini";
import { appendTigerEvent, bindTigerActor, recordTigerEvent } from "./tiger";
import { getCosmeticQuote, verifyCosmeticPayment } from "./solana";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Auth0 student boundary", () => {
  it("keeps only the minimal profile and student-gate claims in the encrypted session", () => {
    const user = sanitizeSessionUser({
      sub: "waad|student",
      email: "a@ttu.edu",
      email_verified: true,
      "https://hitmeup.tech/role": "authenticated",
      "https://hitmeup.tech/edu_domain": "ttu.edu",
      "https://hitmeup.tech/connection_strategy": "waad",
      "https://hitmeup.tech/tid": "ttu-tenant",
      incidental_claim: "must-not-enter-the-session-cookie",
    } as never) as Record<string, unknown>;

    expect(user).toMatchObject({
      sub: "waad|student",
      email: "a@ttu.edu",
      "https://hitmeup.tech/role": "authenticated",
      "https://hitmeup.tech/connection_strategy": "waad",
      "https://hitmeup.tech/tid": "ttu-tenant",
    });
    expect(user).not.toHaveProperty("incidental_claim");
  });

  it("requires a verified email on an approved edu domain", () => {
    expect(isVerifiedStudent({ sub: "student", email: "a@ttu.edu", email_verified: true })).toMatchObject({ eduDomain: "ttu.edu" });
    expect(isVerifiedStudent({ sub: "student", email: "a@ttu.edu", email_verified: false })).toBeNull();
    expect(isVerifiedStudent({ sub: "student", email: "a@gmail.com", email_verified: true })).toBeNull();
  });

  it("requires the server role and an approved Microsoft connection strategy", () => {
    const base = { sub: "auth0|student", email: "a@ttu.edu", email_verified: true, role: "authenticated" };
    expect(verifiedStudentFromSessionClaims({ ...base, connection_strategy: "waad" } as never)).toMatchObject({ eduDomain: "ttu.edu" });
    expect(verifiedStudentFromSessionClaims({ ...base, connection_strategy: "google-oauth2" } as never)).toBeNull();
    expect(verifiedStudentFromSessionClaims({ ...base, role: "guest", connection_strategy: "waad" } as never)).toBeNull();
  });

  it("enforces the configured Microsoft tenant when present", () => {
    vi.stubEnv("AUTH0_MICROSOFT_TID", "ttu-tenant");
    const base = { sub: "auth0|student", email: "a@ttu.edu", email_verified: true, role: "authenticated", connection_strategy: "waad" };
    expect(verifiedStudentFromSessionClaims({ ...base, tid: "ttu-tenant" } as never)).not.toBeNull();
    expect(verifiedStudentFromSessionClaims({ ...base, tid: "other" } as never)).toBeNull();
  });
});

describe("Gemini integration", () => {
  it("returns a deterministic classification when Gemini is not configured", async () => {
    const suggestion = await suggestService({ title: "Laptop repair", description: "Help with a slow computer" });
    expect(suggestion.source).toBe("deterministic-fallback");
    expect(suggestion.category).toBe("Services");
    expect(suggestion.subcategory).toBe("Tech help");
  });

  it("normalizes legacy model categories into the current taxonomy", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        category: "Tech help",
        subcategory: "Tech help",
        tags: ["laptop"],
        suggestedTitle: "Laptop setup",
        riskFlags: [],
        searchKeywords: ["laptop"],
      }) }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(suggestService({ title: "Laptop setup", description: "Help with a slow computer" })).resolves.toMatchObject({
      source: "gemini",
      category: "Services",
      subcategory: "Tech help",
    });
  });

  it("does not hide fallback behavior behind an AI label", () => {
    expect(deterministicSuggestion({ title: "", description: "Math tutoring" }).source).toBe("deterministic-fallback");
  });
});

describe("Solana Devnet boundary", () => {
  it("returns an authenticated-client quote from server-only Devnet configuration", () => {
    vi.stubEnv("SOLANA_TREASURY", "11111111111111111111111111111111");
    expect(getCosmeticQuote("profile-frame")).toEqual({
      network: "devnet",
      productId: "profile-frame",
      label: "Profile frame",
      lamports: 10_000_000,
      treasury: "11111111111111111111111111111111",
    });
  });

  it("rejects non-Devnet configuration before making an RPC request", async () => {
    vi.stubEnv("SOLANA_TREASURY", "11111111111111111111111111111111");
    vi.stubEnv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
    await expect(verifyCosmeticPayment("2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2", "profile-frame", "11111111111111111111111111111111")).rejects.toThrow("restricted to Devnet");
  });

  it("requires a confirmed transfer to the configured treasury", async () => {
    vi.stubEnv("SOLANA_TREASURY", "11111111111111111111111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { slot: 42, meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: "11111111111111111111111111111111", signer: false }, { pubkey: "22222222222222222222222222222222", signer: true }], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: "22222222222222222222222222222222", destination: "11111111111111111111111111111111", lamports: 10_000_000 } } }] } } } }), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await verifyCosmeticPayment("2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2", "profile-frame", "22222222222222222222222222222222");
    expect(result).toMatchObject({ verified: true, network: "devnet", slot: 42 });
  });

  it("rejects a confirmed transfer from a different wallet", async () => {
    vi.stubEnv("SOLANA_TREASURY", "11111111111111111111111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { slot: 42, meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: "11111111111111111111111111111111", signer: false }, { pubkey: "22222222222222222222222222222222", signer: true }], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: "22222222222222222222222222222222", destination: "11111111111111111111111111111111", lamports: 10_000_000 } } }] } } } }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(verifyCosmeticPayment("2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2", "profile-frame", "33333333333333333333333333333333")).rejects.toThrow("does not pay");
  });
});

describe("Tiger append-only analytics", () => {
  it("binds analytics identity to the verified subject", () => {
    expect(bindTigerActor({ name: "service_viewed", actorId: "attacker" }, "auth0|real").actorId).toBe("auth0|real");
  });

  it("is a no-op unless explicitly enabled", async () => {
    const result = await appendTigerEvent({ name: "service_viewed", serviceId: "00000000-0000-4000-8000-000000000001" });
    expect(result).toEqual({ status: "skipped", reason: "disabled" });
  });

  it("only sends append POSTs when configured", async () => {
    vi.stubEnv("TIGER_DATA_ENABLED", "true");
    vi.stubEnv("TIGER_DATA_SALT", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("TIGER_DATA_INGEST_URL", "https://tiger.example/events");
    vi.stubEnv("TIGER_DATA_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ eventId: "evt-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await appendTigerEvent({ name: "rating_submitted", actorId: "u1" })).toEqual({ status: "appended", eventId: "evt-1" });
    const call = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[0]).toEqual(new URL("https://tiger.example/events"));
    expect(call?.[1]).toMatchObject({ method: "POST" });
  });

  it("does not fail an operational write when optional analytics is unavailable", async () => {
    vi.stubEnv("TIGER_DATA_ENABLED", "true");
    vi.stubEnv("TIGER_DATA_SALT", "too-short");
    vi.stubEnv("TIGER_DATA_INGEST_URL", "https://tiger.example/events");
    vi.stubEnv("TIGER_DATA_API_KEY", "test-key");
    await expect(recordTigerEvent({ name: "request_sent" }, "auth0|student"))
      .resolves.toEqual({ status: "skipped", reason: "unavailable" });
  });
});
