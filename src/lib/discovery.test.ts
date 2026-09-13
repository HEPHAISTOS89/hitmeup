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
      { ...defaults, query: "windows" },
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("laptop-repair");
  });

  it("combines category, distance, rating and availability filters", () => {
    const result = filterAndRankServices(
      SERVICES,
      {
        ...defaults,
        categories: ["Tech help", "Ride"],
        maxDistanceMiles: 0.7,
        minimumRating: 4.7,
        availableNow: true,
      },
      ["Tech help"],
    );

    expect(result.map((service) => service.id)).toEqual(["laptop-repair"]);
  });

  it("returns a true empty state when no service meets the filters", () => {
    const result = filterAndRankServices(
      SERVICES,
      { ...defaults, maxDistanceMiles: 0.1 },
      [],
    );

    expect(result).toEqual([]);
  });
});
