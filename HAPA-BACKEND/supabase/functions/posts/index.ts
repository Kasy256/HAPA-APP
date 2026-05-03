import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

import { corsHeaders } from "../_shared/cors.ts";

const stripHtml = (val: string) => val.replace(/<[^>]*>?/gm, '');

const PostCreateSchema = z.object({
    media_type: z.enum(["image", "video"]),
    media_url: z.string(),
    caption: z.string().max(280).transform(stripHtml).optional(),
});

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

    try {
        const authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );

        const subPath = req.headers.get('x-sub-path') || '/';
        const pathParts = subPath.split("?")[0].split("/").filter(Boolean);

        // --- AUTHENTICATION HELPERS ---
        const token = authHeader.replace('Bearer ', '');
        // We use a safe check here. If it's the anon key, we don't even try to get a user.
        let userId: string | undefined;
        if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
            const { data } = await supabaseClient.auth.getUser(token);
            userId = data.user?.id;
        }

        // --- ROUTE: GET /venue/:id (Fetch posts for a venue) ---
        if (req.method === "GET" && pathParts.length === 2 && pathParts[0] === "venue") {
            const venueId = pathParts[1];
            const now = new Date();

            const { data: rawPosts, error: postsError } = await supabaseAdmin
                .from("posts")
                .select("*, post_boosts(starts_at, ends_at)")
                .eq("venue_id", venueId)
                .is("is_deleted", false)
                .gt("expires_at", now.toISOString())
                .order("created_at", { ascending: false })
                .limit(100);

            if (postsError) throw postsError;

            const posts = (rawPosts || []).map((p: any) => ({
                ...p,
                is_boosted: (p.post_boosts || []).some((b: any) => 
                    new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                )
            }));

            // Align with Flask: Populate is_liked if user is logged in
            if (userId && posts.length > 0) {
                const postIds = posts.map(p => p.id);
                const { data: likes } = await supabaseAdmin
                    .from("post_likes")
                    .select("post_id")
                    .eq("user_id", userId)
                    .in("post_id", postIds);

                const likedSet = new Set(likes?.map(l => l.post_id) || []);
                posts.forEach(p => p.is_liked = likedSet.has(p.id));
            }

            return new Response(JSON.stringify({ posts: posts || [] }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: GET /:id (Fetch single post) ---
        if (req.method === "GET" && pathParts.length === 1) {
            const postId = pathParts[0];

            const { data: post, error: postError } = await supabaseAdmin
                .from("posts")
                .select("*, venues(*)")
                .eq("id", postId)
                .single();

            if (postError) throw postError;

            // Check is_liked
            if (userId) {
                const { data: like } = await supabaseAdmin
                    .from("post_likes")
                    .select("post_id")
                    .eq("user_id", userId)
                    .eq("post_id", postId)
                    .maybeSingle();
                post.is_liked = !!like;
            }

            const venue = post.venues;
            const venuePayload = venue ? {
                id: venue.id,
                name: venue.name,
                type: venue.type,
                city: venue.city,
                area: venue.area,
                images: venue.images || [],
            } : null;

            const { venues, ...postRest } = post;
            return new Response(JSON.stringify({ post: postRest, venue: venuePayload }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/view (Track View) ---
        // Moved above auth check to allow anonymous view counts
        if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "view") {
            const postId = pathParts[0];
            try {
                await supabaseAdmin.rpc("track_post_view", {
                    target_post_id: postId,
                    viewer_user_id: userId || null
                });
            } catch (e) {
                console.error("Error tracking view:", e);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/share (Record Share) ---
        if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "share") {
            const postId = pathParts[0];
            
            // We need venue_id for the RPC. Fetch it first.
            const { data: post } = await supabaseAdmin
                .from("posts")
                .select("venue_id")
                .eq("id", postId)
                .single();

            if (post?.venue_id) {
                try {
                    await supabaseAdmin.rpc("increment_post_shares", {
                        target_post_id: postId,
                        target_venue_id: post.venue_id
                    });
                } catch (e) {
                    console.error("Error incrementing share count:", e);
                }
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- AUTHENTICATED ROUTES BELOW ---
        if (!userId) {
            if (req.method !== "OPTIONS") {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
            }
        }

        // --- ROUTE: POST / (Create) ---
        if (req.method === "POST" && pathParts.length === 0) {
            const body = await req.json().catch(() => ({}));
            
            const PostCreateSchema = z.object({
                media_type: z.enum(["image", "video"]),
                media_url: z.string(),
                caption: z.string().max(280).transform(stripHtml).optional(),
                venue_id: z.string().uuid().optional(),
                hashtag: z.string().max(50).optional(),
                is_user_post: z.boolean().default(false),
                author_alias: z.string().max(50).optional(),
                post_type: z.enum(["vibe", "event"]).default("vibe"),
                event_date: z.string().optional(),
                cta_url: z.string().optional(),
                cta_label: z.string().optional(),
            });

            const { 
                media_type, media_url, caption, venue_id, hashtag, 
                is_user_post, author_alias, post_type, event_date, 
                cta_url, cta_label 
            } = PostCreateSchema.parse(body);

            let finalVenueId = venue_id;
            let finalIsUserPost = is_user_post;
            let finalAlias = author_alias;

            // Alias generation if not provided for user posts
            if (is_user_post && !finalAlias) {
                const randomId = Math.floor(Math.random() * 1000);
                finalAlias = `Viber #${randomId}`;
            }

            if (!is_user_post) {
                // Official Venue Post: Verify ownership
                const { data: venue, error: venueError } = await supabaseAdmin
                    .from("venues")
                    .select("id")
                    .eq("owner_id", userId)
                    .single();

                if (venueError || !venue) {
                    console.error("[posts] No venue found for owner:", userId, venueError);
                    throw new Error("No venue found for this owner. Official posts require venue ownership.");
                }
                finalVenueId = venue.id;
                
                // Check post limit for official posts
                const { data: limit } = await supabaseAdmin.rpc("check_post_limit", { p_venue_id: venue.id });
                if (limit && !limit.can_post && !limit.is_unlimited) {
                    return new Response(JSON.stringify({
                        error: "Post limit reached",
                        details: "Free venues are limited to 3 vibes per day. Upgrade to Pro for unlimited posts."
                    }), { status: 403, headers });
                }

                // Tier-based Promotion Validation
                const { data: sub } = await supabaseAdmin
                    .from("venue_subscriptions")
                    .select("tier")
                    .eq("venue_id", venue.id)
                    .eq("status", "active")
                    .maybeSingle();
                
                const tier = sub?.tier || 'free';

                if (post_type === 'event') {
                    if (tier === 'free') {
                        return new Response(JSON.stringify({ error: "Event promotion requires Hapa Pro or Elite." }), { status: 403, headers });
                    }
                    if (tier === 'pro') {
                        const { data: eventCount } = await supabaseAdmin.rpc("get_venue_monthly_event_count", { p_venue_id: venue.id });
                        if (eventCount >= 3) {
                            return new Response(JSON.stringify({ error: "Hapa Pro is limited to 3 event promotions per month." }), { status: 403, headers });
                        }
                    }
                }
            } else {
                // User post: Validate target
                if (!venue_id && !hashtag) {
                    console.error("[posts] Missing target for user post");
                    throw new Error("User posts must tag a venue or include a hashtag.");
                }
            }

            const expires_at = post_type === 'event' && event_date 
                ? new Date(new Date(event_date).getTime() + 24 * 60 * 60 * 1000).toISOString() // Expire 24h AFTER event
                : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            // GLOBAL HUB STRATEGY: 
            // Link hashtag posts to the manually created "HAPA Global" hub.
            if (!finalVenueId) {
                const cleanHashtag = (hashtag || "").replace('#', '').trim();
                console.log("[posts] Attempting hub lookup for hashtag:", hashtag, "clean:", cleanHashtag);
                
                // 1. Check if hashtag matches a REAL Official Venue
                if (cleanHashtag) {
                    const { data: matchedVenue } = await supabaseAdmin
                        .from("venues")
                        .select("id")
                        .ilike("name", cleanHashtag)
                        .not("owner_id", "is", null)
                        .limit(1)
                        .maybeSingle();
                    
                    if (matchedVenue) {
                        console.log("[posts] Found official venue matching hashtag:", matchedVenue.id);
                        finalVenueId = matchedVenue.id;
                    }
                }

                // 2. Fallback to the manual "HAPA Global" hub
                if (!finalVenueId) {
                    console.log("[posts] Falling back to HAPA Global hub lookup...");
                    const { data: hub, error: hubError } = await supabaseAdmin
                        .from("venues")
                        .select("id")
                        .ilike("name", "HAPA Global")
                        .limit(1)
                        .maybeSingle();
                    
                    if (hubError) console.error("[posts] HAPA Global lookup error:", hubError);

                    if (hub) {
                        console.log("[posts] Found HAPA Global hub:", hub.id);
                        finalVenueId = hub.id;
                    } else {
                        console.warn("[posts] HAPA Global not found. Using emergency fallback to any venue.");
                        // EMERGENCY: If you haven't created "HAPA Global" yet, 
                        // use any existing venue ID to prevent a post failure.
                        const { data: anyVenue } = await supabaseAdmin.from("venues").select("id").limit(1).maybeSingle();
                        finalVenueId = anyVenue?.id;
                    }
                }
            }

            if (!finalVenueId) {
                console.error("[posts] Critical Failure: No venue found even after fallback.");
                throw new Error("No venues found in database. Please create 'HAPA Global' or at least one venue first.");
            }

            console.log("[posts] Inserting post for venue:", finalVenueId, "by user:", userId);

            // GAP 8: For true anonymity on user vibes, we do NOT store the userId on the 
            // posts row. This prevents any leaks if the table is ever queried.
            // TODO: Store userId in a separate 'post_audit' table with restricted access.
            const { data: post, error: postError } = await supabaseAdmin
                .from("posts")
                .insert({
                    venue_id: finalVenueId,
                    hashtag,
                    media_type,
                    media_url,
                    caption,
                    expires_at,
                    is_user_post: finalIsUserPost,
                    author_alias: finalAlias,
                    post_type,
                    event_date,
                    cta_url,
                    cta_label,
                })
                .select()
                .single();

            if (postError) {
                console.error("[posts] Insert error:", postError);
                throw postError;
            }

            return new Response(JSON.stringify({ post }), {
                status: 201,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/like (Toggle Like) ---
        if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "like") {
            const postId = pathParts[0];

            // Ensure the user exists in public.users before inserting the like.
            // Anonymous/browse-only users don't go through OTP, so they have a valid
            // auth.users session but NO row in public.users, causing a FK violation.
            // public.users columns: id, phone_number (nullable), role, status, created_at, last_login_at
            const { error: upsertErr } = await supabaseAdmin.from("users").upsert({
                id: userId,
                role: "user",
                status: "active",
            }, { onConflict: "id", ignoreDuplicates: true });

            if (upsertErr) {
                console.warn("[posts/like] Could not upsert user into public.users:", upsertErr.message);
            }

            const { data: metrics, error: likeError } = await supabaseAdmin.rpc("toggle_post_like", {
                target_post_id: postId,
                target_user_id: userId
            });

            if (likeError) throw likeError;

            return new Response(JSON.stringify({ metrics: metrics || { likes: 0, views: 0 } }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: DELETE /:id ---
        if (req.method === "DELETE" && pathParts.length === 1) {
            const postId = pathParts[0];

            // Verify ownership (Flask parity) — read via admin
            const { data: postCheck } = await supabaseAdmin
                .from("posts")
                .select("venues!inner(owner_id)")
                .eq("id", postId)
                .single();

            if (!postCheck || postCheck.venues.owner_id !== userId) {
                return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
            }

            // Hard delete via USER JWT so RLS enforces at the DB level
            const { error } = await supabaseClient
                .from("posts")
                .delete()
                .eq("id", postId);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
});
