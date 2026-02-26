import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sub-path",
};

const OtpRequestSchema = z.object({
    phone_number: z.string().min(10),
});

const OtpVerifySchema = z.object({
    phone_number: z.string().min(10),
    code: z.string().length(5),
});

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const subPath = req.headers.get('x-sub-path') || '/';
        const path = subPath.split("?")[0].split("/").filter(Boolean).pop();
        const body = await req.json().catch(() => ({}));

        // --- ROUTE: /request-otp ---
        if (path === "request-otp") {
            const { phone_number } = OtpRequestSchema.parse(body);
            const code = Math.floor(10000 + Math.random() * 90000).toString();
            const expires_at = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins

            // Insert into otp_codes
            const { error } = await supabaseAdmin.from("otp_codes").insert({
                phone_number,
                code,
                expires_at,
                purpose: "login",
            });
            if (error) throw error;

            console.log(`[Deno OTP] ${code} -> ${phone_number}`);

            return new Response(JSON.stringify({
                success: true,
                otp: code
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /verify-otp ---
        if (path === "verify-otp") {
            const { phone_number, code } = OtpVerifySchema.parse(body);

            const { data: otpRows, error: otpError } = await supabaseAdmin
                .from("otp_codes")
                .select("*")
                .eq("phone_number", phone_number)
                .eq("code", code)
                .gt("expires_at", new Date().toISOString())
                .order("created_at", { ascending: false })
                .limit(1);

            if (otpError || !otpRows?.length) {
                return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Logic to link with Supabase Auth...
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
