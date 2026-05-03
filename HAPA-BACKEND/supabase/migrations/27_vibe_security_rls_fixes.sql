-- Migration: 27_vibe_security_rls_fixes
-- Description: Hardens RLS policies as identified by vibe-security audit.

BEGIN;

-- 1. Fix unrestricted inserts on post_views
DROP POLICY IF EXISTS "Public can insert views" ON public.post_views;

CREATE POLICY "Public can insert views" ON public.post_views 
FOR INSERT 
WITH CHECK (
    -- If a user ID is provided, it MUST match the authenticated user
    (user_id IS NULL OR user_id = auth.uid()) 
    AND 
    -- The post must actually exist
    EXISTS (SELECT 1 FROM public.posts WHERE id = post_id)
);


-- 2. Add explicit WITH CHECK to post_likes
DROP POLICY IF EXISTS "Users can toggle own likes" ON public.post_likes;

CREATE POLICY "Users can toggle own likes" ON public.post_likes 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

COMMIT;
