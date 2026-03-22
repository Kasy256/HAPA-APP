// HAPA-FRONTEND/lib/subscription.ts
// Payment initiation + verification helpers.
// All network calls route through apiFetch → Supabase Edge Function "payments".

import { apiFetch } from '@/lib/api';
import { Linking } from 'react-native';

export type PaymentType      = 'subscription' | 'boost';
export type SubscriptionTier = 'pro' | 'elite';
export type BoostDuration    = '24h' | '48h';

// ── Pricing display ─────────────────────────────────────────────────────────
export const PRICING = {
  pro: {
    price: '$25/mo',
    label: 'Pro',
    features: [
      'Unlimited daily posts',
      'Guaranteed top 5 placement',
      'Priority feed ranking',
      'Full engagement metrics',
      'Verified venue badge',
    ],
  },
  elite: {
    price: '$75/mo',
    label: 'Elite',
    features: [
      'Everything in Pro',
      '1 event spotlight / month',
      'City discovery banner',
      'Analytics export',
      'Multi-location management',
      'Priority support',
    ],
  },
} as const;

export const BOOST_PRICING = {
  '24h': '$10',
  '48h': '$18',
} as const;

export function getPriceLabel(tier: SubscriptionTier): string {
  return PRICING[tier].price;
}

export function getBoostPriceLabel(duration: BoostDuration): string {
  return BOOST_PRICING[duration];
}

// ── Initiate a subscription payment ───────────────────────────────────────────
export async function initiateSubscription(params: {
  tier: SubscriptionTier;
  email: string;
}): Promise<{ reference: string; authorization_url: string }> {
  return apiFetch('/api/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({ type: 'subscription', currency: 'USD', ...params }),
  });
}

// ── Initiate a boost payment ───────────────────────────────────────────────────
export async function initiateBoost(params: {
  postId: string;
  duration: BoostDuration;
  email: string;
}): Promise<{ reference: string; authorization_url: string }> {
  return apiFetch('/api/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({
      type: 'boost',
      currency: 'USD',
      duration: params.duration,
      post_id: params.postId,
      email: params.email,
    }),
  });
}

// ── Verify payment after Paystack redirect ─────────────────────────────────────
export async function verifyPayment(reference: string): Promise<{
  status: string;
  type: string;
  tier?: string;
  message: string;
}> {
  return apiFetch('/api/payments/verify', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
}

// ── Open Paystack payment URL in browser ──────────────────────────────────────
export async function openPaystackUrl(url: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  } else {
    throw new Error('Could not open payment page. Please try again.');
  }
}
