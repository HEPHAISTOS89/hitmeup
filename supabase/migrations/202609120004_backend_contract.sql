-- Final backend contract hardening for the one-off, 1:1 HitMeUp service flow.
-- Prepared locally. Apply only to an explicitly approved disposable/dev database.

alter table public.services
  add column if not exists scheduled_for timestamptz;

alter table public.service_requests
  add column if not exists updated_at timestamptz not null default now();

alter table public.profile_customizations
  add column if not exists equipped boolean not null default false;

-- A pending outbound rating blocks only the student attempting a gated action.
create or replace function public.has_rating_gap(target_user text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.service_requests request
    where request.status = 'rating_pending'
      and target_user in (request.requester_id, request.provider_id)
      and not exists (
        select 1 from public.ratings rating
        where rating.request_id = request.id and rating.author_id = target_user
      )
  )
$$;

create or replace function public.enforce_rating_gate() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if TG_TABLE_NAME = 'services' then
    if NEW.provider_id = public.current_subject()
       and public.has_rating_gap(NEW.provider_id) then
      raise exception 'required bilateral rating missing';
    end if;
  elsif TG_TABLE_NAME = 'service_requests' then
    if NEW.status = 'requested'
       and NEW.requester_id = public.current_subject()
       and public.has_rating_gap(NEW.requester_id) then
      raise exception 'required bilateral rating missing';
    end if;
    if NEW.status in ('accepted', 'meeting')
       and public.current_subject() in (NEW.requester_id, NEW.provider_id)
       and public.has_rating_gap(public.current_subject()) then
      raise exception 'required bilateral rating missing';
    end if;
  end if;
  return NEW;
end;
$$;

-- Remove the earlier over-eager trigger: one participant confirming is not yet
-- completion. Exact location ends after the second confirmation or a terminal state.
drop trigger if exists revoke_location_after_completion on public.service_requests;
drop function if exists public.revoke_location_after_completion();

create or replace function public.revoke_location_after_terminal() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if NEW.status in ('rating_pending', 'closed', 'rejected', 'cancelled') then
    update public.location_shares
    set revoked_at = coalesce(revoked_at, now())
    where request_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists revoke_location_after_terminal on public.service_requests;
create trigger revoke_location_after_terminal
after update of status on public.service_requests
for each row execute function public.revoke_location_after_terminal();

-- Acceptance is serialized on the one-off service row. Only its provider can
-- accept, other pending requests are rejected, and the public offer closes.
drop trigger if exists lock_service_acceptance on public.service_requests;
drop trigger if exists close_losing_service_requests on public.service_requests;
drop function if exists public.lock_service_acceptance();
drop function if exists public.close_losing_service_requests();

create or replace function public.transition_service_request(
  target_request_id uuid,
  next_status public.request_status
) returns public.request_status
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_status public.request_status;
  requester text;
  provider text;
  target_service uuid;
  recipient text;
  service_available boolean;
  loser record;
