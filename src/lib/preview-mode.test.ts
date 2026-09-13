import { describe, expect, it } from "vitest";

import { isFixturePreviewEnabled } from "@/lib/preview-mode";

describe("isFixturePreviewEnabled", () => {
  it("enables fixtures locally and on Vercel Preview when explicitly requested", () => {
    expect(isFixturePreviewEnabled("1", { nodeEnv: "development" })).toBe(true);
    expect(isFixturePreviewEnabled("1", { nodeEnv: "production", vercelEnv: "preview" })).toBe(true);
  });

  it("never enables fixtures on Vercel Production or self-hosted production", () => {
    expect(isFixturePreviewEnabled("1", { nodeEnv: "production", vercelEnv: "production" })).toBe(false);
    expect(isFixturePreviewEnabled("1", { nodeEnv: "production" })).toBe(false);
  });

  it("requires the explicit preview query flag", () => {
    expect(isFixturePreviewEnabled(undefined, { nodeEnv: "development" })).toBe(false);
    expect(isFixturePreviewEnabled("0", { nodeEnv: "development" })).toBe(false);
  });
});
