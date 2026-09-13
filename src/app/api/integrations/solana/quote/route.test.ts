import { afterEach, describe, expect, it, vi } from "vitest";
import { solanaQuoteFailureResponse } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("Solana Devnet quote failures", () => {
  it("turns a concurrent checkout reservation into an actionable conflict", async () => {
    const response = solanaQuoteFailureResponse(new Error("purchase already in progress"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A Devnet checkout is already active for this account. Continue in the original tab or try again after the quote expires.",
      code: "checkout_in_progress",
    });
  });

  it("logs an unexpected reservation failure without identity or payment data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = solanaQuoteFailureResponse(new Error("database unavailable"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Integration request failed.", code: "upstream" });
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      level: "error",
      message: "solana_quote_failed",
      errorName: "Error",
      errorMessage: "database unavailable",
    }));
  });
});
