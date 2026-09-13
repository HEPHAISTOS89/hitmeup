import { describe, expect, it } from "vitest";
import { groupProfileActivity, profileActivityRoleLabel, providedServiceCount } from "./profile-experience";
import type { ServiceRequestSummary } from "./types";

function request(overrides: Partial<ServiceRequestSummary> = {}): ServiceRequestSummary {
  return {
    id: "request-1", serviceId: "service-1", status: "closed", role: "requester",
    otherParty: { name: "Jordan", initials: "JL" }, service: { title: "Python help", category: "Tech help" },
    createdAt: "2026-08-01T00:00:00Z", acceptedAt: null, closedAt: "2026-08-02T00:00:00Z",
    completion: { mine: true, theirs: true }, ratings: { mine: true, theirs: true },
    location: { mine: false, theirs: false, expiresAt: null },
    ...overrides,
  };
}

describe("profile activity projection", () => {
  it("labels the signed-in student's actual role instead of calling every item a meetup", () => {
    expect(profileActivityRoleLabel("provider")).toBe("You provided");
    expect(profileActivityRoleLabel("requester")).toBe("You requested");
  });

  it("groups active, recent, and older request history using lifecycle dates", () => {
    const groups = groupProfileActivity([
      request({ id: "active", status: "accepted", closedAt: null, createdAt: "2026-09-11T00:00:00Z" }),
      request({ id: "recent", closedAt: "2026-09-05T00:00:00Z" }),
      request({ id: "old", closedAt: "2026-05-01T00:00:00Z" }),
    ], new Date("2026-09-12T00:00:00Z"));
    expect(groups.map((group) => group.id)).toEqual(["in-progress", "recent", "earlier"]);
  });

  it("counts distinct services provided without double-counting request rows", () => {
    expect(providedServiceCount([
      request({ id: "a", role: "provider", serviceId: "same" }),
      request({ id: "b", role: "provider", serviceId: "same" }),
      request({ id: "c", role: "requester", serviceId: "other" }),
    ])).toBe(1);
  });
});
