-- Local corrective migration. Review on a disposable database before applying.
-- No service, account, or shared project is mutated by this repository.

alter table public.location_shares
  add column if not exists expires_at timestamptz not null default (now() + interval '1 hour');

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_time_idx on public.notifications (user_id, created_at desc);
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key_uq on public.notifications (dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;

create unique index if not exists active_service_requests_unique_idx
  on public.service_requests (service_id, requester_id)
  where status in ('requested','accepted','meeting','completion_pending','rating_pending');

-- Public profile projection; contact and wallet identifiers remain server-only.
create or replace view public.public_profiles
with (security_invoker = true) as
  select edu_domain, display_name, avatar_url, bio,
         rating_sum, rating_count, completed_count, created_at, updated_at
  from public.profiles;
revoke all on public.public_profiles from public;
grant select on public.public_profiles to authenticated;

-- Never expose exact service coordinates through a normal table select.
revoke select on public.services from anon, authenticated;
grant select (id, provider_id, category, title, description, price_note,
  availability_note, approximate_point, is_active, created_at, updated_at)
  on public.services to authenticated;
revoke select on public.profiles from anon, authenticated;
grant select on public.service_requests, public.messages,
  public.location_shares, public.completion_confirmations, public.ratings,
  public.interaction_events, public.profile_customizations, public.notifications
  to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio, solana_wallet) on public.profiles to authenticated;

drop policy if exists "students create their own requests" on public.service_requests;
create policy "students create their own requests" on public.service_requests
  for insert to authenticated with check (
    requester_id = public.current_subject()
    and requester_id <> provider_id
    and provider_id = (select service.provider_id from public.services service where service.id = service_id)
  );

drop policy if exists "participants manage own location consent" on public.location_shares;
create policy "participants manage own location consent" on public.location_shares
  for all to authenticated using (
    user_id = public.current_subject()
    and public.is_request_participant(request_id)
    and exists (select 1 from public.service_requests r where r.id = request_id and r.status in ('accepted','meeting','completion_pending'))
  ) with check (
    user_id = public.current_subject()
    and public.is_request_participant(request_id)
    and expires_at > now()
    and revoked_at is null
    and exists (select 1 from public.service_requests r where r.id = request_id and r.status in ('accepted','meeting','completion_pending'))
  );

drop policy if exists "participants manage own completion" on public.completion_confirmations;
create policy "participants manage own completion" on public.completion_confirmations
  for all to authenticated using (
    user_id = public.current_subject()
    and public.is_request_participant(request_id)
    and exists (select 1 from public.service_requests r where r.id = request_id and r.status in ('accepted','meeting','completion_pending'))
  ) with check (
    user_id = public.current_subject()
    and public.is_request_participant(request_id)
    and exists (select 1 from public.service_requests r where r.id = request_id and r.status in ('accepted','meeting','completion_pending'))
  );

drop policy if exists "participants submit one outbound rating" on public.ratings;
create policy "participants submit one outbound rating" on public.ratings
  for insert to authenticated with check (
    author_id = public.current_subject()
    and author_id <> subject_id
    and public.is_request_participant(request_id)
    and exists (
      select 1 from public.service_requests r
      where r.id = request_id and r.status in ('completion_pending','rating_pending','closed')
    )
    and (select count(*) from public.completion_confirmations c where c.request_id = ratings.request_id) = 2
    and subject_id in (select r.requester_id from public.service_requests r where r.id = request_id
                       union all
                       select r.provider_id from public.service_requests r where r.id = request_id)
  );

create policy "users read their notifications" on public.notifications
  for select to authenticated using (user_id = public.current_subject());

drop policy if exists "users create their own profile" on public.profiles;
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (user_id = public.current_subject());

create or replace function public.ensure_profile(
  target_user_id text, target_email text, target_edu_domain text, target_display_name text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.current_subject() is null or public.current_subject() <> target_user_id then raise exception 'profile authorization required'; end if;
  if target_user_id is null or target_email is null or target_edu_domain is null
     or target_display_name is null or lower(target_email) !~ ('@' || lower(target_edu_domain) || '$')
     or lower(target_edu_domain) not like '%.edu'
     or lower(target_email) <> lower((select auth.jwt() ->> 'email'))
     or (select auth.jwt() ->> 'email_verified') <> 'true'
     or lower(target_edu_domain) <> lower((select auth.jwt() ->> 'edu_domain'))
     or char_length(target_display_name) not between 2 and 60 then
    raise exception 'invalid profile';
  end if;
  insert into public.profiles (user_id, email, edu_domain, display_name)
  values (target_user_id, lower(target_email), lower(target_edu_domain), left(trim(target_display_name), 60))
  on conflict (user_id) do update set email = excluded.email,
    edu_domain = excluded.edu_domain, updated_at = now();
end;
$$;

create or replace function public.enqueue_request_notification(
  target_user_id text, target_type text, target_payload jsonb, target_dedupe_key text
) returns void
language sql security definer set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, payload, dedupe_key)
  values (target_user_id, target_type, coalesce(target_payload, '{}'::jsonb), target_dedupe_key)
  on conflict do nothing;
