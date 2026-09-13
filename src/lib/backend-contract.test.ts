import { describe, expect, it, vi, afterEach } from "vitest";
import { assertSameOriginMutation } from "./security";
import { appendTigerEvent } from "./integrations/tiger";
import { TigerPostgresStore } from "./integrations/tiger-store";
import { verifyCosmeticPayment } from "./integrations/solana";
import { readFileSync } from "node:fs";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("backend security contract", () => {
  it("rejects cross-origin mutations", () => {
    expect(() => assertSameOriginMutation(new Request("http://localhost", { method: "POST", headers: { origin: "https://evil.example" } }))).toThrow("Cross-origin");
  });

  it("fails closed on a production mutation with no browser origin evidence", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertSameOriginMutation(new Request("https://hitmeup.tech/api/data/services", { method: "POST" }))).toThrow("could not be verified");
    expect(() => assertSameOriginMutation(new Request("https://hitmeup.tech/api/data/services", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }))).not.toThrow();
  });

  it("pseudonymizes Tiger actor ids before optional HTTP append", async () => {
    vi.stubEnv("TIGER_DATA_ENABLED", "true");
    vi.stubEnv("TIGER_DATA_SALT", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("TIGER_DATA_INGEST_URL", "https://tiger.example/events");
    vi.stubEnv("TIGER_DATA_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_input: URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.actorId).not.toBe("auth0|secret-sub");
      expect(payload.actorId).toMatch(/^[0-9a-f]{32}$/);
      return new Response(JSON.stringify({ eventId: "evt" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await appendTigerEvent({ name: "service_viewed", actorId: "auth0|secret-sub" });
  });

  it("rejects unknown or sensitive Tiger payload fields", async () => {
    await expect(appendTigerEvent({ name: "service_viewed", email: "student@ttu.edu" } as never)).rejects.toThrow("Unsupported analytics field");
    await expect(appendTigerEvent({ name: "service_viewed", metadata: { email: "student@ttu.edu" } } as never)).rejects.toThrow("metadata key");
    await expect(appendTigerEvent({ name: "service_viewed", metadata: { source: "student@ttu.edu" } })).rejects.toThrow("categorical values");
    await expect(appendTigerEvent({ name: "service_viewed", metadata: { source: "Alice" } })).rejects.toThrow("categorical values");
    await expect(appendTigerEvent({ name: "service_viewed", metadata: { view: "123MainStreet" } })).rejects.toThrow("categorical values");
    await expect(appendTigerEvent({ name: "service_viewed", metadata: { view: "123 Main Street" } })).rejects.toThrow("categorical values");
    await expect(appendTigerEvent({ name: "filter_applied", metadata: { category: "Tutoring", stage: "requested", source: "web" } })).resolves.toEqual({ status: "skipped", reason: "disabled" });
    await expect(appendTigerEvent({ name: "filter_applied", metadata: { category: "Businesses", filter: "permanent", source: "discovery" } })).resolves.toEqual({ status: "skipped", reason: "disabled" });
  });

  it("uses a parameterized Tiger Postgres append with a pseudonymous actor", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void sql; void params;
      return { rows: [{ id: "42" }] };
    });
    const store = new TigerPostgresStore(query, "0123456789abcdef0123456789abcdef");
    const result = await store.append({ name: "service_viewed", serviceId: "00000000-0000-4000-8000-000000000001" }, "auth0|private");
    expect(result).toEqual({ status: "appended", eventId: "42" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1,$2,$3,$4::jsonb"), expect.arrayContaining(["service_viewed"]));
    expect(query.mock.calls[0]?.[1]?.[1]).not.toBe("auth0|private");
  });

  it("writes Tiger events through parameterized Postgres seam", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("$1");
      expect(params[0]).toBe("service_viewed");
      expect(String(params[1])).toMatch(/^[0-9a-f]{32}$/);
      return { rows: [{ id: "42" }] };
    });
    await expect(new TigerPostgresStore(query, "test-salt").append({ name: "service_viewed" }, "auth0|private"))
      .resolves.toEqual({ status: "appended", eventId: "42" });
  });

  it("requires an exact (not greater-than) Devnet cosmetic transfer", async () => {
    vi.stubEnv("SOLANA_TREASURY", "11111111111111111111111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { slot: 1, meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: "11111111111111111111111111111111", signer: false }, { pubkey: "22222222222222222222222222222222", signer: true }], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: "22222222222222222222222222222222", destination: "11111111111111111111111111111111", lamports: 10000001 } } }] } } } }), { status: 200 })));
    await expect(verifyCosmeticPayment("2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2", "profile-frame", "22222222222222222222222222222222")).rejects.toThrow("does not pay");
  });

  it("defines append-only pseudonymous Tiger storage", () => {
    const migration = readFileSync(new URL("../../tiger/migrations/001_append_only_events.sql", import.meta.url), "utf8");
    expect(migration).toContain("actor_hash");
    expect(migration).toContain("before update or delete");
  });

  it("keeps the Auth0 admission Action Microsoft-only and emits server claims", () => {
    const action = readFileSync(new URL("../../integrations/auth0/post-login-edu-check.js", import.meta.url), "utf8");
    expect(action).toContain("event.connection?.strategy");
    expect(action).toContain("waad,windowslive");
    expect(action).toContain('setCustomClaim("role", "authenticated")');
    expect(action).toContain('setCustomClaim("connection_strategy", strategy)');
    expect(action).toContain("event.user.email_verified");
  });

  it("executes the Auth0 Action gate for Microsoft TTU users and rejects Google", async () => {
    const source = readFileSync(new URL("../../integrations/auth0/post-login-edu-check.js", import.meta.url), "utf8");
    const actionModule: { onExecutePostLogin?: (event: Record<string, unknown>, api: Record<string, unknown>) => Promise<void> } = {};
    new Function("exports", source)(actionModule);
    const run = actionModule.onExecutePostLogin;
    expect(run).toBeTypeOf("function");

    const deny = vi.fn();
    const setCustomClaim = vi.fn();
    await run?.({
      connection: { strategy: "waad" },
      secrets: { ALLOWED_EDU_DOMAINS: "ttu.edu", MICROSOFT_TENANT_ID: "ttu-tenant" },
      user: { email: "student@ttu.edu", email_verified: true, tenantid: "ttu-tenant", identities: [] },
    }, { access: { deny }, idToken: { setCustomClaim } });
    expect(deny).not.toHaveBeenCalled();
    expect(setCustomClaim).toHaveBeenCalledWith("role", "authenticated");
    expect(setCustomClaim).toHaveBeenCalledWith("edu_domain", "ttu.edu");
    expect(setCustomClaim).toHaveBeenCalledWith("tid", "ttu-tenant");
    expect(setCustomClaim).toHaveBeenCalledWith(
      "https://hitmeup.tech/tid",
      "ttu-tenant",
    );

    await run?.({
      connection: { strategy: "google-oauth2" },
      secrets: { ALLOWED_EDU_DOMAINS: "ttu.edu" },
      user: { email: "student@ttu.edu", email_verified: true },
    }, { access: { deny }, idToken: { setCustomClaim } });
    expect(deny).toHaveBeenCalledWith("Use the approved Microsoft university sign-in.");
  });

  it("defines a participant-projected SSE chat stream without exposing Supabase credentials", () => {
    const route = readFileSync(new URL("../app/api/data/requests/[requestId]/messages/stream/route.ts", import.meta.url), "utf8");
    expect(route).toContain('"content-type": "text/event-stream; charset=utf-8"');
    expect(route).toContain('sse("messages", { messages })');
    expect(route).toContain("listMessages(result.client, requestId)");
    expect(route).not.toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("does not derive a public profile name from the university email", () => {
    const helper = readFileSync(new URL("../app/api/data/_lib.ts", import.meta.url), "utf8");
    expect(helper).toContain('displayName: "Student"');
    expect(helper).not.toContain('email.split("@"');
  });

  it("uses the request counterpart in provider UI and asks before Google Maps sharing", () => {
    const marketplace = readFileSync(new URL("../components/campus-marketplace.tsx", import.meta.url), "utf8");
    expect(marketplace).toContain('name: request.otherParty.name');
    expect(marketplace).toContain('request.role === "requester"');
    expect(marketplace).toContain("opening directions sends this exact point to Google Maps");
  });

  it("keeps chat and exact-location state scoped to the selected request", () => {
    const marketplace = readFileSync(new URL("../components/campus-marketplace.tsx", import.meta.url), "utf8");
    expect(marketplace).toContain("activeRequestIdRef.current !== request.id");
    expect(marketplace).toContain("activeRequestIdRef.current === requestId");
    expect(marketplace).toContain("sharedLocation?.serviceId !== currentRequest.serviceId");
    expect(marketplace).toContain("key={activeRequestId ?? drawerService.id}");
    expect(marketplace).toContain("const selectedRequestId = activeRequestIdRef.current");
    expect(marketplace).toContain("const selectedRequestId = preferredId ?? activeRequestIdRef.current");
    expect(marketplace).toContain("requestGeneration === requestsFetchGeneration.current");
    expect(marketplace).toContain("requestGeneration !== requestsFetchGeneration.current");
    expect(marketplace).toContain("preferredId && activeRequestIdRef.current !== preferredId");
  });

  it("hydrates avatar changes without remounting away the saved state", () => {
    const marketplace = readFileSync(new URL("../components/campus-marketplace.tsx", import.meta.url), "utf8");
    const studio = readFileSync(new URL("../components/avatar-studio.tsx", import.meta.url), "utf8");
    expect(marketplace).not.toContain("<AvatarStudio key={avatarKey}");
    expect(studio).toContain("hydratedAvatarKey.current = Object.values(avatarConfig).join");
    expect(studio).toContain('setAvatarSaveState("saved")');
    expect(studio).toContain('setAvatarSaveState("idle")');
    expect(studio).toContain("updateAvatarField(skin, item.id, setSkin)");
  });

  it("distinguishes an ineligible Auth0 account from missing configuration", () => {
    const gate = readFileSync(new URL("../components/app-gate.tsx", import.meta.url), "utf8");
    expect(gate).toContain('error.status === 403) setState("denied")');
    expect(gate).toContain("This account is not eligible yet.");
  });
});
