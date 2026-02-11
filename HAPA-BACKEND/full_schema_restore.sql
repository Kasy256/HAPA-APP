-- RESTORE FULL SCHEMA
-- This script recreates the missing base tables and applies all migrations in order.

-- 1. Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT UNIQUE,
    role TEXT DEFAULT 'venue_owner',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create otp_codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT DEFAULT 'login',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 3. Create venues table
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES public.users(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    categories JSONB DEFAULT '[]'::jsonb,
    images JSONB DEFAULT '[]'::jsonb,
    address TEXT,
    lat FLOAT8,
    lng FLOAT8,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb
);

-- 4. Create posts table
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb,
    is_liked BOOLEAN DEFAULT FALSE -- This might be a computed field in API, but adding column just in case for now or it will be ignored if not used
);

-- APPLY MIGRATIONS

-- 01_likes_and_views.sql --
-- 1. Create venue_likes table (Users waitlist/interest in venues basically)
create table if not exists public.venue_likes (
  user_id uuid not null references auth.users(id) on delete cascade, 
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, venue_id)
);

-- Note: references auth.users(id) might fail if auth.users doesn't exist or if we want to reference public.users.
-- Migration 07 fixes this, but initial creation might fail if auth.users is empty/missing?
-- Actually, strict FK to auth.users is standard in Supabase.
-- However, since the user said "deleted all tables", auth.users might be intact (it's in auth schema, not public).
-- But if strict FK fails, we might need to change it to public.users immediately.
-- Let's stick to original migration text, assuming auth.users exists (it usually does in Supabase).

-- 2. Create venue_views table (Analytics)
create table if not exists public.venue_views (
  id uuid default gen_random_uuid() primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- Optional, for authenticated views
  viewer_ip text, -- Optional, for anonymous unique views logic if needed later
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Add metrics column to venues if not exists (Already added in base table)
-- alter table public.venues 
-- add column if not exists metrics jsonb default '{"likes": 0, "views": 0}'::jsonb;

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

-- 02_post_metrics.sql --
-- Add metrics column to posts if not exists (Already added in base table)
-- alter table public.posts 
-- add column if not exists metrics jsonb default '{"likes": 0, "views": 0}'::jsonb;

-- 03_post_metrics_tables.sql --
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

-- 04_allow_null_phone.sql --
alter table public.users alter column phone_number drop not null;

-- 05_drop_ambiguous_functions.sql --
-- Drop the ambiguous overloads that include a device_id
drop function if exists public.toggle_post_like(uuid, uuid, character varying);
drop function if exists public.track_post_view(uuid, uuid, character varying);

-- 06_unique_post_views.sql --
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

-- 07_fix_venue_fks.sql --
-- Fix FK constraints for venue_likes and venue_views to reference public.users
-- This is necessary because Venue Owners are created in public.users via custom auth 
-- and may not exist in auth.users.

-- 1. Update venue_likes
-- Drop if exists to be safe
ALTER TABLE public.venue_likes DROP CONSTRAINT IF EXISTS venue_likes_user_id_fkey;

alter table public.venue_likes
  add constraint venue_likes_user_id_fkey
  foreign key (user_id)
  references public.users(id)
  on delete cascade;

-- 2. Update venue_views
ALTER TABLE public.venue_views DROP CONSTRAINT IF EXISTS venue_views_user_id_fkey;

alter table public.venue_views
  add constraint venue_views_user_id_fkey
  foreign key (user_id)
  references public.users(id)
  on delete set null;

-- 08_add_working_hours.sql --
-- Add working_hours column to venues table if it doesn't exist
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN public.venues.working_hours IS 'Working hours per day in format: {"monday": {"open": "09:00", "close": "22:00"}, ...}. null for a day means closed.';
