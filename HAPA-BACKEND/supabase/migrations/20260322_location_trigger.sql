-- Migration: Add missing location trigger for venues

-- 1. Backfill existing venues where location is null but we have lat/lng
UPDATE public.venues 
SET location = ST_SetSRID(ST_Point(lng, lat), 4326)::geography 
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;

-- 2. Create function to auto-update location on insert or update of lat/lng
CREATE OR REPLACE FUNCTION public.sync_venue_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_Point(NEW.lng, NEW.lat), 4326)::geography;
    ELSE
        NEW.location := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS sync_venue_location_trigger ON public.venues;

-- 4. Create trigger
CREATE TRIGGER sync_venue_location_trigger
BEFORE INSERT OR UPDATE OF lat, lng ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.sync_venue_location();
