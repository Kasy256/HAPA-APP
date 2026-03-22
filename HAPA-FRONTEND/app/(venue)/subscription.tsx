import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Platform,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
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
} from '@/lib/subscription';
import { useSubscription } from '@/hooks/useSubscription';
import { openDashboard } from '@/lib/openSubscription';
import { apiFetch } from '@/lib/api';

type Tab = 'plans' | 'boost';

export default function SubscriptionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ tab?: string; post_id?: string }>();
    const subscription = useSubscription();

    const [activeTab, setActiveTab] = useState<Tab>(params.tab === 'boost' ? 'boost' : 'plans');
    const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('pro');
    const [selectedBoost, setSelectedBoost] = useState<BoostDuration>('24h');
    const [loadingVenue, setLoadingVenue] = useState(true);
    const [venue, setVenue] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        const loadVenue = async () => {
            try {
                const res = await apiFetch('/api/venues/me', { auth: true });
                if (res.venue) {
                    setVenue({ id: res.venue.id, name: res.venue.name });
                }
            } catch (e) {
                console.error('[Subscription] Failed to load venue:', e);
            } finally {
                setLoadingVenue(false);
            }
        };
        loadVenue();
    }, []);

    const handleExternalRedirect = async (type: 'subscription' | 'boost') => {
        if (!venue) {
            Alert.alert("Error", "Could not identify your venue. Please try again or contact support.");
            return;
        }

        Alert.alert(
            "Manage on Web",
            "To ensure platform compliance and secure regional payments, subscriptions are managed through our web dashboard.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Continue to Web", 
                    onPress: () => openDashboard({
                        venueId: venue.id,
                        venueName: venue.name,
                        tab: type === 'subscription' ? 'plans' : 'boost',
                        postId: params.post_id
                    })
                }
            ]
        );
    };

    const isCurrentPlan = (tier: SubscriptionTier) => subscription.tier === tier;

    return (
        <ScreenWrapper style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Plans & Boosting</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Compliance Note */}
            <View style={styles.complianceNote}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.cta.primary} />
                <Text style={styles.complianceText}>
                    Managed via our secure official web dashboard for platform compliance.
                </Text>
            </View>

            {/* Current plan badge */}
            {!subscription.loading && (
                <View style={styles.currentPlanBadge}>
                    <Ionicons
                        name={subscription.tier === 'free' ? 'star-outline' : 'star'}
                        size={14}
                        color={subscription.tier === 'free' ? 'rgba(255,255,255,0.4)' : Colors.cta.primary}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.currentPlanText}>
                            Current plan:{' '}
                            <Text style={[styles.bold, { color: subscription.tier === 'free' ? 'rgba(255,255,255,0.5)' : Colors.cta.primary }]}>
                                {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}
                            </Text>
                        </Text>
                    </View>
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
                                <Text style={styles.planPeriod}>billed monthly · Managed on web</Text>
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

                        <TouchableOpacity
                            style={[styles.ctaBtn, isCurrentPlan(selectedTier) && styles.ctaBtnDisabled]}
                            onPress={() => handleExternalRedirect('subscription')}
                            disabled={isCurrentPlan(selectedTier)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.ctaBtnText}>
                                {isCurrentPlan(selectedTier)
                                    ? `You're on ${PRICING[selectedTier].label}`
                                    : `Manage Plan on Website`}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.legal}>
                            Cancel or change your subscription anytime via the web dashboard.
                        </Text>
                    </>
                )}

                {activeTab === 'boost' && (
                    <>
                        <Text style={styles.boostIntro}>
                            Pin your post to the top of your city's discovery feed. One-time payment via web.
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
                                <Text style={styles.planPrice}>{getBoostPriceLabel(dur, subscription.tier)}</Text>
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={styles.ctaBtn}
                            onPress={() => handleExternalRedirect('boost')}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.ctaBtnText}>
                                Boost on Website
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.legal}>Boost activates immediately after web confirmation.</Text>
                    </>
                )}

                <View style={{ height: 60 }} />
            </ScrollView>
        </ScreenWrapper>
    );
}

function Radio({ selected }: { selected: boolean }) {
    return (
        <View style={[rStyles.outer, selected && rStyles.outerSelected]}>
            {selected && <View style={rStyles.inner} />}
        </View>
    );
}
const rStyles = StyleSheet.create({
    outer: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    outerSelected: { borderColor: Colors.cta.primary },
    inner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.cta.primary },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: 'white', letterSpacing: 0.3 },
    currentPlanBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    currentPlanText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', flex: 1 },
    bold: { fontWeight: '700' },
    tabs: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabActive: { backgroundColor: Colors.cta.primary },
    tabText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
    tabTextActive: { color: 'white' },
    scroll: { paddingHorizontal: 16, paddingTop: 4 },
    planCard: { backgroundColor: '#1C1C1C', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', position: 'relative' },
    planCardSelected: { borderColor: Colors.cta.primary, backgroundColor: 'rgba(189,49,21,0.06)' },
    planCardCurrent: { borderColor: '#FFD700' },
    badge: { position: 'absolute', top: -1, right: 16, backgroundColor: Colors.cta.primary, paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
    badgeText: { fontSize: 10, fontWeight: '800', color: 'white', letterSpacing: 0.5 },
    planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    planName: { fontSize: 18, fontWeight: '800', color: 'white' },
    planPrice: { fontSize: 18, fontWeight: '800', color: Colors.cta.primary },
    planPeriod: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14, marginLeft: 30 },
    planFeatures: { marginLeft: 30, gap: 8 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    featureDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.cta.primary, flexShrink: 0 },
    featureText: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
    boostIntro: { fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 21, marginBottom: 20 },
    boostCard: { backgroundColor: '#1C1C1C', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    boostCardSelected: { borderColor: Colors.cta.primary, backgroundColor: 'rgba(189,49,21,0.06)' },
    boostDuration: { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 2 },
    boostSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    ctaBtn: { backgroundColor: Colors.cta.primary, paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginTop: 12, marginBottom: 12 },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaBtnText: { color: 'white', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
    legal: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 17, marginBottom: 8 },
    complianceNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', margin: 16, marginTop: 0, padding: 12, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    complianceText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 },
});
