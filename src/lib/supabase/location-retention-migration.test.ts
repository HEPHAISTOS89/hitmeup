import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../supabase/migrations/20260913120000_generalize_closed_service_locations.sql", import.meta.url), "utf8");

describe("closed service location retention", () => {
  it("replaces a closed temporary service exact point with its approximate point", () => {
    expect(sql).toContain("update public.services as service");
    expect(sql).toContain("request.status = 'closed'");
    expect(sql).toContain("NEW.status = 'closed'");
    expect(sql).toContain("exact_point = approximate_point");
    expect(sql).toContain("listing_kind = 'temporary'");
    expect(sql).toContain("security definer set search_path = public, pg_temp");
    expect(sql).toContain("revoke all on function public.generalize_closed_service_location() from public");
  });
});
