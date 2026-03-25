import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

import { corsHeaders } from "../_shared/cors.ts";

// --- SCHEMAS ---

const stripHtml = (val: string) => val.replace(/<[^>]*>?/gm, '');

// Used for POST (create): all required NOT NULL fields must be present
const VenueCreateSchema = z.object({
    name: z.string().min(1, "Venue name is required").max(100, "Venue name too long").transform(stripHtml),
    type: z.string().min(1, "Venue type is required").transform(stripHtml),
    city: z.string().min(1, "City is required").transform(stripHtml),
    area: z.string().min(1, "Area is required").transform(stripHtml),
    address: z.string().transform(stripHtml).optional(),
    categories: z.array(z.string().transform(stripHtml)).optional().default([]),
    contact_phone: z.string().transform(stripHtml).optional(),
    images: z.array(z.string()).optional().default([]),
    working_hours: z.any().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    place_id: z.string().optional(),
    formatted_address: z.string().transform(stripHtml).optional(),
    location_data: z.any().optional(),
});

// Used for PATCH (update): all fields optional, only provided fields are updated
const VenueUpdateSchema = z.object({
    name: z.string().min(1).max(100).transform(stripHtml).optional(),
    type: z.string().min(1).transform(stripHtml).optional(),
    city: z.string().min(1).transform(stripHtml).optional(),
    area: z.string().min(1).transform(stripHtml).optional(),
    address: z.string().transform(stripHtml).optional(),
    categories: z.array(z.string().transform(stripHtml)).optional(),
    contact_phone: z.string().transform(stripHtml).optional(),
    images: z.array(z.string()).optional(),
    working_hours: z.any().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    place_id: z.string().optional(),
    formatted_address: z.string().transform(stripHtml).optional(),
    location_data: z.any().optional(),
});

