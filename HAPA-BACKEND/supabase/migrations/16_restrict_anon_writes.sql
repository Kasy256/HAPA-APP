-- Migration: 16_restrict_anon_writes

-- Drop wide-open public policies or overly-permissive authenticated policies
-- and replace them with policies that ensure coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
-- so anonymous users cannot impersonate venue owners

BEGIN;

-- VENUES
DROP POLICY IF EXISTS "Owners can insert own venue" ON public.venues;
CREATE POLICY "Owners can insert own venue" ON public.venues FOR INSERT TO authenticated 
WITH CHECK (
    auth.uid() = owner_id 
    AND coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
);

DROP POLICY IF EXISTS "Owners can update own venue" ON public.venues;
CREATE POLICY "Owners can update own venue" ON public.venues FOR UPDATE TO authenticated 
USING (
    auth.uid() = owner_id 
    AND coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
) 
WITH CHECK (
    auth.uid() = owner_id 
    AND coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
);

-- POSTS
DROP POLICY IF EXISTS "Owners can insert posts to own venue" ON public.posts;
CREATE POLICY "Owners can insert posts to own venue" ON public.posts FOR INSERT TO authenticated 
WITH CHECK (
    coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
    AND EXISTS (SELECT 1 FROM public.venues WHERE venues.id = venue_id AND venues.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can delete posts from own venue" ON public.posts;
CREATE POLICY "Owners can delete posts from own venue" ON public.posts FOR DELETE TO authenticated 
USING (
    coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
    AND EXISTS (SELECT 1 FROM public.venues WHERE venues.id = venue_id AND venues.owner_id = auth.uid())
);

COMMIT;
