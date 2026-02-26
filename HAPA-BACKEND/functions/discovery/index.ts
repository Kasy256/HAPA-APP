import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

const FeedSchema = z.object({
    lat: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
    lng: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
    radius_km: z.preprocess((val) => parseFloat(val as string), z.number()).default(10),
});

const SearchSchema = z.object({
    q: z.string().optional(),
    city: z.string().optional(),
    area: z.string().optional(),
});

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
        );

        const subPath = req.headers.get('x-sub-path') || '/';
        const path = subPath.split("?")[0].split("/").filter(Boolean).pop();
        const queryStr = subPath.split("?")[1] || "";
        const params = Object.fromEntries(new URLSearchParams(queryStr).entries());

        // --- ROUTE: /feed ---
        if (path === "feed" || path === "discovery" || path === undefined) {
            const { lat, lng, radius_km } = FeedSchema.parse(params);

            if (lat && lng) {
                const { data, error } = await supabaseClient.rpc("get_nearby_vibes", {
                    user_lat: lat,
                    user_lng: lng,
                    radius_meters: radius_km * 1000,
                });

                if (error) throw error;

                // PARITY TRANSFORMATION: Frontend expects { venues: [], posts: [] }
                const venues = (data || []).map((v: any) => ({
                    id: v.venue_id,
                    name: v.venue_name,
                    location: v.venue_location,
                    dist_meters: v.dist_meters,
                    // Re-map other venue fields if needed, or rely on frontend handling
                }));

                const posts = (data || []).filter((v: any) => v.latest_post_url).map((v: any) => ({
                    id: `post-${v.venue_id}`, // Mock ID or keep as is
                    venue_id: v.venue_id,
                    media_url: v.latest_post_url,
                    media_type: v.latest_post_type,
                    created_at: new Date().toISOString(), // Mock or fetch from RPC
                }));

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            } else {
                const { data: venues, error } = await supabaseClient
                    .from("venues")
                    .select("*, posts(*)")
                    .eq("is_deleted", false)
                    .limit(50);

                if (error) throw error;

                // Flatten posts for frontend compatibility
                const posts = venues.flatMap((v: any) => v.posts || []);

                return new Response(JSON.stringify({ venues, posts }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }

        // --- ROUTE: /search ---
        if (path === "search") {
            const { q, city, area } = SearchSchema.parse(params);
            let query = supabaseClient.from("venues").select("*").eq("is_deleted", false);

            if (city) query = query.eq("city", city);
            if (area) query = query.eq("area", area);
            if (q) query = query.or(`name.ilike.%${q}%,type.ilike.%${q}%`);

            const { data, error } = await query.limit(50);
            if (error) throw error;

            return new Response(JSON.stringify({ venues: data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: `Not Found: ${path}` }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
