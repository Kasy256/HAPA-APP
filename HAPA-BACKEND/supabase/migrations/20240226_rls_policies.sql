-- HAPA RLS SECURITY POLICIES
-- Step 3: Row Level Security

-- ==========================================
-- 1. ENABLE RLS
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. PROFILES POLICIES
-- ==========================================
-- Public can view active profiles (limited info)
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (status = 'active');

-- Users can update only their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ==========================================
-- 3. VENUES POLICIES
-- ==========================================
-- Everyone can view active venues
CREATE POLICY "Venues are viewable by everyone"
ON public.venues FOR SELECT
USING (is_deleted = FALSE);

-- Owners can update their own venues
CREATE POLICY "Owners can update own venue"
ON public.venues FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Only admins can delete venues (or soft delete via update)
CREATE POLICY "Admins can delete venues"
ON public.venues FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==========================================
-- 4. POSTS POLICIES
-- ==========================================
-- Public read access ONLY for TODAY'S (live) posts
CREATE POLICY "Live posts are viewable by everyone"
ON public.posts FOR SELECT
USING (expires_at > NOW() AND is_deleted = FALSE);

-- Venue owners can see their own expired/deleted posts for history
CREATE POLICY "Owners can view all their venue posts"
ON public.posts FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = posts.venue_id AND venues.owner_id = auth.uid()
));

-- Venue owners can insert posts to their own venues
CREATE POLICY "Owners can insert posts to own venue"
ON public.posts FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = venue_id AND venues.owner_id = auth.uid()
));

-- Venue owners can delete posts from their own venues
CREATE POLICY "Owners can delete posts from own venue"
ON public.posts FOR DELETE
USING (EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = posts.venue_id AND venues.owner_id = auth.uid()
));

-- ==========================================
-- 5. INTERACTIONS (LIKES, COMMENTS)
-- ==========================================
-- Likes
CREATE POLICY "Likes are viewable by everyone" ON public.post_likes FOR SELECT USING (TRUE);
CREATE POLICY "Users can toggle own likes" ON public.post_likes FOR ALL USING (auth.uid() = user_id);

-- Comments
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (is_deleted = FALSE);
CREATE POLICY "Users can post comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit/delete own comments" ON public.comments FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 6. STORAGE (MEDIA)
-- ==========================================
-- This requires the 'media' bucket to exist
-- Public read
CREATE POLICY "Public Media Read"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

-- Authenticated upload (only own folder/files via owner check)
CREATE POLICY "Authenticated Media Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media' AND auth.uid() = owner);

CREATE POLICY "Owner Media Update/Delete"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'media' AND auth.uid() = owner);

-- ==========================================
-- 7. ADMIN OVERRIDE
-- ==========================================
-- This is a generic policy pattern. In practice, Supabase 'service_role' 
-- bypasses RLS, but for 'admin' users in public.profiles:
CREATE POLICY "Admin full access"
ON public.posts
FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
-- Repeat for other tables as needed.
