import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrations = [
  ["202609120001", "hitmeup_core"],
  ["202609120002", "hitmeup_integrity"],
  ["202609120004", "backend_contract"],
  ["202609120005", "profile_experience"],
] as const;

const repair = readFileSync(
  new URL(
    "../../../supabase/migrations/20260913040702_repair_manually_applied_hitmeup_history.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Supabase production migration history repair", () => {
  it.each(migrations)("keeps %s synchronized with its deployed statement payload", (version, name) => {
    const source = readFileSync(
      new URL(`../../../supabase/migrations/${version}_${name}.sql`, import.meta.url),
      "utf8",
    );

    expect(repair).toContain(`('${version}', '${name}', ARRAY[$migration_${version}$${source}$migration_${version}$]::text[])`);
  });

  it("is safe to re-run when the migration versions already exist", () => {
    expect(repair).toContain("on conflict (version) do update");
    expect(repair).toContain("statements = excluded.statements;");
  });
});
