-- Fix for Post Limit Logic:
-- Ensures that only official venue posts (is_user_post = FALSE) count towards the daily post limit.
-- User-tagged posts should NOT affect a venue's ability to post.

-- 1. Update the trigger function to filter out user posts
CREATE OR REPLACE FUNCTION public.trg_increment_post_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment the daily limit count if it is an OFFICIAL venue post
  IF NEW.is_user_post = FALSE THEN
    PERFORM increment_post_count(NEW.venue_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Recalculate historical and today's counts to fix any venues currently blocked by user posts
DELETE FROM public.daily_post_counts;

INSERT INTO public.daily_post_counts (venue_id, date, count)
SELECT 
    venue_id, 
    created_at::date as date, 
    count(*) as count
FROM public.posts
WHERE is_user_post = FALSE 
  AND is_deleted = FALSE
GROUP BY venue_id, created_at::date
ON CONFLICT (venue_id, date) 
DO UPDATE SET count = EXCLUDED.count;

COMMENT ON FUNCTION public.trg_increment_post_count() IS 'Only increments daily_post_counts for official venue posts (is_user_post = FALSE).';
