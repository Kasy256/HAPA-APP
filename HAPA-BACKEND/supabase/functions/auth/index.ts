import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rateLimit.ts";

import { corsHeaders } from "../_shared/cors.ts";

const OtpRequestSchema = z.object({
    phone_number: z.string().min(10),
});

const OtpVerifySchema = z.object({
    phone_number: z.string().min(10),
    code: z.string().length(5),
});

const MAX_OTP_ATTEMPTS = 5;

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

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
                headers: { ...headers, "Content-Type": "application/json" }
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
                    headers: { ...headers, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
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

            console.log(`[Deno OTP] Generated OTP for ${phone_number}`);

            // Send via Africa's Talking
            const atUsername = Deno.env.get("AFRICASTALKING_USERNAME");
            const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");

            if (atUsername && atApiKey) {
                const isSandbox = atUsername === 'sandbox';
                const atUrl = isSandbox
                    ? "https://api.sandbox.africastalking.com/version1/messaging"
                    : "https://api.africastalking.com/version1/messaging";

                // Africa's Talking strictly requires the '+' prefix for international numbers (e.g. Kenya)
                let atPhoneNumber = phone_number.trim();
                if (!atPhoneNumber.startsWith('+')) {
                    atPhoneNumber = '+' + atPhoneNumber;
                }

                const bodyMsg = new URLSearchParams({
                    username: atUsername,
                    to: atPhoneNumber,
                    message: `Your HAPA verification code is ${code}`
                });

                try {
                    const smsRes = await fetch(atUrl, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'apiKey': atApiKey
                        },
                        body: bodyMsg.toString()
                    });

                    if (!smsRes.ok) {
                        const errText = await smsRes.text();
                        console.error("[Deno OTP] Africa's Talking Error:", errText);
                    } else {
                        console.log(`[Deno OTP] SMS sent via Africa's Talking to ${phone_number}`);
                    }
                } catch (smsErr) {
                    console.error("[Deno OTP] Africa's Talking Exception:", smsErr);
                }
            } else {
                console.warn("[Deno OTP] AFRICASTALKING_USERNAME or AFRICASTALKING_API_KEY is not set. OTP logged locally only.");
                console.log(`[Deno OTP] FALLBACK LOG OTP: ${code} -> ${phone_number}`);
            }

            return new Response(JSON.stringify({
                success: true,
                message: "OTP sent successfully"
            }), {
                headers: { ...headers, "Content-Type": "application/json" },
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
                    headers: { ...headers, "Content-Type": "application/json", ...rateLimitHeaders(rl.remaining, rl.retryAfterMs) },
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
                    headers: { ...headers, "Content-Type": "application/json" }
                });
            }

            const otpRecord = otpRows[0];
            const attempts = otpRecord.attempts ?? 0;

            // Step 2: Check if this code is already locked out
            if (attempts >= MAX_OTP_ATTEMPTS) {
                return new Response(JSON.stringify({ error: "Too many failed attempts. Please request a new code." }), {
                    status: 429,
                    headers: { ...headers, "Content-Type": "application/json" }
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
                    headers: { ...headers, "Content-Type": "application/json" }
                });
            }

            // Delete the used OTP row — keeps the table clean and prevents re-use
            await supabaseAdmin.from("otp_codes").delete().eq("id", otpRecord.id);

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
            const dummyPassword = `hapa_${normalized}_pw`; // The old predictable password

            // 1. Generate a secure deterministic password
            // Users will never type this; they only log in via OTPs
            const hasher = new TextEncoder().encode(dummyEmail + "hapa_secure_salt_" + (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback"));
            const hashBuffer = await crypto.subtle.digest("SHA-256", hasher);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const securePassword = hashArray.map((b: number) => b.toString(16).padStart(2, "0")).join("") + "Aa!1";

            // 2. See if we know the user ID or phone number in our public.users table
            const { data: pubUserByPhone } = await supabaseAdmin.from("users").select("id").eq("phone_number", phone_number).maybeSingle();
            let authUserId = pubUserByPhone?.id;

            if (authUserId) {
                // User exists in public.users, ensures their Auth password is correct
                await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                    password: securePassword
                });
            } else {
                // No user in public.users, but they might still exist in Supabase Auth (e.g. database was cleared)
                // We can't use getUserByEmail, so we try to create them first.
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: dummyEmail,
                    password: securePassword,
                    email_confirm: true,
                });

                if (createError) {
                    // If it fails because they already exist in auth, let's try to sign in with the old dummy password to find their ID
                    const { data: oldAuthData } = await supabaseAdmin.auth.signInWithPassword({
                        email: dummyEmail,
                        password: dummyPassword,
                    });

                    if (oldAuthData?.user?.id) {
                        authUserId = oldAuthData.user.id;
                        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                            password: securePassword
                        });
                    } else {
                        // Try signing in with the securePassword in case we already migrated them
                        const { data: currentAuthData } = await supabaseAdmin.auth.signInWithPassword({
                            email: dummyEmail,
                            password: securePassword,
                        });
                        if (!currentAuthData?.user?.id) {
                            console.error("Could not create/lookup auth user:", createError.message);
                            return new Response(JSON.stringify({ error: "Failed to create user account: " + createError.message }), { status: 500, headers });
                        }
                    }
                }
            }

            // 3. Now sign in the user
            const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
                email: dummyEmail,
                password: securePassword,
            });

            if (authError || !authData.session) {
                console.error("Sign-in failed:", authError?.message);
                return new Response(JSON.stringify({ error: "Failed to generate session tokens: " + authError?.message }), { status: 500, headers });
            }
            const { session, user } = authData;

            // 4. Sync profile to public.users (Our single source of truth)
            if (user) {
                console.log(`[Deno Auth] Syncing profile for user ${user.id} (${phone_number})`);

                const { error: upsertError } = await supabaseAdmin.from("users").upsert({
                    id: user.id,
                    phone_number: phone_number,
                    role: "venue_owner",
                    status: "active"
                }, { onConflict: "id" });

                if (upsertError) {
                    console.error("[Deno Auth] Critical: Could not upsert user into public.users:", upsertError.message);
                    return new Response(JSON.stringify({
                        error: "Profile synchronization failed.",
                        details: `${upsertError.message} (ID: ${user.id})`
                    }), { status: 500, headers });
                }
            }

            // 5. Delete the used OTP row — keeps the table clean and prevents re-use
            await supabaseAdmin.from("otp_codes").delete().eq("id", otpRecord.id);

            return new Response(JSON.stringify({
                success: true,
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                user: user
            }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: /login-supabase ---
        if (path === "login-supabase") {
            const { access_token } = body;
            if (!access_token) {
                return new Response(JSON.stringify({ error: "Missing access_token" }), {
                    status: 400,
                    headers: { ...headers, "Content-Type": "application/json" }
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
                    headers: { ...headers, "Content-Type": "application/json" }
                });
            }

            // Return the same token and a mock refresh token (or the real one if we have it)
            // This satisfies the legacy frontend expectation
            return new Response(JSON.stringify({
                access_token,
                refresh_token: "supabase-refresh-token-managed-by-client",
                user
            }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: DELETE /delete-account ---
        if (req.method === "DELETE" && path === "delete-account") {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401, headers });
            }

            const token = authHeader.replace("Bearer ", "");
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

            if (authError || !user) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
            }

            // Delete the user from Supabase Auth
            // Foreign keys in public.users etc should cascade, but the root delete is here.
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

            if (deleteError) {
                console.error(`[Deno Auth] Error deleting user ${user.id}: ${deleteError.message}`);
                return new Response(JSON.stringify({ error: "Failed to delete account" }), { status: 500, headers });
            }

            return new Response(JSON.stringify({ success: true, message: "Account deleted successfully" }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
});
