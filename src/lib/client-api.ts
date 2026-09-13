import type {
  CosmeticQuote,
  CosmeticProjection,
  CosmeticUnlockResult,
  NotificationProjection,
  ProfileProjection,
  ProfileReview,
  RequestMessage,
  Service,
  ServiceCategory,
  ServiceRequestSummary,
  SessionProjection,
  SharedLocation,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json() as Record<string, unknown>
    : null;

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "The request could not be completed.";
    const code = typeof payload?.code === "string" ? payload.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  return payload as T;
}

const CATEGORY_ACCENT: Record<ServiceCategory, string> = {
  Tutoring: "#f6b73c",
  "Tech help": "#1d7a67",
  Ride: "#cd5c45",
  Creative: "#7557a8",
  Moving: "#3473a8",
};

type BackendService = {
  id: string;
  provider: {
    name: string;
    initials: string;
    verified: boolean;
    rating: number;
    ratingCount: number;
    completed: number;
  };
  title: string;
  description: string;
  category: ServiceCategory;
  priceNote: string;
  availability: string;
  scheduledFor?: string | null;
  distanceMiles: number;
  approximatePosition: [number, number];
  type?: string;
};

function normalizeService(service: BackendService): Service {
  return {
    ...service,
    provider: { ...service.provider, responseMinutes: 0 },
    price: service.priceNote,
    accent: CATEGORY_ACCENT[service.category] ?? "#e7011f",
    tags: [service.type ?? "One-off", service.scheduledFor ? "Scheduled" : "Available"],
  };
}

export async function getSession() {
  return apiFetch<SessionProjection>("/api/session");
}

export async function getServices(filters?: {
  category?: string;
  query?: string;
  minRating?: number;
  maxDistanceMiles?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.query) params.set("q", filters.query);
  if (filters?.minRating) params.set("minRating", String(filters.minRating));
  if (filters?.maxDistanceMiles) params.set("maxDistanceMiles", String(filters.maxDistanceMiles));
  const suffix = params.size ? `?${params}` : "";
  const result = await apiFetch<{ services: BackendService[] }>(`/api/data/services${suffix}`);
  return result.services.map(normalizeService);
}

export function createService(input: {
  category: ServiceCategory;
  title: string;
  description: string;
  priceNote: string;
  availabilityNote: string;
  exactPoint: { latitude: number; longitude: number };
}) {
  return apiFetch<{ id: string }>("/api/data/services", { method: "POST", body: JSON.stringify(input) });
}

export async function getRequests() {
  return (await apiFetch<{ requests: ServiceRequestSummary[] }>("/api/data/requests")).requests;
}

export function createRequest(serviceId: string) {
  return apiFetch<{ id: string }>("/api/data/requests", { method: "POST", body: JSON.stringify({ serviceId }) });
}

export function updateRequestStatus(requestId: string, status: "accepted" | "rejected" | "cancelled" | "meeting") {
  return apiFetch<{ status: string }>(`/api/data/requests/${requestId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function getMessages(requestId: string) {
  return (await apiFetch<{ messages: RequestMessage[] }>(`/api/data/requests/${requestId}/messages`)).messages;
}

export function postMessage(requestId: string, body: string) {
  return apiFetch<{ id: string }>(`/api/data/requests/${requestId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
}

export function getSharedLocation(requestId: string) {
  return apiFetch<SharedLocation | null>(`/api/data/requests/${requestId}/location`);
}

export function shareLocation(requestId: string) {
  return apiFetch<unknown>(`/api/data/requests/${requestId}/location`, { method: "POST", body: "{}" });
}

export function revokeLocation(requestId: string) {
  return apiFetch<unknown>(`/api/data/requests/${requestId}/location`, { method: "DELETE" });
}

export function confirmCompletion(requestId: string) {
  return apiFetch<{ complete: boolean }>(`/api/data/requests/${requestId}/completion`, { method: "POST", body: "{}" });
}

export function submitRating(requestId: string, score: number, comment?: string) {
  return apiFetch<{ id: string }>(`/api/data/requests/${requestId}/ratings`, { method: "POST", body: JSON.stringify({ score, comment }) });
}

export async function getProfile() {
  return (await apiFetch<{ profile: ProfileProjection | null }>("/api/data/profile")).profile;
}

export async function getReceivedReviews() {
  return (await apiFetch<{ reviews: ProfileReview[] }>("/api/data/profile/reviews")).reviews;
}

export function updateProfile(input: Partial<Pick<ProfileProjection, "displayName" | "bio" | "solanaWallet" | "interests" | "avatarConfig">>) {
  return apiFetch<{ updated: unknown }>("/api/data/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export async function getNotifications() {
  return (await apiFetch<{ notifications: NotificationProjection[] }>("/api/data/notifications")).notifications;
}

export function markNotificationsRead(ids?: string[]) {
  return apiFetch<{ updated: unknown }>("/api/data/notifications", { method: "PATCH", body: JSON.stringify(ids ? { ids } : {}) });
}

export async function getCosmetics() {
  return (await apiFetch<{ cosmetics: CosmeticProjection[] }>("/api/data/cosmetics")).cosmetics;
}

export function equipCosmetic(sku: string) {
  return apiFetch<{ equipped: string }>("/api/data/cosmetics", { method: "PATCH", body: JSON.stringify({ sku }) });
}

export function getCosmeticQuote(productId: string) {
  return apiFetch<CosmeticQuote>("/api/integrations/solana/quote", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export function unlockCosmetic(productId: string, signature: string) {
  return apiFetch<CosmeticUnlockResult>("/api/integrations/solana/unlock", {
    method: "POST",
    body: JSON.stringify({ productId, signature }),
  });
}

export type ServiceSuggestion = {
  category: string;
  tags: string[];
  suggestedTitle: string;
  riskFlags: string[];
  searchKeywords: string[];
  source: "gemini" | "deterministic-fallback";
};

export function suggestServiceDraft(input: { title: string; description: string }) {
  return apiFetch<ServiceSuggestion>("/api/integrations/gemini", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
