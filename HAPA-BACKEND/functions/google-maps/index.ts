import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

const QuerySchema = z.object({
    q: z.string().min(1),
    lat: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
    lng: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
});

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const subPath = req.headers.get('x-sub-path') || '/';
        const queryStr = subPath.split("?")[1] || "";
        const params = Object.fromEntries(new URLSearchParams(queryStr).entries());

        // 1. Validation
        const validated = QuerySchema.safeParse(params);
        if (!validated.success) {
            return new Response(JSON.stringify({ error: validated.error }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { q, lat, lng } = validated.data;
        const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Maps API key not configured" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2. Fetch from Google Places
        const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        googleUrl.searchParams.set("query", q);
        googleUrl.searchParams.set("key", apiKey);
        if (lat && lng) {
            googleUrl.searchParams.set("location", `${lat},${lng}`);
            googleUrl.searchParams.set("radius", "5000");
        }

        const response = await fetch(googleUrl.toString());
        const data = await response.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            return new Response(JSON.stringify({ error: data.error_message || "Google API error" }), {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 3. Format response (Parity with old backend)
        const suggestions = (data.results || []).slice(0, 5).map((item: any) => ({
            id: item.place_id,
            name: item.name,
            address: item.formatted_address,
            lat: item.geometry?.location?.lat,
            lng: item.geometry?.location?.lng,
        }));

        return new Response(JSON.stringify({ suggestions }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
