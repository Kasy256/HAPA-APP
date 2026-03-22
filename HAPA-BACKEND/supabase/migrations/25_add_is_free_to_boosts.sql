-- Add is_free column to post_boosts to distinguish free elite boosts from paid ones
ALTER TABLE post_boosts 
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast daily free boost count queries
CREATE INDEX IF NOT EXISTS idx_post_boosts_is_free_starts_at 
  ON post_boosts (venue_id, is_free, starts_at);
