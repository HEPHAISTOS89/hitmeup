import type { RankedService, Service, ServiceCategory } from "./types";

const WEIGHTS = {
  categoryAffinity: 0.3,
  adjustedRating: 0.27,
  distance: 0.2,
  reliability: 0.13,
  responsiveness: 0.1,
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
        responsiveness: clamp(1 - service.provider.responseMinutes / 60),
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
        explanation: `A strong ${service.category.toLowerCase()} match, ${service.distanceMiles.toFixed(1)} mi away, with a ${adjusted.toFixed(1)} adjusted rating.`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
