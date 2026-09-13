-- Server-backed avatar marketplace and non-cash service rewards.
-- The 0.05 SOL Devnet bundle price and 50-point service reward are explicit
-- hackathon product decisions, not values supplied by Laura's visual branch.
-- The avatar.* visuals are deterministic original HitMeUp SVG assets.

alter table public.service_requests
  add column if not exists meeting_started_at timestamptz;

-- Preserve already-valid in-flight services during the rolling deploy. A
-- legacy `meeting` status is itself a trusted server transition. Later
-- completion states are backfilled only when both participants had shared a
-- location by the last trusted request update. Accepted-only and closed rows
-- are deliberately excluded: acceptance is not proof of a meeting, and this
-- release must not mint retroactive rewards for historical closed services.
update public.service_requests request
set meeting_started_at = coalesce(request.updated_at, request.accepted_at, now())
where request.meeting_started_at is null
  and (
    request.status = 'meeting'
    or (
      request.status in ('completion_pending', 'rating_pending')
      and (
        select count(distinct share.user_id)
        from public.location_shares share
        where share.request_id = request.id
          and share.user_id in (request.requester_id, request.provider_id)
          and share.shared_at <= coalesce(request.updated_at, now())
      ) = 2
    )
  );

-- A Solana wallet can identify only one profile. If old data contains
-- duplicates, deployment must stop for explicit cleanup rather than merge users.
create unique index if not exists profiles_solana_wallet_unique_idx
  on public.profiles (solana_wallet) where solana_wallet is not null;

create or replace function public.stamp_request_meeting_started_at() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'meeting' and OLD.status <> 'meeting' then
    NEW.meeting_started_at := coalesce(NEW.meeting_started_at, now());
  end if;
  return NEW;
end;
$$;
drop trigger if exists stamp_request_meeting_started_at on public.service_requests;
create trigger stamp_request_meeting_started_at before update of status on public.service_requests
for each row execute function public.stamp_request_meeting_started_at();

