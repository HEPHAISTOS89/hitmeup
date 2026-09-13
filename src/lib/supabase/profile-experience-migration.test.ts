import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/202609120005_profile_experience.sql", import.meta.url), "utf8");

describe("own-profile review projection migration", () => {
  it("returns only the current subject's received reviews after bilateral closed completion", () => {
    expect(migration).toContain("rating.subject_id = public.current_subject()");
    expect(migration).toContain("request.status = 'closed'");
    expect(migration).toContain("count(*) from public.ratings peer");
    expect(migration).toContain("public.current_subject() in (request.requester_id, request.provider_id)");
  });

  it("does not project internal subjects, contact data, wallet, or location", () => {
    const returnShape = migration.split("returns table (", 2)[1]?.split(")\nlanguage", 1)[0] ?? "";
    expect(returnShape).not.toMatch(/\b(author_id|subject_id|requester_id|provider_id|email|wallet|location|exact_point)\b/i);
    expect(migration).toContain("revoke all on function public.list_my_received_reviews() from public, anon");
  });
});