begin
  select service_id into target_service
  from public.service_requests
  where id = target_request_id
    and public.current_subject() in (requester_id, provider_id);

  if target_service is null then raise exception 'request unavailable'; end if;

  if next_status = 'accepted' then
    -- Every acceptance takes the service lock before a request lock. This avoids
    -- deadlocks when two pending requests for the same one-off offer race.
    select is_active into service_available
    from public.services where id = target_service for update;
  end if;

  select status, requester_id, provider_id
  into current_status, requester, provider
  from public.service_requests
  where id = target_request_id
  for update;

  if current_status is null or public.current_subject() not in (requester, provider) then
    raise exception 'request unavailable';
  end if;
  if public.has_rating_gap(public.current_subject())
     and next_status in ('accepted', 'meeting') then
    raise exception 'required bilateral rating missing';
  end if;

  if next_status = 'accepted' then
    if public.current_subject() <> provider or current_status <> 'requested' then
      raise exception 'invalid acceptance';
    end if;
    if coalesce(service_available, false) = false then
      raise exception 'service already accepted';
    end if;
    update public.services
      set is_active = false, updated_at = now()
      where id = target_service;
    for loser in
      update public.service_requests
      set status = 'rejected', closed_at = coalesce(closed_at, now()), updated_at = now()
      where service_id = target_service
        and id <> target_request_id
        and status = 'requested'
      returning id, requester_id
    loop
      perform public.enqueue_request_notification(
        loser.requester_id, 'request_status',
        jsonb_build_object('request_id', loser.id, 'status', 'rejected'),
        'request-status:' || loser.id || ':rejected:' || loser.requester_id
      );
    end loop;
  elsif next_status = 'rejected' then
    if public.current_subject() <> provider or current_status <> 'requested' then
      raise exception 'invalid rejection';
    end if;
  elsif next_status = 'meeting' then
    if current_status <> 'accepted' then raise exception 'invalid meeting transition'; end if;
    if (select count(*)
        from public.location_shares share
        where share.request_id = target_request_id
          and share.user_id in (requester, provider)
          and share.revoked_at is null
          and share.expires_at > now()) <> 2 then
      raise exception 'mutual location consent required';
    end if;
  elsif next_status = 'cancelled' then
    if public.current_subject() = requester and current_status not in ('requested', 'accepted', 'meeting') then
      raise exception 'invalid cancellation';
    end if;
    if public.current_subject() = provider and current_status not in ('accepted', 'meeting') then
      raise exception 'invalid cancellation';
    end if;
  else
    raise exception 'unsupported transition';
  end if;

  update public.service_requests
  set status = next_status,
      accepted_at = case when next_status = 'accepted' then now() else accepted_at end,
      closed_at = case when next_status in ('rejected', 'cancelled') then coalesce(closed_at, now()) else closed_at end,
      updated_at = now()
  where id = target_request_id;

  recipient := case when public.current_subject() = requester then provider else requester end;
  perform public.enqueue_request_notification(
    recipient,
    'request_status',
    jsonb_build_object('request_id', target_request_id, 'status', next_status),
    'request-status:' || target_request_id || ':' || next_status::text || ':' || recipient
  );
  return next_status;
end;
$$;

