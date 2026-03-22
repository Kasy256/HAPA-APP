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

        const now = new Date();

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
            // Postgres Rate limit: 60 per minute per IP
            const { data: isAllowed } = await supabaseAdmin.rpc("check_rate_limit", {
                p_ip: clientIp,
                p_endpoint: 'discovery_feed',
                p_max_reqs: 60,
                p_window_seconds: 60
            });

            if (isAllowed === false) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
                    status: 429,
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            const { lat, lng, city, radius_km } = FeedSchema.parse(params);

            // Priority 1: City filtering (for Discover Feed)
            if (city && lat === undefined) {
                const { data: rawData, error } = await supabaseAdmin
                    .from("venues")
                    .select("*, posts(*), venue_subscriptions(tier, status), post_boosts(starts_at, ends_at)")
                    .eq("is_deleted", false)
                    .eq("posts.is_deleted", false)
                    .ilike("city", `%${city}%`);

                if (error) throw error;

                const rawVenues = (rawData || []).map((v: any) => {
                    const subs = v.venue_subscriptions;
                    const activeSub = Array.isArray(subs) 
                        ? subs.find((s: any) => s.status === 'active')
                        : (subs?.status === 'active' ? subs : null);
                    
                    return {
                        ...v,
                        tier: activeSub?.tier || 'free',
                        is_boosted: (v.post_boosts || []).some((b: any) => 
                            new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                        )
                    };
                });

                // Sort by: Boosted > Elite > Pro > Free
                const tierWeight: Record<string, number> = { elite: 1, pro: 2, free: 3 };
                const venues = rawVenues.sort((a: any, b: any) => {
                    if (a.is_boosted && !b.is_boosted) return -1;
                    if (!a.is_boosted && b.is_boosted) return 1;
                    return (tierWeight[a.tier] || 3) - (tierWeight[b.tier] || 3);
                });

                const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > now);

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

                const venues = (nearbyData || []).map((v: any) => ({
                    id: v.venue_id,
                    name: v.venue_name,
                    area: v.venue_area,
                    type: v.venue_type,
                    categories: v.venue_categories,
                    images: v.venue_images,
                    location: v.venue_location,
                    lat: v.venue_lat,
                    lng: v.venue_lng,
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

            // Fallback & City: Join with subscription/boost status
            const cityQuery = supabaseAdmin
                .from("venues")
                .select("*, posts(*), venue_subscriptions(tier, status), post_boosts(starts_at, ends_at)")
                .eq("is_deleted", false)
                .eq("posts.is_deleted", false);

            if (city) cityQuery.ilike("city", `%${city}%`);
            
            const { data: rawData, error } = await cityQuery.limit(50);
            if (error) throw error;

            const rawVenues = (rawData || []).map((v: any) => {
                const subs = v.venue_subscriptions;
                const activeSub = Array.isArray(subs) 
                    ? subs.find((s: any) => s.status === 'active')
                    : (subs?.status === 'active' ? subs : null);
                
                return {
                    ...v,
                    tier: activeSub?.tier || 'free',
                    is_boosted: (v.post_boosts || []).some((b: any) => 
                        new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                    )
                };
            });

            const tierWeight: Record<string, number> = { elite: 1, pro: 2, free: 3 };
            const venues = rawVenues.sort((a: any, b: any) => {
                if (a.is_boosted && !b.is_boosted) return -1;
                if (!a.is_boosted && b.is_boosted) return 1;
                return (tierWeight[a.tier] || 3) - (tierWeight[b.tier] || 3);
            });

            const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > now);

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
            // Postgres Rate limit: max 30 search requests per IP per minute (fixed to 30 as per requirements)
            const { data: isAllowed } = await supabaseAdmin.rpc("check_rate_limit", {
                p_ip: clientIp,
                p_endpoint: 'discovery_search',
                p_max_reqs: 30,
                p_window_seconds: 60
            });

            if (isAllowed === false) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
                    status: 429,
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            const { q, city, area, lat, lng } = SearchSchema.parse(params);

            // If coordinates are provided, we'll try to sort by distance
            // Since we can't easily do complex PostGIS joins via PostgREST without a custom RPC,
            // we'll fetch results and then potentially sort if needed, OR just return them with lat/lng
            // The frontend already calculates distance for display.

            let query = supabaseAdmin
                .from("venues")
                .select("*, venue_subscriptions(tier, status), post_boosts(starts_at, ends_at)")
                .eq("is_deleted", false);

            if (city) query = query.eq("city", city);
            if (area) query = query.eq("area", area);
            if (q) query = query.or(`name.ilike."%${q}%",type.ilike."%${q}%"`);

            const { data: resultsRaw, error } = await query.limit(50);
            if (error) throw error;

            // Flatten and Sort Search Results: Boosted > Elite > Pro > Free
            const results = (resultsRaw || []).map((v: any) => {
                const subs = v.venue_subscriptions;
                const activeSub = Array.isArray(subs) 
                    ? subs.find((s: any) => s.status === 'active')
                    : (subs?.status === 'active' ? subs : null);
                
                return {
                    ...v,
                    tier: activeSub?.tier || 'free',
                    is_boosted: (v.post_boosts || []).some((b: any) => 
                        new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                    )
                };
            }).sort((a: any, b: any) => {
                if (a.is_boosted && !b.is_boosted) return -1;
                if (!a.is_boosted && b.is_boosted) return 1;
                const tierWeight: Record<string, number> = { elite: 1, pro: 2, free: 3 };
                return (tierWeight[a.tier] || 3) - (tierWeight[b.tier] || 3);
            });

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
