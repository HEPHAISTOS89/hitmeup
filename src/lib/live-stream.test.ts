import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseServiceFilters, parseTopics, GET } from "@/app/api/data/live/route";

const mocks = vi.hoisted(() => ({
  withDataClient: vi.fn(),
  allowRate: vi.fn(),
  listNotifications: vi.fn(),
  listRequests: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock("@/app/api/data/_lib", () => ({
  dataError: (error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
  inputError: (message: string) => new Error(message),
  withDataClient: mocks.withDataClient,
}));
vi.mock("@/lib/rate-limit", () => ({ allowRate: mocks.allowRate }));
vi.mock("@/lib/supabase/repository", () => ({
  listNotifications: mocks.listNotifications,
  listRequests: mocks.listRequests,
  listServices: mocks.listServices,
}));

afterEach(() => vi.clearAllMocks());

describe("live data stream contract", () => {
  it("defaults to all safe projections and accepts a bounded topic subset", () => {
    expect(parseTopics(new Request("http://localhost/api/data/live"))).toEqual([
      "notifications",
      "requests",
      "services",
    ]);
    expect(parseTopics(new Request("http://localhost/api/data/live?topics=requests,notifications,requests")))
      .toEqual(["requests", "notifications"]);
  });

  it("rejects unknown stream resources", () => {
    expect(() => parseTopics(new Request("http://localhost/api/data/live?topics=profiles")))
      .toThrow("topics is invalid");
  });

  it("rejects an untrusted browser origin before touching the data layer", async () => {
    const response = await GET(new Request("http://localhost/api/data/live", {
      headers: { origin: "https://evil.example" },
    }));
    expect(response.status).toBe(403);
    expect(mocks.withDataClient).not.toHaveBeenCalled();
  });

  it("keeps service filters aligned with the list endpoint", () => {
    expect(parseServiceFilters(new Request(
      "http://localhost/api/data/live?category=Help&q=ride&minRating=4&maxDistanceMiles=3&listingKind=temporary&subcategory=Quick%20ride",
    ))).toEqual({
      category: "Help",
      query: "ride",
      minRating: 4,
      maxDistanceMiles: 3,
      listingKind: "temporary",
      subcategory: "Quick ride",
    });
  });

  it("authorizes once, emits projected snapshots, and stops promptly on abort", async () => {
    mocks.withDataClient.mockResolvedValue({ client: {}, student: { sub: "student" } });
    mocks.allowRate.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.listNotifications.mockResolvedValue([{ id: "notification", readAt: null }]);
    mocks.listRequests.mockResolvedValue([{ id: "request", status: "requested" }]);
    mocks.listServices.mockResolvedValue([{ id: "service", approximatePosition: [33.58, -101.87] }]);
    const abort = new AbortController();
    const response = await GET(new Request("http://localhost/api/data/live", { signal: abort.signal }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    let initial = "";
    for (let index = 0; index < 5; index += 1) {
      const chunk = await reader?.read();
      initial += new TextDecoder().decode(chunk?.value);
      if (initial.includes("event: services")) break;
    }
    expect(initial).toContain("event: ready");
    expect(initial).toContain("event: notifications");
    expect(initial).toContain("event: requests");
    expect(initial).toContain("event: services");
    expect(mocks.withDataClient).toHaveBeenCalledOnce();
    expect(mocks.allowRate).toHaveBeenCalledWith("student", "live-stream", 12, 60_000);
    expect(mocks.listServices).toHaveBeenCalledWith({}, {});
    abort.abort();
    await expect(reader?.read()).resolves.toMatchObject({ done: true });
  });

  it("defines authenticated projected snapshots, reconnects, and heartbeats", () => {
    const route = readFileSync(new URL("../app/api/data/live/route.ts", import.meta.url), "utf8");
    expect(route).toContain('"content-type": "text/event-stream; charset=utf-8"');
    expect(route).toContain('const TOPICS = ["notifications", "requests", "services"] as const');
    expect(route).toContain('controller.enqueue(sse(topic, { [topic]: value }))');
    expect(route).toContain('sse("stream-error", { code: "refresh_failed" })');
    expect(route).toContain(": keep-alive\\n\\n");
    expect(route).toContain("request.signal.aborted");
    expect(route).toContain("withDataClient");
    expect(route).not.toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(route).not.toContain("exactPoint");
    expect(route).not.toContain("provider_id");
  });
});
