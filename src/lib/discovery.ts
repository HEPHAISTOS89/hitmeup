import type { ListingKind, RankedService, Service, ServiceCategory } from "./types";
import { rankServices } from "./ranking";

export type DiscoveryFilters = {
  query: string;
  categories: ReadonlyArray<ServiceCategory>;
  maxDistanceMiles: number;
  minimumRating: number;
  availableNow: boolean;
  availability?: "any" | "now" | "today" | "this-week";
  listingKind?: ListingKind | "all";
  subcategory?: string;
};

const NOW_PATTERN = /available now|free now|today|this evening|after \d/i;
const TODAY_PATTERN = /available now|free now|today|tonight|this evening|after \d/i;
const WEEK_PATTERN = /available now|free now|today|tonight|this evening|this week|weekend|weekday|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|after \d/i;

function matchesAvailability(value: string, availability: DiscoveryFilters["availability"], availableNow: boolean) {
  const window = availability ?? (availableNow ? "now" : "any");
  if (window === "any") return true;
  if (window === "now") return NOW_PATTERN.test(value);
  if (window === "today") return TODAY_PATTERN.test(value);
  return WEEK_PATTERN.test(value);
}

export function filterAndRankServices(
  services: Service[],
  filters: DiscoveryFilters,
  preferredCategories: ServiceCategory[],
): RankedService[] {
  const query = filters.query.trim().toLocaleLowerCase();

  const filtered = services.filter((service) => {
    const searchable = [
      service.title,
      service.description,
      service.category,
      service.subcategory ?? "",
      service.provider.name,
      ...service.tags,
    ]
      .join(" ")
      .toLocaleLowerCase();

    if (query && !searchable.includes(query)) return false;
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(service.category)
    ) {
      return false;
    }
    if (filters.listingKind && filters.listingKind !== "all" && (service.listingKind ?? "temporary") !== filters.listingKind) return false;
    if (filters.subcategory && service.subcategory !== filters.subcategory) return false;
    if (service.distanceMiles > filters.maxDistanceMiles) return false;
    if (service.provider.rating < filters.minimumRating) return false;
    if (!matchesAvailability(service.availability, filters.availability, filters.availableNow)) {
      return false;
    }

    return true;
  });

  return rankServices(filtered, preferredCategories);
}
