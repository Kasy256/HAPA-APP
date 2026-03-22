// Supabase Edge Function: payments
// Routes (via x-sub-path header, matching all other HAPA edge functions):
//   POST /initiate      — create Paystack transaction
//   POST /verify        — verify + activate after redirect
//   POST /webhook       — Paystack HMAC webhook (no auth required)
//   GET  /subscription  — current tier + post limits for the caller
//   DELETE /subscription — mark cancel_at_period_end

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

import { corsHeaders } from "../_shared/cors.ts";

const PAYSTACK_BASE = "https://api.paystack.co";
const FRONTEND_URL = "hapapp://";

// ── Pricing (amounts in KES — matching user dashboard) ──────────────────────
const PLANS: Record<string, number> = {
  pro: 3250,  // KES 3,250 (~$25)
  elite: 9750,  // KES 9,750 (~$75)
};

const BOOST_PRICE: Record<string, number> = {
  "24h": 1300,  // KES 1,300 (~$10)
  "48h": 2340,  // KES 2,340 (~$18)
};



// ── Paystack helpers ───────────────────────────────────────────────────────────
async function paystackPost(path: string, body: unknown, secret: string) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack error");
  return data.data;
}

async function paystackGet(path: string, secret: string) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack error");
  return data.data;
}

async function verifyWebhookSignature(
  payload: Uint8Array,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, payload);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}

// ── Activation helpers ─────────────────────────────────────────────────────────
async function activateSubscription(
  admin: ReturnType<typeof createClient>,
  venueId: string,
  tier: string,
  customerCode?: string,
  subscriptionCode?: string
) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  console.log(`[Subscription] Activating ${tier} for venue ${venueId}. Codes: ${customerCode}, ${subscriptionCode}`);

  // 1. First try to update the existing record
  const { data: updated, error: updateError } = await admin
    .from("venue_subscriptions")
    .update({
      tier,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      paystack_customer_code: customerCode || null,
      paystack_subscription_code: subscriptionCode || null,
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    })
    .eq("venue_id", venueId)
    .select();

  if (updateError) {
    console.error(`[Subscription] DB Update error:`, updateError);
    throw updateError;
  }

  // 2. If no record was updated (unlikely due to trigger), then insert
  if (!updated || updated.length === 0) {
    console.log(`[Subscription] No existing record for ${venueId}, inserting...`);
    const { error: insertError } = await admin
      .from("venue_subscriptions")
      .insert({
        venue_id: venueId,
        tier,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        paystack_customer_code: customerCode || null,
        paystack_subscription_code: subscriptionCode || null,
        cancel_at_period_end: false,
      });

    if (insertError) {
      console.error(`[Subscription] DB Insert error:`, insertError);
      throw insertError;
    }
  } else {
    console.log(`[Subscription] Successfully updated tier to ${tier} for ${venueId}. Result:`, updated[0]);
  }
}

async function activateBoost(
  admin: ReturnType<typeof createClient>,
  venueId: string,
  transactionId: string,
  postId: string | null,
  duration: string
) {
  const now = new Date();
  const hours = duration === "48h" ? 48 : 24;
  const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  await admin.from("post_boosts").insert({
    venue_id: venueId,
    post_id: postId ?? null,
    transaction_id: transactionId,
    duration_hours: hours,
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  });
}

