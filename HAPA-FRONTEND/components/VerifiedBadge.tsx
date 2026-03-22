// components/VerifiedBadge.tsx
// Custom verify badge — shown next to venue names for Pro/Elite subscribers.

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const VERIFY_PRO   = require('@/assets/images/verify.png');
const VERIFY_ELITE = require('@/assets/images/verify-Elite.png');

type Props = {
  tier?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
};

const SIZES = { sm: 16, md: 20, lg: 24 };

export function VerifiedBadge({ tier, size = 'sm', showLabel = false }: Props) {
  if (!tier || tier === 'free') return null;

  const iconSize = SIZES[size];
  const isElite = tier === 'elite';
  const labelColor = isElite ? '#FFD700' : '#1D9BF0';
  const badgeSource = isElite ? VERIFY_ELITE : VERIFY_PRO;

  return (
    <View style={styles.row}>
      <Image
        source={badgeSource}
        style={{ width: iconSize, height: iconSize }}
        resizeMode="contain"
      />
      {showLabel && (
        <Text style={[styles.label, { color: labelColor, fontSize: iconSize * 0.65 }]}>
          {isElite ? 'Elite' : 'Verified'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
