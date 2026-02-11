-- STORAGE POLICY RESTORE
-- This script sets up the 'media' bucket and applies RLS policies for uploads/downloads.

-- 1. Create the 'media' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow Public Access (Read)
-- Drop existing policy if any to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'media' );

-- 3. Allow Authenticated Uploads
-- Drop existing policy if any
DROP POLICY IF EXISTS "Authenticated Uploads" ON storage.objects;

CREATE POLICY "Authenticated Uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'media' );

-- 4. Allow Owners to Update/Delete their own files (Optional but good practice)
-- Assuming we want users to be able to delete files they uploaded. 
-- Note: Supabase storage RLS usually tracks 'owner' by the user_id column in storage.objects.
-- When a user uploads, their auth.uid() is stored as owner.

DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
CREATE POLICY "Owner Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'media' AND auth.uid() = owner );

DROP POLICY IF EXISTS "Owner Delete" ON storage.objects;
CREATE POLICY "Owner Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'media' AND auth.uid() = owner );