$$;

drop function if exists public.create_service(text,text,text,text,text,text,text);
create or replace function public.create_service(
  service_category text, service_title text, service_description text,
  service_price_note text, service_availability_note text,
  exact_wkt text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare created_id uuid; exact_point extensions.geography(point,4326); approximate_point extensions.geography(point,4326);
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  exact_point := extensions.ST_GeogFromText(exact_wkt);
  if extensions.ST_Y(exact_point::extensions.geometry) not between -89.99 and 89.99 or extensions.ST_X(exact_point::extensions.geometry) not between -179.99 and 179.99 then raise exception 'exact point is invalid'; end if;
  -- Public point is a deterministic ~300m offset from a 0.004-degree grid cell.
  approximate_point := extensions.ST_Project(exact_point, 350 + random() * 300, random() * 2 * pi());
  insert into public.services (provider_id, category, title, description, price_note, availability_note, approximate_point, exact_point)
  values (public.current_subject(), service_category, service_title, service_description,
    service_price_note, service_availability_note,
    approximate_point, exact_point)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.create_service_request(target_service_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare created_id uuid; target_provider text;
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  select provider_id into target_provider from public.services where id = target_service_id and is_active;
  if target_provider is null or target_provider = public.current_subject() then raise exception 'service unavailable'; end if;
  insert into public.service_requests (service_id, requester_id, provider_id)
  values (target_service_id, public.current_subject(), target_provider)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.transition_service_request(target_request_id uuid, next_status public.request_status) returns public.request_status
language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_status public.request_status; requester text; provider text; recipient text;
begin
  select status, requester_id, provider_id into current_status, requester, provider
  from public.service_requests where id = target_request_id for update;
  if current_status is null or public.current_subject() not in (requester, provider) then raise exception 'request unavailable'; end if;
  if next_status = 'accepted' and (public.current_subject() <> provider or current_status <> 'requested') then raise exception 'invalid acceptance'; end if;
  if next_status = 'rejected' and (public.current_subject() <> provider or current_status <> 'requested') then raise exception 'invalid rejection'; end if;
  if next_status = 'meeting' and current_status <> 'accepted' then raise exception 'invalid meeting transition'; end if;
  if next_status = 'cancelled' and current_status not in ('requested','accepted','meeting') then raise exception 'invalid cancellation'; end if;
  if next_status not in ('accepted','rejected','meeting','cancelled') then raise exception 'unsupported transition'; end if;
  update public.service_requests set status = next_status, accepted_at = case when next_status = 'accepted' then now() else accepted_at end where id = target_request_id;
  recipient := case when public.current_subject() = requester then provider else requester end;
  perform public.enqueue_request_notification(recipient, 'request_status', jsonb_build_object('request_id', target_request_id, 'status', next_status), 'request-status:' || target_request_id || ':' || next_status::text || ':' || recipient);
  return next_status;
end;
$$;

create or replace function public.send_request_message(target_request_id uuid, message_body text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare created_id uuid; current_status public.request_status; recipient text;
begin
  select status into current_status from public.service_requests where id = target_request_id and public.current_subject() in (requester_id, provider_id);
  if current_status is null or current_status in ('rejected','cancelled','closed','rating_pending') then raise exception 'messaging unavailable'; end if;
  insert into public.messages (request_id, sender_id, body) values (target_request_id, public.current_subject(), message_body) returning id into created_id;
  select case when requester_id = public.current_subject() then provider_id else requester_id end into recipient from public.service_requests where id = target_request_id;
  perform public.enqueue_request_notification(recipient, 'message_received', jsonb_build_object('request_id', target_request_id, 'message_id', created_id), 'message:' || created_id);
  return created_id;
end;
$$;

create or replace function public.share_request_location(target_request_id uuid, target_expires_at timestamptz) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if target_expires_at <= now() or target_expires_at > now() + interval '24 hours' then raise exception 'invalid expiry'; end if;
  if not exists (select 1 from public.service_requests where id = target_request_id and public.current_subject() in (requester_id, provider_id) and status in ('accepted','meeting','completion_pending')) then raise exception 'location sharing unavailable'; end if;
  insert into public.location_shares (request_id, user_id, shared_at, revoked_at, expires_at)
  values (target_request_id, public.current_subject(), now(), null, target_expires_at)
  on conflict (request_id, user_id) do update set shared_at = now(), revoked_at = null, expires_at = excluded.expires_at;
  perform public.enqueue_request_notification(
    (select case when requester_id = public.current_subject() then provider_id else requester_id end from public.service_requests where id = target_request_id),
    'location_shared', jsonb_build_object('request_id', target_request_id),
    'location:' || target_request_id || ':' || public.current_subject() || ':' || target_expires_at::text
  );
  return true;
end;
$$;

create or replace function public.revoke_request_location(target_request_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.location_shares set revoked_at = now()
  where request_id = target_request_id and user_id = public.current_subject();
  return found;
end;
$$;

create or replace function public.get_shared_request_location(target_request_id uuid)
returns table (service_id uuid, exact_point text, expires_at timestamptz)
language sql security definer set search_path = public, pg_temp
as $$
  select r.service_id, extensions.ST_AsText(s.exact_point), least(a.expires_at, b.expires_at)
  from public.service_requests r
  join public.services s on s.id = r.service_id
  join public.location_shares a on a.request_id = r.id and a.user_id = r.requester_id
  join public.location_shares b on b.request_id = r.id and b.user_id = r.provider_id
  where r.id = target_request_id and public.current_subject() in (r.requester_id, r.provider_id)
    and r.status in ('accepted','meeting','completion_pending')
    and a.revoked_at is null and b.revoked_at is null and a.expires_at > now() and b.expires_at > now();
$$;

create or replace function public.confirm_request_completion(target_request_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare total integer; recipient text; requester text; provider text;
begin
  if not exists (select 1 from public.service_requests where id = target_request_id and public.current_subject() in (requester_id, provider_id) and status in ('accepted','meeting','completion_pending')) then raise exception 'completion unavailable'; end if;
  insert into public.completion_confirmations (request_id, user_id) values (target_request_id, public.current_subject()) on conflict do nothing;
  select count(*) into total from public.completion_confirmations where request_id = target_request_id;
  select requester_id, provider_id, case when requester_id = public.current_subject() then provider_id else requester_id end into requester, provider, recipient from public.service_requests where id = target_request_id;
  if total = 1 then
    update public.service_requests set status = 'completion_pending' where id = target_request_id and status in ('accepted','meeting');
    perform public.enqueue_request_notification(recipient, 'completion_confirmed', jsonb_build_object('request_id', target_request_id), 'completion:' || target_request_id || ':' || public.current_subject());
  end if;
  if total = 2 then
    update public.service_requests set status = 'rating_pending' where id = target_request_id and status <> 'closed';
    perform public.enqueue_request_notification(requester, 'rating_available', jsonb_build_object('request_id', target_request_id), 'rating-available:' || target_request_id || ':' || requester);
    perform public.enqueue_request_notification(provider, 'rating_available', jsonb_build_object('request_id', target_request_id), 'rating-available:' || target_request_id || ':' || provider);
  end if;
  return total = 2;
end;
$$;

create or replace function public.submit_request_rating(target_request_id uuid, target_score smallint, target_comment text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_subject text; rating_id uuid; current_status public.request_status; was_closed boolean; requester text; provider text;
begin
  select status into current_status
  from public.service_requests where id = target_request_id and public.current_subject() in (requester_id, provider_id);
  if current_status is null or current_status not in ('rating_pending','closed') then raise exception 'rating unavailable'; end if;
  was_closed := current_status = 'closed';
  select requester_id, provider_id, case when requester_id = public.current_subject() then provider_id else requester_id end into requester, provider, target_subject from public.service_requests where id = target_request_id;
  insert into public.ratings (request_id, author_id, subject_id, score, comment)
  values (target_request_id, public.current_subject(), target_subject, target_score, nullif(trim(target_comment), ''))
  on conflict (request_id, author_id) do nothing
  returning id into rating_id;
  if rating_id is null then
    select id into rating_id from public.ratings where request_id = target_request_id and author_id = public.current_subject();
  else
    update public.profiles set rating_sum = rating_sum + target_score, rating_count = rating_count + 1 where user_id = target_subject;
    perform public.enqueue_request_notification(target_subject, 'rating_received', jsonb_build_object('request_id', target_request_id), 'rating:' || target_request_id || ':' || public.current_subject());
  end if;
  if not was_closed and (select count(*) from public.ratings where request_id = target_request_id) = 2 then
    update public.profiles set completed_count = completed_count + 1
    where user_id in (select requester_id from public.service_requests where id = target_request_id union all select provider_id from public.service_requests where id = target_request_id);
    update public.service_requests set status = 'closed', closed_at = coalesce(closed_at, now()) where id = target_request_id;
  end if;
  return rating_id;
end;
$$;

drop function if exists public.claim_profile_customization(text, text);
create or replace function public.claim_profile_customization(
  target_user_id text, target_sku text, target_signature text, target_wallet text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare customization_id uuid; profile_wallet text;
begin
  if target_sku not in ('profile-frame','campus-theme','trust-badge')
     or target_signature !~ '^[1-9A-HJ-NP-Za-km-z]{80,100}$'
     or target_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'invalid cosmetic claim';
  end if;
  select solana_wallet into profile_wallet from public.profiles where user_id = target_user_id;
  if profile_wallet is null or profile_wallet <> target_wallet then raise exception 'wallet does not match profile'; end if;
  insert into public.profile_customizations (user_id, cosmetic_sku, solana_cluster, transaction_signature, verified_at)
  values (target_user_id, target_sku, 'devnet', target_signature, now())
  on conflict (transaction_signature) do nothing returning id into customization_id;
  if customization_id is null then
    select id into customization_id from public.profile_customizations where transaction_signature = target_signature and user_id = target_user_id and cosmetic_sku = target_sku;
    if customization_id is null then raise exception 'transaction already claimed'; end if;
  end if;
  return customization_id;
end;
$$;

revoke all on function public.create_service(text,text,text,text,text,text) from public;
revoke all on function public.create_service_request(uuid) from public;
revoke all on function public.transition_service_request(uuid,public.request_status) from public;
revoke all on function public.send_request_message(uuid,text) from public;
revoke all on function public.share_request_location(uuid,timestamptz) from public;
revoke all on function public.revoke_request_location(uuid) from public;
revoke all on function public.get_shared_request_location(uuid) from public;
revoke all on function public.confirm_request_completion(uuid) from public;
revoke all on function public.submit_request_rating(uuid,smallint,text) from public;
revoke all on function public.ensure_profile(text,text,text,text) from public;
revoke all on function public.enqueue_request_notification(text,text,jsonb,text) from public;
revoke all on function public.claim_profile_customization(text,text,text,text) from public;
grant execute on function public.ensure_profile(text,text,text,text) to authenticated;
grant execute on function public.create_service(text,text,text,text,text,text), public.create_service_request(uuid), public.transition_service_request(uuid,public.request_status), public.send_request_message(uuid,text), public.share_request_location(uuid,timestamptz), public.revoke_request_location(uuid), public.get_shared_request_location(uuid), public.confirm_request_completion(uuid), public.submit_request_rating(uuid,smallint,text) to authenticated;
grant execute on function public.claim_profile_customization(text,text,text,text) to service_role;

-- Rating gate: a student with an unfinished bilateral rating cannot publish, request,
-- accept, or enter a meeting. Triggers keep this invariant across every API caller.
create or replace function public.has_rating_gap(target_user text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.service_requests r
    where r.status in ('rating_pending','closed')
      and target_user in (r.requester_id, r.provider_id)
      and not exists (select 1 from public.ratings rating where rating.request_id = r.id and rating.author_id = target_user)
  )
$$;
create or replace function public.enforce_rating_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if TG_TABLE_NAME = 'services' and public.has_rating_gap(NEW.provider_id) then raise exception 'required bilateral rating missing'; end if;
  if TG_TABLE_NAME = 'service_requests' and NEW.status in ('requested','accepted','meeting')
     and (public.has_rating_gap(NEW.requester_id) or public.has_rating_gap(NEW.provider_id)) then raise exception 'required bilateral rating missing'; end if;
  if TG_TABLE_NAME = 'service_requests' and NEW.status in ('accepted','meeting')
     and (public.has_rating_gap(NEW.requester_id) or public.has_rating_gap(NEW.provider_id)) then raise exception 'required bilateral rating missing'; end if;
  return NEW;
end;
$$;
drop trigger if exists services_rating_gate on public.services;
create trigger services_rating_gate before insert on public.services for each row execute function public.enforce_rating_gate();
drop trigger if exists requests_rating_gate on public.service_requests;
create trigger requests_rating_gate before insert or update of status on public.service_requests for each row execute function public.enforce_rating_gate();
-- A completed interaction no longer needs location access.
create or replace function public.revoke_location_after_completion() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if NEW.status in ('completion_pending','rating_pending','closed') then
    update public.location_shares set revoked_at = coalesce(revoked_at, now()) where request_id = NEW.id;
  end if;
  return NEW;
end; $$;
drop trigger if exists revoke_location_after_completion on public.service_requests;
create trigger revoke_location_after_completion after update of status on public.service_requests for each row execute function public.revoke_location_after_completion();

-- Explainable personalized discovery projection. It returns public fields only;
-- score uses the viewer's stored interests plus provider rating/reliability.
alter table public.profiles add column if not exists interests jsonb not null default '[]'::jsonb;
create or replace function public.list_recommended_services()
returns table (id uuid, title text, category text, description text, price_note text,
  availability_note text, approximate_point text, provider_name text, adjusted_rating numeric,
  score numeric, explanation text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.id, s.title, s.category, s.description, s.price_note, s.availability_note,
    extensions.ST_AsText(s.approximate_point), p.display_name,
    round(((p.rating_sum + 4.5 * 8)::numeric / greatest(p.rating_count + 8, 1)), 2),
    round((case when exists (select 1 from jsonb_array_elements_text(coalesce(me.interests, '[]'::jsonb)) interest where lower(interest) = lower(s.category)) then 0.30 else 0.075 end
      + least(1, ((p.rating_sum + 4.5 * 8)::numeric / greatest(p.rating_count + 8, 1) - 3.5) / 1.5) * 0.27
      + least(1, greatest(0, 1 - extensions.ST_Distance(s.approximate_point, extensions.ST_SetSRID(extensions.ST_MakePoint(-101.87,33.58),4326)::extensions.geography) / 5000)) * 0.20
      + least(1, p.completed_count::numeric / 60) * 0.13)::numeric, 4),
    'Category affinity, adjusted rating, approximate distance, and completion reliability.'
  from public.services s join public.profiles p on p.user_id=s.provider_id
  left join public.profiles me on me.user_id=public.current_subject()
  where s.is_active;
$$;
revoke all on function public.list_recommended_services() from public;
grant execute on function public.list_recommended_services() to authenticated;

-- Serialize the one-off acceptance on the service row; only one pending request wins.
create or replace function public.lock_service_acceptance() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare still_active boolean;
begin
  if NEW.status = 'accepted' and OLD.status = 'requested' then
    select is_active into still_active from public.services where id = NEW.service_id for update;
    if coalesce(still_active, false) = false then raise exception 'service already accepted'; end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists lock_service_acceptance on public.service_requests;
create trigger lock_service_acceptance before update of status on public.service_requests for each row execute function public.lock_service_acceptance();
create or replace function public.close_losing_service_requests() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if NEW.status = 'accepted' and OLD.status <> 'accepted' then
    update public.services set is_active = false, updated_at = now() where id = NEW.service_id;
    update public.service_requests set status = 'rejected', updated_at = now()
      where service_id = NEW.service_id and id <> NEW.id and status = 'requested';
  end if;
  return NEW;
end;
$$;
drop trigger if exists close_losing_service_requests on public.service_requests;
create trigger close_losing_service_requests after update of status on public.service_requests for each row execute function public.close_losing_service_requests();

-- Correct actor scoping: an incoming provider rating gap must not block a request
-- until that provider attempts an actor-controlled operation.
create or replace function public.enforce_rating_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if TG_TABLE_NAME = 'services' and NEW.provider_id = public.current_subject() and public.has_rating_gap(NEW.provider_id) then raise exception 'required bilateral rating missing'; end if;
  if TG_TABLE_NAME = 'service_requests' and NEW.status = 'requested'
     and NEW.requester_id = public.current_subject() and public.has_rating_gap(NEW.requester_id) then raise exception 'required bilateral rating missing'; end if;
  if TG_TABLE_NAME = 'service_requests' and NEW.status in ('accepted','meeting')
     and public.current_subject() in (NEW.requester_id, NEW.provider_id) and public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  return NEW;
end;
$$;

-- State changes go through the security-definer RPCs; direct client writes cannot
-- bypass transition, consent, bilateral completion, or rating gates.
revoke insert, update, delete on public.services, public.service_requests, public.messages,
  public.location_shares, public.completion_confirmations, public.ratings from authenticated;
grant select on public.service_requests, public.messages, public.location_shares,
  public.completion_confirmations, public.ratings, public.notifications to authenticated;

create or replace function public.revoke_location_after_terminal() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if NEW.status in ('rating_pending','closed','rejected','cancelled') then
    update public.location_shares set revoked_at = coalesce(revoked_at, now()) where request_id = NEW.id;
  end if;
  return NEW;
end; $$;
drop trigger if exists revoke_location_after_terminal on public.service_requests;
create trigger revoke_location_after_terminal after update of status on public.service_requests for each row execute function public.revoke_location_after_terminal();
