-- Fix FK constraints for venue_likes and venue_views to reference public.users
-- This is necessary because Venue Owners are created in public.users via custom auth 
-- and may not exist in auth.users.

-- 1. Update venue_likes
alter table public.venue_likes
  drop constraint venue_likes_user_id_fkey;

alter table public.venue_likes
  add constraint venue_likes_user_id_fkey
  foreign key (user_id)
  references public.users(id)
  on delete cascade;

-- 2. Update venue_views
alter table public.venue_views
  drop constraint venue_views_user_id_fkey;

alter table public.venue_views
  add constraint venue_views_user_id_fkey
  foreign key (user_id)
  references public.users(id)
  on delete set null;
