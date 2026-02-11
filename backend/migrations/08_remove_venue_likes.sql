-- Drop the function first (it depends on the table, but good practice to drop usage)
DROP FUNCTION IF EXISTS public.toggle_venue_like(uuid, uuid);

-- Drop the table
DROP TABLE IF EXISTS public.venue_likes;

-- Optional: If we want to clean up the 'likes' key from venues.metrics, we could.
-- But since it's a jsonb blob and we might want to keep the historical data or just ignore it,
-- we'll leave the data as is. The code no longer uses it.
