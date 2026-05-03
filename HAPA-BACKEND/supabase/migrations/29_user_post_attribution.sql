-- HAPA USER POST ATTRIBUTION
-- Add support for identifying user-generated vibes and their aliases

DO $$ 
BEGIN 
    -- Add is_user_post flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='is_user_post') THEN
        ALTER TABLE public.posts ADD COLUMN is_user_post BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add author_alias for privacy-focused attribution
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='author_alias') THEN
        ALTER TABLE public.posts ADD COLUMN author_alias TEXT;
    END IF;

    -- Add hashtag support if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='hashtag') THEN
        ALTER TABLE public.posts ADD COLUMN hashtag TEXT;
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS posts_is_user_post_idx ON public.posts (is_user_post);
CREATE INDEX IF NOT EXISTS posts_hashtag_idx ON public.posts (hashtag);
