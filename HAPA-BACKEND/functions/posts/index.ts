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
        const authHeader = req.headers.get("Authorization")!;
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error("Unauthorized");

        const subPath = req.headers.get('x-sub-path') || '/';
        const body = await req.json().catch(() => ({}));

        // --- ROUTE: POST / (Create) ---
        if (req.method === "POST") {
            const { media_type, media_url, caption } = PostCreateSchema.parse(body);

            const { data: venue, error: venueError } = await supabaseClient
                .from("venues")
                .select("id")
                .eq("owner_id", user.id)
                .single();

            if (venueError || !venue) throw new Error("No venue found for this owner");

            const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

        // --- ROUTE: DELETE /:id ---
        if (req.method === "DELETE") {
            const postId = subPath.split("/").filter(Boolean).pop();
            if (!postId) throw new Error("Post ID required");

            const { error } = await supabaseClient
                .from("posts")
                .update({ is_deleted: true }) // Soft delete
                .eq("id", postId);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
