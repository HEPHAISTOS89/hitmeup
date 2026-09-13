-- Backfill first: once a one-off service is fully closed, the exact meeting point is no longer
-- needed. Keep only the already-randomized approximate point so service and
-- reward history remain intact without retaining the precise location.
update public.services as service
   set exact_point = service.approximate_point,
       updated_at = now()
 where service.listing_kind = 'temporary'
   and exists (
     select 1 from public.service_requests as request
      where request.service_id = service.id
        and request.status = 'closed'
   );

-- Apply the same retention rule to every future closure.
create or replace function public.generalize_closed_service_location() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'closed' and OLD.status <> 'closed' then
    update public.services
       set exact_point = approximate_point,
           updated_at = now()
     where id = NEW.service_id
       and listing_kind = 'temporary';
  end if;
  return NEW;
end;
$$;

drop trigger if exists generalize_closed_service_location on public.service_requests;
create trigger generalize_closed_service_location
  after update of status on public.service_requests
  for each row execute function public.generalize_closed_service_location();

revoke all on function public.generalize_closed_service_location() from public;
