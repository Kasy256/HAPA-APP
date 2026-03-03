-- Add working_hours column to venues table if it doesn't exist
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT NULL;

-- Add comment to document the expected structure
COMMENT ON COLUMN public.venues.working_hours IS 'Working hours per day in format: {"monday": {"open": "09:00", "close": "22:00"}, ...}. null for a day means closed.';
