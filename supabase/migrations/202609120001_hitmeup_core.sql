-- Prepared locally. Do not apply to a shared Supabase project without explicit approval.
create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create type public.request_status as enum (
  'requested', 'accepted', 'meeting', 'completion_pending',
  'rating_pending', 'closed', 'rejected', 'cancelled'
);

create table public.profiles (
  user_id text primary key,
  email text not null unique check (email = lower(email)),
  edu_domain text not null check (edu_domain like '%.edu'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 320),
  solana_wallet text,
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.profiles(user_id) on delete cascade,
  category text not null,
  title text not null check (char_length(title) between 4 and 90),
  description text not null check (char_length(description) between 10 and 600),
  price_note text not null check (char_length(price_note) <= 80),
  availability_note text not null check (char_length(availability_note) <= 120),
  approximate_point extensions.geography(point, 4326) not null,
  exact_point extensions.geography(point, 4326) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_approximate_point_gix on public.services using gist (approximate_point);
create index services_active_category_idx on public.services (is_active, category);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  requester_id text not null references public.profiles(user_id) on delete restrict,
  provider_id text not null references public.profiles(user_id) on delete restrict,
  status public.request_status not null default 'requested',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  check (requester_id <> provider_id)
);

create index requests_requester_idx on public.service_requests (requester_id, created_at desc);
create index requests_provider_idx on public.service_requests (provider_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_id text not null references public.profiles(user_id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_request_idx on public.messages (request_id, created_at);

create table public.location_shares (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (request_id, user_id)
);

create table public.completion_confirmations (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  user_id text not null references public.profiles(user_id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  author_id text not null references public.profiles(user_id) on delete restrict,
  subject_id text not null references public.profiles(user_id) on delete restrict,
  score smallint not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (request_id, author_id),
  check (author_id <> subject_id)
);

create table public.interaction_events (
  id bigint generated always as identity primary key,
  actor_id text not null references public.profiles(user_id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  event_type text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index interaction_events_actor_time_idx on public.interaction_events (actor_id, occurred_at desc);

create table public.profile_customizations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  cosmetic_sku text not null,
  solana_cluster text not null check (solana_cluster = 'devnet'),
  transaction_signature text not null unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.messages enable row level security;
alter table public.location_shares enable row level security;
alter table public.completion_confirmations enable row level security;
alter table public.ratings enable row level security;
alter table public.interaction_events enable row level security;
alter table public.profile_customizations enable row level security;

create function public.current_subject() returns text
language sql stable security invoker
set search_path = ''
as $$ select nullif((select auth.jwt()) ->> 'sub', '') $$;

revoke all on function public.current_subject() from public;
grant execute on function public.current_subject() to authenticated;

create function public.is_request_participant(target_request_id uuid) returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.service_requests request
    where request.id = target_request_id
      and public.current_subject() in (request.requester_id, request.provider_id)
  )
$$;

revoke all on function public.is_request_participant(uuid) from public;
grant execute on function public.is_request_participant(uuid) to authenticated;

create policy "profiles are readable to verified users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using (user_id = public.current_subject())
  with check (user_id = public.current_subject());

create policy "active services are discoverable" on public.services
  for select to authenticated using (is_active or provider_id = public.current_subject());
create policy "providers manage their services" on public.services
  for all to authenticated using (provider_id = public.current_subject())
  with check (provider_id = public.current_subject());

create policy "participants read requests" on public.service_requests
  for select to authenticated using (public.current_subject() in (requester_id, provider_id));
create policy "students create their own requests" on public.service_requests
  for insert to authenticated with check (requester_id = public.current_subject());

create policy "participants read messages" on public.messages
  for select to authenticated using (public.is_request_participant(request_id));
create policy "participants send their own messages" on public.messages
  for insert to authenticated with check (
    sender_id = public.current_subject() and public.is_request_participant(request_id)
  );

create policy "participants manage own location consent" on public.location_shares
  for all to authenticated using (
    user_id = public.current_subject() and public.is_request_participant(request_id)
  ) with check (
    user_id = public.current_subject() and public.is_request_participant(request_id)
  );

create policy "participants manage own completion" on public.completion_confirmations
  for all to authenticated using (
    user_id = public.current_subject() and public.is_request_participant(request_id)
  ) with check (
    user_id = public.current_subject() and public.is_request_participant(request_id)
  );

create policy "participants read ratings after both submit" on public.ratings
  for select to authenticated using (
    public.is_request_participant(request_id)
    and (select count(*) from public.ratings peer where peer.request_id = ratings.request_id) = 2
  );
create policy "participants submit one outbound rating" on public.ratings
  for insert to authenticated with check (
    author_id = public.current_subject()
    and public.is_request_participant(request_id)
  );

create policy "users write their interaction events" on public.interaction_events
  for insert to authenticated with check (actor_id = public.current_subject());
create policy "users read their interaction events" on public.interaction_events
  for select to authenticated using (actor_id = public.current_subject());

create policy "users read their cosmetics" on public.profile_customizations
  for select to authenticated using (user_id = public.current_subject());

-- Exact coordinates are intentionally not granted through the services table.
-- Expose them later through a security-invoker RPC that checks request acceptance
-- plus two active rows in location_shares before returning a point.
