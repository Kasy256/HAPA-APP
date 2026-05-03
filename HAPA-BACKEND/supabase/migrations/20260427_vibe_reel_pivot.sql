-- Migration: Vibe Reel & Social Pivot
-- Description: Adds user-generated content fields and creates the Live Wall comments table.

-- 1. Update posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS is_user_post BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS author_alias TEXT,
ADD COLUMN IF NOT EXISTS hashtag TEXT;

-- Index for hashtag searches
CREATE INDEX IF NOT EXISTS idx_posts_hashtag ON public.posts(hashtag) WHERE hashtag IS NOT NULL;

-- 2. Create comments table (The Live Wall)
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID REFERENCES public.venues(id),
    hashtag TEXT,
    user_id UUID REFERENCES auth.users(id),
    author_alias TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure either venue_id or hashtag is set, but not both or neither
    CONSTRAINT comment_target_check CHECK (
        (venue_id IS NOT NULL AND hashtag IS NULL) OR 
        (venue_id IS NULL AND hashtag IS NOT NULL)
    )
);

-- Index for venue comments
CREATE INDEX IF NOT EXISTS idx_comments_venue_id ON public.comments(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_hashtag ON public.comments(hashtag) WHERE hashtag IS NOT NULL;

-- 3. RLS for comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read comments
CREATE POLICY "Public can read comments" 
ON public.comments FOR SELECT 
USING (true);

-- Policy: Any authenticated (anonymous or logged-in) user can insert comments
CREATE POLICY "Users can post comments" 
ON public.comments FOR INSERT 
WITH CHECK (true);
