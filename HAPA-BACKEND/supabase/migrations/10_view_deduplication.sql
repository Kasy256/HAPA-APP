-- Migration 10: 24-hour deduplication window for venue views
-- Prevents the same user from inflating view counts on repeat visits
-- Works for both real users (by user_id) and anonymous users (same Supabase anon UUID)

create or replace function track_venue_view(target_venue_id uuid, viewer_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
declare
  venue_owner_id uuid;
  already_viewed boolean;
begin
  -- Get the owner of this venue
  select owner_id into venue_owner_id
  from public.venues
  where id = target_venue_id;

  -- Self-view guard: skip if viewer is the venue owner
  if viewer_user_id is not null and viewer_user_id = venue_owner_id then
    return;
  end if;

  -- 24-hour deduplication: same user can only add one view per day
  if viewer_user_id is not null then
    select exists(
      select 1 from public.venue_views
      where venue_id = target_venue_id
        and user_id = viewer_user_id
        and created_at > now() - interval '24 hours'
    ) into already_viewed;

    if already_viewed then
      return;
    end if;
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