-- Completion and rating serialize on the request row so simultaneous calls
-- cannot double-count profile totals or observe a stale lifecycle state.
create or replace function public.confirm_request_completion(target_request_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  total integer;
  recipient text;
  requester text;
  provider text;
  current_status public.request_status;
begin
  select status, requester_id, provider_id,
    case when requester_id = public.current_subject() then provider_id else requester_id end
  into current_status, requester, provider, recipient
  from public.service_requests
  where id = target_request_id
    and public.current_subject() in (requester_id, provider_id)
  for update;

  if current_status is null
     or current_status not in ('accepted', 'meeting', 'completion_pending') then
    raise exception 'completion unavailable';
  end if;

  insert into public.completion_confirmations (request_id, user_id)
  values (target_request_id, public.current_subject())
  on conflict do nothing;

  select count(*) into total
  from public.completion_confirmations
  where request_id = target_request_id;

  if total = 1 then
    update public.service_requests
    set status = 'completion_pending', updated_at = now()
    where id = target_request_id and status in ('accepted', 'meeting');
    perform public.enqueue_request_notification(
      recipient, 'completion_confirmed',
      jsonb_build_object('request_id', target_request_id),
      'completion:' || target_request_id || ':' || public.current_subject()
    );
  elsif total = 2 then
    update public.service_requests
    set status = 'rating_pending', updated_at = now()
    where id = target_request_id and status <> 'closed';
    perform public.enqueue_request_notification(
      requester, 'rating_available', jsonb_build_object('request_id', target_request_id),
      'rating-available:' || target_request_id || ':' || requester
    );
    perform public.enqueue_request_notification(
      provider, 'rating_available', jsonb_build_object('request_id', target_request_id),
      'rating-available:' || target_request_id || ':' || provider
    );
  end if;
  return total = 2;
end;
$$;

create or replace function public.submit_request_rating(
  target_request_id uuid,
  target_score smallint,
  target_comment text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target_subject text;
  rating_id uuid;
  current_status public.request_status;
  requester text;
  provider text;
  inserted_rating boolean := false;
begin
  select status, requester_id, provider_id,
    case when requester_id = public.current_subject() then provider_id else requester_id end
  into current_status, requester, provider, target_subject
  from public.service_requests
  where id = target_request_id
    and public.current_subject() in (requester_id, provider_id)
  for update;

  if current_status is null or current_status not in ('rating_pending', 'closed') then
    raise exception 'rating unavailable';
  end if;

  insert into public.ratings (request_id, author_id, subject_id, score, comment)
  values (
    target_request_id, public.current_subject(), target_subject,
    target_score, nullif(trim(target_comment), '')
  )
  on conflict (request_id, author_id) do nothing
  returning id into rating_id;

  if rating_id is null then
    select id into rating_id
    from public.ratings
    where request_id = target_request_id and author_id = public.current_subject();
  else
    inserted_rating := true;
    update public.profiles
    set rating_sum = rating_sum + target_score,
        rating_count = rating_count + 1,
        updated_at = now()
    where user_id = target_subject;
    perform public.enqueue_request_notification(
      target_subject, 'rating_received', jsonb_build_object('request_id', target_request_id),
      'rating:' || target_request_id || ':' || public.current_subject()
    );
  end if;

  if inserted_rating
     and current_status <> 'closed'
     and (select count(*) from public.ratings where request_id = target_request_id) = 2 then
    update public.profiles
    set completed_count = completed_count + 1, updated_at = now()
    where user_id in (requester, provider);
    update public.service_requests
    set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
    where id = target_request_id;
  end if;
  return rating_id;
end;
$$;

-- New service creation accepts an optional one-off schedule and derives the
-- public approximation from the exact point inside the database.
drop function if exists public.create_service(text, text, text, text, text, text);
create or replace function public.create_service(
  service_category text,
  service_title text,
  service_description text,
  service_price_note text,
  service_availability_note text,
  service_scheduled_for timestamptz,
  exact_wkt text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  created_id uuid;
  exact_location extensions.geography(point, 4326);
  public_location extensions.geography(point, 4326);
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  if public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  if service_category is null
     or service_category not in ('Tutoring', 'Tech help', 'Ride', 'Creative', 'Moving', 'Other')
     or service_title is null or char_length(trim(service_title)) not between 4 and 90
     or service_description is null or char_length(trim(service_description)) not between 10 and 600
     or service_price_note is null or char_length(trim(service_price_note)) not between 1 and 80
     or service_availability_note is null or char_length(trim(service_availability_note)) not between 1 and 120 then
    raise exception 'invalid service input';
  end if;
  exact_location := extensions.ST_GeogFromText(exact_wkt);
  if extensions.ST_Y(exact_location::extensions.geometry) not between -89.99 and 89.99
     or extensions.ST_X(exact_location::extensions.geometry) not between -179.99 and 179.99 then
    raise exception 'exact point is invalid';
  end if;
  -- Store one stable public point 350-650 metres away from the exact point.
  -- A fresh random bearing makes the displacement non-reversible from the public
  -- service id, while the minimum radius prevents accidental near-exact exposure.
  public_location := extensions.ST_Project(
    exact_location,
    350 + random() * 300,
    random() * 2 * pi()
  );
  insert into public.services (
    provider_id, category, title, description, price_note,
    availability_note, scheduled_for, approximate_point, exact_point
  ) values (
    public.current_subject(), service_category, service_title, service_description,
    service_price_note, service_availability_note, service_scheduled_for,
    public_location, exact_location
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.create_service_request(target_service_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare created_id uuid; target_provider text;
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  if public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  select provider_id into target_provider
  from public.services
  where id = target_service_id and is_active
  for share;
  if target_provider is null or target_provider = public.current_subject() then
    raise exception 'service unavailable';
  end if;
  insert into public.service_requests (service_id, requester_id, provider_id)
  values (target_service_id, public.current_subject(), target_provider)
  returning id into created_id;
  perform public.enqueue_request_notification(
    target_provider, 'request_received',
    jsonb_build_object('request_id', created_id, 'service_id', target_service_id),
    'request-received:' || created_id || ':' || target_provider
  );
  return created_id;
end;
$$;

create or replace function public.replace_service(
  target_service_id uuid,
  service_category text,
  service_title text,
  service_description text,
  service_price_note text,
  service_availability_note text,
  service_scheduled_for timestamptz,
  exact_wkt text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare exact_location extensions.geography(point, 4326); public_location extensions.geography(point, 4326);
begin
  if public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  if service_category is null
     or service_category not in ('Tutoring', 'Tech help', 'Ride', 'Creative', 'Moving', 'Other')
     or service_title is null or char_length(trim(service_title)) not between 4 and 90
     or service_description is null or char_length(trim(service_description)) not between 10 and 600
     or service_price_note is null or char_length(trim(service_price_note)) not between 1 and 80
     or service_availability_note is null or char_length(trim(service_availability_note)) not between 1 and 120 then
    raise exception 'invalid service input';
  end if;
  exact_location := extensions.ST_GeogFromText(exact_wkt);
  if extensions.ST_Y(exact_location::extensions.geometry) not between -89.99 and 89.99
     or extensions.ST_X(exact_location::extensions.geometry) not between -179.99 and 179.99 then
    raise exception 'exact point is invalid';
  end if;
  public_location := extensions.ST_Project(
    exact_location,
    350 + random() * 300,
    random() * 2 * pi()
  );
  update public.services
  set category = service_category, title = service_title,
      description = service_description, price_note = service_price_note,
      availability_note = service_availability_note,
      scheduled_for = service_scheduled_for,
      exact_point = exact_location, approximate_point = public_location,
      updated_at = now()
  where id = target_service_id
    and provider_id = public.current_subject()
    and is_active;
  if not found then raise exception 'service unavailable'; end if;
  return true;
end;
$$;

create or replace function public.deactivate_service(target_service_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare loser record;
begin
  update public.services
  set is_active = false, updated_at = now()
  where id = target_service_id
    and provider_id = public.current_subject()
    and is_active
    and not exists (
      select 1 from public.service_requests request
      where request.service_id = target_service_id
        and request.status in ('accepted', 'meeting', 'completion_pending', 'rating_pending')
    );
  if not found then raise exception 'service cannot be deactivated'; end if;
  for loser in
    update public.service_requests
    set status = 'rejected', closed_at = coalesce(closed_at, now()), updated_at = now()
    where service_id = target_service_id and status = 'requested'
    returning id, requester_id
  loop
    perform public.enqueue_request_notification(
      loser.requester_id, 'request_status',
      jsonb_build_object('request_id', loser.id, 'status', 'rejected'),
      'request-status:' || loser.id || ':rejected:' || loser.requester_id
    );
  end loop;
  return true;
end;
$$;

-- Profile writes use a checked RPC so a browser holding a valid Auth0 token
-- cannot bypass the BFF's URL, wallet, or interests validation with table writes.
alter table public.profiles add column if not exists avatar_config jsonb not null default
  '{"skin":"golden","face":"smile","hair":"curls","hairColor":"ink","outfit":"hoodie","accessory":"headphones"}'::jsonb;
alter table public.profiles drop constraint if exists profiles_avatar_config_valid;
alter table public.profiles add constraint profiles_avatar_config_valid check (
  avatar_config = jsonb_build_object(
    'skin', avatar_config ->> 'skin',
    'face', avatar_config ->> 'face',
    'hair', avatar_config ->> 'hair',
    'hairColor', avatar_config ->> 'hairColor',
    'outfit', avatar_config ->> 'outfit',
    'accessory', avatar_config ->> 'accessory'
  )
  and coalesce(avatar_config ->> 'skin', '') in ('porcelain', 'sand', 'golden', 'umber', 'cocoa', 'ebony')
  and coalesce(avatar_config ->> 'face', '') in ('smile', 'focused', 'wink')
  and coalesce(avatar_config ->> 'hair', '') in ('crop', 'curls', 'locs', 'bob')
  and coalesce(avatar_config ->> 'hairColor', '') in ('ink', 'chestnut', 'auburn', 'violet')
  and coalesce(avatar_config ->> 'outfit', '') in ('tee', 'hoodie', 'tech')
  and coalesce(avatar_config ->> 'accessory', '') in ('none', 'glasses', 'headphones')
);

drop function if exists public.update_my_profile(boolean, text, boolean, text, boolean, text, boolean, text, boolean, jsonb);
create or replace function public.update_my_profile(
  set_display_name boolean,
  target_display_name text,
  set_avatar_url boolean,
  target_avatar_url text,
  set_bio boolean,
  target_bio text,
  set_solana_wallet boolean,
  target_solana_wallet text,
  set_interests boolean,
  target_interests jsonb,
  set_avatar_config boolean,
  target_avatar_config jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  if set_display_name and (
    target_display_name is null
    or char_length(trim(target_display_name)) not between 2 and 60
  ) then raise exception 'invalid display name'; end if;
  if set_avatar_url and target_avatar_url is not null and (
    char_length(target_avatar_url) > 500
    or target_avatar_url !~* '^https://[^/[:space:]]+(/[^[:space:]]*)?$'
  ) then raise exception 'invalid avatar url'; end if;
  if set_bio and target_bio is not null and char_length(target_bio) > 320 then
    raise exception 'invalid bio';
  end if;
  if set_solana_wallet and target_solana_wallet is not null
     and target_solana_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception 'invalid solana wallet';
  end if;
  if set_interests and (
    target_interests is null
    or jsonb_typeof(target_interests) <> 'array'
    or jsonb_array_length(target_interests) > 20
    or exists (
      select 1 from jsonb_array_elements(target_interests) item
      where jsonb_typeof(item) <> 'string'
        or char_length(trim(item #>> '{}')) not between 1 and 50
    )
  ) then raise exception 'invalid interests'; end if;
  if set_avatar_config and (
    target_avatar_config is null
    or target_avatar_config <> jsonb_build_object(
      'skin', target_avatar_config ->> 'skin',
      'face', target_avatar_config ->> 'face',
      'hair', target_avatar_config ->> 'hair',
      'hairColor', target_avatar_config ->> 'hairColor',
      'outfit', target_avatar_config ->> 'outfit',
      'accessory', target_avatar_config ->> 'accessory'
    )
    or coalesce(target_avatar_config ->> 'skin', '') not in ('porcelain', 'sand', 'golden', 'umber', 'cocoa', 'ebony')
    or coalesce(target_avatar_config ->> 'face', '') not in ('smile', 'focused', 'wink')
    or coalesce(target_avatar_config ->> 'hair', '') not in ('crop', 'curls', 'locs', 'bob')
    or coalesce(target_avatar_config ->> 'hairColor', '') not in ('ink', 'chestnut', 'auburn', 'violet')
    or coalesce(target_avatar_config ->> 'outfit', '') not in ('tee', 'hoodie', 'tech')
    or coalesce(target_avatar_config ->> 'accessory', '') not in ('none', 'glasses', 'headphones')
  ) then raise exception 'invalid avatar config'; end if;

  update public.profiles
  set display_name = case when set_display_name then trim(target_display_name) else display_name end,
      avatar_url = case when set_avatar_url then target_avatar_url else avatar_url end,
      bio = case when set_bio then nullif(trim(target_bio), '') else bio end,
      solana_wallet = case when set_solana_wallet then target_solana_wallet else solana_wallet end,
      interests = case when set_interests then target_interests else interests end,
      avatar_config = case when set_avatar_config then target_avatar_config else avatar_config end,
      updated_at = now()
  where user_id = public.current_subject();
  if not found then raise exception 'profile unavailable'; end if;
  return true;
end;
$$;

-- Safe public discovery projection. No auth subject, email, wallet, exact point,
-- or service-private data can be returned by this RPC.
create or replace function public.list_public_services(
  target_category text default null,
  target_query text default null,
  target_min_rating numeric default null,
  target_max_distance_miles numeric default null
) returns table (
  id uuid,
  title text,
  category text,
  description text,
  price_note text,
  availability_note text,
  scheduled_for timestamptz,
  approximate_lat double precision,
  approximate_lng double precision,
  approximate_distance_miles double precision,
  provider_name text,
  provider_initials text,
  provider_verified boolean,
  provider_rating numeric,
  provider_rating_count integer,
  provider_completed integer,
  service_type text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with rows as (
    select service.id, service.title, service.category, service.description,
      service.price_note, service.availability_note, service.scheduled_for,
      service.approximate_point, service.created_at,
      profile.display_name, profile.rating_sum, profile.rating_count,
      profile.completed_count,
      round(((profile.rating_sum + 4.5 * 8)::numeric / greatest(profile.rating_count + 8, 1)), 2) as adjusted_rating,
      extensions.ST_Distance(
        service.approximate_point,
        extensions.ST_SetSRID(extensions.ST_MakePoint(-101.8747, 33.5843), 4326)::extensions.geography
      ) / 1609.344 as campus_distance
    from public.services service
    join public.profiles profile on profile.user_id = service.provider_id
    where service.is_active
  )
  select rows.id, rows.title, rows.category, rows.description, rows.price_note,
    rows.availability_note, rows.scheduled_for,
    extensions.ST_Y(rows.approximate_point::extensions.geometry), extensions.ST_X(rows.approximate_point::extensions.geometry),
    rows.campus_distance, rows.display_name,
    upper(left(regexp_replace(rows.display_name, '[^[:alnum:] ]', '', 'g'), 1)
      || left(coalesce(nullif(split_part(rows.display_name, ' ', 2), ''), rows.display_name), 1)),
    true, rows.adjusted_rating, rows.rating_count, rows.completed_count, 'offer'::text
  from rows
  where (target_category is null or lower(rows.category) = lower(target_category))
    and (target_query is null or concat_ws(' ', rows.title, rows.description, rows.category, rows.display_name) ilike '%' || target_query || '%')
    and (target_min_rating is null or rows.adjusted_rating >= target_min_rating)
    and (target_max_distance_miles is null or rows.campus_distance <= target_max_distance_miles)
  order by rows.created_at desc
  limit 100;
$$;

create or replace function public.list_my_service_requests()
returns table (
  id uuid,
  service_id uuid,
  status public.request_status,
  viewer_role text,
  other_party_name text,
  other_party_initials text,
  service_title text,
  service_category text,
  created_at timestamptz,
  accepted_at timestamptz,
  closed_at timestamptz,
  my_completion boolean,
  other_completion boolean,
  my_rating boolean,
  other_rating boolean,
  my_location_shared boolean,
  other_location_shared boolean,
  location_expires_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select request.id, request.service_id, request.status,
    case when request.requester_id = public.current_subject() then 'requester' else 'provider' end,
    other_profile.display_name,
    upper(left(other_profile.display_name, 1)
      || left(coalesce(nullif(split_part(other_profile.display_name, ' ', 2), ''), other_profile.display_name), 1)),
    service.title, service.category, request.created_at, request.accepted_at, request.closed_at,
    exists (select 1 from public.completion_confirmations completion where completion.request_id = request.id and completion.user_id = public.current_subject()),
    exists (select 1 from public.completion_confirmations completion where completion.request_id = request.id and completion.user_id <> public.current_subject()),
    exists (select 1 from public.ratings rating where rating.request_id = request.id and rating.author_id = public.current_subject()),
    exists (select 1 from public.ratings rating where rating.request_id = request.id and rating.author_id <> public.current_subject()),
    exists (select 1 from public.location_shares share where share.request_id = request.id and share.user_id = public.current_subject() and share.revoked_at is null and share.expires_at > now()),
    exists (select 1 from public.location_shares share where share.request_id = request.id and share.user_id <> public.current_subject() and share.revoked_at is null and share.expires_at > now()),
    (select min(share.expires_at) from public.location_shares share where share.request_id = request.id and share.revoked_at is null and share.expires_at > now())
  from public.service_requests request
  join public.services service on service.id = request.service_id
  join public.profiles other_profile on other_profile.user_id = case
    when request.requester_id = public.current_subject() then request.provider_id
    else request.requester_id end
  where public.current_subject() in (request.requester_id, request.provider_id)
  order by request.created_at desc
  limit 100;
$$;

create or replace function public.list_request_messages(target_request_id uuid)
returns table (
  id uuid,
  request_id uuid,
  body text,
  created_at timestamptz,
  is_mine boolean,
  sender_name text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_request_participant(target_request_id) then
    raise exception 'request unavailable';
  end if;
  return query
    select message.id, message.request_id, message.body, message.created_at,
      message.sender_id = public.current_subject(), profile.display_name
    from public.messages message
    join public.profiles profile on profile.user_id = message.sender_id
    where message.request_id = target_request_id
    order by message.created_at
    limit 200;
end;
$$;

drop function if exists public.get_my_profile();
create or replace function public.get_my_profile()
returns table (
  display_name text,
  avatar_url text,
  bio text,
  edu_domain text,
  solana_wallet text,
  interests jsonb,
  avatar_config jsonb,
  rating numeric,
  rating_count integer,
  completed_count integer
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select profile.display_name, profile.avatar_url, profile.bio, profile.edu_domain,
    profile.solana_wallet, profile.interests, profile.avatar_config,
    case when profile.rating_count = 0 then null else round(profile.rating_sum::numeric / profile.rating_count, 2) end,
    profile.rating_count, profile.completed_count
  from public.profiles profile
  where profile.user_id = public.current_subject();
$$;

create or replace function public.list_my_notifications()
returns table (id uuid, type text, payload jsonb, read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select notification.id, notification.type, notification.payload,
    notification.read_at, notification.created_at
  from public.notifications notification
  where notification.user_id = public.current_subject()
  order by notification.created_at desc
  limit 100;
$$;

create or replace function public.mark_my_notifications_read(target_ids uuid[]) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare changed integer;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = public.current_subject()
    and (target_ids is null or id = any(target_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.list_my_cosmetics()
returns table (
  sku text,
  label text,
  lamports bigint,
  owned boolean,
  equipped boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with catalog(sku, label, lamports) as (values
    ('profile-frame'::text, 'Profile frame'::text, 10000000::bigint),
    ('campus-theme'::text, 'Campus theme'::text, 20000000::bigint),
    ('trust-badge'::text, 'Trust badge'::text, 30000000::bigint)
  )
  select catalog.sku, catalog.label, catalog.lamports,
    customization.id is not null, coalesce(customization.equipped, false)
  from catalog
  left join public.profile_customizations customization
    on customization.cosmetic_sku = catalog.sku
   and customization.user_id = public.current_subject()
   and customization.verified_at is not null
  order by catalog.lamports;
$$;

create or replace function public.equip_profile_customization(target_sku text) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if target_sku not in ('profile-frame', 'campus-theme', 'trust-badge') then
    raise exception 'unknown cosmetic';
  end if;
  update public.profile_customizations
  set equipped = true
  where user_id = public.current_subject()
    and cosmetic_sku = target_sku
    and verified_at is not null;
  if not found then raise exception 'cosmetic not owned'; end if;
  return true;
end;
$$;

-- Atomic shared rate limits for horizontally scaled/serverless API instances.
-- The application sends only an HMAC pseudonym, never the raw Auth0 subject.
create table if not exists public.api_rate_limits (
  subject_hash text not null,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (subject_hash, operation),
  check (subject_hash ~ '^[0-9a-f]{64}$'),
  check (operation ~ '^[a-z0-9-]{1,48}$')
);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_api_rate_limit(
  target_subject_hash text,
  target_operation text,
  target_limit integer,
  target_window_seconds integer
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_window timestamptz;
  current_count integer;
begin
  if target_subject_hash !~ '^[0-9a-f]{64}$'
     or target_operation !~ '^[a-z0-9-]{1,48}$'
     or target_limit not between 1 and 10000
     or target_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit input';
  end if;

  insert into public.api_rate_limits (subject_hash, operation, window_started_at, request_count)
  values (target_subject_hash, target_operation, now(), 1)
  on conflict (subject_hash, operation) do update set
    window_started_at = case
      when public.api_rate_limits.window_started_at <= now() - make_interval(secs => target_window_seconds) then now()
      else public.api_rate_limits.window_started_at
    end,
    request_count = case
      when public.api_rate_limits.window_started_at <= now() - make_interval(secs => target_window_seconds) then 1
      else public.api_rate_limits.request_count + 1
    end
  returning public.api_rate_limits.window_started_at, public.api_rate_limits.request_count
  into current_window, current_count;

  return query select
    current_count <= target_limit,
    case when current_count <= target_limit then 0 else greatest(
      1,
      ceil(extract(epoch from (current_window + make_interval(secs => target_window_seconds) - now())))::integer
    ) end;
end;
$$;

-- Direct table access would leak internal Auth0 subjects or bypass state logic.
-- Authenticated clients use the safe RPC projections and mutation RPCs instead.
revoke select, insert, update, delete on public.services, public.service_requests,
  public.messages, public.location_shares, public.completion_confirmations,
  public.ratings, public.interaction_events, public.profile_customizations,
  public.notifications from authenticated;
revoke select, insert, update, delete on public.profiles from authenticated;
revoke all on public.api_rate_limits from public, anon, authenticated;

revoke all on function public.create_service(text, text, text, text, text, timestamptz, text) from public;
revoke all on function public.create_service_request(uuid) from public;
revoke all on function public.replace_service(uuid, text, text, text, text, text, timestamptz, text) from public;
revoke all on function public.deactivate_service(uuid) from public;
revoke all on function public.transition_service_request(uuid, public.request_status) from public;
revoke all on function public.list_public_services(text, text, numeric, numeric) from public;
revoke all on function public.list_my_service_requests() from public;
revoke all on function public.list_request_messages(uuid) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.list_my_notifications() from public;
revoke all on function public.mark_my_notifications_read(uuid[]) from public;
revoke all on function public.list_my_cosmetics() from public;
revoke all on function public.equip_profile_customization(text) from public;
revoke all on function public.update_my_profile(boolean, text, boolean, text, boolean, text, boolean, text, boolean, jsonb, boolean, jsonb) from public;
revoke all on function public.has_rating_gap(text) from public;
revoke all on function public.enforce_rating_gate() from public;
revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

grant execute on function public.create_service(text, text, text, text, text, timestamptz, text),
  public.create_service_request(uuid),
  public.replace_service(uuid, text, text, text, text, text, timestamptz, text),
  public.deactivate_service(uuid),
  public.transition_service_request(uuid, public.request_status),
  public.list_public_services(text, text, numeric, numeric),
  public.list_my_service_requests(),
  public.list_request_messages(uuid),
  public.get_my_profile(),
  public.list_my_notifications(),
  public.mark_my_notifications_read(uuid[]),
  public.list_my_cosmetics(),
  public.equip_profile_customization(text),
  public.update_my_profile(boolean, text, boolean, text, boolean, text, boolean, text, boolean, jsonb, boolean, jsonb)
to authenticated;
