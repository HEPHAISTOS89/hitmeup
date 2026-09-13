import { fetchWithTimeout, IntegrationError, readJson } from "./http";
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { TigerPostgresStore } from "./tiger-store";

export const TIGER_EVENTS = [
  "service_viewed",
  "filter_applied",
  "request_sent",
  "request_accepted",
  "service_completed",
  "rating_submitted",
  "profile_item_purchased",
] as const;

export type TigerEventName = (typeof TIGER_EVENTS)[number];
export type TigerEvent = {
  name: TigerEventName;
  actorId?: string;
  serviceId?: string;
  metadata?: Record<string, string | number | boolean>;
  occurredAt?: string;
};

export type TigerAppendResult =
  | { status: "appended"; eventId: string }
  | { status: "skipped"; reason: "disabled" | "not_configured" | "unavailable" };

let sql: ReturnType<typeof postgres> | undefined;
function analyticsSalt() {
  const salt = process.env.TIGER_DATA_SALT;
  if (!salt || salt.length < 32) {
    throw new IntegrationError("configuration", "TIGER_DATA_SALT must contain at least 32 characters.");
  }
  return salt;
}

function databaseStore() {
  const url = process.env.TIGER_DATABASE_URL;
  if (!url) return undefined;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new IntegrationError("configuration", "TIGER_DATABASE_URL is invalid."); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new IntegrationError("configuration", "TIGER_DATABASE_URL must be a PostgreSQL URL.");
  }
  if (!sql) sql = postgres(url, { max: 2, idle_timeout: 10, connect_timeout: 8, ssl: "require" });
  return new TigerPostgresStore(async (query, params) => {
    const rows = await sql!.unsafe(query, params as (string | number | boolean | null)[]);
    return { rows: rows as Array<{ id?: string }> };
  }, analyticsSalt());
}

export function bindTigerActor(event: TigerEvent, actorId: string): TigerEvent {
  return { ...event, actorId };
}

function pseudonymizeActor(actorId: string) {
  return createHmac("sha256", analyticsSalt()).update(actorId).digest("hex").slice(0, 32);
}

function isEventName(value: unknown): value is TigerEventName {
  return typeof value === "string" && (TIGER_EVENTS as readonly string[]).includes(value);
}

const TIGER_METADATA_KEYS = new Set(["category", "source", "view", "filter", "stage"]);
const SERVICE_CATEGORIES = new Set(["tutoring", "tech help", "ride", "creative", "moving", "other"]);
const REQUEST_STAGES = new Set(["requested", "accepted", "meeting", "completion_pending", "rating_pending", "closed", "rejected", "cancelled"]);
const EVENT_SOURCES = new Set(["web", "mobile", "server", "system", "gemini", "deterministic", "profile", "discovery", "request", "notification"]);
const APP_VIEWS = new Set(["discover", "requests", "profile", "service", "chat", "avatar", "settings", "login", "onboarding"]);
const FILTER_DIMENSIONS = new Set(["category", "distance", "rating", "availability", "query", "temporary", "permanent"]);

function isSafeMetadataValue(key: string, value: string | number | boolean) {
  if (typeof value !== "string") return typeof value === "boolean" || Number.isFinite(value);
  const normalized = value.trim().toLowerCase();
  if (key === "category") return SERVICE_CATEGORIES.has(normalized);
  if (key === "stage") return REQUEST_STAGES.has(normalized);
  if (key === "source") return EVENT_SOURCES.has(normalized);
  if (key === "view") return APP_VIEWS.has(normalized);
  if (key === "filter") return FILTER_DIMENSIONS.has(normalized);
  return false;
}

function validateEvent(event: TigerEvent) {
  const input = event as TigerEvent & Record<string, unknown>;
  const allowedTopLevel = new Set(["name", "actorId", "serviceId", "metadata", "occurredAt"]);
  if (Object.keys(input).some((key) => !allowedTopLevel.has(key))) {
    throw new IntegrationError("invalid_response", "Unsupported analytics field.", 400);
  }
  if (!isEventName(event.name)) throw new IntegrationError("invalid_response", "Unsupported analytics event.", 400);
  if (event.actorId && (typeof event.actorId !== "string" || event.actorId.length > 160)) throw new IntegrationError("invalid_response", "Invalid actor id.", 400);
  if (event.serviceId && (typeof event.serviceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.serviceId))) throw new IntegrationError("invalid_response", "Invalid service id.", 400);
  if (event.metadata !== undefined) {
    if (!event.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata) || Object.keys(event.metadata).length > 30) {
      throw new IntegrationError("invalid_response", "Metadata must be a small object.", 400);
    }
    if (Object.values(event.metadata).some((value) =>
      !["string", "number", "boolean"].includes(typeof value)
      || (typeof value === "string" && value.length > 160)
      || (typeof value === "number" && !Number.isFinite(value)))) {
      throw new IntegrationError("invalid_response", "Metadata values must be scalar.", 400);
    }
    const sensitive = /(?:email|name|address|location|latitude|longitude|message|token|wallet|secret|password)/i;
    if (Object.keys(event.metadata).some((key) => !TIGER_METADATA_KEYS.has(key) || sensitive.test(key))) {
      throw new IntegrationError("invalid_response", "Unsupported analytics metadata key.", 400);
    }
    if (Object.entries(event.metadata).some(([key, value]) => !isSafeMetadataValue(key, value))) {
      throw new IntegrationError("invalid_response", "Analytics metadata must use approved categorical values.", 400);
    }
  }
  if (event.occurredAt !== undefined && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt)))) {
    throw new IntegrationError("invalid_response", "Invalid event timestamp.", 400);
  }
  return {
    name: event.name,
    actorId: event.actorId,
    serviceId: event.serviceId,
    metadata: event.metadata ? { ...event.metadata } : undefined,
    occurredAt: event.occurredAt,
  } satisfies TigerEvent;
}

export async function appendTigerEvent(event: TigerEvent): Promise<TigerAppendResult> {
  const valid = validateEvent(event);
  if (process.env.TIGER_DATA_ENABLED !== "true") return { status: "skipped", reason: "disabled" };
  const store = databaseStore();
  if (store) {
    if (!valid.actorId) throw new IntegrationError("invalid_response", "Analytics actor is required.", 400);
    return store.append(valid, valid.actorId);
  }
  const endpoint = process.env.TIGER_DATA_INGEST_URL;
  const apiKey = process.env.TIGER_DATA_API_KEY;
  if (!endpoint || !apiKey) return { status: "skipped", reason: "not_configured" };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new IntegrationError("configuration", "TIGER_DATA_INGEST_URL is invalid.");
  }
  if (url.protocol !== "https:") throw new IntegrationError("configuration", "Tiger ingestion must use HTTPS.");
  if (!valid.actorId) throw new IntegrationError("invalid_response", "Analytics actor is required.", 400);
  const payload = {
    name: valid.name,
    actorId: pseudonymizeActor(valid.actorId),
    serviceId: valid.serviceId,
    metadata: valid.metadata,
    occurredAt: valid.occurredAt ?? new Date().toISOString(),
  };
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const body = await readJson<{ eventId?: string }>(response);
  return { status: "appended", eventId: body.eventId ?? `${valid.name}:${payload.occurredAt}` };
}

/** Operational flows must not be rolled back or retried because analytics is down. */
export async function recordTigerEvent(event: TigerEvent, actorId: string): Promise<TigerAppendResult> {
  try {
    return await appendTigerEvent(bindTigerActor(event, actorId));
  } catch {
    return { status: "skipped", reason: "unavailable" };
  }
}
