import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rateLimit.ts";

import { corsHeaders } from "../_shared/cors.ts";

const parseNumber = (val: unknown) => {
    if (typeof val === 'string' && val.trim() !== '') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? undefined : parsed;
    }
    return typeof val === 'number' ? val : undefined;
};

const FeedSchema = z.object({
    lat: z.preprocess(parseNumber, z.number().optional()),
    lng: z.preprocess(parseNumber, z.number().optional()),
    city: z.string().optional(),
    radius_km: z.preprocess((val) => parseNumber(val) ?? 10, z.number().default(10)),
});

const SearchSchema = z.object({
    q: z.string().optional(),
    city: z.string().optional(),
    area: z.string().optional(),
    lat: z.preprocess(parseNumber, z.number().optional()),
    lng: z.preprocess(parseNumber, z.number().optional()),
});

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

    // Rate limit by client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    try {
        // --- AUTHENTICATION HELPERS ---
        const authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;
        const token = authHeader.replace('Bearer ', '');
        let userId: string | undefined;
        if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
            // Need to initialize a client just to get the user
            const tempClient = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_ANON_KEY") ?? "",
                { global: { headers: { Authorization: authHeader } } }
            );
            const { data } = await tempClient.auth.getUser(token);
            userId = data.user?.id;
        }

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        // --- ADMIN CLIENT (Bypasses RLS) ---
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );

        const subPath = req.headers.get('x-sub-path') || '/';
        const path = subPath.split("?")[0].split("/").filter(Boolean).pop();
        const queryStr = subPath.split("?")[1] || "";
        const params = Object.fromEntries(new URLSearchParams(queryStr).entries());

        // --- ROUTE: /feed ---
        if (path === "feed" || path === "discovery" || path === undefined) {
            // Rate limit: max 30 feed requests per IP per minute
            const rl = checkRateLimit(`discovery-feed:${clientIp}`, 30, 60_000);
            if (!rl.allowed) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
                    status: 429,
                    headers: { ...headers, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
                });
            }

            const { lat, lng, city, radius_km } = FeedSchema.parse(params);

            // Priority 1: City filtering (for Discover Feed)
            if (city) {
                const { data: venues, error } = await supabaseAdmin
                    .from("venues")
                    .select("*, posts(*)")
                    .eq("is_deleted", false)
                    .eq("posts.is_deleted", false)
                    .ilike("city", `%${city}%`);

                if (error) throw error;

                const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > new Date());

                // Populate is_liked
                if (userId && posts.length > 0) {
                    const postIds = posts.map((p: any) => p.id);
                    const { data: likes } = await supabaseAdmin
                        .from("post_likes")
                        .select("post_id")
                        .eq("user_id", userId)
                        .in("post_id", postIds);

                    const likedSet = new Set(likes?.map(l => l.post_id) || []);
                    posts.forEach((p: any) => p.is_liked = likedSet.has(p.id));
                }

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            // Priority 2: Proximity filtering (for Near You)
            if (lat !== undefined && lng !== undefined) {
                const { data: nearbyData, error: rpcError } = await supabaseAdmin.rpc("get_nearby_vibes", {
                    user_lat: lat,
                    user_lng: lng,
                    radius_meters: radius_km * 1000,
                });

                if (rpcError) throw rpcError;

                // The RPC already returns pre-ranked venues with their latest post info.
                // We map it to the structure the frontend expects { venues, posts }.
                const venues = (nearbyData || []).map((v: any) => ({
                    id: v.venue_id,
                    name: v.venue_name,
                    area: v.venue_area,
                    type: v.venue_type,
                    images: v.venue_images,
                    location: v.venue_location,
                    lat: v.venue_location?.coordinates?.[1],
                    lng: v.venue_location?.coordinates?.[0],
                    dist_meters: v.dist_meters,
                    tier: v.tier,
                    is_boosted: v.is_boosted,
                }));

                const posts = (nearbyData || []).filter((v: any) => v.latest_post_url).map((v: any) => ({
                    id: `post_${v.venue_id}_${v.latest_post_created}`,
                    venue_id: v.venue_id,
                    media_url: v.latest_post_url,
                    media_type: v.latest_post_type,
                    created_at: v.latest_post_created,
                }));

                // Populate is_liked
                if (userId && posts.length > 0) {
                    const postIds = posts.map((p: any) => p.id);
                    const { data: likes } = await supabaseAdmin
                        .from("post_likes")
                        .select("post_id")
                        .eq("user_id", userId)
                        .in("post_id", postIds);

                    const likedSet = new Set(likes?.map(l => l.post_id) || []);
                    posts.forEach((p: any) => p.is_liked = likedSet.has(p.id));
                }

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            // Fallback & City: Use a ranked query to ensure paid tiers come first even without lat/lng
            const cityQuery = city ? supabaseAdmin.from("venues").select("*, posts(*)").ilike("city", `%${city}%`) : supabaseAdmin.from("venues").select("*, posts(*)");
            
            const { data: rawVenues, error } = await cityQuery
                .eq("is_deleted", false)
                .eq("posts.is_deleted", false)
                .limit(50);

            if (error) throw error;

            // Sort by tier manually since PostgREST doesn't support complex case-based ordering easily
            const tierWeight: Record<string, number> = { elite: 1, pro: 2, free: 3 };
            const venues = (rawVenues || []).sort((a: any, b: any) => {
                const tierA = a.tier || 'free';
                const tierB = b.tier || 'free';
                return (tierWeight[tierA] || 3) - (tierWeight[tierB] || 3);
            });

            const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > new Date());

            // Populate is_liked
            if (userId && posts.length > 0) {
                const postIds = posts.map((p: any) => p.id);
                const { data: likes } = await supabaseAdmin
                    .from("post_likes")
                    .select("post_id")
                    .eq("user_id", userId)
                    .in("post_id", postIds);

                const likedSet = new Set(likes?.map(l => l.post_id) || []);
                posts.forEach((p: any) => p.is_liked = likedSet.has(p.id));
            }

            return new Response(JSON.stringify({ venues, posts }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /search ---
        if (path === "search") {
            // Rate limit: max 20 search requests per IP per minute
            const rl = checkRateLimit(`discovery-search:${clientIp}`, 20, 60_000);
            if (!rl.allowed) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
                    status: 429,
                    headers: { ...headers, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
                });
            }

            const { q, city, area, lat, lng } = SearchSchema.parse(params);

            // If coordinates are provided, we'll try to sort by distance
            // Since we can't easily do complex PostGIS joins via PostgREST without a custom RPC,
            // we'll fetch results and then potentially sort if needed, OR just return them with lat/lng
            // The frontend already calculates distance for display.

            let query = supabaseAdmin.from("venues").select("*").eq("is_deleted", false);

            if (city) query = query.eq("city", city);
            if (area) query = query.eq("area", area);
            if (q) query = query.or(`name.ilike."%${q}%",type.ilike."%${q}%"`);

            const { data, error } = await query.limit(50);
            if (error) throw error;

            let results = data || [];

            // If coordinates are available, we COULD sort here, but let's keep it simple
            // and ensure the frontend has the data it needs to show distances.
            // The venues table has lat/lng or location.

            return new Response(JSON.stringify({ venues: results }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: `Not Found: ${path}` }), {
            status: 404,
            headers: { ...headers, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
});
