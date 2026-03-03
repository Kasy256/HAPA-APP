-- Migration: Add self-view guard to track_venue_view function
-- Venue owners viewing their own profile should not count as a view
-- (Instagram/TikTok standard behavior)

create or replace function track_venue_view(target_venue_id uuid, viewer_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
declare
  venue_owner_id uuid;
begin
  -- Get the owner of this venue
  select owner_id into venue_owner_id
  from public.venues
  where id = target_venue_id;

  -- Self-view guard: skip if viewer is the venue owner
  if viewer_user_id is not null and viewer_user_id = venue_owner_id then
    return;
  end if;

  -- Insert view record
  insert into public.venue_views (venue_id, user_id)
  values (target_venue_id, viewer_user_id);

  -- Increment counter
  update public.venues
  set metrics = jsonb_set(
    metrics, 
    '{views}', 
    (coalesce((metrics->>'views')::int, 0) + 1)::text::jsonb
  )
  where id = target_venue_id;
end;
$$;
