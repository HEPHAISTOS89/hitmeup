-- Expand HitMeUp discovery without weakening the existing one-off service flow.
-- Existing RPC signatures remain available during rollout; the web app uses the
-- overloads below once this migration has landed.

alter table public.services
  add column if not exists subcategory text,
  add column if not exists listing_kind text not null default 'temporary'
    check (listing_kind in ('temporary', 'permanent')),
  add column if not exists sponsored boolean not null default false
    check (not sponsored or listing_kind = 'permanent');

-- Keep the taxonomy invariant in the database, not just in the web form. The
-- legacy categories remain valid for existing rows and rolling deploys, while
-- all newly-created rows must use the new category/subcategory pairs.
create or replace function public.is_valid_service_taxonomy(
  target_category text,
  target_subcategory text
) returns boolean
language sql immutable security definer set search_path = public, pg_temp
as $$
  select coalesce(case target_category
    when 'Social' then target_subcategory in ('Parties', 'Hangouts', 'Pickup games', 'Study groups', 'Grab food', 'Spontaneous plans')
    when 'Services' then target_subcategory in ('Moving help', 'Photography', 'Hair & nails', 'Tech help', 'Cleaning', 'Furniture assembly')
    when 'Tutoring' then target_subcategory in ('Tutoring', 'Homework help', 'Study sessions', 'Exam prep', 'Coding help', 'Languages')
    when 'Jobs' then target_subcategory in ('Event staffing', 'Campus gigs', 'Paid help', 'Creative gigs', 'Tech gigs', 'Weekend work')
    when 'Volunteer' then target_subcategory in ('Cleanups', 'Donation drives', 'Charity events', 'Community projects', 'Environment', 'Outreach')
    when 'Clubs' then target_subcategory in ('Gaming', 'Crochet & crafts', 'Art', 'Coding', 'Book clubs', 'Music & jams', 'Chess')
    when 'Activities' then target_subcategory in ('Basketball', 'Soccer', 'Running', 'Gym buddies', 'Hiking', 'Cycling')
    when 'Events' then target_subcategory in ('Concerts', 'Campus events', 'Game nights', 'Pop-ups', 'Workshops', 'Open mics')
    when 'Businesses' then target_subcategory in ('Restaurants', 'Student businesses', 'Shops', 'Professional services', 'Promotions', 'Coffee & snacks')
    when 'Help' then target_subcategory in ('Borrow an item', 'Carry something', 'Study company', 'Quick ride', 'Find something', 'Other request')
    when 'Tech help' then target_subcategory = 'Tech help'
    when 'Ride' then target_subcategory = 'Quick ride'
    when 'Creative' then target_subcategory = 'Photography'
    when 'Moving' then target_subcategory = 'Moving help'
    when 'Other' then target_subcategory = 'Other request'
    else false
  end, false);
$$;

revoke all on function public.is_valid_service_taxonomy(text, text) from public;

-- Student-created listings are always temporary. Permanent sponsored listings
-- are intentionally provisioned only through a reviewed back-office workflow.
-- There is no checkout here: only the privileged service_role/back-office path
-- may write a permanent sponsored row, and it remains explicitly disclosed.
create or replace function public.enforce_reviewed_listing_fields()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.listing_kind = 'permanent' or new.sponsored then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'permanent sponsored listings require the reviewed workflow';
    end if;
    if new.category <> 'Businesses' or new.listing_kind <> 'permanent' or not new.sponsored then
      raise exception 'permanent listings must be reviewed business pins';
    end if;
  elsif new.category = 'Businesses' then
    raise exception 'business listings require the reviewed workflow';
  end if;

  -- Preserve the legacy RPC during rollout without creating new null taxonomy
  -- rows. Existing rows stay untouched until their next write.
  if new.subcategory is null then
    new.subcategory := case new.category
      when 'Tutoring' then 'Tutoring'
      when 'Tech help' then 'Tech help'
      when 'Ride' then 'Quick ride'
      when 'Creative' then 'Photography'
      when 'Moving' then 'Moving help'
      when 'Other' then 'Other request'
      else null
    end;
  end if;
  if new.subcategory is null or not public.is_valid_service_taxonomy(new.category, new.subcategory) then
    raise exception 'service taxonomy is invalid';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reviewed_listing_fields() from public;

drop trigger if exists services_reviewed_listing_fields on public.services;
create trigger services_reviewed_listing_fields
  before insert or update on public.services
  for each row execute function public.enforce_reviewed_listing_fields();

