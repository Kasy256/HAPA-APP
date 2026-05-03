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
            const category = params.category; // Optional category filter
            const hashtag = params.hashtag;   // Optional hashtag filter

            let query = supabaseAdmin
                .from("venues")
                .select("*, venue_subscriptions(tier, status), post_boosts(starts_at, ends_at)")
                .eq("is_deleted", false)
                .or("owner_id.not.is.null,name.ilike.HAPA Global"); // Show official venues OR the global hub

            if (city) query = query.ilike("city", `%${city}%`);
            if (category) query = query.contains("categories", JSON.stringify([category]));

            const { data: rawVenuesData, error: venueError } = await query.limit(100);
            if (venueError) throw venueError;

            const venues = (rawVenuesData || []).map((v: any) => {
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

            const venueIds = venues.map(v => v.id);

            // Fetch hybrid posts: Venue posts + User posts tagged to these venues
            let postsQuery = supabaseAdmin
                .from("posts")
                .select("*, venues(owner_id), post_boosts(starts_at, ends_at)")
                .eq("is_deleted", false)
                .gt("expires_at", now.toISOString())
                .order("created_at", { ascending: false });

            if (hashtag) {
                // For hashtag views, we still want to show all posts, but we'll filter 
                // out non-official ones if they are in a search context.
                // To avoid JSON errors, we use a simpler filter.
                postsQuery = postsQuery.eq("hashtag", hashtag);
            } else if (category) {
                // For categories, we use a simpler approach to avoid join issues
                postsQuery = postsQuery.not("venue_id", "is", null);
            }

            const { data: rawPosts, error: postsError } = await postsQuery.limit(200);
            if (postsError) throw postsError;

            const posts = (rawPosts || []).map((p: any) => {
                const venue = venues.find(v => v.id === p.venue_id);

                // Robust parsing for stringified JSON fields
                const parseField = (field: any) => {
                    if (typeof field === 'string') {
                        try { return JSON.parse(field); } catch { return []; }
                    }
                    return Array.isArray(field) ? field : [];
                };

                const venueImages = parseField(venue?.images);

                return {
                    ...p,
                    metrics: p.metrics || { likes: 0, views: 0, shares: 0, comments: 0 },
                    venue_name: venue?.name,
                    venue_image: venueImages[0] || null,
                    venue_tier: venue?.tier,
                    venue_lat: venue?.lat,
                    venue_lng: venue?.lng,
                    venue_owner_id: venue?.owner_id,
                    is_boosted: p.is_boosted || (p.post_boosts || []).some((b: any) =>
                        new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                    )
                };
            });

            // Sorting Logic: 
            // 1. Elite (Boosted or Event)
            // 2. Elite (Standard Vibe)
            // 3. Pro (Boosted or Event)
            // 4. Pro (Standard Vibe)
            // 5. User/Free (Standard Vibe)
            const sortedPosts = posts.sort((a, b) => {
                // Tier weights: Elite = 10, Pro = 5, Free = 0
                const getWeight = (p: any) => {
                    let weight = 0;
                    if (p.venue_tier === 'elite') weight += 10;
                    else if (p.venue_tier === 'pro') weight += 5;

                    // Boosted or Event posts get internal priority within their tier
                    if (p.is_boosted || p.post_type === 'event' || p.is_promoted) weight += 2;
                    
                    return weight;
                };

                const weightA = getWeight(a);
                const weightB = getWeight(b);

                if (weightA !== weightB) return weightB - weightA;

                // Fallback to recency
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });

            if (userId && sortedPosts.length > 0) {
                const postIds = sortedPosts.map((p: any) => p.id);
                const { data: likes } = await supabaseAdmin
                    .from("post_likes")
                    .select("post_id")
                    .eq("user_id", userId)
                    .in("post_id", postIds);

                const likedSet = new Set(likes?.map(l => l.post_id) || []);
                sortedPosts.forEach((p: any) => p.is_liked = likedSet.has(p.id));
            }

            return new Response(JSON.stringify({ venues, posts: sortedPosts }), {
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
                .eq("is_deleted", false)
                .not("owner_id", "is", null); // ONLY SHOW OFFICIAL VENUES IN SEARCH

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
