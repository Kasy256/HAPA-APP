-- HAPA PRO & ELITE UPGRADE
-- Add support for Promoted Events and Tiered Discovery

-- 1. Extend Posts Table for Events
DO $$ 
BEGIN 
    -- Add post_type enum-like column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='post_type') THEN
        ALTER TABLE public.posts ADD COLUMN post_type TEXT DEFAULT 'vibe' CHECK (post_type IN ('vibe', 'event'));
    END IF;

    -- Add event_date for scheduled promotions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='event_date') THEN
        ALTER TABLE public.posts ADD COLUMN event_date TIMESTAMPTZ;
    END IF;

    -- Add CTA (Call to Action) fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='cta_url') THEN
        ALTER TABLE public.posts ADD COLUMN cta_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='cta_label') THEN
        ALTER TABLE public.posts ADD COLUMN cta_label TEXT;
    END IF;

    -- Add is_promoted flag for manual boosts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='is_promoted') THEN
        ALTER TABLE public.posts ADD COLUMN is_promoted BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Create index for Discovery Engine optimization
CREATE INDEX IF NOT EXISTS posts_type_idx ON public.posts (post_type);
CREATE INDEX IF NOT EXISTS posts_promoted_idx ON public.posts (is_promoted) WHERE is_promoted = TRUE;

-- 3. Update the discovery algorithm logic (handled in Edge Function, but DB indexes help)
-- We might need a helper function to check monthly event limits
CREATE OR REPLACE FUNCTION public.get_venue_monthly_event_count(p_venue_id UUID)
RETURNS BIGINT AS $$
    SELECT COUNT(*) 
    FROM public.posts 
    WHERE venue_id = p_venue_id 
      AND post_type = 'event' 
      AND created_at >= date_trunc('month', now());
$$ LANGUAGE sql STABLE;
