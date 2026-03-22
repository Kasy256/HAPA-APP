// HAPA-FRONTEND/app/(venue)/subscription.tsx
// Subscription & boost purchase screen for venue owners — USD pricing only.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import {
  type BoostDuration,
  type SubscriptionTier,
  PRICING,
  BOOST_PRICING,
  getPriceLabel,
  getBoostPriceLabel,
  initiateBoost,
  initiateSubscription,
  openPaystackUrl,
  verifyPayment,
} from '@/lib/subscription';
import { useSubscription } from '@/hooks/useSubscription';

type Tab = 'plans' | 'boost';

export default function SubscriptionScreen() {
  const router       = useRouter();
  const params       = useLocalSearchParams<{ tab?: string; post_id?: string }>();
  const subscription = useSubscription();

  const [activeTab,     setActiveTab]     = useState<Tab>(params.tab === 'boost' ? 'boost' : 'plans');
  const [selectedTier,  setSelectedTier]  = useState<SubscriptionTier>('pro');
  const [selectedBoost, setSelectedBoost] = useState<BoostDuration>('24h');
  const [email,         setEmail]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [pendingRef,    setPendingRef]    = useState<string | null>(null);

  // ── Deep link listener (Paystack callback) ─────────────────────────────────
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      const match = url.match(/[?&]ref=([^&]+)/);
      if (match) await handleVerify(decodeURIComponent(match[1]));
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });
    return () => sub.remove();
  }, []);

  // ── Poll when we have a pending reference ──────────────────────────────────
  useEffect(() => {
    if (!pendingRef) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 20) { clearInterval(interval); setPendingRef(null); return; }
      try {
        const result = await verifyPayment(pendingRef);
        if (result.status === 'success') {
          clearInterval(interval);
          setPendingRef(null);
          await subscription.refresh();
          Alert.alert('Payment Successful', result.message ?? 'Your plan is now active.', [
            { text: 'Done', onPress: () => router.back() },
          ]);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingRef]);

  const handleVerify = useCallback(async (ref: string) => {
    try {
      setLoading(true);
      const result = await verifyPayment(ref);
      if (result.status === 'success') {
        await subscription.refresh();
        Alert.alert('Payment Successful', result.message ?? 'Your plan is active.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Verification failed', e?.message ?? 'Please contact support.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubscribe = async () => {
    if (!email.includes('@')) {
      Alert.alert('Email required', 'Enter your email address to continue.');
      return;
    }
    try {
      setLoading(true);
      const { authorization_url, reference } = await initiateSubscription({ tier: selectedTier, email });
      setPendingRef(reference);
      await openPaystackUrl(authorization_url);
    } catch (e: any) {
      Alert.alert('Payment Error', e?.message ?? 'Could not start payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleBoost = async () => {
    if (!email.includes('@')) {
      Alert.alert('Email required', 'Enter your email address to continue.');
      return;
    }
    try {
      setLoading(true);
      const { authorization_url, reference } = await initiateBoost({
        postId: params.post_id ?? '', duration: selectedBoost, email,
      });
      setPendingRef(reference);
      await openPaystackUrl(authorization_url);
    } catch (e: any) {
      Alert.alert('Payment Error', e?.message ?? 'Could not start payment.');
    } finally {
      setLoading(false);
    }
  };

  const isCurrentPlan = (tier: SubscriptionTier) => subscription.tier === tier;

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plans & Pricing</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Current plan badge */}
      {!subscription.loading && (
        <View style={styles.currentPlanBadge}>
          <Ionicons
            name={subscription.tier === 'free' ? 'star-outline' : 'star'}
            size={14}
            color={subscription.tier === 'free' ? 'rgba(255,255,255,0.4)' : Colors.cta.primary}
          />
          <Text style={styles.currentPlanText}>
            Current plan:{' '}
            <Text style={[styles.bold, { color: subscription.tier === 'free' ? 'rgba(255,255,255,0.5)' : Colors.cta.primary }]}>
              {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}
            </Text>
          </Text>
          {subscription.tier !== 'free' && (
            <Text style={styles.currentPlanSub}>
              {subscription.isUnlimited ? 'Unlimited posts' : `${subscription.postsToday}/${subscription.postLimit} today`}
            </Text>
          )}
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabs}>
        {(['plans', 'boost'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'plans' ? 'Monthly Plans' : 'Boost a Post'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── PLANS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'plans' && (
          <>
            {(['pro', 'elite'] as SubscriptionTier[]).map(tier => (
              <TouchableOpacity
                key={tier}
                style={[styles.planCard, selectedTier === tier && styles.planCardSelected, isCurrentPlan(tier) && styles.planCardCurrent]}
                onPress={() => setSelectedTier(tier)}
                activeOpacity={0.85}
              >
                {tier === 'pro' && !isCurrentPlan(tier) && (
                  <View style={styles.badge}><Text style={styles.badgeText}>Most Popular</Text></View>
                )}
                {isCurrentPlan(tier) && (
                  <View style={[styles.badge, { backgroundColor: '#FFD700' }]}>
                    <Text style={[styles.badgeText, { color: '#000' }]}>Current Plan</Text>
                  </View>
                )}
                <View style={[styles.planHeader, { marginTop: 18 }]}>
                  <View style={styles.row}>
                    <Radio selected={selectedTier === tier} />
                    <Text style={styles.planName}>{PRICING[tier].label}</Text>
                  </View>
                  <Text style={styles.planPrice}>{getPriceLabel(tier)}</Text>
                </View>
                <Text style={styles.planPeriod}>billed monthly · Paystack converts to your local currency</Text>
                <View style={styles.planFeatures}>
                  {PRICING[tier].features.map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <View style={styles.featureDot} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}

            <EmailInput value={email} onChange={setEmail} />

            <TouchableOpacity
              style={[styles.ctaBtn, (loading || isCurrentPlan(selectedTier)) && styles.ctaBtnDisabled]}
              onPress={handleSubscribe}
              disabled={loading || isCurrentPlan(selectedTier)}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="white" /> : (
                <Text style={styles.ctaBtnText}>
                  {isCurrentPlan(selectedTier)
                    ? `You're on ${PRICING[selectedTier].label}`
                    : `Upgrade to ${PRICING[selectedTier].label} — ${getPriceLabel(selectedTier)}`}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.legal}>
              Payments processed securely by Paystack. Cancel anytime.
            </Text>
          </>
        )}

        {/* ── BOOST TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'boost' && (
          <>
            <Text style={styles.boostIntro}>
              Pin your post to the top of your city's discovery feed. One-time payment — no subscription needed.
            </Text>

            {(['24h', '48h'] as BoostDuration[]).map(dur => (
              <TouchableOpacity
                key={dur}
                style={[styles.boostCard, selectedBoost === dur && styles.boostCardSelected]}
                onPress={() => setSelectedBoost(dur)}
                activeOpacity={0.85}
              >
                <View style={styles.row}>
                  <Radio selected={selectedBoost === dur} />
                  <View>
                    <Text style={styles.boostDuration}>{dur} boost</Text>
                    <Text style={styles.boostSub}>Pinned at top for {dur === '24h' ? '24 hours' : '48 hours'}</Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>{getBoostPriceLabel(dur)}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={styles.infoText}>
                Boosted posts are pinned above all other venue cards — including Pro venues — for the duration you choose.
              </Text>
            </View>

            <EmailInput value={email} onChange={setEmail} />

            <TouchableOpacity
              style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
              onPress={handleBoost}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="white" /> : (
                <Text style={styles.ctaBtnText}>
                  Boost for {selectedBoost} — {getBoostPriceLabel(selectedBoost)}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.legal}>One-time payment. Boost activates immediately after confirmation.</Text>
          </>
        )}

        {/* Pending verification indicator */}
        {pendingRef && (
          <View style={styles.pendingBox}>
            <ActivityIndicator size="small" color={Colors.cta.primary} />
            <Text style={styles.pendingText}>Waiting for payment confirmation...</Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </ScreenWrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[rStyles.outer, selected && rStyles.outerSelected]}>
      {selected && <View style={rStyles.inner} />}
    </View>
  );
}
const rStyles = StyleSheet.create({
  outer:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  outerSelected: { borderColor: Colors.cta.primary },
  inner:         { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.cta.primary },
});

function EmailInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={eStyles.wrap}>
      <Text style={eStyles.label}>Email for payment receipt</Text>
      <TextInput
        style={eStyles.input}
        placeholder="your@email.com"
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={value}
        onChangeText={onChange}
        keyboardType="email-address"
        autoCapitalize="none"
      />
    </View>
  );
}
const eStyles = StyleSheet.create({
  wrap:  { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: 'white', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  backBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle:       { fontSize: 18, fontWeight: '800', color: 'white', letterSpacing: 0.3 },
  currentPlanBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  currentPlanText:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', flex: 1 },
  currentPlanSub:    { fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  bold:              { fontWeight: '700' },
  tabs:              { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 },
  tab:               { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive:         { backgroundColor: Colors.cta.primary },
  tabText:           { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  tabTextActive:     { color: 'white' },
  scroll:            { paddingHorizontal: 16, paddingTop: 4 },
  planCard:          { backgroundColor: '#1C1C1C', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', position: 'relative' },
  planCardSelected:  { borderColor: Colors.cta.primary, backgroundColor: 'rgba(189,49,21,0.06)' },
  planCardCurrent:   { borderColor: '#FFD700' },
  badge:             { position: 'absolute', top: -1, right: 16, backgroundColor: Colors.cta.primary, paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  badgeText:         { fontSize: 10, fontWeight: '800', color: 'white', letterSpacing: 0.5 },
  planHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  row:               { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  planName:          { fontSize: 18, fontWeight: '800', color: 'white' },
  planPrice:         { fontSize: 18, fontWeight: '800', color: Colors.cta.primary },
  planPeriod:        { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14, marginLeft: 30 },
  planFeatures:      { marginLeft: 30, gap: 8 },
  featureRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.cta.primary, flexShrink: 0 },
  featureText:       { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  boostIntro:        { fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 21, marginBottom: 20 },
  boostCard:         { backgroundColor: '#1C1C1C', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boostCardSelected: { borderColor: Colors.cta.primary, backgroundColor: 'rgba(189,49,21,0.06)' },
  boostDuration:     { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 2 },
  boostSub:          { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  infoBox:           { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, marginBottom: 20, alignItems: 'flex-start' },
  infoText:          { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18 },
  ctaBtn:            { backgroundColor: Colors.cta.primary, paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  ctaBtnDisabled:    { opacity: 0.6 },
  ctaBtnText:        { color: 'white', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  legal:             { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 17, marginBottom: 8 },
  pendingBox:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(189,49,21,0.1)', borderRadius: 10, padding: 14, marginTop: 16 },
  pendingText:       { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
});
