import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseAdminClient, createServerSupabaseClient, SupabaseConfigurationError } from "./factory";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase Auth0 boundary", () => {
  it("fails closed when no Auth0 ID token exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
    await expect(createServerSupabaseClient()).rejects.toThrow("ID token is unavailable");
  });

  it("creates a client from an injected verified ID token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
    await expect(createServerSupabaseClient("verified-id-token")).resolves.toBeDefined();
  });

  it("classifies missing server configuration instead of leaking a generic failure", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => createServerSupabaseAdminClient()).toThrow(SupabaseConfigurationError);
  });
});
