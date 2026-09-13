import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202609120004_backend_contract.sql", import.meta.url),
  "utf8",
);

describe("final backend contract migration", () => {
  it("keeps public discovery approximate and excludes identity/location secrets", () => {
    const projection = migration.split("create or replace function public.list_public_services", 2)[1]
      ?.split("create or replace function public.list_my_service_requests", 1)[0] ?? "";
    expect(projection).toContain("approximate_lat");
    expect(projection).toContain("provider_name");
    const returnShape = projection.split("language sql", 1)[0] ?? projection;
    expect(returnShape).not.toMatch(/\b(provider_id|exact_point|email|solana_wallet)\b/i);
  });

  it("blocks only the actor with an outstanding rating", () => {
    expect(migration).toContain("NEW.requester_id = public.current_subject()");
    expect(migration).toContain("public.has_rating_gap(public.current_subject())");
    expect(migration).not.toContain("public.has_rating_gap(NEW.requester_id) or public.has_rating_gap(NEW.provider_id)");
    expect(migration).toContain("if TG_TABLE_NAME = 'services' then");
    expect(migration).toContain("elsif TG_TABLE_NAME = 'service_requests' then");
    expect(migration).toContain("revoke all on function public.has_rating_gap(text) from public");
  });

  it("serializes one-off acceptance and closes competing requests", () => {
    expect(migration).toContain("from public.services where id = target_service for update");
    expect(migration).toContain("set is_active = false");
    expect(migration).toContain("id <> target_request_id");
    expect(migration).toContain("status = 'rejected'");
    expect(migration).toContain("returning id, requester_id");
    expect(migration).toContain("loser.requester_id, 'request_status'");
  });

  it("requires bilateral active location consent before the meeting state", () => {
    expect(migration).toContain("mutual location consent required");
    expect(migration).toContain("share.expires_at > now()");
    expect(migration).toContain("share.revoked_at is null");
  });

  it("validates exact coordinates on both create and replacement", () => {
    expect(
      migration.match(
        /extensions\.ST_Y\(exact_location::extensions\.geometry\) not between -89\.99 and 89\.99/g,
      ),
    ).toHaveLength(2);
  });

  it("stores a non-reversible public point with a guaranteed minimum displacement", () => {
    expect(migration.match(/ST_Project\(\s*exact_location,\s*350 \+ random\(\) \* 300,/g)).toHaveLength(2);
    expect(migration).not.toContain("ST_SnapToGrid(exact_location");
  });

  it("revokes location only after completion becomes bilateral or terminal", () => {
    expect(migration).toContain("drop trigger if exists revoke_location_after_completion");
    expect(migration).toContain("NEW.status in ('rating_pending', 'closed', 'rejected', 'cancelled')");
    expect(migration).not.toContain("NEW.status in ('completion_pending', 'rating_pending', 'closed')");
  });

  it("removes direct table paths that could bypass RPC invariants", () => {
    expect(migration).toContain("revoke select, insert, update, delete on public.services, public.service_requests");
    expect(migration).toContain("public.list_request_messages(uuid)");
    expect(migration).toContain("public.list_my_cosmetics()");
    expect(migration).toContain("public.update_my_profile(boolean, text, boolean, text, boolean, text, boolean, text, boolean, jsonb, boolean, jsonb)");
    expect(migration).not.toContain("grant update (display_name, avatar_url, bio, solana_wallet, interests)");
    expect(migration).toContain("revoke select, insert, update, delete on public.profiles from authenticated");
    expect(migration).toContain("profiles_avatar_config_valid");
    expect(migration).toContain("coalesce(target_avatar_config ->> 'skin', '') not in");
  });

  it("serializes completion and ratings before aggregate updates", () => {
    const completion = migration.split("create or replace function public.confirm_request_completion", 2)[1]
      ?.split("create or replace function public.submit_request_rating", 1)[0] ?? "";
    const rating = migration.split("create or replace function public.submit_request_rating", 2)[1]
      ?.split("-- New service creation", 1)[0] ?? "";
    expect(completion).toContain("for update");
    expect(rating).toContain("for update");
    expect(rating).toContain("inserted_rating boolean := false");
  });

  it("provides an atomic shared rate limiter only to the service role", () => {
    expect(migration).toContain("create table if not exists public.api_rate_limits");
    expect(migration).toContain("on conflict (subject_hash, operation) do update");
    expect(migration).toContain("grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role");
    expect(migration).toContain("revoke all on public.api_rate_limits from public, anon, authenticated");
  });
});
