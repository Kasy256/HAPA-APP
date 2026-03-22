import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

    try {
        const body = await req.json().catch(() => ({}));
        const { item_id, item_type, reason } = body;
        
        if (!item_id || !item_type || !reason) {
            return new Response(JSON.stringify({ error: "Missing required fields (item_id, item_type, reason)" }), { 
                status: 400, 
                headers: { ...headers, "Content-Type": "application/json" } 
            });
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        let reporterId = null;
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.includes("Bearer")) {
            const token = authHeader.replace("Bearer ", "");
            // Only try to parse user if it's not the anon key 
            if (token !== Deno.env.get("SUPABASE_ANON_KEY")) {
                const { data } = await supabaseAdmin.auth.getUser(token);
                reporterId = data?.user?.id || null;
            }
        }

        const { error } = await supabaseAdmin.from("reports").insert({
            reporter_id: reporterId,
            reported_item_id: item_id,
            item_type,
            reason
        });

        if (error) {
            console.error("[Reports] Error inserting record:", error);
            throw new Error("Failed to submit report");
        }

        return new Response(JSON.stringify({ success: true, message: "Report submitted successfully" }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" }
        });

    } catch (e: any) {
         return new Response(JSON.stringify({ error: e.message }), { 
             status: 500, 
             headers: { ...headers, "Content-Type": "application/json" } 
         });
    }
});
