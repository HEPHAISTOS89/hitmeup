import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/202609120002_hitmeup_integrity.sql", import.meta.url), "utf8");

describe("Supabase integrity migration guardrails", () => {
  it("does not allow lifecycle RPC calls to skip completion and ratings", () => {
    expect(migration).toContain("if next_status not in ('accepted','rejected','meeting','cancelled') then raise exception 'unsupported transition'; end if;");
  });

  it("keeps cosmetics server-claim-only and wallet-bound", () => {
    expect(migration).toContain("if profile_wallet is null or profile_wallet <> target_wallet then raise exception 'wallet does not match profile'; end if;");
    expect(migration).toContain("grant execute on function public.claim_profile_customization(text,text,text,text) to service_role;");
    expect(migration).not.toContain("claim_profile_customization(text,text) to authenticated");
  });

  it("binds profile provisioning to the current authenticated subject", () => {
    expect(migration).toContain("public.current_subject() is null or public.current_subject() <> target_user_id");
    expect(migration).toContain("lower(target_email) <> lower((select auth.jwt() ->> 'email'))");
    expect(migration).toContain("(select auth.jwt() ->> 'email_verified') <> 'true'");
    expect(migration).toContain("lower(target_edu_domain) <> lower((select auth.jwt() ->> 'edu_domain'))");
    expect(migration).toContain("grant execute on function public.ensure_profile(text,text,text,text) to authenticated;");
  });

  it("protects public discovery and deduplicates active requests", () => {
    expect(migration).toContain(
      "create or replace view public.public_profiles\nwith (security_invoker = true) as",
    );
    const publicView = migration
      .split("with (security_invoker = true) as", 2)[1]
      ?.split(";", 1)[0] ?? "";
    expect(publicView).not.toMatch(/\b(user_id|email|solana_wallet|exact_point)\b/i);
    expect(migration).toContain("create unique index if not exists active_service_requests_unique_idx");
    expect(migration).toContain("create unique index if not exists notifications_dedupe_key_uq");
  });

  it("keeps exact location restricted to the active mutual-consent lifecycle", () => {
    expect(migration).toContain("status in ('accepted','meeting','completion_pending')");
    expect(migration).not.toContain("status in ('accepted','meeting','completion_pending','rating_pending')");
  });

  it("derives the public point from the exact point server-side", () => {
    expect(migration).toContain("drop function if exists public.create_service(text,text,text,text,text,text,text);");
    expect(migration).toContain("ST_Project(exact_point, 350 + random() * 300, random() * 2 * pi())");
    expect(migration).not.toContain("approximate_wkt text");
  });

  it("casts the recommendation score before using numeric round precision", () => {
    const recommendations = migration.split("create or replace function public.list_recommended_services", 2)[1]
      ?.split("revoke all on function public.list_recommended_services()", 1)[0] ?? "";

    expect(recommendations).toContain("* 0.13)::numeric, 4),");
    expect(recommendations).not.toContain("* 0.13), 4),");
  });
});
