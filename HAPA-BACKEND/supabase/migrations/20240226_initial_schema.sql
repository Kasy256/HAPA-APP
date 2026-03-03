-- HAPA SUPABASE MIGRATION - OPTIMIZED SCHEMA
-- Step 2: Database Architecture Design

-- ==========================================
-- 1. EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================================
-- 2. PROFILES & USER SYNC
-- ==========================================
-- This table matches Supabase Auth users to public metadata
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'authenticated' CHECK (role IN ('authenticated', 'venue_owner', 'admin', 'anonymous')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: Create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, phone_number, role)
    VALUES (NEW.id, NEW.phone, 'authenticated')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 3. VENUES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    address TEXT,
    contact_phone TEXT,
    categories JSONB DEFAULT '[]'::jsonb,
    images JSONB DEFAULT '[]'::jsonb,
    working_hours JSONB,
    location GEOGRAPHY(POINT, 4326), -- PostGIS for spatial queries
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb
);

-- IDEMPOTENT COLUMN UPDATES (In case table existed)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='location') THEN
        ALTER TABLE public.venues ADD COLUMN location GEOGRAPHY(POINT, 4326);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='is_deleted') THEN
        ALTER TABLE public.venues ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='metrics') THEN
        ALTER TABLE public.venues ADD COLUMN metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS venues_location_idx ON public.venues USING GIST (location);
CREATE INDEX IF NOT EXISTS venues_city_idx ON public.venues (city);
CREATE INDEX IF NOT EXISTS venues_is_deleted_idx ON public.venues (is_deleted) WHERE is_deleted = FALSE;

-- ==========================================
-- 4. POSTS (LIVE VIBES)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    media_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb,
    CONSTRAINT expires_after_created CHECK (expires_at > created_at)
);

-- IDEMPOTENT COLUMN UPDATES
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='is_deleted') THEN
        ALTER TABLE public.posts ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='metrics') THEN
        ALTER TABLE public.posts ADD COLUMN metrics JSONB DEFAULT '{"likes": 0, "views": 0}'::jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_venue_id_idx ON public.posts (venue_id);
CREATE INDEX IF NOT EXISTS posts_active_idx ON public.posts (expires_at, is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);

-- ==========================================
-- 5. REACTIONS & INTERACTIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.post_likes (
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- ==========================================
-- 6. REPORTS (SAFETY)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    target_venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 7. HELPER FUNCTIONS (RPCs)
-- ==========================================

-- Optimized: Get nearby venues with their latest vibe
CREATE OR REPLACE FUNCTION public.get_nearby_vibes(
    user_lat FLOAT,
    user_lng FLOAT,
    radius_meters FLOAT DEFAULT 5000,
    limit_count INT DEFAULT 50
)
RETURNS TABLE (
    venue_id UUID,
    venue_name TEXT,
    venue_location GEOGRAPHY,
    dist_meters FLOAT,
    latest_post_url TEXT,
    latest_post_type TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id,
        v.name,
        v.location,
        ST_Distance(v.location, ST_SetSRID(ST_Point(user_lng, user_lat), 4326)::geography) as dist_meters,
        p.media_url,
        p.media_type
    FROM public.venues v
    LEFT JOIN LATERAL (
        SELECT media_url, media_type
        FROM public.posts
        WHERE venue_id = v.id 
          AND expires_at > NOW() 
          AND is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1
    ) p ON TRUE
    WHERE 
        v.is_deleted = FALSE
        AND ST_DWithin(v.location, ST_SetSRID(ST_Point(user_lng, user_lat), 4326)::geography, radius_meters)
    ORDER BY dist_meters ASC
    LIMIT limit_count;
END;
$$;
