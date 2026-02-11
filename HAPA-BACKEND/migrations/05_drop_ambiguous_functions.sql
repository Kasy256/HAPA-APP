-- Drop the ambiguous overloads that include a device_id
-- These were likely created in a previous migration or manual schema change that is causing conflicts.

drop function if exists public.toggle_post_like(uuid, uuid, character varying);
drop function if exists public.track_post_view(uuid, uuid, character varying);
