import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rateLimit.ts";

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

const MAX_OTP_ATTEMPTS = 5;

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

        console.log(`[Deno Auth] Invoking path: ${path}`, { subPath });

        if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
            console.error("[Deno Auth] Error: SUPABASE_SERVICE_ROLE_KEY is missing!");
            return new Response(JSON.stringify({ error: "Server configuration error" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // --- ROUTE: /request-otp ---
        if (path === "request-otp") {
            const { phone_number } = OtpRequestSchema.parse(body);

            // Rate limit: max 5 OTP requests per phone per minute
            const rl = checkRateLimit(`otp-request:${phone_number}`, 5, 60_000);
            if (!rl.allowed) {
                return new Response(JSON.stringify({ error: "Too many OTP requests. Please wait before trying again." }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
                });
            }

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

            // Rate limit: max 10 verify attempts per phone per minute
            const rl = checkRateLimit(`otp-verify:${phone_number}`, 10, 60_000);
            if (!rl.allowed) {
                return new Response(JSON.stringify({ error: "Too many verification attempts. Please wait." }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
                });
            }

            // Step 1: Fetch the latest non-expired OTP for this phone (regardless of code)
            const { data: otpRows, error: otpError } = await supabaseAdmin
                .from("otp_codes")
                .select("*")
                .eq("phone_number", phone_number)
                .gt("expires_at", new Date().toISOString())
                .order("created_at", { ascending: false })
                .limit(1);

            if (otpError || !otpRows?.length) {
                return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            const otpRecord = otpRows[0];
            const attempts = otpRecord.attempts ?? 0;

            // Step 2: Check if this code is already locked out
            if (attempts >= MAX_OTP_ATTEMPTS) {
                return new Response(JSON.stringify({ error: "Too many failed attempts. Please request a new code." }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Step 3: Check if the submitted code is correct
            if (otpRecord.code !== code) {
                // Increment attempts on failure
                await supabaseAdmin
                    .from("otp_codes")
                    .update({ attempts: attempts + 1 })
                    .eq("id", otpRecord.id);

                const remaining = MAX_OTP_ATTEMPTS - (attempts + 1);
                return new Response(JSON.stringify({
                    error: remaining > 0
                        ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                        : "Too many failed attempts. Please request a new code."
                }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Logic to link with Supabase Auth...
            // Use email-based dummy auth to avoid phone E.164 format issues
            // Normalize: remove non-digits AND handle leading zero after country code
            let normalized = phone_number.replace(/\D/g, "");
            if (normalized.startsWith('2540')) {
                normalized = '254' + normalized.slice(4);
            } else if (normalized.startsWith('2560')) {
                normalized = '256' + normalized.slice(4);
            }

            const dummyEmail = `${normalized}@hapa-venue.app`;
            const dummyPassword = `hapa_${normalized}_pw`;

            // 1. Try to sign in first (if user already exists)
            let { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
                email: dummyEmail,
                password: dummyPassword,
            });

            // 2. If sign-in fails, create the account
            if (authError || !authData.session) {
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: dummyEmail,
                    password: dummyPassword,
                    email_confirm: true,
                });

                if (createError && createError.message !== "A user with this email address has already been registered") {
                    console.error("Could not create Supabase auth user:", createError.message);
                    return new Response(JSON.stringify({ error: "Failed to create user account: " + createError.message }), { status: 500, headers: corsHeaders });
                }

                // Sign in again
                const signInRetry = await supabaseAdmin.auth.signInWithPassword({
                    email: dummyEmail,
                    password: dummyPassword,
                });

                authData = signInRetry.data;
                authError = signInRetry.error;

                if (authError || !authData.session) {
                    console.error("Retry sign-in failed:", authError?.message);
                    return new Response(JSON.stringify({ error: "Failed to generate session tokens: " + authError?.message }), { status: 500, headers: corsHeaders });
                }
            }

            const { session, user } = authData;

            // 3. Upsert into public.users
            if (user) {
                const { error: upsertError } = await supabaseAdmin.from("users").upsert({
                    id: user.id,
                    phone_number: phone_number,
                    role: "venue_owner",
                    updated_at: new Date().toISOString()
                }, { onConflict: "id" });

                if (upsertError) {
                    console.error("Could not upsert user:", upsertError);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user: user
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /login-supabase ---
        if (path === "login-supabase") {
            const { access_token } = body;
            if (!access_token) {
                return new Response(JSON.stringify({ error: "Missing access_token" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Verify the token by getting the user
            const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(access_token);
            if (userError || !user) {
                console.error(`[Deno Auth] Invalid token check: ${userError?.message}`);
                return new Response(JSON.stringify({
                    error: "Invalid Supabase token",
                    details: userError?.message
                }), {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Return the same token and a mock refresh token (or the real one if we have it)
            // This satisfies the legacy frontend expectation
            return new Response(JSON.stringify({
                access_token,
                refresh_token: "supabase-refresh-token-managed-by-client",
                user
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
