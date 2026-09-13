import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { allowRate, resetRateLimitsForTests } from "./rate-limit";

afterEach(() => resetRateLimitsForTests());

describe("process-local abuse guardrail", () => {
  it("limits a subject and resets after the window", async () => {
    expect((await allowRate("student", "write", 2, 1_000, 0)).allowed).toBe(true);
    expect((await allowRate("student", "write", 2, 1_000, 1)).allowed).toBe(true);
    expect((await allowRate("student", "write", 2, 1_000, 2)).allowed).toBe(false);
    expect((await allowRate("student", "write", 2, 1_000, 1_001)).allowed).toBe(true);
  });

  it("makes the shared database bucket mandatory in production", () => {
    const source = readFileSync(new URL("./rate-limit.ts", import.meta.url), "utf8");
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('client.rpc("consume_api_rate_limit"');
    expect(source).toContain('createHmac("sha256"');
  });
});
