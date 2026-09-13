import { createHmac } from "node:crypto";
import { createServerSupabaseAdminClient } from "./supabase/factory";

type Bucket = { startedAt: number; count: number };

const buckets = new Map<string, Bucket>();

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Shared rate limiting is unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

/** Fast per-process defence; the shared database gate below is authoritative. */
function allowLocalRate(subject: string, operation: string, limit: number, windowMs: number, now = Date.now()) {
  const key = `${operation}:${subject}`;
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    if (buckets.size > 10_000) {
      for (const [candidate, bucket] of buckets) {
        if (now - bucket.startedAt >= windowMs) buckets.delete(candidate);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1_000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function subjectHash(subject: string) {
  const secret = process.env.RATE_LIMIT_SALT ?? process.env.AUTH0_SECRET;
  if (!secret || secret.length < 32) throw new RateLimitUnavailableError();
  return createHmac("sha256", secret).update(subject).digest("hex");
}

/**
 * In production every request also consumes an atomic Supabase bucket shared by
 * all instances. Tests/development may opt in with SHARED_RATE_LIMIT_ENABLED.
 */
export async function allowRate(subject: string, operation: string, limit: number, windowMs: number, now = Date.now()) {
  const local = allowLocalRate(subject, operation, limit, windowMs, now);
  if (!local.allowed) return local;
  if (process.env.NODE_ENV !== "production" && process.env.SHARED_RATE_LIMIT_ENABLED !== "true") return local;

  try {
    const client = createServerSupabaseAdminClient();
    const { data, error } = await client.rpc("consume_api_rate_limit", {
      target_subject_hash: subjectHash(subject),
      target_operation: operation,
      target_limit: limit,
      target_window_seconds: Math.max(1, Math.ceil(windowMs / 1_000)),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean" || typeof row.retry_after_seconds !== "number") {
      throw new Error("invalid shared rate limit response");
    }
    return { allowed: row.allowed, retryAfterSeconds: Math.max(0, row.retry_after_seconds) };
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) throw error;
    throw new RateLimitUnavailableError();
  }
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
