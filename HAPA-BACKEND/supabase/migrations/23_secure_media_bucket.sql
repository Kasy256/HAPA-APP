-- Migration: 23_secure_media_bucket
-- 1. Restricts bucket to explicit file types and sizes.
-- 2. Prevents anonymous accounts from uploading to the media bucket.
-- 3. Creates the reports table for UGC moderation (Apple mandate).

BEGIN;

UPDATE storage.buckets 
SET 
  allowed_mime_types = array['image/jpeg', 'video/mp4'],
  file_size_limit = 52428800
WHERE id = 'media';

-- Recreate Authenticated Media Upload policy to explicitly block anonymous HTTP JWTs
DROP POLICY IF EXISTS "Authenticated Media Upload" ON storage.objects;
CREATE POLICY "Authenticated Media Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'media' 
    AND auth.uid() = owner 
    AND coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
);

CREATE TABLE IF NOT EXISTS public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reported_item_id TEXT NOT NULL,
    item_type TEXT NOT NULL, 
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert reports" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view reports" ON public.reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

COMMIT;
