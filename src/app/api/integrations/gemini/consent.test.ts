import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth0", () => ({
  requireVerifiedStudent: vi.fn(async () => ({ ok: true, student: { sub: "auth0|test", email: "student@ttu.edu" } })),
}));
vi.mock("@/lib/rate-limit", () => ({
  allowRate: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));

import { POST as suggest } from "./route";
import { POST as discover } from "./discover/route";
import { POST as explain } from "../../gemini/explain/route";

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("Gemini explicit consent gate", () => {
  it("rejects listing assistance without an explicit consent flag", async () => {
    const response = await suggest(request("/api/integrations/gemini", { title: "Math help", description: "Review algebra" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "consent_required" });
  });

  it("rejects discovery assistance without an explicit consent flag", async () => {
    const response = await discover(request("/api/integrations/gemini/discover", { query: "Math help nearby" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "consent_required" });
  });

  it("rejects personalized match explanations without explicit consent", async () => {
    const response = await explain(request("/api/gemini/explain", { serviceId: "00000000-0000-4000-8000-000000000001" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "consent_required" });
  });
});
