-- Migration 14: Fix post_likes and post_views FKs to reference auth.users
--
-- Problem: post_likes.user_id and post_views.user_id both have FK constraints 
-- that currently point to public.users(id).
-- Anonymous / browse-only users have a valid Supabase Auth session (auth.users row)
-- but may not have a row in public.users yet (they only get one after completing OTP login).
-- This caused: "insert or update on table post_likes violates foreign key constraint"
--
-- Fix: Drop the existing FK and recreate as a cascade on public.users,
-- AND ensure the upsert path in the posts Edge Function creates the public.users row.
-- This is safe because public.users.phone_number is already nullable (migration 04).
-- Users with just auth.users rows (anonymous) can now be upserted with just id, role, status.

-- Step 1: Re-confirm post_likes FK target and constraint name
-- (Run this in Supabase Dashboard > SQL Editor if the like error persists after redeploying posts)

-- Check existing constraint:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.post_likes'::regclass;

-- Step 2: If the constraint is already post_likes_user_id_fkey pointing to public.users,
-- then the fix is purely in the Edge Function (the upsert with correct columns).
-- Run this only if you need to ensure it's set to public.users:

ALTER TABLE public.post_likes DROP CONSTRAINT IF EXISTS post_likes_user_id_fkey;
ALTER TABLE public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.post_views DROP CONSTRAINT IF EXISTS post_views_user_id_fkey;
ALTER TABLE public.post_views
    ADD CONSTRAINT post_views_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;
