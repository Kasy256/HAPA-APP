
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SkeletonBox } from '@/components/Skeleton';
import { apiFetch, clearAuthTokens, deletePost } from '@/lib/api';
import { getTimeAgo } from '@/lib/time';

const { width } = Dimensions.get('window');

export default function VenueHomeScreen() {
  const router = useRouter();
  const [venueName, setVenueName] = useState<string>('Your venue');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [metrics, setMetrics] = useState({ likes: 0, views: 0 });

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

  const handleSignOut = async () => {
    await clearAuthTokens();
    router.replace('/');
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
            <Text style={styles.greeting}>Good Evening,</Text>
            {loadingVenue ? (
              <SkeletonBox width={180} height={20} borderRadius={10} />
            ) : (
              <Text style={styles.venueName}>{venueName}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>

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
          ) : recentPosts.length === 0 ? (
            <View style={[styles.postCard, { justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                You haven&apos;t posted any vibes yet.
              </Text>
            </View>
          ) : (
            recentPosts.map(p => (
              <View key={p.id} style={styles.postCardWrapper}>
                <TouchableOpacity
                  style={styles.postCard}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/story/${p.id}`)}
                >
                  <Image source={{ uri: p.media_url }} style={styles.postImage} />
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
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeletePost(p.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="white" />
                </TouchableOpacity>
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
});
