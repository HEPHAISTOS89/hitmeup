-- Own-profile review projection for the HitMeUp profile experience.
-- Prepared locally. Apply only to an explicitly approved disposable/dev database.
-- It does not create public profile routes or expose internal identity columns.

create or replace function public.list_my_received_reviews()
returns table (
  id uuid,
  score smallint,
  comment text,
  created_at timestamptz,
  author_name text,
  author_initials text,
  service_title text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select rating.id,
    rating.score,
    rating.comment,
    rating.created_at,
    author.display_name,
    upper(left(split_part(author.display_name, ' ', 1), 1)
      || left(coalesce(nullif(split_part(author.display_name, ' ', 2), ''), split_part(author.display_name, ' ', 1)), 1)),
    service.title
  from public.ratings rating
  join public.service_requests request on request.id = rating.request_id
  join public.services service on service.id = request.service_id
  join public.profiles author on author.user_id = rating.author_id
  where rating.subject_id = public.current_subject()
    and request.status = 'closed'
    and public.current_subject() in (request.requester_id, request.provider_id)
    and (select count(*) from public.ratings peer where peer.request_id = request.id) = 2
  order by rating.created_at desc
  limit 100;
$$;

revoke all on function public.list_my_received_reviews() from public, anon;
grant execute on function public.list_my_received_reviews() to authenticated;
