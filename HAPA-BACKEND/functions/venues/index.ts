import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

const VenueUpdateSchema = z.object({
    name: z.string().optional(),
    type: z.string().optional(),
    city: z.string().optional(),
    area: z.string().optional(),
    address: z.string().optional(),
    contact_phone: z.string().optional(),
    images: z.array(z.string()).optional(),
    working_hours: z.any().optional(),
});

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("Authorization")!;
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error("Unauthorized");

        const subPath = req.headers.get('x-sub-path') || '/';
        const path = subPath.split("?")[0].split("/").filter(Boolean).pop();

        // --- ROUTE: /me (Dashboard Stats) ---
        if (path === "me" && req.method === "GET") {
            const { data: venue, error: venueError } = await supabaseClient
                .from("venues")
                .select("*, posts(metrics)")
                .eq("owner_id", user.id)
                .single();

            if (venueError) throw venueError;

            const totalMetrics = (venue.posts || []).reduce(
                (acc: any, post: any) => {
                    acc.likes += post.metrics?.likes || 0;
                    acc.views += post.metrics?.views || 0;
                    return acc;
                },
                { likes: 0, views: 0 }
            );

            return new Response(JSON.stringify({
                venue: { ...venue, total_metrics: totalMetrics }
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: Update Venue ---
        if (req.method === "PATCH" || req.method === "POST") {
            const body = await req.json();
            const updates = VenueUpdateSchema.parse(body);

            const { data: updated, error: updateError } = await supabaseClient
                .from("venues")
                .update(updates)
                .eq("owner_id", user.id)
                .select()
                .single();

            if (updateError) throw updateError;

            return new Response(JSON.stringify({ venue: updated }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Not Found or Method Not Allowed" }), { status: 404 });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
