-- Migration: 16_consolidate_user_storage.sql
-- Merges the redundant 'profiles' table into 'users' and updates triggers.

-- 1. Add missing metadata columns to 'users' table if they don't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Migrate any existing data from 'profiles' to 'users' (optional but safe)
INSERT INTO public.users (id, phone_number, full_name, avatar_url, role, status, created_at, updated_at)
SELECT id, phone_number, full_name, avatar_url, role, status, created_at, updated_at
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET 
    phone_number = EXCLUDED.phone_number,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

-- 3. Update the trigger function to point to 'users' instead of 'profiles'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, phone_number, role, status)
    VALUES (NEW.id, NEW.phone, 'authenticated', 'active')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update foreign keys in other tables to point to 'users'
-- Note: 'venues.owner_id' might already point to 'users', but let's be sure.
-- If you get an error here, it means the FK is already correct or has a different name.
DO $$ 
BEGIN 
    -- Drop old venue FK if it points to profiles
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'venues_owner_id_fkey') THEN
        ALTER TABLE public.venues DROP CONSTRAINT venues_owner_id_fkey;
    END IF;
    
    -- Add new venue FK pointing to users
    ALTER TABLE public.venues 
    ADD CONSTRAINT venues_owner_id_fkey 
    FOREIGN KEY (owner_id) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;
END $$;

-- 5. Cleanup: Delete the redundant profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 6. Ensure RLS is still set up correctly on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
CREATE POLICY "Public profiles are viewable by everyone" ON public.users FOR SELECT USING (status = 'active');
