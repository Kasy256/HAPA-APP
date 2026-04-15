import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { corsHeaders } from "../_shared/cors.ts";

const PAYSTACK_BASE = "https://api.paystack.co";
const FRONTEND_URL = "hapapp://";
// Paystack webhook IPs — keep in sync with their published list
const PAYSTACK_IPS = ['52.31.139.75', '52.49.173.169', '52.214.14.220'];
const FREE_BOOSTS_PER_DAY = 3;

// Amounts in KES
const PLANS: Record<string, number> = {
  pro: 3250,
  elite: 9750,
};

const BOOST_PRICE: Record<string, number> = {
  "24h": 1300,
  "48h": 2340,
};

async function paystackPost(path: string, body: unknown, secret: string) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
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

async function activateSubscription(
  admin: ReturnType<typeof createClient>,
  venueId: string,
  tier: string,
  customerCode?: string,
  subscriptionCode?: string
) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  console.log(`[payments] activateSubscription tier=${tier} venue=${venueId}`);

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
    console.error(`[payments] subscription update error:`, updateError);
    throw updateError;
  }

  // Upsert: insert if no existing row (should rarely happen given DB trigger)
  if (!updated || updated.length === 0) {
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
      console.error(`[payments] subscription insert error:`, insertError);
      throw insertError;
    }
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

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

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
  const route = subPath.split("?")[0].split("/").filter(Boolean)[0] ?? "";

  try {
    if (req.method === "GET" && route === "subscription") {
      if (isAnon) return json({ error: "Unauthorized: No session token" }, 401, headers);

      const token = authHeader!.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        console.error("[payments] auth error:", authError);
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

      const isElite = sub?.tier === 'elite';
      let freeBoostsUsedToday = 0;
      if (isElite) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count } = await admin
          .from("post_boosts")
          .select("id", { count: 'exact', head: true })
          .eq("venue_id", venue.id)
          .eq("is_free", true)
          .gte("starts_at", todayStart.toISOString());
        freeBoostsUsedToday = count ?? 0;
      }

      if (!sub) {
        return json({
          tier: "free", status: "active",
          can_post: true, posts_today: 0, post_limit: 3,
          is_unlimited: false, current_period_end: null, cancel_at_period_end: false,
          free_boosts_used_today: 0, free_boosts_remaining: 0,
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
        free_boosts_used_today: freeBoostsUsedToday,
        free_boosts_remaining: isElite ? Math.max(0, FREE_BOOSTS_PER_DAY - freeBoostsUsedToday) : 0,
      }, 200, headers);
    }

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

    // Webhook — no JWT, verified via Paystack HMAC-SHA512
    if (req.method === "POST" && route === "webhook") {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (!clientIp || !PAYSTACK_IPS.includes(clientIp)) {
        console.warn(`[payments] webhook rejected — unknown IP: ${clientIp}`);
        return json({ error: "Unauthorized IP" }, 403, headers);
      }

      const signature = req.headers.get("x-paystack-signature") ?? "";
      const payload = await req.arrayBuffer();
      const valid = await verifyWebhookSignature(
        new Uint8Array(payload), signature, PAYSTACK_SECRET
      );
      if (!valid) return json({ error: "Invalid signature" }, 401, headers);

      const event = JSON.parse(new TextDecoder().decode(payload));
      const eventType = event.event ?? "";
      const data = event.data ?? {};

      console.log(`[payments] webhook ${eventType} ref=${data.reference}`);

      if (eventType === "charge.success") {
        const reference = data.reference ?? "";
        if (reference) {
          const { data: tx } = await admin
            .from("payment_transactions")
            .select("*")
            .eq("paystack_reference", reference)
            .single();

          if (!tx) {
            console.error(`[payments] no transaction for ref: ${reference}`);
            return json({ error: "Transaction not found" }, 404, headers);
          }

          // Guard against double-activation from webhook + /verify race
          if (tx.status === "pending") {
            const { error: updateError } = await admin
              .from("payment_transactions")
              .update({ status: "success", updated_at: new Date().toISOString() })
              .eq("id", tx.id);
            if (updateError) {
              console.error(`[payments] tx status update error:`, updateError);
            }
          }

          const expectedAmountMinor = Number(tx.amount_local) * 100;
          const paidAmount = data.amount ?? 0;
          const paidCurrency = data.currency ?? "";

          if (paidCurrency !== tx.currency && tx.currency === 'KES' && paidCurrency !== 'USD') {
            console.error(`[payments] currency mismatch ref=${reference} expected=${tx.currency} got=${paidCurrency}`);
            await admin.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
            return json({ error: "Invalid payment currency" }, 400, headers);
          }

          if (paidAmount < expectedAmountMinor * 0.95) {
            console.error(`[payments] amount mismatch ref=${reference} expected=${expectedAmountMinor} got=${paidAmount}`);
            await admin.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
            return json({ error: "Invalid payment amount" }, 400, headers);
          }

          if (tx.type === "subscription") {
            const customerCode = data.customer?.customer_code || data.customer_code;
            const subCode = data.subscription_code || data.subscription?.subscription_code || data.subscription;
            await activateSubscription(admin, tx.venue_id, tx.tier, customerCode, typeof subCode === 'string' ? subCode : undefined);
          } else if (tx.type === "boost") {
            const meta = tx.metadata ?? {};
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

    // All routes below require a valid session
    if (isAnon) return json({ error: "Unauthorized: No session token" }, 401, headers);

    const token = authHeader!.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error("[payments] auth error:", authError);
      return json({ error: "Unauthorized", details: authError?.message }, 401, headers);
    }

    const { data: venue } = await admin
      .from("venues").select("id").eq("owner_id", user.id).single();
    if (!venue) return json({ error: "Venue not found" }, 404, headers);
    const venueId = venue.id;

    if (req.method === "POST" && route === "initiate") {
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

      const { data: isAllowed, error: rlError } = await admin.rpc("check_rate_limit", {
        p_ip: clientIp,
        p_endpoint: `payments_initiate_${venueId}`,
        p_max_reqs: 10,
        p_window_seconds: 3600
      });

      if (!rlError && isAllowed === false) {
        return json({ error: "Too many payment attempts. Please try again later." }, 429, headers);
      }

      const body = await req.json().catch(() => ({}));
      const { type, email, tier, duration, post_id } = body;

      if (!email) return json({ error: "Email is required" }, 400, headers);
      if (!["subscription", "boost"].includes(type))
        return json({ error: "Invalid payment type" }, 400, headers);

      const currency = "KES";
      const refSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const reference = `hapa_${type}_${venueId.slice(0, 8)}_${refSuffix}`;

      let amount = 0;
      if (type === "subscription") {
        amount = PLANS[tier];
      } else {
        // Pro subscribers get a ~30% discount on boosts
        const { data: sub } = await admin
          .from("venue_subscriptions")
          .select("tier")
          .eq("venue_id", venueId)
          .eq("status", "active")
          .maybeSingle();
        const basePrice = BOOST_PRICE[duration] || 0;
        const isSubscriber = sub && (sub.tier === 'pro' || sub.tier === 'elite');
        amount = isSubscriber ? Math.round(basePrice * 0.7) : basePrice;
      }

      if (!amount || amount <= 0) return json({ error: "Invalid tier or duration" }, 400, headers);

      const metadata: Record<string, string> = {
        venue_id: venueId, payment_type: type, currency,
      };
      if (type === "subscription") metadata.tier = tier;
      if (type === "boost") { metadata.duration = duration; if (post_id) metadata.post_id = post_id; }

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

      let plan = undefined;
      if (type === "subscription") {
        plan = Deno.env.get(`PAYSTACK_PLAN_${tier.toUpperCase()}`);
      }

      const paystackData = await paystackPost(
        "/transaction/initialize",
        {
          email,
          amount: amount * 100,
          currency,
          reference,
          plan,
          metadata,
          callback_url: origin && origin.includes("www.gethapa.com")
            ? `${origin}/dashboard?reference=${reference}`
            : `${FRONTEND_URL}/payment/callback?ref=${reference}`,
        },
        PAYSTACK_SECRET
      );

      return json({
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code,
        reference,
      }, 200, headers);
    }

    // Elite members get 3 free boosts per day — no Paystack required
    if (req.method === "POST" && route === "free-boost") {
      const { data: sub } = await admin
        .from("venue_subscriptions")
        .select("tier, status")
        .eq("venue_id", venueId)
        .eq("status", "active")
        .single();

      if (!sub || sub.tier !== "elite") {
        return json({ error: "Free boosts are only available for Elite subscribers." }, 403, headers);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: usedToday } = await admin
        .from("post_boosts")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("is_free", true)
        .gte("starts_at", todayStart.toISOString());

      if ((usedToday ?? 0) >= FREE_BOOSTS_PER_DAY) {
        return json({
          error: `You have used all ${FREE_BOOSTS_PER_DAY} free boosts for today. They reset at midnight.`,
        }, 429, headers);
      }

      const body = await req.json().catch(() => ({}));
      const { duration, post_id } = body;
      const validDuration = ["24h", "48h"].includes(duration) ? duration : "24h";

      const now = new Date();
      const hours = validDuration === "48h" ? 48 : 24;
      const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

      const { error: insertErr } = await admin.from("post_boosts").insert({
        venue_id: venueId,
        post_id: post_id ?? null,
        transaction_id: null,
        is_free: true,
        duration_hours: hours,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      });

      if (insertErr) {
        console.error("[payments] free-boost insert error:", insertErr);
        return json({ error: "Failed to activate boost. Please try again." }, 500, headers);
      }

      const remaining = FREE_BOOSTS_PER_DAY - (usedToday ?? 0) - 1;
      return json({
        status: "success",
        type: "boost",
        duration: validDuration,
        free_boosts_remaining: remaining,
        message: `Post boosted for ${validDuration}. ${remaining} free boost${remaining !== 1 ? 's' : ''} remaining today.`,
      }, 200, headers);
    }

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

      if (psTx.status !== "success" || paidAmount < expectedAmountMinor * 0.95) {
        if (tx.status === "pending") {
          await admin.from("payment_transactions")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("paystack_reference", reference);
        }
        return json({ error: "Payment was not successful or invalid amount", status: "failed" }, 402, headers);
      }

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
        await activateSubscription(admin, tx.venue_id, tx.tier, customerCode, typeof subCode === 'string' ? subCode : undefined);
        return json({
          status: "success", type: "subscription", tier: tx.tier,
          message: `Your ${tx.tier} plan is now active.`,
        }, 200, headers);
      }

      if (tx.type === "boost") {
        const meta = tx.metadata ?? {};
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
