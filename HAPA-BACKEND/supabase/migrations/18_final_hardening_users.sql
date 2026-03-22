-- Migration: 18_final_hardening_users.sql
-- FINAL STEP: Re-enables security and cleans up unused columns.

-- 1. Remove unused metadata columns to keep it lean
ALTER TABLE public.users DROP COLUMN IF EXISTS full_name;
ALTER TABLE public.users DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE public.users DROP COLUMN IF EXISTS updated_at;

-- 2. Re-enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Service Role (Backend sync)
DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" 
ON public.users FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Policy: Users (Own profile)
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- 5. Policy: Public (Discoverability)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.users FOR SELECT 
USING (status = 'active');
