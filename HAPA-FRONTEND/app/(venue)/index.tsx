
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { useUpload } from '@/contexts/UploadContext';
import { useSubscription, getTierLabel, getTierColor } from '@/hooks/useSubscription';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { SkeletonBox } from '@/components/Skeleton';
import { apiFetch, clearAuthTokens, deletePost, logWalkin } from '@/lib/api';
import { getTimeAgo } from '@/lib/time';
import { supabase } from '@/lib/supabaseClient';
import { isNearVenue, UserLocation } from '@/lib/location';

function VideoThumbnail({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={styles.postImage} pointerEvents="none">
      <VideoView style={{ width: '100%', height: '100%' }} player={player} nativeControls={false} contentFit="cover" />
    </View>
  );
}

const { width } = Dimensions.get('window');

export default function VenueHomeScreen() {
  const router = useRouter();
  const { pendingPost } = useUpload();
  const subscription = useSubscription();
  const [venueName, setVenueName] = useState<string>('Your venue');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [metrics, setMetrics] = useState({ likes: 0, views: 0, post_shares: 0, walkins_count: 0 });
  const [venueCoords, setVenueCoords] = useState<{ lat?: number, lng?: number }>({});

  // Merge pending post with fetched posts for optimistic UI
  const displayPosts = pendingPost ? [pendingPost, ...recentPosts] : recentPosts;

  useEffect(() => {
    const loadVenue = async () => {
      try {
        const data = await apiFetch('/api/venues/me', { auth: true });
        if (data.venue?.name) {
          setVenueName(data.venue.name);
        }
        if (data.venue?.id) {
          setVenueId(data.venue.id);
        }
        if (data.venue?.metrics) {
          setMetrics(data.venue.metrics);
        }
        if (data.venue?.lat && data.venue?.lng) {
          setVenueCoords({ lat: data.venue.lat, lng: data.venue.lng });
        }
      } catch {
        // If we can't load venue details, keep default name and show empty state.
        setVenueId(null);
      } finally {
        setLoadingVenue(false);
      }
    };
    loadVenue();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const loadPosts = async () => {
        if (!venueId) {
          setRecentPosts([]);
          setLoadingPosts(false);
          return;
        }
        try {
          setLoadingPosts(true);
          const p = await apiFetch(`/api/posts/venue/${venueId}`);
          setRecentPosts((p.posts || []).slice(0, 10));
        } catch {
          setRecentPosts([]);
        } finally {
          setLoadingPosts(false);
        }
      };
      loadPosts();
    }, [venueId])
  );

  // Proximity Geofence Walk-in Check
  useFocusEffect(
    React.useCallback(() => {
      const checkProximity = async () => {
        if (!venueId || !venueCoords.lat || !venueCoords.lng) return;

        // Check 3-hour deduplication window locally
        const DEDUP_MS = 3 * 60 * 60 * 1000;
        const lastWalkinStr = await AsyncStorage.getItem(`hapa_walkin_${venueId}`);
        if (lastWalkinStr) {
          const lastWalkinTs = parseInt(lastWalkinStr, 10);
          if (Date.now() - lastWalkinTs < DEDUP_MS) return; // skipped locally
        }

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const near = isNearVenue(pos.coords.latitude, pos.coords.longitude, venueCoords.lat, venueCoords.lng, 175);
          
          if (near) {
            await logWalkin(venueId, 'proximity');
            await AsyncStorage.setItem(`hapa_walkin_${venueId}`, Date.now().toString());
          }
        } catch (err) {
          console.warn('[Proximity Check] Failed:', err);
        }
      };

      checkProximity();
    }, [venueId, venueCoords])
  );

  const handleSignOut = async () => {
    try {
      console.log('[Logout] Initiating full sign out from dashboard...');

      // 1. Clear Supabase session
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.warn('[Logout] Supabase signOut warning:', signOutError.message);

      // 2. Clear custom auth tokens
      await clearAuthTokens();

      // 3. Small flush to ensure AsyncStorage commit
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log('[Logout] Cleared. Navigating to start...');
      router.replace('/');
    } catch (err) {
      console.error('[Logout] Critical failure:', err);
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

  const handleDeletePost = (postId: string) => {
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this vibe? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePost(postId);
              // Optimistic update
              setRecentPosts(prev => prev.filter(p => p.id !== postId));
            } catch (error: any) {
              console.error("Delete failed:", error);
              Alert.alert("Error", `Failed to delete post: ${error.message || error}`);
            }
          }
        }
      ]
    );
  };

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {new Date().getHours() < 12 ? 'Good Morning,' : new Date().getHours() < 17 ? 'Good Afternoon,' : 'Good Evening,'}
            </Text>
            {loadingVenue ? (
              <SkeletonBox width={180} height={20} borderRadius={10} />
            ) : (
              <Text style={styles.venueName}>{venueName}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.iconButton}
              activeOpacity={0.7}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
              activeOpacity={0.7}
              onPress={handleDeleteAccount}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subscription status banner — free tier upgrade prompt */}
        {!subscription.loading && subscription.tier === 'free' && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => router.push('/(venue)/subscription' as any)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeBannerTitle}>
                Free plan — {subscription.postsToday}/3 posts today
              </Text>
              <Text style={styles.upgradeBannerSub}>
                Upgrade to Pro for unlimited posts + top 5 placement
              </Text>
            </View>
            <Text style={styles.upgradeBannerCta}>Upgrade →</Text>
          </TouchableOpacity>
        )}

        {/* Pro / Elite status badge */}
        {!subscription.loading && subscription.tier !== 'free' && (
          <View style={styles.tierBadgeRow}>
            <View style={[styles.tierBadge, { backgroundColor: `${getTierColor(subscription.tier)}22` }]}>
              <Text style={[styles.tierBadgeText, { color: getTierColor(subscription.tier) }]}>
                {getTierLabel(subscription.tier).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.tierBadgeSub}>
              Unlimited posts · Renews{' '}
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : '—'}
            </Text>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]}>
              <Ionicons name="eye" size={24} color="#4CAF50" />
            </View>
            {loadingVenue ? (
              <>
                <SkeletonBox width={60} height={20} borderRadius={10} />
                <View style={{ height: 6 }} />
                <SkeletonBox width={80} height={14} borderRadius={8} />
              </>
            ) : (
              <>
                <Text style={styles.statNumber}>{metrics.views}</Text>
                <Text style={styles.statLabel}>Profile Views</Text>
              </>
            )}
          </View>
          <View style={styles.statCard}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 79, 163, 0.2)' }]}>
              <Ionicons name="heart" size={24} color={Colors.cta.primary} />
            </View>
            {loadingVenue ? (
              <>
                <SkeletonBox width={60} height={20} borderRadius={10} />
                <View style={{ height: 6 }} />
                <SkeletonBox width={80} height={14} borderRadius={8} />
              </>
            ) : (
              <>
                <Text style={styles.statNumber}>{metrics.likes}</Text>
                <Text style={styles.statLabel}>Vibe Likes</Text>
              </>
            )}
          </View>
        </View>

        {/* Elite Analytics Metrics */}
        {!subscription.loading && subscription.tier === 'elite' && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 215, 0, 0.2)' }]}>
                <Ionicons name="footsteps" size={24} color="#FFD700" />
              </View>
              {loadingVenue ? (
                <>
                  <SkeletonBox width={60} height={20} borderRadius={10} />
                  <View style={{ height: 6 }} />
                  <SkeletonBox width={80} height={14} borderRadius={8} />
                </>
              ) : (
                <>
                  <Text style={styles.statNumber}>{metrics.walkins_count}</Text>
                  <Text style={styles.statLabel}>Walk-ins</Text>
                </>
              )}
            </View>
            <View style={styles.statCard}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(29, 155, 240, 0.2)' }]}>
                <Ionicons name="share-social" size={24} color="#1D9BF0" />
              </View>
              {loadingVenue ? (
                <>
                  <SkeletonBox width={60} height={20} borderRadius={10} />
                  <View style={{ height: 6 }} />
                  <SkeletonBox width={80} height={14} borderRadius={8} />
                </>
              ) : (
                <>
                  <Text style={styles.statNumber}>{metrics.post_shares}</Text>
                  <Text style={styles.statLabel}>Post Shares</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Recent Posts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Posts</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.postsContainer}
        >
          {loadingPosts ? (
            <>
              {[1, 2, 3].map(i => (
                <View key={i} style={styles.postCard}>
                  <SkeletonBox width="100%" height={220} borderRadius={12} />
                </View>
              ))}
            </>
          ) : displayPosts.length === 0 ? (
            <View style={[styles.postCard, { justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                You haven&apos;t posted any vibes yet.
              </Text>
            </View>
          ) : (
            displayPosts.map(p => (
              <View key={p.id} style={[styles.postCardWrapper, p.isPending && { opacity: 0.7 }]}>
                <TouchableOpacity
                  style={styles.postCard}
                  activeOpacity={0.9}
                  onPress={() => !p.isPending && router.push(`/story/${p.id}`)}
                >
                  {p.media_type === 'video' ? (
                    <VideoThumbnail uri={p.media_url} />
                  ) : (
                    <Image source={{ uri: p.media_url }} style={styles.postImage} />
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.postGradient}
                  />
                  <View style={styles.postContent}>
                    {!!p.caption && (
                      <Text style={styles.postCaption} numberOfLines={2}>
                        {p.caption}
                      </Text>
                    )}
                    <View style={styles.postMetricsRow}>
                      <View style={styles.postMetric}>
                        <Ionicons name="eye" size={12} color="white" />
                        <Text style={styles.postMetricText}>
                          {p.metrics?.views || 0}
                        </Text>
                      </View>
                      <View style={styles.postMetric}>
                        <Ionicons name="heart" size={12} color="white" />
                        <Text style={styles.postMetricText}>
                          {p.metrics?.likes || 0}
                        </Text>
                      </View>
                      <Text style={[styles.postTime, { marginLeft: 'auto' }]}>{getTimeAgo(p.created_at)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {!p.isPending && (
                  <View style={styles.postActions}>
                    <TouchableOpacity
                      style={styles.boostButton}
                      onPress={() => router.push(`/(venue)/subscription?tab=boost&post_id=${p.id}` as any)}
                    >
                      <Text style={styles.boostButtonText}>BOOST</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePost(p.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Tips */}
        <View style={styles.tipCard}>
          <LinearGradient
            colors={[Colors.cta.primary, '#99004d']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tipGradient}
          >
            <Text style={styles.tipTitle}>Boost your exposure</Text>
            <Text style={styles.tipDesc}>Venues with video stories get 3x more engagement.</Text>
          </LinearGradient>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.gradient[2],
    paddingHorizontal: 16, // iOS margin
  },
  header: {
    marginTop: 16,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  greeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15, // iOS Subhead
  },
  venueName: {
    color: Colors.text.primary,
    fontSize: 32, // Title 1
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12, // Reduced from 16
    marginBottom: 24, // Reduced from 30
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 28, 0.9)',
    padding: 16, // Multiple of 8
    borderRadius: 12, // iOS standard radius
    borderWidth: 1,
    borderColor: 'rgba(189, 49, 21, 0.2)',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statNumber: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13, // iOS Footnote
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 22, // Title 2
    fontWeight: 'bold',
  },
  seeAllText: {
    color: Colors.cta.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  postsContainer: {
    gap: 16,
    marginBottom: 30,
  },
  postCardWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  postCard: {
    width: 140,
    height: 220,
    borderRadius: 12, // Standard component radius
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#333',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  postGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  postContent: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
  },
  postCaption: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  upgradeBanner: {
    backgroundColor: 'rgba(189,49,21,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(189,49,21,0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeBannerTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 3,
  },
  upgradeBannerSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  upgradeBannerCta: {
    color: '#BD3115',
    fontWeight: '800',
    fontSize: 13,
  },
  tierBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tierBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tierBadgeSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  postActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    gap: 6,
    zIndex: 10,
  },
  boostButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(189,49,21,0.5)',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  boostButtonText: {
    color: '#BD3115',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  deleteButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 16,
  },

  postMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  postMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postMetricText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  postTime: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
  },
  tipCard: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 100,
  },
  tipGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  tipTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tipDesc: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
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