// ── JSON response helper ───────────────────────────────────────────────────────
function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });

  const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ANON_KEY;

  const authHeader = req.headers.get("Authorization");
  const isAnon = !authHeader || authHeader.includes(ANON_KEY);

  const supabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader ?? `Bearer ${ANON_KEY}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const subPath = req.headers.get("x-sub-path") ?? "/";
  const pathParts = subPath.split("?")[0].split("/").filter(Boolean);
  const route = pathParts[0] ?? "";

  try {
    // ── GET /subscription ─────────────────────────────────────────────────────
    if (req.method === "GET" && route === "subscription") {
      if (isAnon) return json({ error: "Unauthorized: No session token" }, 401, headers);

      const token = authHeader!.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        console.error("Auth error:", authError);
        return json({ error: "Unauthorized", details: authError?.message }, 401, headers);
      }

      const { data: venue } = await admin
        .from("venues").select("id").eq("owner_id", user.id).single();
      if (!venue) return json({ error: "Venue not found" }, 404, headers);

      const { data: sub } = await admin
        .from("venue_subscriptions").select("*").eq("venue_id", venue.id).single();

      const { data: limitData } = await admin
        .rpc("check_post_limit", { p_venue_id: venue.id });
      const limit = limitData ?? {};

      if (!sub) {
        return json({
          tier: "free", status: "active",
          can_post: true, posts_today: 0, post_limit: 3,
          is_unlimited: false, current_period_end: null, cancel_at_period_end: false,
        }, 200, headers);
      }

      return json({
        tier: sub.tier,
        status: sub.status,
        current_period_end: sub.current_period_end ?? null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        posts_today: limit.count ?? 0,
        post_limit: limit.limit ?? 3,
        can_post: limit.can_post ?? true,
        is_unlimited: limit.is_unlimited ?? false,
      }, 200, headers);
    }

    // ── DELETE /subscription ──────────────────────────────────────────────────
    if (req.method === "DELETE" && route === "subscription") {
      if (isAnon) return json({ error: "Unauthorized: No session token" }, 401, headers);

      const token = authHeader!.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) return json({ error: "Unauthorized" }, 401, headers);

      const { data: venue } = await admin
        .from("venues").select("id").eq("owner_id", user.id).single();
      if (!venue) return json({ error: "Venue not found" }, 404, headers);

      await admin
        .from("venue_subscriptions")
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("venue_id", venue.id);

      return json({ message: "Subscription will cancel at end of billing period." }, 200, headers);
    }

    // ── POST /webhook — No JWT, HMAC verified ─────────────────────────────────
    if (req.method === "POST" && route === "webhook") {
      const signature = req.headers.get("x-paystack-signature") ?? "";
      const payload = await req.arrayBuffer();
      const valid = await verifyWebhookSignature(
        new Uint8Array(payload), signature, PAYSTACK_SECRET
      );
      if (!valid) return json({ error: "Invalid signature" }, 401, headers);

      const event = JSON.parse(new TextDecoder().decode(payload));
      const eventType = event.event ?? "";
      const data = event.data ?? {};

      console.log(`[Webhook] Received ${eventType} with reference: ${data.reference}`);

      if (eventType === "charge.success") {
        const reference = data.reference ?? "";
        if (reference) {
          // 1. Find the transaction first (don't update yet, we need the current status)
          const { data: tx } = await admin
            .from("payment_transactions")
            .select("*")
            .eq("paystack_reference", reference)
            .single();

          if (!tx) {
            console.error(`[Webhook] No transaction found for reference: ${reference}`);
            return json({ error: "Transaction not found" }, 404, headers);
          }

          // 2. Atomic update only if pending (to avoid multiple activations)
          if (tx.status === "pending") {
            const { error: updateError } = await admin
              .from("payment_transactions")
              .update({ status: "success", updated_at: new Date().toISOString() })
              .eq("id", tx.id);

            if (updateError) {
              console.error(`[Webhook] Failed to update transaction status:`, updateError);
            }
          }

          // 3. Validate Amount & Currency
          const expectedAmountMinor = Number(tx.amount_local) * 100;
          const paidAmount = data.amount ?? 0;
          const paidCurrency = data.currency ?? "";

          if (paidCurrency !== tx.currency && tx.currency === 'KES' && paidCurrency !== 'USD') {
            console.error(`[Webhook] Invalid Payment Currency for ${reference}. Expected: ${tx.currency}, Got: ${paidCurrency}`);
            await admin.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
            return json({ error: "Invalid payment currency" }, 400, headers);
          }

          if (paidAmount < expectedAmountMinor * 0.95) {
            console.error(`[Webhook] Invalid Payment Amount for ${reference}. Expected: ${expectedAmountMinor}, Got: ${paidAmount}`);
            await admin.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
            return json({ error: "Invalid payment amount" }, 400, headers);
          }

          // 4. Activate! (Idempotent call)
          if (tx.type === "subscription") {
            const customerCode = data.customer?.customer_code || data.customer_code;
            const subCode = data.subscription_code || data.subscription?.subscription_code || data.subscription;

            console.log(`[Webhook] Activating subscription. Reference: ${reference}, SubCode: ${typeof subCode === 'string' ? subCode : 'complex'}`);
            await activateSubscription(admin, tx.venue_id, tx.tier, customerCode, typeof subCode === 'string' ? subCode : undefined);
          } else if (tx.type === "boost") {
            const meta = tx.metadata ?? {};
            console.log(`[Webhook] Activating boost. Reference: ${reference}, Venue: ${tx.venue_id}`);
            await activateBoost(admin, tx.venue_id, tx.id, meta.post_id, meta.duration ?? "24h");
          }
        }
      } else if (eventType === "subscription.disable") {
        const subCode = data.subscription_code ?? data.subscription?.subscription_code ?? "";
        if (subCode) {
          await admin.from("venue_subscriptions")
            .update({ status: "cancelled", cancel_at_period_end: true, updated_at: new Date().toISOString() })
            .eq("paystack_subscription_code", subCode);
        }
      }
      return json({ status: "ok" }, 200, headers);
    }

    // ── Authenticated routes below ─────────────────────────────────────────────
    if (isAnon) return json({ error: "Unauthorized: No session token" }, 401, headers);

    const token = authHeader!.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error in authenticated section:", authError);
      return json({ error: "Unauthorized", details: authError?.message }, 401, headers);
    }

    const { data: venue } = await admin
      .from("venues").select("id").eq("owner_id", user.id).single();
    if (!venue) return json({ error: "Venue not found" }, 404, headers);
    const venueId = venue.id;

    // ── POST /initiate ─────────────────────────────────────────────────────────
    if (req.method === "POST" && route === "initiate") {
      const body = await req.json().catch(() => ({}));
      const { type, email, tier, duration, post_id } = body;

      if (!email) return json({ error: "Email is required" }, 400, headers);
      if (!["subscription", "boost"].includes(type))
        return json({ error: "Invalid payment type" }, 400, headers);

      const currency = "KES"; // Paystack plans are in KES
      const refSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const reference = `hapa_${type}_${venueId.slice(0, 8)}_${refSuffix}`;

      const amount = type === "subscription"
        ? PLANS[tier]
        : BOOST_PRICE[duration];

      if (!amount) return json({ error: "Invalid tier or duration" }, 400, headers);

      const metadata: Record<string, string> = {
        venue_id: venueId, payment_type: type, currency,
      };
      if (type === "subscription") metadata.tier = tier;
      if (type === "boost") { metadata.duration = duration; if (post_id) metadata.post_id = post_id; }

      // Save pending transaction
      await admin.from("payment_transactions").insert({
        venue_id: venueId,
        type,
        tier: type === "subscription" ? tier : null,
        amount_local: amount,
        currency,
        paystack_reference: reference,
        status: "pending",
        metadata,
      });

      // Get plan code from env if it exists (for subscriptions)
      let plan = undefined;
      if (type === "subscription") {
        const envKey = `PAYSTACK_PLAN_${tier.toUpperCase()}`;
        plan = Deno.env.get(envKey);
      }

      const paystackData = await paystackPost(
        "/transaction/initialize",
        {
          email,
          amount: amount * 100, // Paystack expects minor units (cents/kobo/etc) even for KES/UGX in some API versions, but for KES/UGX specifically it varies. Best practice is * 100.
          currency,
          reference,
          plan, // include the PLN_xxx code here
          metadata,
          callback_url: `${FRONTEND_URL}/payment/callback?ref=${reference}`,
        },
        PAYSTACK_SECRET
      );

      return json({
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code,
        reference,
      }, 200, headers);
    }

    // ── POST /verify ───────────────────────────────────────────────────────────
    if (req.method === "POST" && route === "verify") {
      const { reference } = await req.json().catch(() => ({}));
      if (!reference) return json({ error: "Reference is required" }, 400, headers);

      const { data: tx } = await admin
        .from("payment_transactions").select("*")
        .eq("paystack_reference", reference).single();
      if (!tx) return json({ error: "Transaction not found" }, 404, headers);

      if (tx.status === "success") {
        return json({ status: "success", type: tx.type, tier: tx.tier, message: "Already verified." }, 200, headers);
      }

      const psTx = await paystackGet(`/transaction/verify/${reference}`, PAYSTACK_SECRET);

      const expectedAmountMinor = Number(tx.amount_local) * 100;
      const paidAmount = psTx.amount ?? 0;
      const paidCurrency = psTx.currency ?? "";

      if (psTx.status !== "success" || paidAmount < expectedAmountMinor * 0.95) {
        if (tx.status === "pending") {
          await admin.from("payment_transactions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("paystack_reference", reference);
        }
        return json({ error: "Payment was not successful or invalid amount", status: "failed" }, 402, headers);
      }

      // atomic update
      if (tx.status === "pending") {
        await admin.from("payment_transactions")
          .update({
            status: "success",
            paystack_transaction_id: String(psTx.id ?? ""),
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id);
      }

      const customerCode = psTx.customer?.customer_code || psTx.customer_code;
      const subCode = psTx.subscription?.subscription_code || psTx.subscription_code || psTx.subscription;

      if (tx.type === "subscription") {
        console.log(`[/verify] Activating subscription. Reference: ${reference}, Tier: ${tx.tier}, SubCode: ${typeof subCode === 'string' ? subCode : 'complex'}`);
        await activateSubscription(admin, tx.venue_id, tx.tier, customerCode, typeof subCode === 'string' ? subCode : undefined);
        return json({
          status: "success", type: "subscription", tier: tx.tier,
          message: `Your ${tx.tier} plan is now active.`,
        }, 200, headers);
      }

      if (tx.type === "boost") {
        const meta = tx.metadata ?? {};
        console.log(`[/verify] Activating boost. Reference: ${reference}`);
        await activateBoost(admin, tx.venue_id, tx.id, meta.post_id ?? null, meta.duration ?? "24h");
        return json({
          status: "success", type: "boost", duration: meta.duration,
          message: `Your post is now boosted for ${meta.duration}.`,
        }, 200, headers);
      }

      return json({ status: "success" }, 200, headers);
    }

    return json({ error: "Method Not Allowed" }, 405, headers);

  } catch (err: any) {
    console.error("[payments]", err);
    return json({ error: err.message ?? "Internal error" }, 400, headers);
  }
});
