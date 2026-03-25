-- =============================================================================
-- Migration 26: Post Shares & Walk-In Tracking
-- Adds post sharing counters and walk-in log infrastructure.
-- Apply via: Supabase Dashboard > SQL Editor, or supabase db push
-- =============================================================================

-- ─── 1. Extend venues table ───────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS post_shares   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS walkins_count INTEGER NOT NULL DEFAULT 0;

-- ─── 2. Add shares counter to posts.metrics JSONB ─────────────────────────────
-- posts.metrics is already a JSONB column { "likes": N, "views": N }
-- We extend it to support { "likes": N, "views": N, "shares": N }
-- Existing rows default to 0 shares via the coalesce in the increment function.

-- ─── 3. walkin_logs — immutable audit log of every walk-in event ──────────────
CREATE TABLE IF NOT EXISTS walkin_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,  -- nullable for anon
  source     TEXT        NOT NULL CHECK (source IN ('directions_tap', 'proximity')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index: fast dedup query ("has this user visited this venue in last 3h?")
CREATE INDEX IF NOT EXISTS idx_walkin_logs_dedup
  ON walkin_logs (venue_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Index for venue analytics queries (all logs for a venue ordered by time)
CREATE INDEX IF NOT EXISTS idx_walkin_logs_venue_time
  ON walkin_logs (venue_id, created_at DESC);

-- ─── 4. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE walkin_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can INSERT a walk-in log (the backend enforces dedup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'walkin_logs_insert_anyone' AND tablename = 'walkin_logs'
    ) THEN
        CREATE POLICY "walkin_logs_insert_anyone"
          ON walkin_logs FOR INSERT
          TO anon, authenticated
          WITH CHECK (true);
    END IF;
END $$;

-- Only the venue owner can SELECT their venue's logs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'walkin_logs_owner_select' AND tablename = 'walkin_logs'
    ) THEN
        CREATE POLICY "walkin_logs_owner_select"
          ON walkin_logs FOR SELECT
          TO authenticated
          USING (
            venue_id IN (
              SELECT id FROM venues WHERE owner_id = auth.uid()
            )
          );
    END IF;
END $$;

-- Service role (backend) has unrestricted access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'walkin_logs_service_role_all' AND tablename = 'walkin_logs'
    ) THEN
        CREATE POLICY "walkin_logs_service_role_all"
          ON walkin_logs FOR ALL
          TO service_role
          USING (true)
          WITH CHECK (true);
    END IF;
END $$;

-- ─── 5. DB function: increment post shares (atomic, race-condition safe) ───────
CREATE OR REPLACE FUNCTION increment_post_shares(target_post_id UUID, target_venue_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as DB owner, bypasses RLS on internal counters
SET search_path = public
AS $$
BEGIN
  -- Increment post-level share counter in JSONB metrics
  UPDATE posts
  SET metrics = jsonb_set(
      COALESCE(metrics, '{}'::jsonb),
      '{shares}',
      to_jsonb(COALESCE((metrics->>'shares')::int, 0) + 1)
    )
  WHERE id = target_post_id;

  -- Increment venue-level aggregate post_shares counter
  UPDATE venues
  SET post_shares = post_shares + 1
  WHERE id = target_venue_id;
END;
$$;

-- ─── 6. DB function: log walk-in with server-side 3-hour dedup ───────────────
-- Returns: 'logged' | 'skipped' | 'skipped_anon'
CREATE OR REPLACE FUNCTION log_venue_walkin(
  p_venue_id UUID,
  p_user_id  UUID,
  p_source   TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - INTERVAL '3 hours';
  v_recent BOOLEAN;
BEGIN
  -- Anonymous walk-ins: always log, no dedup possible (but still rate-limited at API layer)
  IF p_user_id IS NULL THEN
    INSERT INTO walkin_logs (venue_id, user_id, source)
    VALUES (p_venue_id, NULL, p_source);

    UPDATE venues SET walkins_count = walkins_count + 1 WHERE id = p_venue_id;
    RETURN 'logged';
  END IF;

  -- Authenticated dedup: one log per (user, venue) per 3-hour window
  SELECT EXISTS (
    SELECT 1 FROM walkin_logs
    WHERE venue_id  = p_venue_id
      AND user_id   = p_user_id
      AND created_at > v_cutoff
    LIMIT 1
  ) INTO v_recent;

  IF v_recent THEN
    RETURN 'skipped';
  END IF;

  INSERT INTO walkin_logs (venue_id, user_id, source)
  VALUES (p_venue_id, p_user_id, p_source);

  UPDATE venues SET walkins_count = walkins_count + 1 WHERE id = p_venue_id;
  RETURN 'logged';
END;
$$;

-- Grant EXECUTE on both functions to authenticated and anon roles
GRANT EXECUTE ON FUNCTION increment_post_shares(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION log_venue_walkin(UUID, UUID, TEXT) TO authenticated, anon, service_role;
