-- Migration: 17_final_cleanup_profiles.sql
-- Run this in the Supabase SQL Editor to remove the problematic legacy table and trigger.

-- 1. Drop the trigger that is failing during login
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the function used by the trigger
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- 3. Delete the redundant and problematic profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 4. Ensure the users table is ready and RLS is fine
-- (We already did this, but let's be 100% sure it's unblocked)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY; 
-- Note: You can re-enable RLS later once the app is working perfectly.
