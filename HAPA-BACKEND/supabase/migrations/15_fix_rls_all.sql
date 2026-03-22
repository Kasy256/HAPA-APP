-- Migration: 15_fix_rls_all.sql
-- Comprehensive fix for RLS across all tables, ensuring everything is synchronized.

-- ==========================================
-- 1. USERS TABLE
-- ==========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
CREATE POLICY "Public profiles are viewable by everyone" ON public.users FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ==========================================
-- 1.5 PROFILES TABLE
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
CREATE POLICY "Service role full access" ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ==========================================
-- 2. VENUES TABLE
-- ==========================================
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.venues;
CREATE POLICY "Service role full access" ON public.venues FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Venues are viewable by everyone" ON public.venues;
CREATE POLICY "Venues are viewable by everyone" ON public.venues FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can update own venue" ON public.venues;
CREATE POLICY "Owners can update own venue" ON public.venues FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own venue" ON public.venues;
CREATE POLICY "Owners can insert own venue" ON public.venues FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);


-- ==========================================
-- 3. POSTS TABLE
-- ==========================================
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Live posts are viewable by everyone" ON public.posts;
CREATE POLICY "Live posts are viewable by everyone" ON public.posts FOR SELECT USING (expires_at > NOW());

DROP POLICY IF EXISTS "Owners can insert posts to own venue" ON public.posts;
CREATE POLICY "Owners can insert posts to own venue" ON public.posts FOR INSERT TO authenticated 
WITH CHECK (EXISTS (SELECT 1 FROM public.venues WHERE venues.id = venue_id AND venues.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete posts from own venue" ON public.posts;
CREATE POLICY "Owners can delete posts from own venue" ON public.posts FOR DELETE TO authenticated 
USING (EXISTS (SELECT 1 FROM public.venues WHERE venues.id = venue_id AND venues.owner_id = auth.uid()));


-- ==========================================
-- 4. INTERACTIONS (LIKES, VIEWS)
-- ==========================================
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can toggle own likes" ON public.post_likes;
CREATE POLICY "Users can toggle own likes" ON public.post_likes FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert views" ON public.post_views;
CREATE POLICY "Public can insert views" ON public.post_views FOR INSERT WITH CHECK (true);
