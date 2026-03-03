-- Migration: 13_private_venue_docs_bucket
-- Creates a private storage bucket for sensitive venue documents
-- (e.g., business permits, identity verification, contracts).
-- Unlike the public 'media' bucket, this bucket requires signed URLs for access.

-- 1. Create the private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-docs', 'venue-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: Only authenticated users can upload to their own folder
DROP POLICY IF EXISTS "Owners can upload venue docs" ON storage.objects;
CREATE POLICY "Owners can upload venue docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'venue-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Policy: Only the owner can read their own docs
DROP POLICY IF EXISTS "Owners can read own venue docs" ON storage.objects;
CREATE POLICY "Owners can read own venue docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'venue-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Policy: Only the owner can delete their own docs
DROP POLICY IF EXISTS "Owners can delete own venue docs" ON storage.objects;
CREATE POLICY "Owners can delete own venue docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'venue-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
