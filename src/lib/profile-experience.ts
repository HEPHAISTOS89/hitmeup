import type { ServiceRequestSummary } from "./types";

export type ProfileActivityGroup = {
  id: "in-progress" | "recent" | "earlier";
  label: string;
  items: ServiceRequestSummary[];
};

const TERMINAL = new Set(["closed", "rejected", "cancelled"]);

export function profileActivityRoleLabel(role: ServiceRequestSummary["role"]) {
  return role === "provider" ? "You provided" : "You requested";
}

export function profileActivityDate(request: ServiceRequestSummary) {
  return request.closedAt ?? request.acceptedAt ?? request.createdAt;
}

export function groupProfileActivity(
  requests: ServiceRequestSummary[],
  now = new Date(),
): ProfileActivityGroup[] {
  const recentBoundary = now.valueOf() - 30 * 24 * 60 * 60 * 1_000;
  const buckets: Record<ProfileActivityGroup["id"], ServiceRequestSummary[]> = {
    "in-progress": [],
    recent: [],
    earlier: [],
  };

  for (const request of requests) {
    if (!TERMINAL.has(request.status)) {
      buckets["in-progress"].push(request);
      continue;
    }
    const time = new Date(profileActivityDate(request)).valueOf();
    buckets[Number.isFinite(time) && time >= recentBoundary ? "recent" : "earlier"].push(request);
  }

  const definitions = [
    { id: "in-progress", label: "In progress" },
    { id: "recent", label: "Last 30 days" },
    { id: "earlier", label: "Earlier" },
  ] as const;

  return definitions
    .map(({ id, label }) => ({
      id,
      label,
      items: buckets[id].sort((a, b) => new Date(profileActivityDate(b)).valueOf() - new Date(profileActivityDate(a)).valueOf()),
    }))
    .filter((group) => group.items.length > 0);
}

export function providedServiceCount(requests: ServiceRequestSummary[]) {
  return new Set(requests.filter((request) => request.role === "provider").map((request) => request.serviceId)).size;
}
