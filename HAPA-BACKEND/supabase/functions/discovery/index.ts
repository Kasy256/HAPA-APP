import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rateLimit.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

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
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    // Rate limit by client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    try {
        const authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;
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
                    headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
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

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

                const venueIds = (nearbyData || []).map((v: any) => v.venue_id);

                const { data: venues, error: venuesError } = await supabaseAdmin
                    .from("venues")
                    .select("*, posts(*)")
                    .in("id", venueIds)
                    .eq("is_deleted", false)
                    .eq("posts.is_deleted", false);

                if (venuesError) throw venuesError;

                const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > new Date());

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Fallback: Just get some venues
            const { data: venues, error } = await supabaseAdmin
                .from("venues")
                .select("*, posts(*)")
                .eq("is_deleted", false)
                .eq("posts.is_deleted", false)
                .limit(50);

            if (error) throw error;

            const posts = (venues || []).flatMap((v: any) => v.posts || []).filter((p: any) => new Date(p.expires_at) > new Date());

            return new Response(JSON.stringify({ venues, posts }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /search ---
        if (path === "search") {
            // Rate limit: max 20 search requests per IP per minute
            const rl = checkRateLimit(`discovery-search:${clientIp}`, 20, 60_000);
            if (!rl.allowed) {
                return new Response(JSON.stringify({ error: "Rate limit exceeded. Please slow down." }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
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
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: `Not Found: ${path}` }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
