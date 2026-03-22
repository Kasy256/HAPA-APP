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
  free: {
    price: '$0/mo',
    label: 'Free',
    features: [
      'Up to 3 vibe posts per day',
      'Permanent venue profile',
      'Appears in discovery feed',
      'Basic stats (likes + views)',
      'Eligible to purchase boosts',
    ],
  },
  pro: {
    price: '$25/mo',
    label: 'Pro',
    features: [
      'Unlimited vibe posts',
      'Priority ranking in discovery feed',
      'Verified venue badge',
      'Full stats (likes, views, profile visits)',
      'Discounted boosts ($7 instead of $10)',
    ],
  },
  elite: {
    price: '$75/mo',
    label: 'Elite',
    features: [
      'Everything in Pro',
      '3 free daily boosts',
      '1 Event Spotlight per month',
      'Daily Venue Ads (Coming Soon)',
      'Advanced stats & trends',
      'Multi-location management',
    ],
  },
} as const;

export const BOOST_PRICING = {
  '24h': { base: 10, discounted: 7 },
  '48h': { base: 18, discounted: 13 }, // Estimated discount for 48h
} as const;

export function getPriceLabel(tier: SubscriptionTier | 'free'): string {
  if (tier === 'free') return PRICING.free.price;
  return PRICING[tier].price;
}

export function getBoostPriceLabel(duration: BoostDuration, currentTier?: string): string {
  const isDiscounted = currentTier === 'pro' || currentTier === 'elite';
  const price = isDiscounted ? BOOST_PRICING[duration].discounted : BOOST_PRICING[duration].base;
  return `$${price}`;
}

// ── Initiate a subscription (External) ───────────────────────────────────────────
// DEPRECATED: Handled via Linking.openURL in components
// initiateSubscription, initiateBoost, verifyPayment, cancelSubscription removed for compliance.
