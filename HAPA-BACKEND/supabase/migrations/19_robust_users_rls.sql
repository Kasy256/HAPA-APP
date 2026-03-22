-- Migration: 19_robust_users_rls.sql
-- Run this if you are still getting "new row violates RLS" for the 'users' table.

-- 1. First, let's make sure the users table is clean and the old ghost trigger is 100% GONE.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- 2. Clean up any existing policies to start fresh
DROP POLICY IF EXISTS "Service role full access" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;

-- 3. Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. THE FIX: Grant the service_role absolute access explicitly.
-- We use 'TO authenticated, service_role' to be super safe.
CREATE POLICY "Allow backend full access" 
ON public.users 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 5. Standard user policies
CREATE POLICY "Allow users to see themselves" 
ON public.users 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- 6. Verify if it's working by adding a temporary "Everyone can see" policy if needed,
-- but let's try this first.
