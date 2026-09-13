import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_CATALOG, SERVICE_CATEGORIES, subcategoriesFor } from "./service-taxonomy";

const migration = readFileSync(
  new URL("../../supabase/migrations/202609130500_marketplace_taxonomy.sql", import.meta.url),
  "utf8",
);

describe("marketplace taxonomy contract", () => {
  it("defines the ten requested categories with icon-backed subservices", () => {
    expect(SERVICE_CATEGORIES).toEqual([
      "Social", "Services", "Tutoring", "Jobs", "Volunteer",
      "Clubs", "Activities", "Events", "Businesses", "Help",
    ]);
    expect(CATEGORY_CATALOG).toHaveLength(10);
    for (const category of CATEGORY_CATALOG) {
      expect(category.icon).toBeTruthy();
      expect(subcategoriesFor(category.id).length).toBeGreaterThanOrEqual(6);
      expect(category.subcategories.every((item) => Boolean(item.icon))).toBe(true);
    }
  });

  it("keeps sponsored businesses permanent and student posts temporary", () => {
    expect(CATEGORY_CATALOG.find((item) => item.id === "Businesses")?.listingKind).toBe("permanent");
    expect(migration).toContain("listing_kind in ('temporary', 'permanent')");
    expect(migration).toContain("check (not sponsored or listing_kind = 'permanent')");
    expect(migration).toContain("service_subcategory");
    expect(migration).toContain("'temporary', false");
    expect(migration).toContain("list_public_marketplace_services");
    const publicProjection = migration.split("create or replace function public.list_public_marketplace_services", 2)[1];
    expect(publicProjection).toContain("service.approximate_point");
    expect(publicProjection).not.toContain("service.exact_point");
  });

  it("locks business fields behind a privileged workflow and validates RPC filters", () => {
    expect(migration).toContain("revoke insert, update, delete, truncate, references, trigger on table public.services from anon, authenticated");
    expect(migration).toContain("services_reviewed_listing_fields");
    expect(migration).toContain("when 'Tutoring' then 'Tutoring'");
    expect(migration).toContain("new.subcategory is null or not public.is_valid_service_taxonomy");
    expect(migration).toContain("current_user not in ('service_role', 'postgres', 'supabase_admin')");
    expect(migration).toContain("service_category = 'Businesses'");
    expect(migration).toContain("is_valid_service_taxonomy(service_category, trim(service_subcategory))");
    expect(migration).toContain("target_listing_kind text default null");
    expect(migration).toContain("target_subcategory text default null");
    expect(migration).toContain("listing kind is invalid");
    expect(migration).toContain("query_pattern");
  });
});