-- Acceptance alone is not evidence that the students met and cannot unlock
-- completion or rating rewards.
create or replace function public.confirm_request_completion(target_request_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  total integer;
  recipient text;
  requester text;
  provider text;
  current_status public.request_status;
  meeting_started timestamptz;
begin
  select status, requester_id, provider_id, meeting_started_at,
    case when requester_id = public.current_subject() then provider_id else requester_id end
  into current_status, requester, provider, meeting_started, recipient
  from public.service_requests
  where id = target_request_id
    and public.current_subject() in (requester_id, provider_id)
  for update;
  if current_status is null
     or current_status not in ('meeting', 'completion_pending')
     or meeting_started is null then
    raise exception 'completion unavailable until a verified meeting starts';
  end if;
  insert into public.completion_confirmations (request_id, user_id)
  values (target_request_id, public.current_subject())
  on conflict do nothing;
  select count(*) into total from public.completion_confirmations where request_id = target_request_id;
  if total = 1 then
    update public.service_requests set status = 'completion_pending', updated_at = now()
    where id = target_request_id and status = 'meeting';
    perform public.enqueue_request_notification(
      recipient, 'completion_confirmed', jsonb_build_object('request_id', target_request_id),
      'completion:' || target_request_id || ':' || public.current_subject()
    );
  elsif total = 2 then
    update public.service_requests set status = 'rating_pending', updated_at = now()
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

create table if not exists public.avatar_solana_products (
  sku text primary key,
  label text not null check (char_length(label) between 1 and 80),
  lamports bigint not null check (lamports > 0),
  active boolean not null default true
);
insert into public.avatar_solana_products (sku,label,lamports) values
  ('avatar-premium-collection','Avatar premium collection',50000000),
  ('profile-frame','Profile frame',10000000),
  ('campus-theme','Campus theme',20000000),
  ('trust-badge','Trust badge',30000000)
on conflict (sku) do update set label=excluded.label, lamports=excluded.lamports, active=true;

create table if not exists public.avatar_cosmetic_catalog (
  sku text primary key check (sku ~ '^[a-z0-9][a-z0-9.-]{1,79}$'),
  label text not null check (char_length(label) between 1 and 80),
  category text not null check (category in ('collection','top','bottom','expression','accessory','background','frame','patch','motion')),
  value_key text not null check (value_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  equip_group text not null check (equip_group ~ '^[a-z0-9][a-z0-9:-]{0,79}$'),
  collections text[] not null check (cardinality(collections) between 1 and 2 and collections <@ array['male','female']::text[]),
  unlock_method text not null check (unlock_method in ('included','reward_points','solana_devnet')),
  purchase_sku text references public.avatar_solana_products(sku) on delete restrict,
  lamports bigint not null default 0 check (lamports >= 0),
  reward_points integer not null default 0 check (reward_points >= 0),
  asset_status text not null check (asset_status in ('approved','placeholder')),
  sort_order integer not null unique,
  active boolean not null default true,
  check (
    (unlock_method = 'included' and purchase_sku is null and lamports = 0 and reward_points = 0)
    or (unlock_method = 'reward_points' and purchase_sku is null and lamports = 0 and reward_points > 0)
    or (unlock_method = 'solana_devnet' and purchase_sku is not null and lamports > 0 and reward_points = 0)
  )
);

insert into public.avatar_cosmetic_catalog
  (sku,label,category,value_key,equip_group,collections,unlock_method,purchase_sku,lamports,reward_points,asset_status,sort_order)
values
  ('avatar.collection.male','Male collection','collection','male','collection',array['male']::text[],'included',null,0,0,'approved',10),
  ('avatar.collection.female','Female collection','collection','female','collection',array['female']::text[],'included',null,0,0,'approved',11),
  ('avatar.top.male.original-jacket','Original jacket','top','original-jacket','top',array['male']::text[],'included',null,0,0,'approved',20),
  ('avatar.top.male.utility-overshirt','Utility overshirt','top','utility-overshirt','top',array['male']::text[],'included',null,0,0,'approved',21),
  ('avatar.top.male.star-tee','Star tee','top','star-tee','top',array['male']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',22),
  ('avatar.top.female.red-jacket','Red jacket','top','red-jacket','top',array['female']::text[],'included',null,0,0,'approved',23),
  ('avatar.top.female.star-tee','Star tee','top','star-tee','top',array['female']::text[],'included',null,0,0,'approved',24),
  ('avatar.top.female.teal-hoodie','Teal hoodie','top','teal-hoodie','top',array['female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',25),
  ('avatar.bottom.male.black-cargos','Black cargos','bottom','black-cargos','bottom',array['male']::text[],'included',null,0,0,'approved',30),
  ('avatar.bottom.male.baggy-denim','Baggy denim','bottom','baggy-denim','bottom',array['male']::text[],'included',null,0,0,'approved',31),
  ('avatar.bottom.male.street-shorts','Street shorts','bottom','street-shorts','bottom',array['male']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',32),
  ('avatar.bottom.female.black-cargos','Black cargos','bottom','black-cargos','bottom',array['female']::text[],'included',null,0,0,'approved',33),
  ('avatar.bottom.female.tartan-skirt','Tartan skirt','bottom','tartan-skirt','bottom',array['female']::text[],'included',null,0,0,'approved',34),
  ('avatar.bottom.female.baggy-denim','Baggy denim','bottom','baggy-denim','bottom',array['female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',35),
  ('avatar.expression.default','Default','expression','default','expression',array['male','female']::text[],'included',null,0,0,'approved',40),
  ('avatar.expression.happy','Happy','expression','happy','expression',array['male','female']::text[],'included',null,0,0,'approved',41),
  ('avatar.expression.playful','Playful','expression','playful','expression',array['male','female']::text[],'included',null,0,0,'approved',42),
  ('avatar.accessory.frames','Clear frames','accessory','frames','accessory:eyewear',array['male','female']::text[],'included',null,0,0,'approved',50),
  ('avatar.accessory.shades','Shades','accessory','shades','accessory:eyewear',array['male','female']::text[],'included',null,0,0,'approved',51),
  ('avatar.accessory.headphones','Headphones','accessory','headphones','accessory:headphones',array['male','female']::text[],'included',null,0,0,'approved',52),
  ('avatar.accessory.cap','Star cap','accessory','cap','accessory:headwear',array['male']::text[],'included',null,0,0,'approved',53),
  ('avatar.accessory.chain','Star chain','accessory','chain','accessory:neckwear',array['male','female']::text[],'included',null,0,0,'approved',54),
  ('avatar.accessory.hoops','Gold hoops','accessory','hoops','accessory:earrings',array['male','female']::text[],'included',null,0,0,'approved',55),
  ('avatar.accessory.bow','Red bow','accessory','bow','accessory:hair',array['female']::text[],'included',null,0,0,'approved',56),
  ('avatar.accessory.hearts','Heart frames','accessory','hearts','accessory:eyewear',array['female']::text[],'included',null,0,0,'approved',57),
  ('avatar.accessory.cuff','Studded cuff','accessory','cuff','accessory:wrist',array['male']::text[],'included',null,0,0,'approved',58),
  ('avatar.accessory.clips','Cherry clips','accessory','clips','accessory:hair',array['female']::text[],'included',null,0,0,'approved',59),
  ('avatar.accessory.beanie','Night beanie','accessory','beanie','accessory:headwear',array['male','female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',60),
  ('avatar.accessory.bag','Crossbody bag','accessory','bag','accessory:bag',array['male','female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',61),
  ('avatar.accessory.wallet','Wallet chain','accessory','wallet','accessory:wallet',array['male']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',62),
  ('avatar.accessory.stars','Star earrings','accessory','stars','accessory:earrings',array['female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',63),
  ('avatar.accessory.choker','Star choker','accessory','choker','accessory:neckwear',array['female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',64),
  ('avatar.background.signal','Signal orange','background','signal','background',array['male','female']::text[],'included',null,0,0,'approved',70),
  ('avatar.background.petrol','Petrol blue','background','petrol','background',array['male','female']::text[],'included',null,0,0,'approved',71),
  ('avatar.background.gold','Golden hour','background','gold','background',array['male','female']::text[],'included',null,0,0,'approved',72),
  ('avatar.background.purple','Purple haze','background','purple','background',array['male','female']::text[],'included',null,0,0,'approved',73),
  ('avatar.background.dark','After dark','background','dark','background',array['male','female']::text[],'included',null,0,0,'approved',74),
  ('avatar.background.rose','Rose paper','background','rose','background',array['male','female']::text[],'included',null,0,0,'approved',75),
  ('avatar.background.check','Checkmate','background','check','background',array['male','female']::text[],'included',null,0,0,'approved',76),
  ('avatar.background.dots','Dot matrix','background','dots','background',array['male','female']::text[],'included',null,0,0,'approved',77),
  ('avatar.background.tape','Cut & paste','background','tape','background',array['male','female']::text[],'included',null,0,0,'approved',78),
  ('avatar.background.burst','Noise burst','background','burst','background',array['male','female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',79),
  ('avatar.background.wave','Sound wave','background','wave','background',array['male','female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',80),
  ('avatar.background.grid','Midnight grid','background','grid','background',array['male','female']::text[],'solana_devnet','avatar-premium-collection',50000000,0,'approved',81),
  ('reward-frame-mint','Mint circuit frame','frame','mint','frame',array['male','female']::text[],'reward_points',null,0,40,'approved',82),
  ('reward-frame-solar','Solar circuit frame','frame','solar','frame',array['male','female']::text[],'reward_points',null,0,60,'approved',83),
  ('reward-patch-nearby','Nearby reward patch','patch','nearby','patch',array['male','female']::text[],'reward_points',null,0,80,'approved',84),
  ('reward-motion-drift','Drift reward motion','motion','drift','motion',array['male','female']::text[],'reward_points',null,0,100,'approved',85),
  ('profile-frame','Profile frame','frame','constellation','frame',array['male','female']::text[],'solana_devnet','profile-frame',10000000,0,'approved',90),
  ('campus-theme','Campus theme','motion','pulse','motion',array['male','female']::text[],'solana_devnet','campus-theme',20000000,0,'approved',91),
  ('trust-badge','Trust badge','patch','relay','patch',array['male','female']::text[],'solana_devnet','trust-badge',30000000,0,'approved',92)
on conflict (sku) do update set
  label = excluded.label, category = excluded.category, value_key = excluded.value_key,
  equip_group = excluded.equip_group, collections = excluded.collections,
  unlock_method = excluded.unlock_method, purchase_sku = excluded.purchase_sku,
  lamports = excluded.lamports, reward_points = excluded.reward_points,
  asset_status = excluded.asset_status, sort_order = excluded.sort_order, active = true;

create table if not exists public.profile_avatar_loadout (
  user_id text not null references public.profiles(user_id) on delete cascade,
  equip_group text not null,
  cosmetic_sku text not null references public.avatar_cosmetic_catalog(sku) on delete restrict,
  equipped_at timestamptz not null default now(),
  primary key (user_id, equip_group),
  unique (user_id, cosmetic_sku)
);

create table if not exists public.profile_purchase_entitlements (
  user_id text not null references public.profiles(user_id) on delete cascade,
  purchase_sku text not null references public.avatar_solana_products(sku) on delete restrict,
  customization_id uuid not null references public.profile_customizations(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  primary key (user_id, purchase_sku),
  unique (customization_id)
);
insert into public.profile_purchase_entitlements (user_id,purchase_sku,customization_id,acquired_at)
select distinct on (paid.user_id,paid.cosmetic_sku)
  paid.user_id, paid.cosmetic_sku, paid.id, coalesce(paid.verified_at, paid.created_at)
from public.profile_customizations paid
join public.avatar_solana_products product on product.sku = paid.cosmetic_sku
where paid.verified_at is not null
order by paid.user_id, paid.cosmetic_sku, paid.verified_at, paid.id
on conflict (user_id,purchase_sku) do nothing;

-- Carry the previous three SVG cosmetics into the new per-group loadout. The
-- legacy table stored only the paid product SKU, so only exact visual/product
-- matches can be migrated without inventing a premium avatar selection.
insert into public.profile_avatar_loadout (user_id,equip_group,cosmetic_sku,equipped_at)
select distinct on (paid.user_id, catalog.equip_group)
  paid.user_id, catalog.equip_group, catalog.sku,
  coalesce(paid.verified_at, paid.created_at)
from public.profile_customizations paid
join public.avatar_cosmetic_catalog catalog
  on catalog.sku = paid.cosmetic_sku
 and catalog.purchase_sku = paid.cosmetic_sku
where paid.verified_at is not null
  and paid.equipped
  and catalog.asset_status = 'approved'
order by paid.user_id, catalog.equip_group,
  coalesce(paid.verified_at, paid.created_at) desc, paid.id desc
on conflict (user_id,equip_group) do update set
  cosmetic_sku = excluded.cosmetic_sku,
  equipped_at = excluded.equipped_at;

create table if not exists public.profile_purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  purchase_sku text not null references public.avatar_solana_products(sku) on delete restrict,
  client_key uuid not null,
  lamports bigint not null check (lamports > 0),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, purchase_sku)
);

create or replace function public.reserve_profile_purchase_quote(
  target_user_id text, target_sku text, target_lamports bigint, target_client_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare quote_id uuid; quote_expires timestamptz; quote_claimed timestamptz; quote_client_key uuid;
begin
  perform 1 from public.profiles where user_id = target_user_id for update;
  if not found then raise exception 'profile unavailable'; end if;
  if not exists (select 1 from public.avatar_solana_products where sku = target_sku and active and lamports = target_lamports)
    then raise exception 'invalid cosmetic quote'; end if;
  if exists (select 1 from public.profile_purchase_entitlements where user_id = target_user_id and purchase_sku = target_sku)
    then raise exception 'cosmetic already owned'; end if;
  select id, expires_at, claimed_at, client_key into quote_id, quote_expires, quote_claimed, quote_client_key
  from public.profile_purchase_quotes where user_id = target_user_id and purchase_sku = target_sku for update;
  if quote_id is not null and quote_claimed is null and quote_expires > now() then
    if quote_client_key = target_client_key then return quote_id; end if;
    raise exception 'purchase already in progress';
  end if;
  quote_id := gen_random_uuid();
  insert into public.profile_purchase_quotes (id,user_id,purchase_sku,client_key,lamports,expires_at,claimed_at,created_at)
  values (quote_id,target_user_id,target_sku,target_client_key,target_lamports,now() + interval '60 minutes',null,now())
  on conflict (user_id,purchase_sku) do update set
    id=excluded.id, client_key=excluded.client_key, lamports=excluded.lamports, expires_at=excluded.expires_at,
    claimed_at=null, created_at=excluded.created_at;
  return quote_id;
end;
$$;

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  entry_type text not null check (entry_type in ('service_closed','reward_unlock')),
  points_delta integer not null check (points_delta <> 0),
  source_request_id uuid references public.service_requests(id) on delete restrict,
  reward_sku text references public.avatar_cosmetic_catalog(sku) on delete restrict,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 320),
  created_at timestamptz not null default now(),
  check (
    (entry_type = 'service_closed' and points_delta > 0 and source_request_id is not null and reward_sku is null)
    or (entry_type = 'reward_unlock' and points_delta < 0 and source_request_id is null and reward_sku is not null)
  )
);
create unique index if not exists reward_ledger_service_closed_uq
  on public.reward_ledger (user_id, source_request_id, entry_type)
  where entry_type = 'service_closed';
create index if not exists reward_ledger_user_time_idx
  on public.reward_ledger (user_id, created_at desc);

create table if not exists public.reward_unlocks (
  user_id text not null references public.profiles(user_id) on delete cascade,
  cosmetic_sku text not null references public.avatar_cosmetic_catalog(sku) on delete restrict,
  ledger_entry_id uuid not null unique references public.reward_ledger(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_sku)
);

alter table public.avatar_solana_products enable row level security;
alter table public.avatar_cosmetic_catalog enable row level security;
alter table public.profile_avatar_loadout enable row level security;
alter table public.profile_purchase_entitlements enable row level security;
alter table public.profile_purchase_quotes enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.reward_unlocks enable row level security;

create or replace function public.deny_reward_ledger_mutation() returns trigger
language plpgsql set search_path = public, pg_temp
as $$ begin raise exception 'reward ledger is append-only'; end; $$;
drop trigger if exists reward_ledger_append_only on public.reward_ledger;
create trigger reward_ledger_append_only before update or delete on public.reward_ledger
for each row execute function public.deny_reward_ledger_mutation();

create or replace function public.award_closed_request_rewards(target_request_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  request_row public.service_requests%rowtype;
  participant text;
  inserted_id uuid;
begin
  select * into request_row from public.service_requests where id = target_request_id for update;
  if request_row.id is null or request_row.status <> 'closed' or request_row.meeting_started_at is null then
    raise exception 'verified meeting required';
  end if;
  if (select count(*) from public.completion_confirmations where request_id = target_request_id) <> 2
     or (select count(*) from public.ratings where request_id = target_request_id) <> 2
     or not exists (select 1 from public.ratings where request_id = target_request_id and author_id = request_row.requester_id and subject_id = request_row.provider_id)
     or not exists (select 1 from public.ratings where request_id = target_request_id and author_id = request_row.provider_id and subject_id = request_row.requester_id) then
    raise exception 'verified bilateral completion and ratings required';
  end if;
  -- Serialize both participants in a stable order so concurrent request closures
  -- cannot race the daily cap and opposite requester/provider roles cannot deadlock.
  perform profile.user_id from public.profiles profile
  where profile.user_id = any(array[request_row.requester_id, request_row.provider_id])
  order by profile.user_id for update;
  foreach participant in array array[request_row.requester_id, request_row.provider_id] loop
    -- Anti-farming guardrail: at most three rewarded services per student per UTC day.
    if (select count(*) from public.reward_ledger where user_id = participant and entry_type = 'service_closed' and created_at >= date_trunc('day', now())) >= 3 then
      continue;
    end if;
    inserted_id := null;
    insert into public.reward_ledger (user_id, entry_type, points_delta, source_request_id, idempotency_key)
    values (participant, 'service_closed', 50, target_request_id, 'service_closed:' || target_request_id || ':' || participant)
    on conflict (idempotency_key) do nothing returning id into inserted_id;
    if inserted_id is not null then
      perform public.enqueue_request_notification(
        participant, 'reward_points_earned', jsonb_build_object('request_id', target_request_id, 'points', 50),
        'reward-points:' || target_request_id || ':' || participant
      );
    end if;
  end loop;
end;
$$;

create or replace function public.award_rewards_after_request_closed() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'closed' and OLD.status <> 'closed' then perform public.award_closed_request_rewards(NEW.id); end if;
  return NEW;
end;
$$;
drop trigger if exists award_rewards_after_request_closed on public.service_requests;
create trigger award_rewards_after_request_closed
  after update of status on public.service_requests for each row
  execute function public.award_rewards_after_request_closed();

create or replace function public.get_my_reward_summary()
returns table (balance integer, lifetime_earned integer, lifetime_spent integer, unlocked_skus text[])
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(ledger.points_delta), 0)::integer,
    coalesce(sum(greatest(ledger.points_delta, 0)), 0)::integer,
    coalesce(sum(greatest(-ledger.points_delta, 0)), 0)::integer,
    coalesce((select array_agg(unlock.cosmetic_sku order by unlock.unlocked_at)
      from public.reward_unlocks unlock where unlock.user_id = public.current_subject()), array[]::text[])
  from public.reward_ledger ledger where ledger.user_id = public.current_subject();
$$;

create or replace function public.unlock_my_avatar_reward(target_sku text) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare cost integer; current_balance integer; ledger_id uuid;
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  perform 1 from public.profiles where user_id = public.current_subject() for update;
  if not found then raise exception 'profile unavailable'; end if;
  select reward_points into cost from public.avatar_cosmetic_catalog
  where sku = target_sku and active and asset_status = 'approved' and unlock_method = 'reward_points';
  if cost is null then raise exception 'invalid reward cosmetic'; end if;
  if exists (select 1 from public.reward_unlocks where user_id = public.current_subject() and cosmetic_sku = target_sku) then return true; end if;
  select coalesce(sum(points_delta), 0)::integer into current_balance
  from public.reward_ledger where user_id = public.current_subject();
  if current_balance < cost then raise exception 'insufficient reward points'; end if;
  insert into public.reward_ledger (user_id, entry_type, points_delta, reward_sku, idempotency_key)
  values (public.current_subject(), 'reward_unlock', -cost, target_sku, 'reward_unlock:' || public.current_subject() || ':' || target_sku)
  on conflict (idempotency_key) do nothing returning id into ledger_id;
  if ledger_id is null then
    select id into ledger_id from public.reward_ledger
    where idempotency_key = 'reward_unlock:' || public.current_subject() || ':' || target_sku
      and user_id = public.current_subject() and reward_sku = target_sku;
    if ledger_id is null then raise exception 'reward unlock conflict'; end if;
  end if;
  insert into public.reward_unlocks (user_id, cosmetic_sku, ledger_entry_id)
  values (public.current_subject(), target_sku, ledger_id)
  on conflict (user_id, cosmetic_sku) do nothing;
  return true;
end;
$$;

create or replace function public.list_my_avatar_marketplace()
returns table (
  sku text, label text, category text, value_key text, equip_group text,
  collections text[], unlock_method text, purchase_sku text, lamports bigint, reward_points integer,
  owned boolean, equipped boolean, network text, asset_status text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select catalog.sku, catalog.label, catalog.category, catalog.value_key, catalog.equip_group,
    catalog.collections, catalog.unlock_method, catalog.purchase_sku, catalog.lamports, catalog.reward_points,
    catalog.unlock_method = 'included'
      or exists (select 1 from public.profile_purchase_entitlements paid where paid.user_id = public.current_subject() and paid.purchase_sku = catalog.purchase_sku)
      or exists (select 1 from public.reward_unlocks reward where reward.user_id = public.current_subject() and reward.cosmetic_sku = catalog.sku),
    exists (select 1 from public.profile_avatar_loadout loadout where loadout.user_id = public.current_subject() and loadout.cosmetic_sku = catalog.sku),
    case when catalog.unlock_method = 'solana_devnet' then 'devnet' else null end,
    catalog.asset_status
  from public.avatar_cosmetic_catalog catalog where catalog.active order by catalog.sort_order;
$$;

create or replace function public.set_my_avatar_cosmetic(target_sku text, target_equipped boolean default true) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_group text; target_category text; target_collections text[]; target_asset_status text; method text; paid_sku text; is_owned boolean; active_collection text;
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  perform 1 from public.profiles where user_id = public.current_subject() for update;
  if not found then raise exception 'profile unavailable'; end if;
  select equip_group, category, collections, asset_status, unlock_method, purchase_sku
  into target_group, target_category, target_collections, target_asset_status, method, paid_sku
  from public.avatar_cosmetic_catalog where sku = target_sku and active;
  if target_group is null then raise exception 'invalid cosmetic'; end if;
  if target_asset_status <> 'approved' then raise exception 'cosmetic asset unavailable'; end if;
  if target_category <> 'collection' then
    select catalog.value_key into active_collection
    from public.profile_avatar_loadout loadout
    join public.avatar_cosmetic_catalog catalog on catalog.sku = loadout.cosmetic_sku
    where loadout.user_id = public.current_subject() and loadout.equip_group = 'collection';
    if active_collection is not null and not (active_collection = any(target_collections)) then
      raise exception 'cosmetic incompatible with collection';
    end if;
  end if;
  is_owned := method = 'included'
    or exists (select 1 from public.profile_purchase_entitlements paid where paid.user_id = public.current_subject() and paid.purchase_sku = paid_sku)
    or exists (select 1 from public.reward_unlocks reward where reward.user_id = public.current_subject() and reward.cosmetic_sku = target_sku);
  if not is_owned then raise exception 'cosmetic not owned'; end if;
  if target_equipped then
    insert into public.profile_avatar_loadout (user_id, equip_group, cosmetic_sku, equipped_at)
    values (public.current_subject(), target_group, target_sku, now())
    on conflict (user_id, equip_group) do update set cosmetic_sku = excluded.cosmetic_sku, equipped_at = excluded.equipped_at;
    if target_category = 'collection' then
      delete from public.profile_avatar_loadout loadout
      using public.avatar_cosmetic_catalog catalog
      where loadout.cosmetic_sku = catalog.sku
        and loadout.user_id = public.current_subject()
        and loadout.equip_group <> 'collection'
        and not ((select value_key from public.avatar_cosmetic_catalog where sku = target_sku) = any(catalog.collections));
    end if;
  else
    delete from public.profile_avatar_loadout
    where user_id = public.current_subject() and equip_group = target_group and cosmetic_sku = target_sku;
  end if;
  update public.profile_customizations paid set equipped = exists (
    select 1 from public.profile_avatar_loadout loadout
    join public.avatar_cosmetic_catalog catalog on catalog.sku = loadout.cosmetic_sku
    where loadout.user_id = paid.user_id and catalog.purchase_sku = paid.cosmetic_sku
  ) where paid.user_id = public.current_subject();
  return target_equipped;
end;
$$;

-- Compatibility projection for the already-shipped three SVG collectibles.
create or replace function public.list_my_cosmetics()
returns table (sku text, label text, lamports bigint, owned boolean, equipped boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select catalog.sku, catalog.label, catalog.lamports,
    exists (select 1 from public.profile_purchase_entitlements paid where paid.user_id = public.current_subject() and paid.purchase_sku = catalog.purchase_sku),
    exists (select 1 from public.profile_avatar_loadout loadout where loadout.user_id = public.current_subject() and loadout.cosmetic_sku = catalog.sku)
  from public.avatar_cosmetic_catalog catalog
  where catalog.sku in ('profile-frame','campus-theme','trust-badge') and catalog.active order by catalog.sort_order;
$$;

create or replace function public.equip_profile_customization(target_sku text) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$ begin return public.set_my_avatar_cosmetic(target_sku, true); end; $$;

drop function if exists public.claim_profile_customization(text,text,text,text);
drop function if exists public.claim_profile_customization(text,text,text,text,bigint);
create or replace function public.claim_profile_customization(
  target_user_id text, target_sku text, target_signature text, target_wallet text,
  target_lamports bigint, target_quote_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare customization_id uuid; profile_wallet text; existing_signature text;
begin
  if not exists (
       select 1 from public.avatar_solana_products
       where sku = target_sku and active and lamports = target_lamports
     )
     or target_signature !~ '^[1-9A-HJ-NP-Za-km-z]{80,100}$'
     or target_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'invalid cosmetic claim'; end if;
  select solana_wallet into profile_wallet from public.profiles where user_id = target_user_id;
  if profile_wallet is null or profile_wallet <> target_wallet then raise exception 'wallet does not match profile'; end if;
  perform 1 from public.profile_purchase_quotes quote
  where quote.id = target_quote_id and quote.user_id = target_user_id
    and quote.purchase_sku = target_sku and quote.lamports = target_lamports
    and (quote.claimed_at is not null or quote.expires_at > now())
  for update;
  if not found then raise exception 'invalid or expired cosmetic quote'; end if;
  select entitlement.customization_id, customization.transaction_signature
  into customization_id, existing_signature
  from public.profile_purchase_entitlements entitlement
  join public.profile_customizations customization on customization.id = entitlement.customization_id
  where entitlement.user_id = target_user_id and entitlement.purchase_sku = target_sku;
  if customization_id is not null then
    if existing_signature = target_signature then return customization_id; end if;
    raise exception 'cosmetic already owned';
  end if;
  insert into public.profile_customizations (user_id, cosmetic_sku, solana_cluster, transaction_signature, verified_at)
  values (target_user_id, target_sku, 'devnet', target_signature, now())
  on conflict (transaction_signature) do nothing returning id into customization_id;
  if customization_id is null then
    select id into customization_id from public.profile_customizations
    where transaction_signature = target_signature and user_id = target_user_id and cosmetic_sku = target_sku;
    if customization_id is null then raise exception 'transaction already claimed'; end if;
  end if;
  insert into public.profile_purchase_entitlements (user_id,purchase_sku,customization_id)
  values (target_user_id,target_sku,customization_id)
  on conflict (user_id,purchase_sku) do nothing;
  if not found then raise exception 'cosmetic already owned'; end if;
  update public.profile_purchase_quotes set claimed_at = now() where id = target_quote_id;
  return customization_id;
end;
$$;

-- Temporary DB-first rolling-deploy bridge for the previous server route.
-- That route verifies the Devnet transfer before calling this RPC but has no
-- checkout id. Restrict the bridge to its three immutable legacy prices; new
-- products must use the six-argument quote-bound function above. Remove this
-- overload after every production instance runs the checkout-id route.
create or replace function public.claim_profile_customization(
  target_user_id text, target_sku text, target_signature text, target_wallet text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  customization_id uuid;
  existing_signature text;
  target_lamports bigint;
  target_quote_id uuid;
begin
  select entitlement.customization_id, customization.transaction_signature
  into customization_id, existing_signature
  from public.profile_purchase_entitlements entitlement
  join public.profile_customizations customization on customization.id = entitlement.customization_id
  where entitlement.user_id = target_user_id and entitlement.purchase_sku = target_sku;
  if customization_id is not null then
    if existing_signature = target_signature then return customization_id; end if;
    raise exception 'cosmetic already owned';
  end if;

  select product.lamports into target_lamports
  from public.avatar_solana_products product
  where product.sku = target_sku and product.active;
  if (target_sku, target_lamports) not in (
    ('profile-frame', 10000000::bigint),
    ('campus-theme', 20000000::bigint),
    ('trust-badge', 30000000::bigint)
  ) then
    raise exception 'legacy cosmetic claim unavailable; use quote flow';
  end if;

  perform 1 from public.profiles where user_id = target_user_id for update;
  if not found then raise exception 'profile unavailable'; end if;
  select quote.id into target_quote_id
  from public.profile_purchase_quotes quote
  where quote.user_id = target_user_id
    and quote.purchase_sku = target_sku
    and quote.claimed_at is null
    and quote.expires_at > now()
  for update;
  if target_quote_id is null then
    target_quote_id := gen_random_uuid();
    insert into public.profile_purchase_quotes
      (id,user_id,purchase_sku,client_key,lamports,expires_at,claimed_at,created_at)
    values
      (target_quote_id,target_user_id,target_sku,gen_random_uuid(),target_lamports,
       now() + interval '5 minutes',null,now())
    on conflict (user_id,purchase_sku) do update set
      id=excluded.id, client_key=excluded.client_key, lamports=excluded.lamports,
      expires_at=excluded.expires_at, claimed_at=null, created_at=excluded.created_at;
  end if;
  return public.claim_profile_customization(
    target_user_id, target_sku, target_signature, target_wallet,
    target_lamports, target_quote_id
  );
end;
$$;

-- Profile wallets can only be changed by the server after an Ed25519 proof of
-- possession. This replacement RPC deliberately has no wallet parameter.
create or replace function public.update_my_profile_without_wallet(
  set_display_name boolean, target_display_name text,
  set_avatar_url boolean, target_avatar_url text,
  set_bio boolean, target_bio text,
  set_interests boolean, target_interests jsonb,
  set_avatar_config boolean, target_avatar_config jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if public.current_subject() is null then raise exception 'authentication required'; end if;
  if set_display_name and (target_display_name is null or char_length(trim(target_display_name)) not between 2 and 60)
    then raise exception 'invalid display name'; end if;
  if set_avatar_url and target_avatar_url is not null and (
    char_length(target_avatar_url) > 500 or target_avatar_url !~* '^https://[^/[:space:]]+(/[^[:space:]]*)?$'
  ) then raise exception 'invalid avatar url'; end if;
  if set_bio and target_bio is not null and char_length(target_bio) > 320 then raise exception 'invalid bio'; end if;
  if set_interests and (
    target_interests is null or jsonb_typeof(target_interests) <> 'array'
    or jsonb_array_length(target_interests) > 20
    or exists (select 1 from jsonb_array_elements(target_interests) item
      where jsonb_typeof(item) <> 'string' or char_length(trim(item #>> '{}')) not between 1 and 50)
  ) then raise exception 'invalid interests'; end if;
  if set_avatar_config and (
    target_avatar_config is null
    or target_avatar_config <> jsonb_build_object(
      'skin', target_avatar_config ->> 'skin', 'face', target_avatar_config ->> 'face',
      'hair', target_avatar_config ->> 'hair', 'hairColor', target_avatar_config ->> 'hairColor',
      'outfit', target_avatar_config ->> 'outfit', 'accessory', target_avatar_config ->> 'accessory'
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
      interests = case when set_interests then target_interests else interests end,
      avatar_config = case when set_avatar_config then target_avatar_config else avatar_config end,
      updated_at = now()
  where user_id = public.current_subject();
  if not found then raise exception 'profile unavailable'; end if;
  return true;
end;
$$;

-- Rolling-deploy compatibility for the previous frontend. It can still save
-- ordinary profile fields after the database deploy, but wallet writes fail
-- closed and must use the signed challenge/link endpoints.
create or replace function public.update_my_profile(
  set_display_name boolean, target_display_name text,
  set_avatar_url boolean, target_avatar_url text,
  set_bio boolean, target_bio text,
  set_solana_wallet boolean, target_solana_wallet text,
  set_interests boolean, target_interests jsonb,
  set_avatar_config boolean, target_avatar_config jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if set_solana_wallet then raise exception 'use signed wallet-link flow'; end if;
  return public.update_my_profile_without_wallet(
    set_display_name, target_display_name,
    set_avatar_url, target_avatar_url,
    set_bio, target_bio,
    set_interests, target_interests,
    set_avatar_config, target_avatar_config
  );
end;
$$;

revoke all on table public.avatar_solana_products, public.avatar_cosmetic_catalog, public.profile_avatar_loadout, public.profile_purchase_entitlements, public.profile_purchase_quotes, public.reward_ledger, public.reward_unlocks from anon, authenticated;
-- Repeat the profile-table boundary here so a partially upgraded environment
-- cannot retain the historical column-level solana_wallet UPDATE grant.
revoke select, insert, update, delete on public.profiles from authenticated;
revoke select, insert, update, delete on public.completion_confirmations, public.ratings from authenticated;
revoke all on function public.award_closed_request_rewards(uuid) from public;
revoke all on function public.get_my_reward_summary() from public;
revoke all on function public.unlock_my_avatar_reward(text) from public;
revoke all on function public.list_my_avatar_marketplace() from public;
revoke all on function public.set_my_avatar_cosmetic(text, boolean) from public;
revoke all on function public.list_my_cosmetics() from public;
revoke all on function public.equip_profile_customization(text) from public;
revoke all on function public.reserve_profile_purchase_quote(text,text,bigint,uuid) from public;
revoke all on function public.claim_profile_customization(text,text,text,text) from public, anon, authenticated;
revoke all on function public.claim_profile_customization(text,text,text,text,bigint,uuid) from public;
revoke all on function public.update_my_profile(boolean,text,boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.update_my_profile_without_wallet(boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) from public;
grant execute on function public.get_my_reward_summary() to authenticated;
grant execute on function public.unlock_my_avatar_reward(text) to authenticated;
grant execute on function public.list_my_avatar_marketplace() to authenticated;
grant execute on function public.set_my_avatar_cosmetic(text, boolean) to authenticated;
grant execute on function public.list_my_cosmetics() to authenticated;
grant execute on function public.equip_profile_customization(text) to authenticated;
grant execute on function public.reserve_profile_purchase_quote(text,text,bigint,uuid) to service_role;
grant execute on function public.claim_profile_customization(text,text,text,text) to service_role;
grant execute on function public.claim_profile_customization(text,text,text,text,bigint,uuid) to service_role;
grant execute on function public.update_my_profile_without_wallet(boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) to authenticated;
grant execute on function public.update_my_profile(boolean,text,boolean,text,boolean,text,boolean,text,boolean,jsonb,boolean,jsonb) to authenticated;

-- Complete the server ranking contract: current DTO, deterministic order, no
-- fabricated responsiveness signal, and no recommendation of one's own listing.
drop function if exists public.list_recommended_services();
create or replace function public.list_recommended_services()
returns table (
  id uuid, title text, category text, subcategory text, description text,
  price_note text, availability_note text, scheduled_for timestamptz,
  approximate_lat double precision, approximate_lng double precision,
  approximate_distance_miles double precision, provider_name text,
  provider_initials text, provider_verified boolean, provider_rating numeric,
  provider_rating_count integer, provider_completed integer, service_type text,
  sponsored boolean, score numeric, explanation text
)
language sql stable security definer set search_path = extensions, public, pg_temp
as $$
  with candidates as (
    select service.*, profile.display_name, profile.rating_sum, profile.rating_count,
      profile.completed_count,
      round(((profile.rating_sum + 4.5 * 8)::numeric / greatest(profile.rating_count + 8, 1)), 2) as adjusted_rating,
      ST_Distance(
        service.approximate_point,
        ST_SetSRID(ST_MakePoint(-101.8747, 33.5843), 4326)::geography
      ) / 1609.344 as campus_distance,
      case when exists (
        select 1 from jsonb_array_elements_text(coalesce(viewer.interests, '[]'::jsonb)) interest
        where lower(interest) in (lower(service.category), lower(coalesce(service.subcategory, '')))
      ) then 1.0 else 0.25 end as affinity
    from public.services service
    join public.profiles profile on profile.user_id = service.provider_id
    left join public.profiles viewer on viewer.user_id = public.current_subject()
    where service.is_active and service.provider_id <> public.current_subject()
  ), scored as (
    select candidates.*,
      round((
        affinity * 0.33
        + least(1, greatest(0, (adjusted_rating - 3.5) / 1.5)) * 0.30
        + least(1, greatest(0, 1 - campus_distance / 3.0)) * 0.22
        + least(1, greatest(0, completed_count::numeric / 60)) * 0.15
      )::numeric, 4) as recommendation_score
    from candidates
  )
  select scored.id, scored.title, scored.category, scored.subcategory, scored.description,
    scored.price_note, scored.availability_note, scored.scheduled_for,
    ST_Y(scored.approximate_point::geometry), ST_X(scored.approximate_point::geometry),
    scored.campus_distance, scored.display_name,
    upper(left(regexp_replace(scored.display_name, '[^[:alnum:] ]', '', 'g'), 1)
      || left(coalesce(nullif(split_part(scored.display_name, ' ', 2), ''), scored.display_name), 1)),
    true, scored.adjusted_rating, scored.rating_count, scored.completed_count,
    scored.listing_kind, scored.sponsored, scored.recommendation_score,
    case when scored.affinity = 1.0
      then 'Matches a selected interest, adjusted rating, approximate distance, and completed services.'
      else 'Ranked by adjusted rating, approximate distance, and completed services.'
    end
  from scored
  order by scored.recommendation_score desc, scored.created_at desc
  limit 100;
$$;
revoke all on function public.list_recommended_services() from public;
grant execute on function public.list_recommended_services() to authenticated;