-- Service mutations go through the checked SECURITY DEFINER RPCs below. Keep
-- discovery reads available, but remove the broad legacy FOR ALL table grant so
-- an authenticated student cannot forge permanent/sponsored or invalid rows.
revoke insert, update, delete, truncate, references, trigger on table public.services from anon, authenticated;

create or replace function public.create_service(
  service_category text,
  service_title text,
  service_description text,
  service_price_note text,
  service_availability_note text,
  service_scheduled_for timestamptz,
  exact_wkt text,
  service_subcategory text
) returns uuid
language plpgsql security definer set search_path = extensions, public, pg_temp
as $$
declare
  created_id uuid;
  exact_location public.services.exact_point%TYPE;
  public_location public.services.approximate_point%TYPE;
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  if public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  if service_category is null
     or service_category not in ('Social', 'Services', 'Tutoring', 'Jobs', 'Volunteer', 'Clubs', 'Activities', 'Events', 'Help', 'Tech help', 'Ride', 'Creative', 'Moving', 'Other')
     or service_category = 'Businesses'
     or service_subcategory is null or char_length(trim(service_subcategory)) not between 1 and 80
     or not public.is_valid_service_taxonomy(service_category, trim(service_subcategory))
     or service_title is null or char_length(trim(service_title)) not between 4 and 90
     or service_description is null or char_length(trim(service_description)) not between 10 and 600
     or service_price_note is null or char_length(trim(service_price_note)) not between 1 and 80
     or service_availability_note is null or char_length(trim(service_availability_note)) not between 1 and 120 then
    raise exception 'invalid service input';
  end if;
  exact_location := ST_GeogFromText(exact_wkt);
  if ST_Y(exact_location::geometry) not between -89.99 and 89.99
     or ST_X(exact_location::geometry) not between -179.99 and 179.99 then
    raise exception 'exact point is invalid';
  end if;
  public_location := ST_Project(exact_location, 350 + random() * 300, random() * 2 * pi());
  insert into public.services (
    provider_id, category, subcategory, listing_kind, sponsored, title, description,
    price_note, availability_note, scheduled_for, approximate_point, exact_point
  ) values (
    public.current_subject(), service_category, service_subcategory, 'temporary', false,
    service_title, service_description, service_price_note, service_availability_note,
    service_scheduled_for, public_location, exact_location
  ) returning id into created_id;
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
  exact_wkt text,
  service_subcategory text
) returns boolean
language plpgsql security definer set search_path = extensions, public, pg_temp
as $$
declare
  exact_location public.services.exact_point%TYPE;
  public_location public.services.approximate_point%TYPE;
begin
  if public.has_rating_gap(public.current_subject()) then raise exception 'required bilateral rating missing'; end if;
  if service_category is null
     or service_category not in ('Social', 'Services', 'Tutoring', 'Jobs', 'Volunteer', 'Clubs', 'Activities', 'Events', 'Help', 'Tech help', 'Ride', 'Creative', 'Moving', 'Other')
     or service_category = 'Businesses'
     or service_subcategory is null or char_length(trim(service_subcategory)) not between 1 and 80
     or not public.is_valid_service_taxonomy(service_category, trim(service_subcategory))
     or service_title is null or char_length(trim(service_title)) not between 4 and 90
     or service_description is null or char_length(trim(service_description)) not between 10 and 600
     or service_price_note is null or char_length(trim(service_price_note)) not between 1 and 80
     or service_availability_note is null or char_length(trim(service_availability_note)) not between 1 and 120 then
    raise exception 'invalid service input';
  end if;
  exact_location := ST_GeogFromText(exact_wkt);
  if ST_Y(exact_location::geometry) not between -89.99 and 89.99
     or ST_X(exact_location::geometry) not between -179.99 and 179.99 then
    raise exception 'exact point is invalid';
  end if;
  public_location := ST_Project(exact_location, 350 + random() * 300, random() * 2 * pi());
  update public.services
  set category = service_category, subcategory = service_subcategory,
      listing_kind = 'temporary', sponsored = false,
      title = service_title, description = service_description,
      price_note = service_price_note, availability_note = service_availability_note,
      scheduled_for = service_scheduled_for, exact_point = exact_location,
      approximate_point = public_location, updated_at = now()
  where id = target_service_id
    and provider_id = public.current_subject()
    and is_active
    and listing_kind = 'temporary';
  if not found then raise exception 'service unavailable'; end if;
  return true;
end;
$$;

