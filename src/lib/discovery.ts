import type { RankedService, Service, ServiceCategory } from "./types";
import { rankServices } from "./ranking";

export type DiscoveryFilters = {
  query: string;
  categories: ReadonlyArray<ServiceCategory>;
  maxDistanceMiles: number;
  minimumRating: number;
  availableNow: boolean;
};

const NOW_PATTERN = /available now|free now|today|this evening|after \d/i;

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
    if (service.distanceMiles > filters.maxDistanceMiles) return false;
    if (service.provider.rating < filters.minimumRating) return false;
    if (filters.availableNow && !NOW_PATTERN.test(service.availability)) {
      return false;
    }

    return true;
  });

  return rankServices(filtered, preferredCategories);
}
