-- Migration: 12_rls_venue_insert_policy
-- Adds a missing RLS INSERT policy for venues so that authenticated users
-- can create a venue via the user's JWT (not just the Service Role key).
-- This is critical now that the venues Edge Function uses supabaseClient
-- instead of supabaseAdmin for mutations.

-- Allow authenticated users to insert a venue where they are the owner
DROP POLICY IF EXISTS "Owners can insert own venue" ON public.venues;
CREATE POLICY "Owners can insert own venue"
ON public.venues FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Also ensure the posts INSERT policy exists (may already exist)
DROP POLICY IF EXISTS "Owners can insert posts to own venue" ON public.posts;
CREATE POLICY "Owners can insert posts to own venue"
ON public.posts FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM public.venues
    WHERE venues.id = venue_id AND venues.owner_id = auth.uid()
));
