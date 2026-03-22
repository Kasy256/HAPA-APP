-- ============================================================
-- HAPA Subscriptions & Payment Schema
-- Run in Supabase SQL editor or via: supabase db push
-- ============================================================

-- Subscription tiers enum
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'elite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Venue subscriptions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tier              subscription_tier NOT NULL DEFAULT 'free',
  status            subscription_status NOT NULL DEFAULT 'active',
  paystack_customer_code      TEXT,
  paystack_subscription_code  TEXT,
  current_period_start        TIMESTAMPTZ,
  current_period_end          TIMESTAMPTZ,
  cancel_at_period_end        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venue_id)
);

-- ── Payment transactions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  type                    TEXT NOT NULL CHECK (type IN ('subscription', 'boost')),
  tier                    subscription_tier,
  amount_local            NUMERIC(12,2),
  currency                TEXT DEFAULT 'USD',
  paystack_reference      TEXT UNIQUE,
  paystack_transaction_id TEXT,
  status                  payment_status NOT NULL DEFAULT 'pending',
  metadata                JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── Post boosts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_boosts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  post_id         UUID REFERENCES posts(id) ON DELETE SET NULL,
  transaction_id  UUID REFERENCES payment_transactions(id),
  duration_hours  INTEGER NOT NULL DEFAULT 24,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  -- is_active is computed via a view; query: NOW() BETWEEN starts_at AND ends_at
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Daily post count tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS daily_post_counts (
  venue_id  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  date      DATE NOT NULL DEFAULT CURRENT_DATE,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, date)
);

-- ── RLS Policies ───────────────────────────────────────────
ALTER TABLE venue_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_boosts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_post_counts    ENABLE ROW LEVEL SECURITY;

-- Venues read their own subscription
DROP POLICY IF EXISTS "venue_read_own_subscription" ON venue_subscriptions;
CREATE POLICY "venue_read_own_subscription"
  ON venue_subscriptions FOR SELECT
  USING (venue_id IN (SELECT id FROM venues WHERE owner_id = auth.uid()));

-- Service role can do everything
DROP POLICY IF EXISTS "service_role_all_subscriptions" ON venue_subscriptions;
CREATE POLICY "service_role_all_subscriptions"
  ON venue_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_transactions" ON payment_transactions;
CREATE POLICY "service_role_all_transactions"
  ON payment_transactions FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_boosts" ON post_boosts;
CREATE POLICY "service_role_all_boosts"
  ON post_boosts FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all_post_counts" ON daily_post_counts;
CREATE POLICY "service_role_all_post_counts"
  ON daily_post_counts FOR ALL
  USING (auth.role() = 'service_role');

-- Venues read own transactions
DROP POLICY IF EXISTS "venue_read_own_transactions" ON payment_transactions;
CREATE POLICY "venue_read_own_transactions"
  ON payment_transactions FOR SELECT
  USING (venue_id IN (SELECT id FROM venues WHERE owner_id = auth.uid()));

-- ── Default free subscription trigger ─────────────────────
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO venue_subscriptions (venue_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (venue_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_venue_created_add_subscription ON venues;
CREATE TRIGGER on_venue_created_add_subscription
  AFTER INSERT ON venues
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- ── Helper: get venue tier ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_venue_tier(p_venue_id UUID)
RETURNS subscription_tier AS $$
  SELECT COALESCE(
    (SELECT tier FROM venue_subscriptions
     WHERE venue_id = p_venue_id
       AND status = 'active'
       AND (current_period_end IS NULL OR current_period_end > NOW())
     LIMIT 1),
    'free'::subscription_tier
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Helper: check if boosted ───────────────────────────
CREATE OR REPLACE FUNCTION is_venue_boosted(p_venue_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM post_boosts
    WHERE venue_id = p_venue_id
      AND starts_at <= NOW()
      AND ends_at > NOW()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Helper: check daily post limit ────────────────────────
CREATE OR REPLACE FUNCTION check_post_limit(p_venue_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tier  subscription_tier;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  v_tier  := get_venue_tier(p_venue_id);
  v_limit := CASE v_tier
               WHEN 'free'  THEN 3
               WHEN 'pro'   THEN 999
               WHEN 'elite' THEN 999
             END;

  SELECT COALESCE(count, 0) INTO v_count
  FROM daily_post_counts
  WHERE venue_id = p_venue_id AND date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'tier',         v_tier,
    'count',        COALESCE(v_count, 0),
    'limit',        v_limit,
    'can_post',     COALESCE(v_count, 0) < v_limit,
    'is_unlimited', v_tier IN ('pro', 'elite')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Increment daily post count ─────────────────────────────
CREATE OR REPLACE FUNCTION increment_post_count(p_venue_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_post_counts (venue_id, date, count)
  VALUES (p_venue_id, CURRENT_DATE, 1)
  ON CONFLICT (venue_id, date)
  DO UPDATE SET count = daily_post_counts.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger: Increment count on post insert ────────────────
CREATE OR REPLACE FUNCTION trg_increment_post_count()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_post_count(NEW.venue_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_created_increment_count ON posts;
CREATE TRIGGER on_post_created_increment_count
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION trg_increment_post_count();


-- ── Ranked Discovery: Nearby Vibes ──────────────────────────
-- Completely replaces the basic version to support Boosts/Tiers
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
    venue_images JSONB,
    venue_location GEOGRAPHY,
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
        nv.images,
        nv.location,
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


-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscriptions_venue_id  ON venue_subscriptions(venue_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON venue_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_venue_id   ON payment_transactions(venue_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference  ON payment_transactions(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_boosts_venue_id         ON post_boosts(venue_id);
CREATE INDEX IF NOT EXISTS idx_boosts_active           ON post_boosts(ends_at) WHERE starts_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_counts_venue_date ON daily_post_counts(venue_id, date);
