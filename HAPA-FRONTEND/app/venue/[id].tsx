import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View, Share, Linking } from 'react-native';

import { MediaPreview } from '@/components/MediaPreview';
import { SkeletonBox, SkeletonCircle } from '@/components/Skeleton';
import { apiFetch, getTransformedImageUrl, isVideoUrl, logWalkin, sharePost } from '@/lib/api';
import { getTimeAgo } from '@/lib/time';
import { openDirections } from '@/lib/directions';
import { getVenueStatusText, isVenueOpen } from '@/lib/venue';
import { LiveWall } from '@/components/LiveWall';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

export default function PublicVenueProfileScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [venue, setVenue] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [liveWallVisible, setLiveWallVisible] = useState(false);
    const [selectedPost, setSelectedPost] = useState<any>(null);

    // Guard: ensures we only track one view per screen mount, not on re-renders
    const viewTracked = useRef(false);

    const venueId = useMemo(() => (Array.isArray(id) ? id[0] : (id as string)), [id]);

    useEffect(() => {
        const load = async () => {
            try {
                const v = await apiFetch(`/api/venues/${venueId}`);
                
                // Defensive parsing for stringified JSON fields
                const parseField = (field: any, fallback: any = []) => {
                    if (typeof field === 'string') {
                        try { return JSON.parse(field); } catch { return fallback; }
                    }
                    return field || fallback;
                };

                const venueData = v.venue ? {
                    ...v.venue,
                    images: parseField(v.venue.images),
                    categories: parseField(v.venue.categories),
                    working_hours: parseField(v.venue.working_hours, {})
                } : null;

                setVenue(venueData);
                const p = await apiFetch(`/api/posts/venue/${venueId}`);
                setPosts(p.posts || []);
            } catch {
                setVenue(null);
                setPosts([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [venueId]);

    // Track venue profile view — fires once after venue loads
    // Works for both real users and anonymous users (they have a stable Supabase UUID from boot)
    // Self-view and 24h deduplication are enforced at the DB level
    useEffect(() => {
        if (venue?.id && !viewTracked.current) {
            viewTracked.current = true;
            apiFetch(`/api/venues/${venue.id}/view`, { method: 'POST' }).catch(() => {});
        }
    }, [venue?.id]);

    const handleShare = async (post: any) => {
        try {
            await Share.share({
                message: `Check out this vibe at ${venue?.name} on HAPA! ${post.media_url}`,
            });
            sharePost(post.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleLike = async (postId: string) => {
        try {
            const res = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_liked: !p.is_liked, metrics: res.metrics } : p));
        } catch (e) {
            console.error(e);
        }
    };

    const images = useMemo(() => {
        if (!venue?.images) return [];
        if (Array.isArray(venue.images)) return venue.images;
        if (typeof venue.images === 'string') {
            try { return JSON.parse(venue.images); } catch { return []; }
        }
        return [];
    }, [venue?.images]);

    const header = useMemo(() => {
        return (
            <View style={styles.headerContainer}>
                {/* Image Slideshow Header */}
                <View style={styles.slideshowContainer}>
                    {loading ? (
                        <SkeletonBox width={width} height={HEADER_HEIGHT} borderRadius={0} />
                    ) : images.length ? (
                        <FlatList
                            data={images}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(_, index) => index.toString()}
                            snapToInterval={width}
                            snapToAlignment="start"
                            decelerationRate="fast"
                            initialNumToRender={5}
                            windowSize={11}
                            onMomentumScrollEnd={(e) => {
                                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                                console.log('[Slideshow] Momentum Scroll End. Target Index:', newIndex);
                                if (newIndex !== activeIndex) {
                                    setActiveIndex(newIndex);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                            }}
                            renderItem={({ item }) => (
                                <Image
                                    source={{ uri: getTransformedImageUrl(item, 1200, 90) }}
                                    style={styles.slideImage}
                                    resizeMode="cover"
                                />
                            )}
                            getItemLayout={(_, index) => ({
                                length: width,
                                offset: width * index,
                                index,
                            })}
                        />
                    ) : (
                        <View style={[styles.slideImage, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
                    )}

                    <LinearGradient
                        colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.6)']}
                        style={styles.headerGradient}
                        pointerEvents="none"
                    />

                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={28} color="white" />
                    </TouchableOpacity>

                    {!loading && images.length > 1 && (
                        <View style={styles.paginationDots}>
                            {images.map((_: string, i: number) => (
                                <View 
                                    key={i} 
                                    style={[
                                        styles.dot, 
                                        i === activeIndex && styles.dotActive
                                    ]} 
                                />
                            ))}
                        </View>
                    )}
                </View>

                <View style={styles.contentWrapper}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarRow}>
                            {loading ? (
                                <SkeletonCircle size={80} />
                            ) : (
                                <Image
                                    source={{ uri: getTransformedImageUrl(venue?.images?.[0], 400, 90) }}
                                    style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
                                    resizeMode="cover"
                                />
                            )}
                            <View style={styles.headerInfo}>
                                {loading ? (
                                    <>
                                        <SkeletonBox width={180} height={14} borderRadius={8} />
                                        <View style={{ height: 8 }} />
                                        <SkeletonBox width={140} height={12} borderRadius={8} />
                                    </>
                                ) : (
                                    <>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.venueName} numberOfLines={1}>{venue?.name ?? 'Venue'}</Text>
                                            {(venue?.tier === 'pro' || venue?.tier === 'elite') && (
                                                <Ionicons name="checkmark-circle" size={20} color="#00C2FF" />
                                            )}
                                        </View>
                                        {(venue?.tier === 'pro' || venue?.tier === 'elite') && (
                                            <Text style={styles.verifiedCaption}>
                                                ✓ HAPA Verified Venue
                                            </Text>
                                        )}
                                    </>
                                )}

                                <View style={styles.statusRow}>
                                    <View style={[
                                        styles.statusDot,
                                        { backgroundColor: isVenueOpen(venue?.working_hours) ? '#4CAF50' : '#999' }
                                    ]} />
                                    <Text style={[
                                        styles.statusText,
                                        { color: isVenueOpen(venue?.working_hours) ? '#4CAF50' : '#999' }
                                    ]}>
                                        {getVenueStatusText(venue?.working_hours)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.actionRow}>
                            {venue?.contact_phone && (
                                <TouchableOpacity 
                                    style={styles.actionButton}
                                    onPress={() => Linking.openURL(`tel:${venue.contact_phone}`)}
                                >
                                    <Ionicons name="call-outline" size={20} color="white" />
                                    <Text style={styles.actionText}>Call</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => {
                                    if (venue?.id) {
                                        logWalkin(venue.id, 'directions_tap');
                                    }
                                    openDirections(venue?.lat, venue?.lng, venue?.name);
                                }}
                            >
                                <Ionicons name="navigate-outline" size={20} color="white" />
                                <Text style={styles.actionText}>Directions</Text>
                            </TouchableOpacity>
                        </View>

                        {(venue?.categories && venue.categories.length > 0) && (
                            <View style={styles.tagsRow}>
                                {venue.categories.map((tag: string) => (
                                    <View key={tag} style={styles.tag}>
                                        <Text style={styles.tagText}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Today's Vibes</Text>
                </View>
            </View>
        );
    }, [loading, images, activeIndex, venue]);

    const renderPost = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.vibeCard}
            onPress={() => router.navigate({
                pathname: '/(tabs)/discover',
                params: { postId: item.id }
            })}
        >
            <MediaPreview 
                uri={isVideoUrl(item.media_url) ? item.media_url : getTransformedImageUrl(item.media_url, 400)} 
                style={styles.vibeMedia}
                resizeMode="cover"
            />
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.vibeCardOverlay}
            >
                <View style={styles.vibeCardFooter}>
                    <Text style={styles.vibeCardTime}>{getTimeAgo(item.created_at)}</Text>
                    <View style={styles.vibeCardMetrics}>
                        <View style={styles.metricItem}>
                            <Ionicons name="heart" size={10} color="#FF4FA3" />
                            <Text style={styles.metricText}>{item.metrics?.likes || 0}</Text>
                        </View>
                        <View style={styles.metricItem}>
                            <Ionicons name="chatbubble" size={10} color="white" />
                            <Text style={styles.metricText}>{item.metrics?.comments || 0}</Text>
                        </View>
                    </View>
                </View>
            </LinearGradient>
            {item.is_boosted && (
                <View style={styles.vibeBoostBadge}>
                    <Ionicons name="flash" size={10} color="#FFD700" />
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={posts}
                keyExtractor={item => item.id}
                ListHeaderComponent={header}
                renderItem={renderPost}
                numColumns={3}
                columnWrapperStyle={styles.vibeRow}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.1)" />
                            <Text style={styles.emptyText}>No vibes posted yet today.</Text>
                        </View>
                    ) : null
                }
                contentContainerStyle={{ paddingBottom: 50 }}
            />

            {selectedPost && (
                <LiveWall
                    visible={liveWallVisible}
                    onClose={() => setLiveWallVisible(false)}
                    venueId={selectedPost.venue_id}
                    hashtag={selectedPost.hashtag}
                    title={venue?.name || "Vibe"}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background.gradient[2],
    },
    headerContainer: {
        width: '100%',
    },
    slideshowContainer: {
        height: HEADER_HEIGHT,
        width: '100%',
        position: 'relative',
    },
    slideImage: {
        width: width,
        height: HEADER_HEIGHT,
        backgroundColor: '#1a1a1a',
    },
    headerGradient: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    backButton: {
        position: 'absolute',
        top: 50,
        left: 20,
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 10,
    },
    paginationDots: {
        position: 'absolute',
        bottom: 40,
        flexDirection: 'row',
        alignSelf: 'center',
        gap: 6,
        zIndex: 10,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    dotActive: {
        width: 20, // Wider active dot like premium apps
        backgroundColor: 'white',
    },
    contentWrapper: {
        marginTop: -20, // Overlap cover
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
    },
    profileHeader: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatar: {
        width: 70,
        height: 70,
        borderRadius: 35,
        borderWidth: 2,
        borderColor: 'white',
    },
    headerInfo: {
        flex: 1,
    },
    venueName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text.primary,
        flexShrink: 1,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 6,
    },
    verifiedCaption: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1D9BF0',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#4CAF50',
    },
    statusText: {
        color: '#4CAF50',
        fontSize: 12,
        fontWeight: 'bold',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    actionText: {
        color: Colors.text.primary,
        fontWeight: '600',
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 20,
    },
    tag: {
        backgroundColor: Colors.cta.primary,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    tagText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text.primary,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    vibeRow: {
        paddingHorizontal: 20,
        justifyContent: 'flex-start',
    },
    vibeCard: {
        width: (width - 46) / 3, // (width - 40 total padding - 6 for gaps)
        height: ((width - 46) / 3) * 1.4,
        margin: 1,
        backgroundColor: '#1C1C1E',
        position: 'relative',
    },
    vibeCardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 50,
        justifyContent: 'flex-end',
        padding: 6,
    },
    vibeCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    vibeCardMetrics: {
        flexDirection: 'row',
        gap: 8,
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    metricText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    vibeCardTime: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 9,
        fontWeight: '500',
    },
    vibeMedia: {
        width: '100%',
        height: '100%',
    },
    vibeBoostBadge: {
        position: 'absolute',
        top: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 2,
        borderRadius: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        opacity: 0.5,
    },
    emptyText: {
        color: 'white',
        marginTop: 10,
        fontSize: 14,
    }
});
