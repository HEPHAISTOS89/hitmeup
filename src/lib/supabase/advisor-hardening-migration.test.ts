import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260913042018_harden_advisor_findings_without_contract_change.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Supabase Advisor hardening migration", () => {
  it("keeps the profile projection usable without granting private columns", () => {
    expect(migration).toContain("alter view public.public_profiles set (security_invoker = true)");
    expect(migration).toContain("grant select (\n  edu_domain,");
    const grantedColumns = migration.split("grant select (", 2)[1]?.split(") on public.profiles", 1)[0] ?? "";
    expect(grantedColumns).not.toMatch(/\b(email|solana_wallet|user_id|exact_point)\b/i);
  });

  it("blocks browser execution of trigger helpers and rate-limit rows", () => {
    expect(migration).toContain("revoke execute on function public.revoke_location_after_terminal()");
    expect(migration).toContain("revoke execute on function public.rls_auto_enable()");
    expect(migration).toContain('create policy "client roles cannot access rate limits"');
    expect(migration).toContain("as restrictive\nfor all\nto anon, authenticated\nusing (false)\nwith check (false)");
  });

  it("resolves PostGIS functions in the installed extension schema", () => {
    expect(migration).toContain("where extension_record.extname = 'postgis'");
    expect(migration).toContain("extensions.st_estimatedextent(text, text)");
    expect(migration).toContain("to_regprocedure(format('%I.st_estimatedextent(%s)'");
    expect(migration).not.toContain("revoke execute on function public.st_estimatedextent");
  });

  it("preserves service policy semantics without overlapping SELECT policies", () => {
    expect(migration).toContain('drop policy if exists "providers manage their services"');
    expect(migration).toContain('create policy "providers insert their services"');
    expect(migration).toContain('create policy "providers update their services"');
    expect(migration).toContain('create policy "providers delete their services"');
  });

  it("adds all eight Advisor-reported foreign-key indexes", () => {
    const expected = [
      "completion_confirmations_user_id_idx",
      "interaction_events_service_id_idx",
      "location_shares_user_id_idx",
      "messages_sender_id_idx",
      "profile_customizations_user_id_idx",
      "ratings_author_id_idx",
      "ratings_subject_id_idx",
      "services_provider_id_idx",
    ];

    for (const index of expected) {
      expect(migration).toContain(`create index if not exists ${index}`);
    }
  });
});