-- Separate projection keeps the old public RPC stable during a rolling deploy.
create or replace function public.list_public_marketplace_services(
  target_category text default null,
  target_query text default null,
  target_min_rating numeric default null,
  target_max_distance_miles numeric default null,
  target_listing_kind text default null,
  target_subcategory text default null
) returns table (
  id uuid,
  title text,
  category text,
  subcategory text,
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
  service_type text,
  sponsored boolean
)
language plpgsql stable security definer set search_path = extensions, public, pg_temp
as $$
declare
  query_pattern text;
begin
  if target_category is not null and char_length(trim(target_category)) not between 1 and 80 then
    raise exception 'category is invalid';
  end if;
  if target_query is not null and char_length(trim(target_query)) not between 1 and 120 then
    raise exception 'query is invalid';
  end if;
  if target_min_rating is not null and target_min_rating not between 0 and 5 then
    raise exception 'min rating is invalid';
  end if;
  if target_max_distance_miles is not null and target_max_distance_miles not between 0 and 50 then
    raise exception 'max distance is invalid';
  end if;
  if target_listing_kind is not null and target_listing_kind not in ('temporary', 'permanent') then
    raise exception 'listing kind is invalid';
  end if;
  if target_subcategory is not null and char_length(trim(target_subcategory)) not between 1 and 80 then
    raise exception 'subcategory is invalid';
  end if;
  query_pattern := case
    when target_query is null then null
    else '%' || replace(replace(replace(trim(target_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  with rows as (
    select service.id, service.title, service.category,
      coalesce(service.subcategory,
        case service.category
          when 'Tech help' then 'Tech help'
          when 'Ride' then 'Quick ride'
          when 'Creative' then 'Photography'
          when 'Moving' then 'Moving help'
          else null
        end
      ) as subcategory,
      service.description, service.price_note, service.availability_note,
      service.scheduled_for, service.approximate_point, service.created_at,
      service.listing_kind, service.sponsored,
      profile.display_name, profile.rating_sum, profile.rating_count,
      profile.completed_count,
      round(((profile.rating_sum + 4.5 * 8)::numeric / greatest(profile.rating_count + 8, 1)), 2) as adjusted_rating,
      ST_Distance(
        service.approximate_point,
        ST_SetSRID(ST_MakePoint(-101.8747, 33.5843), 4326)::geography
      ) / 1609.344 as campus_distance
    from public.services service
    join public.profiles profile on profile.user_id = service.provider_id
    where service.is_active
  )
  select rows.id, rows.title, rows.category, rows.subcategory, rows.description,
    rows.price_note, rows.availability_note, rows.scheduled_for,
    ST_Y(rows.approximate_point::geometry),
    ST_X(rows.approximate_point::geometry),
    rows.campus_distance, rows.display_name,
    upper(left(regexp_replace(rows.display_name, '[^[:alnum:] ]', '', 'g'), 1)
      || left(coalesce(nullif(split_part(rows.display_name, ' ', 2), ''), rows.display_name), 1)),
    true, rows.adjusted_rating, rows.rating_count, rows.completed_count,
    rows.listing_kind, rows.sponsored
  from rows
  where (
      target_category is null
      or (lower(target_category) = 'services' and rows.category in ('Services', 'Tech help', 'Creative', 'Moving'))
      or (lower(target_category) = 'help' and rows.category in ('Help', 'Ride', 'Other'))
      or lower(rows.category) = lower(target_category)
    )
    and (query_pattern is null or concat_ws(' ', rows.title, rows.description, rows.category, rows.subcategory, rows.display_name) ilike query_pattern escape '\')
    and (target_min_rating is null or rows.adjusted_rating >= target_min_rating)
    and (target_max_distance_miles is null or rows.campus_distance <= target_max_distance_miles)
    and (target_listing_kind is null or rows.listing_kind = target_listing_kind)
    and (target_subcategory is null or rows.subcategory = target_subcategory)
  order by rows.created_at desc
  limit 100;
end;
$$;

revoke all on function public.create_service(text, text, text, text, text, timestamptz, text, text) from public;
revoke all on function public.replace_service(uuid, text, text, text, text, text, timestamptz, text, text) from public;
revoke all on function public.list_public_marketplace_services(text, text, numeric, numeric, text, text) from public;

grant execute on function public.create_service(text, text, text, text, text, timestamptz, text, text),
  public.replace_service(uuid, text, text, text, text, text, timestamptz, text, text),
  public.list_public_marketplace_services(text, text, numeric, numeric, text, text)
to authenticated;
