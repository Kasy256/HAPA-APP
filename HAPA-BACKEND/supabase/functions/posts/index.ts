import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

const PostCreateSchema = z.object({
    media_type: z.enum(["image", "video"]),
    media_url: z.string().url(),
    caption: z.string().max(280).optional(),
});

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
        const { data: { user } } = await supabaseClient.auth.getUser(token);
        const userId = user?.id;

        // --- ROUTE: GET /venue/:id (Fetch posts for a venue) ---
        if (req.method === "GET" && pathParts.length === 2 && pathParts[0] === "venue") {
            const venueId = pathParts[1];

            const { data: posts, error: postsError } = await supabaseAdmin
                .from("posts")
                .select("*")
                .eq("venue_id", venueId)
                .is("is_deleted", false) // Just in case some soft-deleted ones remain
                .gt("expires_at", new Date().toISOString())
                .order("created_at", { ascending: false })
                .limit(100);

            if (postsError) throw postsError;

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
                headers: { ...corsHeaders, "Content-Type": "application/json" },
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
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- AUTHENTICATED ROUTES BELOW ---
        if (!userId) {
            if (req.method !== "OPTIONS") {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
            }
        }

        // --- ROUTE: POST / (Create) ---
        if (req.method === "POST" && pathParts.length === 0) {
            const body = await req.json().catch(() => ({}));
            const { media_type, media_url, caption } = PostCreateSchema.parse(body);

            // Verify ownership via admin (read-only)
            const { data: venue, error: venueError } = await supabaseAdmin
                .from("venues")
                .select("id")
                .eq("owner_id", userId)
                .single();

            if (venueError || !venue) throw new Error("No venue found for this owner");

            const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            // Insert via USER JWT so RLS enforces ownership at the DB level
            const { data: post, error: postError } = await supabaseClient
                .from("posts")
                .insert({
                    venue_id: venue.id,
                    media_type,
                    media_url,
                    caption,
                    expires_at,
                })
                .select()
                .single();

            if (postError) throw postError;

            return new Response(JSON.stringify({ post }), {
                status: 201,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/view (Track View) ---
        if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "view") {
            const postId = pathParts[0];
            // Flask parity: fire and forget/swallow error for view tracking
            try {
                await supabaseAdmin.rpc("track_post_view", {
                    target_post_id: postId,
                    viewer_user_id: userId
                });
            } catch (e) {
                console.error("Error tracking view:", e);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/like (Toggle Like) ---
        if (req.method === "POST" && pathParts.length === 2 && pathParts[1] === "like") {
            const postId = pathParts[0];
            const { data: metrics, error: likeError } = await supabaseAdmin.rpc("toggle_post_like", {
                target_post_id: postId,
                target_user_id: userId
            });

            if (likeError) throw likeError;

            return new Response(JSON.stringify({ metrics: metrics || { likes: 0, views: 0 } }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
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
                return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
            }

            // Hard delete via USER JWT so RLS enforces at the DB level
            const { error } = await supabaseClient
                .from("posts")
                .delete()
                .eq("id", postId);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
