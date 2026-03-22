-- Migration: 15_fix_users_rls.sql
-- This migration ensures that Row Level Security (RLS) on the public.users table 
-- does not block the authentication and synchronization flow.

-- 1. Enable RLS on the users table (standard practice)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing restrictive policies that might be blocking access
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admin full access" ON public.users;
DROP POLICY IF EXISTS "Enable all for service role" ON public.users;

-- 3. Create a policy that allows the service role key to bypass RLS
-- While service_role usually bypasses RLS automatically, some configurations
-- require an explicit policy if RLS is enabled.
CREATE POLICY "Service role full access" 
ON public.users 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Allow users to view their own profile
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- 5. Allow users to update their own profile
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 6. Also allow public search (e.g. for venues/posts to link to owners)
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.users FOR SELECT 
USING (status = 'active');
