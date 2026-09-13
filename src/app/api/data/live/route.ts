import { allowRate } from "@/lib/rate-limit";
import { listNotifications, listRequests, listServices } from "@/lib/supabase/repository";
import type { ServiceFilters } from "@/lib/supabase/repository";
import type { ListingKind } from "@/lib/types";
import { dataError, inputError, withDataClient } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const encoder = new TextEncoder();
const POLL_INTERVAL_MS = 2_000;
const MAX_CYCLES = 45;
const TOPICS = ["notifications", "requests", "services"] as const;
type LiveTopic = (typeof TOPICS)[number];

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

type LiveSnapshot = {
  notifications?: Awaited<ReturnType<typeof listNotifications>>;
  requests?: Awaited<ReturnType<typeof listRequests>>;
  services?: Awaited<ReturnType<typeof listServices>>;
};

function sse(event: string, value: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    // Close the small check/listener race without leaving a timer behind.
    if (signal.aborted) onAbort();
  });
}

function sameOriginRead(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return false;
  if (process.env.NODE_ENV === "production" && !origin && request.headers.get("sec-fetch-site") !== "same-origin") return false;
  return true;
}

/** Parse and bound the resources a browser may subscribe to. */
export function parseTopics(request: Request): LiveTopic[] {
  const raw = new URL(request.url).searchParams.get("topics");
  if (!raw) return [...TOPICS];
  if (raw.length > 80) throw inputError("topics is invalid.");
  const values = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  if (!values.length || values.some((value) => !TOPICS.includes(value as LiveTopic))) {
    throw inputError("topics is invalid.");
  }
  return values as LiveTopic[];
}

function optionalNumber(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw inputError(`${name} is invalid.`);
  return parsed;
}

/** Keep service stream filters identical to the list endpoint and server-bound. */
export function parseServiceFilters(request: Request): ServiceFilters {
  const params = new URL(request.url).searchParams;
  return {
    category: params.get("category") ?? undefined,
    query: params.get("q") ?? undefined,
    minRating: optionalNumber(params, "minRating"),
    maxDistanceMiles: optionalNumber(params, "maxDistanceMiles"),
    listingKind: (params.get("listingKind") ?? undefined) as ListingKind | undefined,
    subcategory: params.get("subcategory") ?? undefined,
  };
}

async function readSnapshot(
  client: Parameters<typeof listNotifications>[0],
  topics: LiveTopic[],
  filters: ServiceFilters,
): Promise<LiveSnapshot> {
  const snapshot: LiveSnapshot = {};
  if (topics.includes("notifications")) snapshot.notifications = await listNotifications(client);
  if (topics.includes("requests")) snapshot.requests = await listRequests(client);
  if (topics.includes("services")) snapshot.services = await listServices(client, filters);
  return snapshot;
}

function topicValue(snapshot: LiveSnapshot, topic: LiveTopic) {
  return snapshot[topic];
}

function fingerprint(value: unknown) {
  // Each source RPC is bounded (100 rows); stable JSON is sufficient and keeps
  // this route dependency-free while ensuring read-state changes are delivered.
  return JSON.stringify(value);
}

function emitChanged(
  controller: ReadableStreamDefaultController<Uint8Array>,
  snapshot: LiveSnapshot,
  topics: LiveTopic[],
  previous: Map<LiveTopic, string>,
) {
  let changed = false;
  for (const topic of topics) {
    const value = topicValue(snapshot, topic);
    const next = fingerprint(value);
    if (previous.get(topic) === next) continue;
    previous.set(topic, next);
    controller.enqueue(sse(topic, { [topic]: value }));
    changed = true;
  }
  return changed;
}

/**
 * Authenticated BFF stream for safe, projected data snapshots. The browser
 * receives only the same DTOs as the list endpoints; it never receives a
 * Supabase token, Auth0 subject, private location, or raw database row.
 *
 * Contract:
 * - `ready`: `{ topics, intervalMs }` once the initial authorization succeeds.
 * - `notifications`: `{ notifications }` current-user notification projection.
 * - `requests`: `{ requests }` current-user participant-safe request projection.
 * - `services`: `{ services }` public approximate discovery projection.
 * - `stream-error`: `{ code: "refresh_failed" }`, followed by a bounded close;
 *   EventSource reconnects using the advertised retry delay.
 * - SSE comments are heartbeats when no projection changed.
 */
export async function GET(request: Request) {
  if (!sameOriginRead(request)) {
    return new Response(JSON.stringify({ error: "Cross-origin stream denied." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    const streamRate = await allowRate(result.student.sub, "live-stream", 12, 60_000);
    if (!streamRate.allowed) {
      return new Response(JSON.stringify({ error: "Too many live stream connections." }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(streamRate.retryAfterSeconds) },
      });
    }
    const topics = parseTopics(request);
    const filters = parseServiceFilters(request);
    // Fetch before committing streaming headers so auth, participant projection,
    // and filter errors remain ordinary JSON errors to the caller.
    const initial = await readSnapshot(result.client, topics, filters);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const previous = new Map<LiveTopic, string>();
        controller.enqueue(encoder.encode(`retry: ${POLL_INTERVAL_MS}\n\n`));
        controller.enqueue(sse("ready", { topics, intervalMs: POLL_INTERVAL_MS }));
        emitChanged(controller, initial, topics, previous);

        for (let cycle = 1; cycle < MAX_CYCLES && !request.signal.aborted; cycle += 1) {
          await wait(POLL_INTERVAL_MS, request.signal);
          if (request.signal.aborted) break;
          try {
            const snapshot = await readSnapshot(result.client, topics, filters);
            if (!emitChanged(controller, snapshot, topics, previous)) controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            // Do not expose database details. Closing after a typed event lets
            // EventSource reconnect and re-authorize with a fresh session.
            if (!request.signal.aborted) controller.enqueue(sse("stream-error", { code: "refresh_failed" }));
            break;
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return dataError(error);
  }
}
