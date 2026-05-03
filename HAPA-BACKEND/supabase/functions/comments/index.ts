import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

import { corsHeaders } from "../_shared/cors.ts";

const stripHtml = (val: string) => val.replace(/<[^>]*>?/gm, '');

const CommentCreateSchema = z.object({
    venue_id: z.string().uuid().optional().nullable(),
    post_id: z.string().uuid().optional().nullable(),
    hashtag: z.string().max(50).optional().nullable(),
    content: z.string().min(1).max(500).transform(stripHtml),
    author_alias: z.string().max(50).optional().nullable(),
});

serve(async (req) => {
    const origin = req.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { headers });

    try {
        const authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );

        const subPath = req.headers.get('x-sub-path') || '/';
        const pathParts = subPath.split("?")[0].split("/").filter(Boolean);

        const token = authHeader.replace('Bearer ', '');
        let userId: string | undefined;
        if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
            const tempClient = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_ANON_KEY") ?? "",
                { global: { headers: { Authorization: authHeader } } }
            );
            const { data } = await tempClient.auth.getUser(token);
            userId = data.user?.id;
        }

        // --- ROUTE: GET /venue/:id (Fetch comments for a venue) ---
        if (req.method === "GET" && pathParts.length === 2 && pathParts[0] === "venue") {
            const venueId = pathParts[1];
            const { data: comments, error } = await supabaseAdmin
                .from("comments")
                .select("*")
                .eq("venue_id", venueId)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            return new Response(JSON.stringify({ comments }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: GET /post/:id (Fetch comments for a specific post) ---
        if (req.method === "GET" && pathParts.length === 2 && pathParts[0] === "post") {
            const postId = pathParts[1];
            const { data: comments, error } = await supabaseAdmin
                .from("comments")
                .select("*")
                .eq("post_id", postId)
                .order("created_at", { ascending: false })
                .limit(100);

            if (error) throw error;
            return new Response(JSON.stringify({ comments }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: GET /hashtag/:name (Fetch comments for a hashtag) ---
        if (req.method === "GET" && pathParts.length === 2 && pathParts[0] === "hashtag") {
            const hashtag = pathParts[1];
            const { data: comments, error } = await supabaseAdmin
                .from("comments")
                .select("*")
                .eq("hashtag", hashtag)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            return new Response(JSON.stringify({ comments }), {
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // --- ROUTE: POST / (Create) ---
        if (req.method === "POST" && pathParts.length === 0) {
            const body = await req.json().catch(() => ({}));
            const { venue_id, post_id, hashtag, content, author_alias } = CommentCreateSchema.parse(body);

            if (!venue_id && !hashtag && !post_id) {
                throw new Error("Comments must target a post, venue, or a hashtag.");
            }

            let finalAlias = author_alias;
            if (!finalAlias) {
                const randomId = Math.floor(Math.random() * 1000);
                finalAlias = `Viber #${randomId}`;
            }

            const { data: comment, error: commentError } = await supabaseAdmin
                .from("comments")
                .insert({
                    venue_id,
                    post_id,
                    hashtag,
                    user_id: userId || null,
                    author_alias: finalAlias,
                    content
                })
                .select()
                .single();

            if (commentError) throw commentError;

            // If it's a post comment, increment the comment count in post metrics
            if (post_id) {
                try {
                    await supabaseAdmin.rpc("increment_post_comments", {
                        target_post_id: post_id
                    });
                } catch (e) {
                    console.error("Error incrementing comment count:", e);
                }
            }

            return new Response(JSON.stringify({ comment }), {
                status: 201,
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
