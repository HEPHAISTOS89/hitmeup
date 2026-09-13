import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrations = [
  ["202609120001", "hitmeup_core"],
  ["202609120002", "hitmeup_integrity"],
  ["202609120004", "backend_contract"],
  ["202609120005", "profile_experience"],
] as const;

const migrationDirectory = new URL("../../../supabase/migrations/", import.meta.url);
const repairPath = new URL(
  "../../../supabase/repairs/20260913040702_repair_manually_applied_hitmeup_history.sql",
  import.meta.url,
);
const repair = readFileSync(
  repairPath,
  "utf8",
);

describe("Supabase production migration history repair artifact", () => {
  it("keeps the production-only ledger repair out of the active Development sequence", () => {
    const repairFilename = "20260913040702_repair_manually_applied_hitmeup_history.sql";

    expect(existsSync(repairPath)).toBe(true);
    expect(readdirSync(migrationDirectory)).not.toContain(repairFilename);
    expect(
      existsSync(new URL(`../../../supabase/migrations/${repairFilename}`, import.meta.url)),
    ).toBe(false);
  });

  it.each(migrations)("keeps %s synchronized with its recorded Production statement payload", (version, name) => {
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
