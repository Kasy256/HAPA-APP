-- Migration: Fix Near You RPC to include categories and explicit lat/lng
-- Completely replaces the get_nearby_vibes function to ensure "Near You" cards match "Search" cards exactly

DROP FUNCTION IF EXISTS public.get_nearby_vibes(FLOAT, FLOAT, FLOAT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_nearby_vibes(
    user_lat FLOAT,
    user_lng FLOAT,
    radius_meters FLOAT DEFAULT 15000,
    limit_count INT DEFAULT 50
)
RETURNS TABLE (
    venue_id UUID,
    venue_name TEXT,
    venue_area TEXT,
    venue_type TEXT,
    venue_categories JSONB,
    venue_images JSONB,
    venue_location GEOGRAPHY,
    venue_lat FLOAT,
    venue_lng FLOAT,
    dist_meters FLOAT,
    latest_post_url TEXT,
    latest_post_type TEXT,
    latest_post_created TIMESTAMPTZ,
    tier subscription_tier,
    is_boosted BOOLEAN
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH nearby_venues AS (
        SELECT 
            v.*,
            get_venue_tier(v.id) as v_tier,
            is_venue_boosted(v.id) as v_boosted,
            ST_Distance(v.location, ST_SetSRID(ST_Point(user_lng, user_lat), 4326)::geography) as v_dist
        FROM public.venues v
        WHERE 
            v.is_deleted = FALSE
            AND ST_DWithin(v.location, ST_SetSRID(ST_Point(user_lng, user_lat), 4326)::geography, radius_meters)
    )
    SELECT 
        nv.id,
        nv.name,
        nv.area,
        nv.type,
        nv.categories,
        nv.images,
        nv.location,
        nv.lat,
        nv.lng,
        nv.v_dist,
        p.media_url,
        p.media_type,
        p.created_at,
        nv.v_tier,
        nv.v_boosted
    FROM nearby_venues nv
    LEFT JOIN LATERAL (
        SELECT media_url, media_type, created_at
        FROM public.posts p_table
        WHERE p_table.venue_id = nv.id 
          AND p_table.expires_at > NOW() 
          AND p_table.is_deleted = FALSE
        ORDER BY p_table.created_at DESC
        LIMIT 1
    ) p ON TRUE
    ORDER BY 
        nv.v_boosted DESC,      -- Boosted venues FIRST
        (CASE nv.v_tier 
            WHEN 'elite' THEN 1 
            WHEN 'pro'   THEN 2 
            ELSE 3 
         END) ASC,              -- Elite > Pro > Free
        nv.v_dist ASC           -- Distance as final tie breaker
    LIMIT limit_count;
END;
$$;
