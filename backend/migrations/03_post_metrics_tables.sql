-- Post Likes Table
create table if not exists public.post_likes (
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Post Views Table
create table if not exists public.post_views (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade, -- nullable for anonymous views
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- Index for analytics
create index if not exists post_views_post_id_idx on public.post_views(post_id);

-- RPC: Toggle Post Like
create or replace function toggle_post_like(target_post_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
begin
  if exists (select 1 from public.post_likes where post_id = target_post_id and user_id = target_user_id) then
    delete from public.post_likes where post_id = target_post_id and user_id = target_user_id;
    
    update public.posts
    set metrics = jsonb_set(
        coalesce(metrics, '{"likes": 0, "views": 0}'),
        '{likes}',
        (coalesce((metrics->>'likes')::int, 0) - 1)::text::jsonb
    )
    where id = target_post_id;
  else
    insert into public.post_likes (post_id, user_id) values (target_post_id, target_user_id);
    
    update public.posts
    set metrics = jsonb_set(
        coalesce(metrics, '{"likes": 0, "views": 0}'),
        '{likes}',
        (coalesce((metrics->>'likes')::int, 0) + 1)::text::jsonb
    )
    where id = target_post_id;
  end if;

  return (select metrics from public.posts where id = target_post_id);
end;
$$;

-- RPC: Track Post View
create or replace function track_post_view(target_post_id uuid, viewer_user_id uuid default null)
returns void
language plpgsql
security definer
as $$
declare
  is_anon boolean;
begin
  is_anon := (viewer_user_id is null);

  -- Optional: Rate limit logic here (e.g., only 1 view per user per hour).
  -- For now, we trust the client logic to call this once per session.

  insert into public.post_views (post_id, user_id, is_anonymous)
  values (target_post_id, viewer_user_id, is_anon);

  update public.posts
  set metrics = jsonb_set(
      coalesce(metrics, '{"likes": 0, "views": 0}'),
      '{views}',
      (coalesce((metrics->>'views')::int, 0) + 1)::text::jsonb
  )
  where id = target_post_id;
end;
$$;
