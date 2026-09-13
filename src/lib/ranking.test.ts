import { describe, expect, it } from "vitest";
import { SERVICES } from "./service-catalog";
import { bayesianRating, rankServices } from "./ranking";

describe("service ranking", () => {
  it("shrinks low-volume ratings toward the prior", () => {
    expect(bayesianRating(5, 1)).toBeLessThan(5);
    expect(bayesianRating(5, 100)).toBeGreaterThan(
      bayesianRating(5, 1),
    );
  });

  it("uses category affinity as a visible ranking signal", () => {
    const ranked = rankServices(SERVICES, ["Help"]);
    expect(ranked[0].category).toBe("Help");
    expect(ranked[0].explanation).toContain("adjusted rating");
    expect(ranked[0].explanation).toContain("Matches a selected");
  });

  it("does not claim an interest match when there is none", () => {
    const ranked = rankServices(SERVICES, []);
    expect(ranked[0].explanation).toContain("Ranked by approximate distance");
    expect(ranked[0].explanation).not.toContain("selected");
  });
});
