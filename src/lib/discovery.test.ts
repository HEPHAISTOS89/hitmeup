import { describe, expect, it } from "vitest";
import { SERVICES } from "./service-catalog";
import { filterAndRankServices } from "./discovery";

const defaults = {
  query: "",
  categories: [],
  maxDistanceMiles: 3,
  minimumRating: 0,
  availableNow: false,
} as const;

describe("service discovery", () => {
  it("filters across service metadata without exposing exact positions", () => {
    const result = filterAndRankServices(
      SERVICES,
      { ...defaults, query: "charger" },
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("usb-c-charger");
  });

  it("combines category, distance, rating and availability filters", () => {
    const result = filterAndRankServices(
      SERVICES,
      {
        ...defaults,
        categories: ["Help", "Services"],
        maxDistanceMiles: 0.7,
        minimumRating: 4.7,
        availableNow: true,
      },
      ["Help"],
    );

    expect(result.map((service) => service.id)).toEqual(["usb-c-charger"]);
  });

  it("separates temporary posts from permanent sponsored pins", () => {
    const result = filterAndRankServices(
      SERVICES,
      { ...defaults, listingKind: "permanent", subcategory: "Coffee & snacks" },
      [],
    );

    expect(result.map((service) => service.id)).toEqual(["corner-cup"]);
    expect(result[0].sponsored).toBe(true);
  });

  it("returns a true empty state when no service meets the filters", () => {
    const result = filterAndRankServices(
      SERVICES,
      { ...defaults, maxDistanceMiles: 0.05 },
      [],
    );

    expect(result).toEqual([]);
  });
});
