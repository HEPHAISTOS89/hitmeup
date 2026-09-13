import type { RankedService, Service, ServiceCategory } from "./types";

const WEIGHTS = {
  categoryAffinity: 0.33,
  adjustedRating: 0.3,
  distance: 0.22,
  reliability: 0.15,
  // No verified response-time aggregate exists yet; never award a fabricated maximum.
  responsiveness: 0,
} as const;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function bayesianRating(
  rating: number,
  ratingCount: number,
  priorMean = 4.5,
  priorWeight = 8,
) {
  return (rating * ratingCount + priorMean * priorWeight) / (ratingCount + priorWeight);
}

export function rankServices(
  services: Service[],
  preferredCategories: ServiceCategory[],
): RankedService[] {
  return services
    .map((service) => {
      const adjusted = bayesianRating(
        service.provider.rating,
        service.provider.ratingCount,
      );
      const signals = {
        categoryAffinity:
          preferredCategories.length === 0 ||
          preferredCategories.includes(service.category)
            ? 1
            : 0.25,
        adjustedRating: clamp((adjusted - 3.5) / 1.5),
        distance: clamp(1 - service.distanceMiles / 3),
        reliability: clamp(service.provider.completed / 60),
        responsiveness: service.provider.responseMinutes > 0
          ? clamp(1 - service.provider.responseMinutes / 60)
          : 0,
      };

      const score = Object.entries(WEIGHTS).reduce(
        (total, [key, weight]) =>
          total + signals[key as keyof typeof signals] * weight,
        0,
      );

      return {
        ...service,
        score,
        signals,
        explanation: preferredCategories.includes(service.category)
          ? `Matches a selected ${service.category.toLowerCase()} interest, ${service.distanceMiles.toFixed(1)} mi away, with a ${adjusted.toFixed(1)} adjusted rating.`
          : `Ranked by approximate distance (${service.distanceMiles.toFixed(1)} mi), ${adjusted.toFixed(1)} adjusted rating, and completed services.`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
