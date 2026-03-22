// Central subscription hook for tier and post-limit data

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export type SubscriptionTier = 'free' | 'pro' | 'elite';

export interface SubscriptionState {
  tier: SubscriptionTier;
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  postsToday: number;
  postLimit: number;
  canPost: boolean;
  isUnlimited: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT: SubscriptionState = {
  tier: 'free',
  status: 'active',
  postsToday: 0,
  postLimit: 3,
  canPost: true,
  isUnlimited: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,
  error: null,
  refresh: async () => {},
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT);

  const fetchSubscription = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const data = await apiFetch('/api/payments/subscription');
      setState(prev => ({
        ...prev,
        tier:               data.tier              ?? 'free',
        status:             data.status            ?? 'active',
        postsToday:         data.posts_today       ?? 0,
        postLimit:          data.post_limit        ?? 3,
        canPost:            data.can_post          ?? true,
        isUnlimited:        data.is_unlimited      ?? false,
        currentPeriodEnd:   data.current_period_end ?? null,
        cancelAtPeriodEnd:  data.cancel_at_period_end ?? false,
        loading: false,
        error: null,
      }));
    } catch (e: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: e?.message ?? 'Could not load subscription',
      }));
    }
  }, []);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  return { ...state, refresh: fetchSubscription };
}

// Tier helpers

export function isPro(tier: SubscriptionTier): boolean {
  return tier === 'pro' || tier === 'elite';
}

export function isElite(tier: SubscriptionTier): boolean {
  return tier === 'elite';
}

export function getTierLabel(tier: SubscriptionTier): string {
  const labels: Record<SubscriptionTier, string> = { free: 'Free', pro: 'Pro', elite: 'Elite' };
  return labels[tier] ?? 'Free';
}

export function getTierColor(tier: SubscriptionTier): string {
  const colors: Record<SubscriptionTier, string> = {
    free: '#888888', pro: '#BD3115', elite: '#FFD700',
  };
  return colors[tier] ?? '#888888';
}
