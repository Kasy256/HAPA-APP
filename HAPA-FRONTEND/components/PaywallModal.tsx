// HAPA-FRONTEND/components/PaywallModal.tsx
// Drop-in paywall bottom sheet. Venue-side only — never shown to explorers.
//
// Usage:
//   <PaywallModal
//     visible={showPaywall}
//     onClose={() => setShowPaywall(false)}
//     reason="post_limit"
//     postsToday={3}
//   />

import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';

export type PaywallReason =
  | 'post_limit'
  | 'top5'
  | 'boost'
  | 'analytics'
  | 'unlimited';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  reason?: PaywallReason;
  postsToday?: number;
}

const REASON_COPY: Record<PaywallReason, { title: string; subtitle: string }> = {
  post_limit: {
    title: "You've hit today's limit",
    subtitle:
      'Free venues can post 3 vibes per day. Upgrade to Pro for unlimited posts — post every hour on a busy night.',
  },
  top5: {
    title: 'Guaranteed Top 5 is a Pro feature',
    subtitle:
      'Free venues appear in the feed based on activity. Pro venues are guaranteed a top 5 slot every day they post.',
  },
  boost: {
    title: 'Boost this post',
    subtitle:
      'Pin your post to the top of your city\'s discovery feed for 24 or 48 hours. No subscription needed — pay once per boost.',
  },
  analytics: {
    title: 'Full analytics — Pro only',
    subtitle:
      'See views, likes, and profile visits over time. Free tier shows today\'s counts only.',
  },
  unlimited: {
    title: 'Unlock more with Pro',
    subtitle:
      'Unlimited posts, guaranteed top 5, verified badge, and full metrics — from UGX 112,000 per month.',
  },
};

const PRO_FEATURES = [
  'Unlimited daily vibe posts',
  'Guaranteed top 5 placement daily',
  'Priority in city feed ranking',
  'Full engagement metrics',
  'Verified venue badge',
];

export function PaywallModal({ visible, onClose, reason = 'unlimited', postsToday }: PaywallModalProps) {
  const router = useRouter();
  const copy   = REASON_COPY[reason];
  const isBoost = reason === 'boost';

  const handleUpgrade = () => { onClose(); router.push('/(venue)/subscription' as any); };
  const handleBoost   = () => { onClose(); router.push('/(venue)/subscription?tab=boost' as any); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.iconWrap}>
              <Ionicons name={isBoost ? 'rocket' : 'star'} size={32} color={Colors.cta.primary} />
            </View>

            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>

            {reason === 'post_limit' && postsToday !== undefined && (
              <View style={styles.limitBadge}>
                <Text style={styles.limitText}>{postsToday} / 3 posts used today</Text>
              </View>
            )}

            {!isBoost && (
              <View style={styles.featureList}>
                <Text style={styles.featureHeader}>What you get with Pro</Text>
                {PRO_FEATURES.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={styles.featureDot} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.priceHint}>
              {isBoost
                ? 'From UGX 37,000 · KES 1,300 · $10 for 24 hours'
                : 'From UGX 112,000 · KES 3,900 · $30 per month'}
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={isBoost ? handleBoost : handleUpgrade}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {isBoost ? 'Boost This Post' : 'Upgrade to Pro'}
              </Text>
            </TouchableOpacity>

            {!isBoost && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleBoost} activeOpacity={0.7}>
                <Text style={styles.secondaryBtnText}>Just boost one event — from $10</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onClose} style={styles.dismissBtn}>
              <Text style={styles.dismissText}>Maybe later</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#1C1C1C', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '90%', position: 'relative' },
  handle:          { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  closeBtn:        { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  content:         { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, alignItems: 'center' },
  iconWrap:        { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(189,49,21,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title:           { fontSize: 22, fontWeight: '800', color: 'white', textAlign: 'center', marginBottom: 10 },
  subtitle:        { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  limitBadge:      { backgroundColor: 'rgba(189,49,21,0.15)', borderWidth: 1, borderColor: 'rgba(189,49,21,0.3)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  limitText:       { fontSize: 13, fontWeight: '700', color: Colors.cta.primary, letterSpacing: 0.3 },
  featureList:     { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 16 },
  featureHeader:   { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  featureRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  featureDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.cta.primary, flexShrink: 0 },
  featureText:     { fontSize: 14, color: 'rgba(255,255,255,0.75)', flex: 1 },
  priceHint:       { fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 20, letterSpacing: 0.3 },
  primaryBtn:      { backgroundColor: Colors.cta.primary, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14, width: '100%', alignItems: 'center', marginBottom: 10 },
  primaryBtnText:  { color: 'white', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  secondaryBtn:    { borderWidth: 1, borderColor: 'rgba(189,49,21,0.4)', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, width: '100%', alignItems: 'center', marginBottom: 10 },
  secondaryBtnText:{ color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 14 },
  dismissBtn:      { padding: 12, marginTop: 4 },
  dismissText:     { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '500' },
});
