import { describe, expect, it } from "vitest";
import { canCloseRequest, canRevealExactLocation } from "./privacy";

describe("privacy and completion gates", () => {
  it("never reveals exact coordinates before acceptance", () => {
    expect(canRevealExactLocation("requested", true, true)).toBe(false);
  });

  it("requires mutual location consent", () => {
    expect(canRevealExactLocation("accepted", true, false)).toBe(false);
    expect(canRevealExactLocation("accepted", true, true)).toBe(true);
  });

  it("expires exact sharing when completion begins", () => {
    expect(canRevealExactLocation("completion_pending", true, true)).toBe(false);
    expect(canRevealExactLocation("rating_pending", true, true)).toBe(false);
    expect(canRevealExactLocation("closed", true, true)).toBe(false);
  });

  it("requires both completion confirmations and both ratings", () => {
    expect(canCloseRequest(true, true, true, false)).toBe(false);
    expect(canCloseRequest(true, true, true, true)).toBe(true);
  });
});
