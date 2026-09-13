-- TigerData-compatible append-only analytics table. actor_hash is HMAC pseudonymous;
-- raw Auth0 subjects and email are intentionally not stored.
create table if not exists public.tiger_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('service_viewed','filter_applied','request_sent','request_accepted','service_completed','rating_submitted','profile_item_purchased')),
  actor_hash text not null check (actor_hash ~ '^[0-9a-f]{32}$'),
  service_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);
create index if not exists tiger_analytics_events_time_idx on public.tiger_analytics_events (occurred_at desc);
create or replace function public.deny_tiger_analytics_mutation() returns trigger
language plpgsql set search_path = public, pg_temp
as $$ begin raise exception 'Tiger analytics is append-only'; end; $$;
drop trigger if exists tiger_analytics_no_update on public.tiger_analytics_events;
create trigger tiger_analytics_no_update before update or delete on public.tiger_analytics_events for each row execute function public.deny_tiger_analytics_mutation();
revoke update, delete, truncate on public.tiger_analytics_events from public;
revoke all on function public.deny_tiger_analytics_mutation() from public;
