import { describe, expect, it } from "vitest";
import { canTransitionRequest } from "./request-state";

describe("request lifecycle", () => {
  it("preserves the accepted meeting and bilateral rating sequence", () => {
    expect(canTransitionRequest("idle", "requested")).toBe(true);
    expect(canTransitionRequest("requested", "accepted")).toBe(true);
    expect(canTransitionRequest("accepted", "meeting")).toBe(true);
    expect(canTransitionRequest("meeting", "completion_pending")).toBe(true);
    expect(canTransitionRequest("completion_pending", "rating_pending")).toBe(
      true,
    );
    expect(canTransitionRequest("rating_pending", "closed")).toBe(true);
  });

  it("does not permit skipping privacy and completion gates", () => {
    expect(canTransitionRequest("requested", "meeting")).toBe(false);
    expect(canTransitionRequest("accepted", "closed")).toBe(false);
    expect(canTransitionRequest("completion_pending", "closed")).toBe(false);
  });

  it("models explicit rejection and cancellation outcomes", () => {
    expect(canTransitionRequest("requested", "rejected")).toBe(true);
    expect(canTransitionRequest("requested", "cancelled")).toBe(true);
    expect(canTransitionRequest("accepted", "cancelled")).toBe(true);
  });
});
