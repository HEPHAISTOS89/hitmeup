import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_MARKETPLACE_CATALOG, SOLANA_AVATAR_PRODUCTS } from "../avatar-marketplace-catalog";

const migration = readFileSync(new URL("../../../supabase/migrations/20260913090000_rewards_avatar_marketplace.sql", import.meta.url), "utf8");

describe("reward and avatar marketplace migration", () => {
  it("keeps the TypeScript and database catalogs aligned", () => {
    for (const item of AVATAR_MARKETPLACE_CATALOG) {
      expect(migration).toContain(`('${item.sku}','${item.label}'`);
      expect(migration).toContain(`'${item.unlockMethod}'`);
    }
    for (const [sku, product] of Object.entries(SOLANA_AVATAR_PRODUCTS)) {
      expect(migration).toContain(`'${sku}'`);
      expect(migration).toContain(String(product.lamports));
    }
    expect(AVATAR_MARKETPLACE_CATALOG.filter((item) => item.sku.startsWith("avatar.")).every((item) => item.assetStatus === "approved")).toBe(true);
  });

  it("awards points only after verified bilateral completion and ratings", () => {
    expect(migration).toContain("request_row.status <> 'closed'");
    expect(migration).toContain("current_status not in ('meeting', 'completion_pending')");
    expect(migration).toContain("meeting_started_at is null");
    expect(migration).toContain("at most three rewarded services per student per UTC day");
    expect(migration).toContain("order by profile.user_id for update");
    expect(migration).toContain("from public.completion_confirmations where request_id = target_request_id) <> 2");
    expect(migration).toContain("from public.ratings where request_id = target_request_id) <> 2");
    expect(migration).toContain("author_id = request_row.requester_id and subject_id = request_row.provider_id");
    expect(migration).toContain("author_id = request_row.provider_id and subject_id = request_row.requester_id");
    expect(migration).toContain("'service_closed', 50");
    expect(migration).toContain("request.status = 'meeting'");
    expect(migration).toContain("request.status in ('completion_pending', 'rating_pending')");
    expect(migration).toContain("count(distinct share.user_id)");
    expect(migration).toContain("release must not mint retroactive rewards");
  });

  it("uses an append-only idempotent ledger and serialized point spending", () => {
    expect(migration).toContain("reward ledger is append-only");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("perform 1 from public.profiles where user_id = public.current_subject() for update");
    expect(migration).toContain("if current_balance < cost then raise exception 'insufficient reward points'");
    expect(migration).toContain("on conflict (user_id, cosmetic_sku) do nothing");
  });

  it("keeps reward data subject-bound and outside Tiger analytics", () => {
    expect(migration).toContain("where ledger.user_id = public.current_subject()");
    expect(migration).toContain("public.profile_purchase_entitlements, public.profile_purchase_quotes");
    expect(migration).toContain("public.reward_ledger, public.reward_unlocks from anon, authenticated");
    expect(migration).not.toContain("interaction_events");
    expect(migration).not.toContain("tiger");
  });

  it("keeps old avatar_config untouched while adding server loadout state", () => {
    expect(migration).toContain("create table if not exists public.profile_avatar_loadout");
    expect(migration).toContain("and paid.equipped");
    expect(migration).toContain("on conflict (user_id,equip_group) do update set");
    expect(migration).not.toContain("alter table public.profiles add column");
    expect(migration).not.toContain("add column if not exists avatar_config");
  });

  it("requires server-verified paid ownership before premium equip", () => {
    expect(migration).toContain("paid.purchase_sku = paid_sku");
    expect(migration).toContain("where sku = target_sku and active and lamports = target_lamports");
    expect(migration).toContain("primary key (user_id, purchase_sku)");
    expect(migration).toContain("if existing_signature = target_signature then return customization_id");
    expect(migration).toContain("drop function if exists public.claim_profile_customization(text,text,text,text)");
    expect(migration).toContain("legacy cosmetic claim unavailable; use quote flow");
    expect(migration).toContain("grant execute on function public.claim_profile_customization(text,text,text,text) to service_role");
    expect(migration).toContain("grant execute on function public.claim_profile_customization(text,text,text,text,bigint,uuid) to service_role");
    expect(migration).not.toContain("grant execute on function public.claim_profile_customization(text,text,text,text,bigint,uuid) to authenticated");
    expect(migration).toContain("if quote_client_key = target_client_key then return quote_id");
    expect(migration).toContain("client_key uuid not null");
    expect(migration).toContain("purchase already in progress");
    expect(migration).toContain("invalid or expired cosmetic quote");
    expect(migration).toContain("target_asset_status <> 'approved'");
    expect(migration).toContain("perform 1 from public.profiles where user_id = public.current_subject() for update");
  });

  it("requires signed server-side wallet linking and preserves migration compatibility", () => {
    expect(migration).toContain("profiles_solana_wallet_unique_idx");
    expect(migration).toContain("revoke select, insert, update, delete on public.profiles from authenticated");
    expect(migration).toContain("revoke select, insert, update, delete on public.completion_confirmations, public.ratings from authenticated");
    expect(migration).toContain("public.update_my_profile_without_wallet(");
    expect(migration).toContain("revoke all on function public.update_my_profile(boolean,text,boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) from public, anon, authenticated");
    expect(migration).toContain("if set_solana_wallet then raise exception 'use signed wallet-link flow'");
    expect(migration).toContain("grant execute on function public.update_my_profile(boolean,text,boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) to authenticated");
    expect(migration).toContain("drop function if exists public.list_recommended_services()");
  });

  it("orders complete recommendation DTOs by a clamped server score", () => {
    expect(migration).toContain("subcategory text");
    expect(migration).toContain("provider_rating_count integer");
    expect(migration).toContain("service_type text");
    expect(migration).toContain("sponsored boolean");
    expect(migration).toContain("least(1, greatest(0");
    expect(migration).toContain("order by scored.recommendation_score desc, scored.created_at desc");
    expect(migration).toContain("service.provider_id <> public.current_subject()");
  });
});
