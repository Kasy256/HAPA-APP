import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

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

const QuerySchema = z.object({
    q: z.string().min(1),
    lat: z.preprocess(parseNumber, z.number().optional()),
    lng: z.preprocess(parseNumber, z.number().optional()),
});

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const subPath = req.headers.get('x-sub-path') || '/';
        const [path] = subPath.split("?")[0].split("/").filter(Boolean);
        const queryStr = subPath.split("?")[1] || "";
        const params = Object.fromEntries(new URLSearchParams(queryStr).entries());

        const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Maps API key not configured" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /autocomplete or /suggest (backward compatibility) ---
        if (path === "autocomplete" || path === "suggest" || !path) {
            const validated = QuerySchema.safeParse(params);
            if (!validated.success) {
                return new Response(JSON.stringify({ error: validated.error }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const { q, lat, lng } = validated.data;

            // Use Places Autocomplete for better UX and lower cost
            const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
            googleUrl.searchParams.set("input", q);
            googleUrl.searchParams.set("key", apiKey);
            googleUrl.searchParams.set("types", "establishment|geocode");
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

            const suggestions = (data.predictions || []).map((item: any) => ({
                id: item.place_id,
                name: item.structured_formatting?.main_text || item.description,
                address: item.structured_formatting?.secondary_text || "",
                description: item.description,
            }));

            return new Response(JSON.stringify({ suggestions }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /details ---
        if (path === "details") {
            const placeId = params.place_id;
            if (!placeId) {
                return new Response(JSON.stringify({ error: "place_id is required" }), { status: 400, headers: corsHeaders });
            }

            const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
            googleUrl.searchParams.set("place_id", placeId);
            googleUrl.searchParams.set("fields", "geometry,formatted_address,address_components,name");
            googleUrl.searchParams.set("key", apiKey);

            const response = await fetch(googleUrl.toString());
            const data = await response.json();

            if (data.status !== "OK") {
                return new Response(JSON.stringify({ error: data.error_message || "Google API error" }), {
                    status: 502,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const result = data.result;
            const components = result.address_components || [];

            const getBestComponent = (preferredTypes: string[]) => {
                for (const type of preferredTypes) {
                    const comp = components.find((c: any) => c.types.includes(type));
                    if (comp) return comp.long_name;
                }
                return "";
            };

            const city = getBestComponent(["locality"]);
            // Prioritize neighborhood, then route (street), then fallback to sublocality
            const area = getBestComponent(["neighborhood", "route", "sublocality_level_1", "sublocality"]);
            const country = getBestComponent(["country"]);

            return new Response(JSON.stringify({
                place_id: placeId,
                name: result.name,
                formatted_address: result.formatted_address,
                lat: result.geometry?.location?.lat,
                lng: result.geometry?.location?.lng,
                city: city,
                area: area,
                country: country,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
