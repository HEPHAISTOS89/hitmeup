-- Low-blast-radius production hardening based on Supabase Advisor findings.
-- Preserve the existing RPC contract and public profile projection.

set local lock_timeout = '10s';
set local statement_timeout = '2min';

-- Keep the safe profile projection usable under caller privileges. Only the
-- columns already exposed by the view are granted; identifiers and wallet data
-- remain inaccessible.
alter view public.public_profiles set (security_invoker = true);
revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;
revoke select on public.profiles from anon, authenticated;
grant select (
  edu_domain,
  display_name,
  avatar_url,
  bio,
  rating_sum,
  rating_count,
  completed_count,
  created_at,
  updated_at
) on public.profiles to authenticated;

-- Trigger functions remain callable by their triggers/event triggers without
-- being exposed as public RPCs.
revoke execute on function public.revoke_location_after_terminal()
  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

-- PostGIS is non-relocatable in this project. Remove the three advisor-flagged
-- estimation RPCs from client roles without changing spatial behavior used by
-- HitMeUp.
revoke execute on function public.st_estimatedextent(text, text)
  from public, anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text, boolean)
  from public, anon, authenticated;

-- The rate-limit table is service-role-only. An explicit restrictive deny
-- policy documents and enforces that browser roles can never access rows.
drop policy if exists "client roles cannot access rate limits" on public.api_rate_limits;
create policy "client roles cannot access rate limits"
on public.api_rate_limits
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- Preserve the original service policy semantics while avoiding two permissive
-- SELECT policies for providers.
drop policy if exists "providers manage their services" on public.services;
drop policy if exists "providers insert their services" on public.services;
drop policy if exists "providers update their services" on public.services;
drop policy if exists "providers delete their services" on public.services;
create policy "providers insert their services"
on public.services
for insert
to authenticated
with check (provider_id = public.current_subject());
create policy "providers update their services"
on public.services
for update
to authenticated
using (provider_id = public.current_subject())
with check (provider_id = public.current_subject());
create policy "providers delete their services"
on public.services
for delete
to authenticated
using (provider_id = public.current_subject());

-- Cover every foreign-key side reported by Advisor. These indexes do not change
-- query results and make joins and cascading deletes predictable at scale.
create index if not exists completion_confirmations_user_id_idx
  on public.completion_confirmations (user_id);
create index if not exists interaction_events_service_id_idx
  on public.interaction_events (service_id);
create index if not exists location_shares_user_id_idx
  on public.location_shares (user_id);
create index if not exists messages_sender_id_idx
  on public.messages (sender_id);
create index if not exists profile_customizations_user_id_idx
  on public.profile_customizations (user_id);
create index if not exists ratings_author_id_idx
  on public.ratings (author_id);
create index if not exists ratings_subject_id_idx
  on public.ratings (subject_id);
create index if not exists services_provider_id_idx
  on public.services (provider_id);
