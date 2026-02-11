-- 1. Create venue_likes table (Users waitlist/interest in venues basically)
create table public.venue_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, venue_id)
);

-- 2. Create venue_views table (Analytics)
create table public.venue_views (
  id uuid default gen_random_uuid() primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- Optional, for authenticated views
  viewer_ip text, -- Optional, for anonymous unique views logic if needed later
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Add metrics column to venues if not exists
alter table public.venues 
add column if not exists metrics jsonb default '{"likes": 0, "views": 0}'::jsonb;

-- 4. Create function to increment likes
create or replace function toggle_venue_like(target_venue_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  is_liked boolean;
  new_count int;
begin
  -- Check if already liked
  select exists(
    select 1 from public.venue_likes 
    where venue_id = target_venue_id and user_id = target_user_id
  ) into is_liked;

  if is_liked then
    -- Unlike
    delete from public.venue_likes 
    where venue_id = target_venue_id and user_id = target_user_id;
    
    -- Decrement counter safely
    update public.venues
    set metrics = jsonb_set(
      metrics, 
      '{likes}', 
      (coalesce((metrics->>'likes')::int, 0) - 1)::text::jsonb
    )
    where id = target_venue_id;
  else
    -- Like
    insert into public.venue_likes (venue_id, user_id)
    values (target_venue_id, target_user_id);
    
    -- Increment counter safely
    update public.venues
    set metrics = jsonb_set(
      metrics, 
      '{likes}', 
      (coalesce((metrics->>'likes')::int, 0) + 1)::text::jsonb
    )
    where id = target_venue_id;
  end if;

  return (select metrics from public.venues where id = target_venue_id);
end;
$$;

-- 5. Create function to track view
create or replace function track_venue_view(target_venue_id uuid, viewer_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
begin
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
