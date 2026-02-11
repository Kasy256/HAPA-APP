-- Update track_post_view to ensure unique views per user
create or replace function track_post_view(target_post_id uuid, viewer_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
declare
  is_anon boolean;
  view_exists boolean;
begin
  is_anon := (viewer_user_id is null);

  -- 1. Check if this user has already viewed this post
  --    If user is anonymous (null), we can't really track uniqueness easily without a device_id or IP.
  --    BUT, since we implemented Anonymous Auth, 'viewer_user_id' should NOT be null anymore 
  --    (it will be the anonymous user's UUID).
  
  if viewer_user_id is not null then
    select exists(
      select 1 from public.post_views 
      where post_id = target_post_id and user_id = viewer_user_id
    ) into view_exists;
    
    if view_exists then
      -- User already viewed this post. Do nothing.
      return;
    end if;
  end if;

  -- 2. Insert new view record
  insert into public.post_views (post_id, user_id, is_anonymous)
  values (target_post_id, viewer_user_id, is_anon);

  -- 3. Increment counter
  update public.posts
  set metrics = jsonb_set(
      coalesce(metrics, '{"likes": 0, "views": 0}'),
      '{views}',
      (coalesce((metrics->>'views')::int, 0) + 1)::text::jsonb
  )
  where id = target_post_id;
end;
$$;