// Helper: verify location with Google Maps and overwrite coordinates if valid
async function verifyLocation(updates: Record<string, any>) {
    if (updates.place_id && Deno.env.get("GOOGLE_MAPS_API_KEY")) {
        try {
            const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
            googleUrl.searchParams.set("place_id", updates.place_id);
            googleUrl.searchParams.set("fields", "geometry,formatted_address,address_components");
            googleUrl.searchParams.set("key", Deno.env.get("GOOGLE_MAPS_API_KEY")!);

            const gRes = await fetch(googleUrl.toString());
            const gData = await gRes.json();

            if (gData.status === "OK") {
                const result = gData.result;
                const components = result.address_components || [];

                const getBestComponent = (preferredTypes: string[]) => {
                    for (const type of preferredTypes) {
                        const comp = components.find((c: any) => c.types.includes(type));
                        if (comp) return comp.long_name;
                    }
                    return "";
                };

                updates.lat = result.geometry.location.lat;
                updates.lng = result.geometry.location.lng;
                updates.location_data = result;
                updates.address = result.formatted_address;
                updates.formatted_address = result.formatted_address;

                // Extract City and Area
                updates.city = getBestComponent(["locality"]);
                updates.area = getBestComponent(["neighborhood", "route", "sublocality_level_1", "sublocality"]);
            }
        } catch (e) {
            console.error("Location verification failed:", e);
        }
    }
    return updates;
}

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

    try {
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace('Bearer ', '');
        
        let user = null;
        let authError = null;

        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: authHeader || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` } } }
        );

        if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
            const { data, error } = await supabaseClient.auth.getUser(token);
            user = data?.user;
            authError = error;
        }

        const subPath = req.headers.get('x-sub-path') || '/';
        const pathParts = subPath.split("?")[0].split("/").filter(Boolean);

        // --- ADMIN CLIENT (Bypasses RLS) ---
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );

        // --- ROUTE: /me (Dashboard Stats) ---
        if (pathParts[0] === "me" && req.method === "GET") {
            if (authError || !user) throw new Error("Unauthorized");

            const { data: venue, error: venueError } = await supabaseAdmin
                .from("venues")
                .select("*, posts(metrics)")
                .eq("owner_id", user.id)
                .maybeSingle();

            if (venueError) throw venueError;

            if (!venue) {
                return new Response(JSON.stringify({ venue: null }), {
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            const totalMetrics = (venue.posts || []).reduce(
                (acc: any, post: any) => {
                    const postMetrics = typeof post.metrics === 'string' ? JSON.parse(post.metrics) : post.metrics;
                    acc.likes += postMetrics?.likes || 0;
                    acc.views += postMetrics?.views || 0;
                    return acc;
                },
                { likes: 0, views: 0 }
            );

            const mergedMetrics = {
                ...(venue.metrics || { likes: 0, views: 0 }),
                likes: totalMetrics.likes,
                walkins_count: venue.walkins_count || 0,
                post_shares: venue.post_shares || 0
            };

            return new Response(JSON.stringify({
                venue: { ...venue, metrics: mergedMetrics, total_metrics: totalMetrics }
            }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: GET /:id (Fetch venue details) ---
        if (pathParts.length === 1 && pathParts[0] !== "me" && req.method === "GET") {
            const venueId = pathParts[0];
            const now = new Date();
            const { data: rawData, error: venueError } = await supabaseAdmin
                .from("venues")
                .select("*, venue_subscriptions(tier, status), post_boosts(starts_at, ends_at)")
                .eq("id", venueId)
                .single();

            if (venueError) throw venueError;

            // Map tier and boosted status
            const subs = rawData.venue_subscriptions;
            const activeSub = Array.isArray(subs) 
                ? subs.find((s: any) => s.status === 'active')
                : (subs?.status === 'active' ? subs : null);
            
            const venue = {
                ...rawData,
                tier: activeSub?.tier || 'free',
                is_boosted: (rawData.post_boosts || []).some((b: any) => 
                    new Date(b.starts_at) <= now && new Date(b.ends_at) > now
                )
            };

            return new Response(JSON.stringify({ venue }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/view (Track view) ---
        if (pathParts.length === 2 && pathParts[1] === "view" && req.method === "POST") {
            const venueId = pathParts[0];
            let isOwner = false;

            if (user) {
                // Instagram standard: skip self-views (venue owners viewing their own venue)
                const { data: venueOwnerCheck } = await supabaseAdmin
                    .from("venues")
                    .select("owner_id")
                    .eq("id", venueId)
                    .maybeSingle();

                isOwner = venueOwnerCheck?.owner_id === user.id;
            }

            if (!isOwner) {
                try {
                    await supabaseAdmin.rpc("track_venue_view", {
                        target_venue_id: venueId, viewer_user_id: user?.id || null
                    });
                } catch (e) {
                    console.error("Error tracking venue view:", e);
                }
            }
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST / (Create new venue) ---
        if (req.method === "POST" && pathParts.length === 0) {
            if (authError || !user) throw new Error("Unauthorized");

            const body = await req.json();

            // Validate with strict schema — name, type, city, area are required
            const parsed = VenueCreateSchema.parse(body);
            let data: Record<string, any> = { ...parsed };
            data = await verifyLocation(data);

            // Check if a venue already exists for this owner
            // Also grab their phone number to use as the default contact_phone
            const { data: existingUser } = await supabaseAdmin
                .from("users")
                .select("id, phone_number, venues(id)")
                .eq("id", user.id)
                .maybeSingle();

            if (existingUser?.venues && existingUser.venues.length > 0) {
                return new Response(JSON.stringify({ error: "A venue already exists for this account. Use PATCH to update it." }), {
                    status: 409,
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            if (!data.contact_phone && existingUser?.phone_number) {
                data.contact_phone = existingUser.phone_number;
            } else if (!data.contact_phone) {
                // Fallback to avoid constraint error if phone_number is missing
                data.contact_phone = "Not provided";
            }

            const { data: created, error: createError } = await supabaseClient
                .from("venues")
                .insert({
                    ...data,
                    owner_id: user.id,
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) throw createError;

            return new Response(JSON.stringify({ venue: created }), {
                status: 201,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: PATCH / or PATCH /:id (Update existing venue) ---
        // Always resolves venue by owner_id for security (path ID is ignored for lookup)
        if (req.method === "PATCH") {
            if (authError || !user) throw new Error("Unauthorized");

            const body = await req.json();
            const parsed = VenueUpdateSchema.parse(body);

            // Strip undefined values so we only update what was provided
            const updates: Record<string, any> = Object.fromEntries(
                Object.entries(parsed).filter(([_, v]) => v !== undefined)
            );

            if (Object.keys(updates).length === 0) {
                return new Response(JSON.stringify({ error: "No fields provided to update." }), {
                    status: 400,
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            }

            const verifiedUpdates = await verifyLocation(updates);

            const { data: updated, error: updateError } = await supabaseClient
                .from("venues")
                .update({
                    ...verifiedUpdates,
                    updated_at: new Date().toISOString(),
                })
                .eq("owner_id", user.id)
                .select()
                .single();

            if (updateError) {
                if (updateError.code === 'PGRST116') {
                    // No venue found for this owner
                    return new Response(JSON.stringify({ error: "No venue profile found for this account. Please create one first." }), {
                        status: 404,
                        headers: { ...headers, "Content-Type": "application/json" },
                    });
                }
                throw updateError;
            }

            return new Response(JSON.stringify({ venue: updated }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST /:id/walkin (Record Walk-in) ---
        if (pathParts.length === 2 && pathParts[1] === "walkin" && req.method === "POST") {
            const venueId = pathParts[0];
            const body = await req.json().catch(() => ({}));
            const source = body.source || 'directions_tap';

            try {
                const { data: status } = await supabaseAdmin.rpc("log_venue_walkin", {
                    p_venue_id: venueId,
                    p_user_id: user?.id || null,
                    p_source: source
                });
                return new Response(JSON.stringify({ success: true, status }), {
                    headers: { ...headers, "Content-Type": "application/json" },
                });
            } catch (e) {
                console.error("Error logging walk-in:", e);
                return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
            }
        }

        return new Response(JSON.stringify({ error: "Not Found or Method Not Allowed" }), { status: 404 });

    } catch (error: any) {
        // Zod validation errors give a cleaner message
        const message = error?.errors
            ? error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
            : error.message;

        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
});
