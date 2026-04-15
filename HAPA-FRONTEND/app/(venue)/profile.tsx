
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, clearAuthTokens } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MediaPreview } from '@/components/MediaPreview';
import { SkeletonBox, SkeletonCircle } from '@/components/Skeleton';
import { useSubscription, getTierColor, getTierLabel } from '@/hooks/useSubscription';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { openManage } from '@/lib/openSubscription';

type Venue = {
    id: string;
    name: string;
    type?: string;
    city?: string;
    area?: string;
    images?: string[];
};

type Post = {
    id: string;
    media_url: string;
};

export default function VenueProfileScreen() {
    const router = useRouter();
    const [venue, setVenue] = useState<Venue | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const subscription = useSubscription();

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const venueRes = await apiFetch('/api/venues/me', { auth: true });
                if (venueRes.venue) {
                    setVenue(venueRes.venue);
                    const postsRes = await apiFetch(`/api/posts/venue/${venueRes.venue.id}`);
                    setPosts(postsRes.posts || []);
                }
            } catch {
                setVenue(null);
                setPosts([]);
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
    }, []);

    const handleSignOut = async () => {
        try {
            // Perform full sign out
            await supabase.auth.signOut();
            await clearAuthTokens();
            await AsyncStorage.removeItem('hapa_active_role');
            await new Promise(resolve => setTimeout(resolve, 50)); // Ensure AsyncStorage writes commit

            router.replace('/');

        } catch (err) {
            console.error('[Logout] Critical failure:', err);
            // Attempt cleanup even on failure
            await AsyncStorage.removeItem('hapa_active_role').catch(() => {});
            router.replace('/');
        }
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            "Delete Account",
            "Are you absolutely sure you want to delete your account? This action is permanent and will delete all your venues, vibes, and subscription data. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete Forever",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            Alert.alert("Deleting...", "Please wait while we delete your account.");

                            await apiFetch('/api/auth/delete-account', { method: 'DELETE', auth: true });

                            // Clear everything before navigating
                            await supabase.auth.signOut();
                            await clearAuthTokens();
                            await AsyncStorage.removeItem('hapa_active_role');
                            await new Promise(resolve => setTimeout(resolve, 50));

                            router.replace('/');

                        } catch (error: any) {
                            Alert.alert("Error", error.message || "Failed to delete account. Please contact support.");
                        }
                    }
                }
            ]
        );
    };

    const handleCancelPlan = () => {
        if (!venue) return;
        Alert.alert(
            'Manage Subscription',
            `To cancel or change your plan, please visit our secure web dashboard.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Go to Dashboard', 
                    onPress: () => openManage({
                        venueId: venue.id,
                        venueName: venue.name,
                    })
                },
            ]
        );
    };

    if (!venue && !loading) {
        return (
            <ScreenWrapper>
                <View style={[styles.headerActions, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        activeOpacity={0.7}
                        onPress={handleSignOut}
                    >
                        <Ionicons name="log-out-outline" size={20} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                        activeOpacity={0.7}
                        onPress={handleDeleteAccount}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                </View>

                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <Text style={{ color: Colors.text.primary, textAlign: 'center', marginBottom: 16 }}>
                        No venue profile found yet.
                    </Text>
                    <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => router.push('/venue-onboarding')}
                    >
                        <Text style={styles.editButtonText}>Create Venue Profile</Text>
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        );
    }

    const coverImage = venue?.images?.[0];

    return (
        <ScreenWrapper>
            <ScrollView>
                {loading ? (
                    <SkeletonBox width="100%" height={180} borderRadius={0} />
                ) : coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} />
                ) : (
                    <View style={[styles.coverImage, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
                )}

                {/* Header Actions */}
                <View style={[styles.headerActions, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        activeOpacity={0.7}
                        onPress={handleSignOut}
                    >
                        <Ionicons name="log-out-outline" size={20} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                        activeOpacity={0.7}
                        onPress={handleDeleteAccount}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                </View>

                <View style={styles.profileSection}>
                    <View style={styles.avatarContainer}>
                        {loading ? (
                            <SkeletonCircle size={100} />
                        ) : coverImage ? (
                            <Image source={{ uri: coverImage }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
                        )}
                    </View>

                    <View style={styles.infoContainer}>
                        {loading ? (
                            <>
                                <SkeletonBox width={160} height={16} borderRadius={8} />
                                <View style={{ height: 8 }} />
                                <SkeletonBox width={100} height={12} borderRadius={8} />
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.name} numberOfLines={1}>{venue?.name}</Text>
                                    <VerifiedBadge tier={subscription.tier} size="md" />
                                </View>
                                <Text style={styles.category}>{venue?.type || 'Venue'}</Text>
                            </>
                        )}
                    </View>

                    {/* Info Grid */}
                    <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>Location</Text>
                            {loading ? (
                                <SkeletonBox width={120} height={12} borderRadius={8} />
                            ) : (
                                <Text style={styles.infoValue}>
                                    {venue?.area}, {venue?.city}
                                </Text>
                            )}
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => router.push('/(venue)/edit-profile')}
                    >
                        <Text style={styles.editButtonText}>Edit Profile</Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                        <TouchableOpacity
                            style={[styles.editButton, { flex: 1, marginTop: 0 }]}
                            onPress={() => Linking.openURL('https://www.gethapa.com')}
                        >
                            <Text style={styles.editButtonText}>Website</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.editButton, { flex: 1, marginTop: 0 }]}
                            onPress={() => Linking.openURL('https://www.gethapa.com/Privacy.html')}
                        >
                            <Text style={styles.editButtonText}>Privacy</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.editButton, { flex: 1, marginTop: 0 }]}
                            onPress={() => Linking.openURL('https://www.gethapa.com/Terms.html')}
                        >
                            <Text style={styles.editButtonText}>Terms</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Plan & Billing */}
                    {!subscription.loading && (
                        <View style={styles.planCard}>
                            <View style={styles.planCardHeader}>
                                <View style={styles.planCardLeft}>
                                    <View style={[styles.tierBadge, { backgroundColor: getTierColor(subscription.tier) + '22' }]}>
                                        <Ionicons
                                            name={subscription.tier === 'free' ? 'star-outline' : 'star'}
                                            size={13}
                                            color={getTierColor(subscription.tier)}
                                        />
                                        <Text style={[styles.tierBadgeText, { color: getTierColor(subscription.tier) }]}>
                                            {getTierLabel(subscription.tier)}
                                        </Text>
                                    </View>
                                    <Text style={styles.planCardTitle}>Plan & Billing</Text>
                                </View>
                                <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.3)" />
                            </View>

                            {subscription.tier !== 'free' && subscription.currentPeriodEnd && (
                                <Text style={styles.planRenewal}>
                                    {subscription.cancelAtPeriodEnd
                                        ? `⚠️ Cancels on ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                        : `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                    }
                                </Text>
                            )}

                            <View style={styles.planActions}>
                                <TouchableOpacity
                                    style={styles.planUpgradeBtn}
                                    onPress={() => router.push('/(venue)/subscription')}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="rocket-outline" size={15} color="white" />
                                    <Text style={styles.planUpgradeBtnText}>
                                        {subscription.tier === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                                    </Text>
                                </TouchableOpacity>

                                {subscription.tier !== 'free' && !subscription.cancelAtPeriodEnd && (
                                    <TouchableOpacity
                                        style={[styles.planCancelBtn, cancelling && { opacity: 0.5 }]}
                                        onPress={handleCancelPlan}
                                        disabled={cancelling}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.planCancelBtnText}>
                                            {cancelling ? 'Cancelling...' : 'Cancel Plan'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    <Text style={styles.sectionTitle}>Your Posts</Text>

                    <View style={styles.grid}>
                        {loading
                            ? [1, 2, 3, 4, 5, 6].map(i => (
                                <View key={i} style={styles.gridItem}>
                                    <SkeletonBox width="100%" height={180} borderRadius={8} />
                                </View>
                            ))
                            : posts.map(post => (
                                <View key={post.id} style={styles.gridItem}>
                                    <MediaPreview uri={post.media_url} style={styles.gridImage} />
                                </View>
                            ))}
                    </View>

                </View>
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    coverImage: {
        width: '100%',
        height: 180,
    },
    profileSection: {
        padding: 20,
        marginTop: -60,
    },
    headerActions: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
    },
    iconButton: {
        padding: 8,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
    },
    avatarContainer: {
        alignSelf: 'center',
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: '#000',
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    infoContainer: {
        alignItems: 'center',
        marginTop: 8, // Reduced from 12
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.text.primary,
        flexShrink: 1,
    },
    category: {
        fontSize: 14, // Reduced from 16
        color: Colors.text.secondary,
        marginTop: 2,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 30, // Reduced gap
        marginTop: 16, // Reduced from 24
    },
    stat: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18, // Reduced from 20
        fontWeight: 'bold',
        color: Colors.text.primary,
    },
    statLabel: {
        color: Colors.text.secondary,
        fontSize: 12,
    },
    infoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20, // Reduced from 30
        paddingHorizontal: 0, // Removed padding
        gap: 16,
    },
    infoItem: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)', // Added background
        padding: 10,
        borderRadius: 12,
    },
    infoLabel: {
        color: Colors.text.primary,
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    infoValue: {
        color: Colors.text.secondary,
        fontSize: 11,
        textAlign: 'center',
    },
    editButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 12,
        borderRadius: 12,
        marginTop: 16, // Reduced from 24
        alignItems: 'center',
    },
    editButtonText: {
        color: Colors.text.primary,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 18, // Reduced from 20
        fontWeight: 'bold',
        color: Colors.text.primary,
        marginTop: 24, // Reduced from 32
        marginBottom: 12, // Reduced from 16
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6, // Smaller gap
    },
    gridItem: {
        width: '31.5%', // 3 columns approx
        aspectRatio: 9 / 16, // Keep portrait ratio
        borderRadius: 8, // Slightly smaller radius for denser grid
        overflow: 'hidden',
        backgroundColor: '#333',
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    expiryBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    expiryText: {
        color: 'white',
        fontSize: 10,
    },
    // Plan & Billing card
    planCard: {
        marginTop: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    planCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    planCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    planCardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    tierBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
    },
    tierBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    planRenewal: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 6,
        marginBottom: 14,
        marginLeft: 2,
    },
    planActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },
    planUpgradeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.cta?.primary ?? '#BD3115',
        paddingVertical: 11,
        borderRadius: 10,
    },
    planUpgradeBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
    planCancelBtn: {
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,59,48,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCancelBtnText: {
        color: '#FF3B30',
        fontWeight: '600',
        fontSize: 13,
    },
    pillButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    pillButtonText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
    },
});

