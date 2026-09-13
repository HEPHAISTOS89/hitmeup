import { listMessages } from "@/lib/supabase/repository";
import { allowRate } from "@/lib/rate-limit";
import { dataError, withDataClient } from "../../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

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
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Safe near-real-time chat stream. The browser keeps only the Auth0 HttpOnly
 * session cookie; each update is fetched through the participant-only RPC and
 * never exposes raw sender subjects or a Supabase token.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const result = await withDataClient();
    if (result.response) return result.response;
    const streamRate = await allowRate(result.student.sub, "message-stream", 12, 60_000);
    if (!streamRate.allowed) {
      return new Response(JSON.stringify({ error: "Too many message stream connections." }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(streamRate.retryAfterSeconds) },
      });
    }

    const { requestId } = await context.params;
    // Authorize before returning streaming headers.
    const initial = await listMessages(result.client, requestId);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let messages = initial;
        let fingerprint = "";
        controller.enqueue(encoder.encode("retry: 1500\n\n"));

        for (let cycle = 0; cycle < 20 && !request.signal.aborted; cycle += 1) {
          try {
            if (cycle > 0) messages = await listMessages(result.client, requestId);
            const last = messages.at(-1);
            const nextFingerprint = `${messages.length}:${last?.id ?? ""}:${last?.createdAt ?? ""}`;
            if (nextFingerprint !== fingerprint) {
              fingerprint = nextFingerprint;
              controller.enqueue(sse("messages", { messages }));
            } else {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            }
          } catch {
            controller.enqueue(sse("stream-error", { code: "refresh_failed" }));
            break;
          }
          await wait(1_250, request.signal);
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
