-- Add metrics column to posts if not exists
alter table public.posts 
add column if not exists metrics jsonb default '{"likes": 0, "views": 0}'::jsonb;
