-- Migration: 22_verify_cascades
-- Enforces ON DELETE CASCADE for users and venues to strictly comply with Apple's account deletion policy.

BEGIN;

DO $$ 
BEGIN
    -- Ensure deleting an auth.users row deletes the public.users profile natively
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_id_fkey' AND table_name = 'users'
    ) THEN
        ALTER TABLE public.users DROP CONSTRAINT users_id_fkey;
        ALTER TABLE public.users ADD CONSTRAINT users_id_fkey 
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    ELSE
        -- If it was missing entirely, add it
        ALTER TABLE public.users ADD CONSTRAINT users_id_fkey 
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    -- Ensure deleting a public.users profile deletes their venues natively
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'venues_owner_id_fkey' AND table_name = 'venues'
    ) THEN
        ALTER TABLE public.venues DROP CONSTRAINT venues_owner_id_fkey;
        ALTER TABLE public.venues ADD CONSTRAINT venues_owner_id_fkey 
            FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
