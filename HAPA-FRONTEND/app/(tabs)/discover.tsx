import { Colors } from '@/constants/Colors';
import { apiFetch, getTransformedImageUrl, isVideoUrl, logWalkin, sharePost } from '@/lib/api';
import { useUpload } from '@/contexts/UploadContext';
import { openDirections } from '@/lib/directions';
import { LiveWall } from '@/components/LiveWall';
import { DiscoverSkeleton } from '@/components/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    DeviceEventEmitter,
    FlatList,
    Animated,
} from 'react-native';
import { logger } from '@/lib/logger';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// ─── PRELOAD WINDOW CONFIG ─────────────────────────────────────────────────────
// Exactly the Mux/TikTok pattern:
// - 5 videos ahead get a source URL and buffer silently
// - 1 video behind stays buffered for quick back-scroll
// - Everything outside this window gets source=null (memory freed)
const PRELOAD_AHEAD = 2; // Reduced from 5 to prevent OOM on new post additions
const PRELOAD_BEHIND = 1;

function getPreloadRange(activeIndex: number, total: number) {
    const start = Math.max(0, activeIndex - PRELOAD_BEHIND);
    const end = Math.min(total - 1, activeIndex + PRELOAD_AHEAD);
    return { start, end };
}

// ─── VIDEO ITEM ───────────────────────────────────────────────────────────────
// Each item owns its own player. isActive = plays with audio.
// shouldPreload = has a source URL, buffers silently. Neither = source is null.
interface VideoItemProps {
    uri: string;
    isActive: boolean;
    shouldPreload: boolean;
    isModalVisible: boolean;
    style: any;
}

const VideoItem = memo(({ uri, isActive, shouldPreload, isModalVisible, style }: VideoItemProps) => {
    const isFocused = useIsFocused();
    const reallyActive = isActive && isFocused && !isModalVisible;
    // Keep sourceUri active even when blurred to prevent Fabric churn during transitions.
    // The player will still pause via reallyActive.
    const sourceUri = (isActive || shouldPreload) ? uri : null;

    const player = useVideoPlayer(sourceUri, p => {
        p.loop = true;
        p.muted = true;
    });

    useEffect(() => {
        if (!player) return;
        if (reallyActive) {
            player.muted = false;
            player.play();
        } else {
            player.muted = true;
            player.pause();
        }
    }, [reallyActive, player]);

    return (
        <View style={[style, { backgroundColor: '#050505', overflow: 'hidden' }]}>
            <LinearGradient
                colors={['#050505', '#121212', '#050505']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {sourceUri && player && (
                <VideoView
                    key={uri}
                    player={player}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    nativeControls={false}
                />
            )}
        </View>
    );
});

// ─── SLIDESHOW ITEM (Horizontal Carousel) ──────────────────────────────────────
const SlideshowItem = memo(({ urls, isActive, isModalVisible, style }: {
    urls: string[];
    isActive: boolean;
    isModalVisible: boolean;
    style: any;
}) => {
    const [innerIndex, setInnerIndex] = useState(0);
    const [hasSwiped, setHasSwiped] = useState(false);
    const scrollX = useRef(new Animated.Value(0)).current;

    const showHint = isActive && innerIndex === 0 && !hasSwiped;

    return (
        <View style={style}>
            <FlatList
                data={urls}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(u, i) => `${u}-${i}`}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
                removeClippedSubviews={false}
                onMomentumScrollEnd={(e) => {
                    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                    setInnerIndex(newIndex);
                    if (newIndex > 0) setHasSwiped(true);
                }}
                renderItem={({ item: uri, index }) => {
                    const isV = isVideoUrl(uri);
                    const isCurrent = isActive && index === innerIndex;

                    return (
                        <View style={{ width, height: style?.height || height }}>
                            {isV ? (
                                <VideoItem
                                    uri={uri}
                                    isActive={isCurrent}
                                    shouldPreload={isActive && Math.abs(index - innerIndex) === 1}
                                    isModalVisible={isModalVisible}
                                    style={StyleSheet.absoluteFill}
                                />
                            ) : (
                                <Image
                                    source={{ uri: getTransformedImageUrl(uri, 1080) }}
                                    style={StyleSheet.absoluteFill}
                                    resizeMode="cover"
                                />
                            )}
                        </View>
                    );
                }}
            />
            {/* Pagination Dots */}
            <View style={styles.paginationDots}>
                {urls.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            innerIndex === i ? styles.activeDot : styles.inactiveDot
                        ]}
                    />
                ))}
            </View>

            {showHint && (
                <View style={styles.swipeHintContainer} pointerEvents="none">
                    <View style={styles.swipeHintCircle}>
                        <Ionicons name="arrow-forward" size={24} color="white" />
                    </View>
                    <Text style={styles.swipeHintText}>Swipe for more</Text>
                </View>
            )}

            {/* Item Counter */}
            <View style={styles.itemCounter}>
                <Text style={styles.itemCounterText}>{innerIndex + 1} / {urls.length}</Text>
            </View>
        </View>
    );
});

// ─── POST ITEM ────────────────────────────────────────────────────────────────
interface PostItemProps {
    item: any;
    index: number;
    activeIndexRef: React.MutableRefObject<number>;
    totalCount: number;
    insets: { top: number; bottom: number };
    onLike: (postId: string) => void;
    onShare: (post: any) => void;
    onComment: (post: any) => void;
    isModalVisible: boolean;
    router: any;
    containerHeight: number;
}

const PostItem = memo(({
    item, index, activeIndexRef, totalCount, insets, onLike, onShare, onComment, isModalVisible, router, containerHeight
}: PostItemProps) => {
    const [visibilityState, setVisibilityState] = useState({
        isActive: index === activeIndexRef.current,
        shouldPreload: index >= getPreloadRange(activeIndexRef.current, totalCount).start &&
            index <= getPreloadRange(activeIndexRef.current, totalCount).end &&
            index !== activeIndexRef.current
    });

    useEffect(() => {
        const checkVisibility = () => {
            const current = activeIndexRef.current;
            const { start, end } = getPreloadRange(current, totalCount);
            const active = index === current;
            const preload = index >= start && index <= end && !active;

            if (active !== visibilityState.isActive || preload !== visibilityState.shouldPreload) {
                setVisibilityState({ isActive: active, shouldPreload: preload });
            }
        };

        const sub = DeviceEventEmitter.addListener('feedActiveIndex', checkVisibility);
        checkVisibility();
        return () => sub.remove();
    }, [index, totalCount, visibilityState.isActive, visibilityState.shouldPreload]);

    const { isActive, shouldPreload } = visibilityState;

    // Support multi-media JSON strings
    const mediaUrls = React.useMemo(() => {
        if (typeof item.media_url === 'string' && item.media_url.startsWith('[')) {
            try {
                const parsed = JSON.parse(item.media_url);
                return Array.isArray(parsed) ? parsed : [item.media_url];
            } catch { return [item.media_url]; }
        }
        return item.media_url ? [item.media_url] : [];
    }, [item.media_url]);

    const isSlideshow = mediaUrls.length > 1;
    const isVideo = !isSlideshow && isVideoUrl(item.media_url);
    const isElite = item.venue_tier === 'elite';
    const isPro = item.venue_tier === 'pro';
    const isVerified = isElite || isPro;
    const isEvent = item.post_type === 'event';

    return (
        <View style={[styles.slide, { height: containerHeight }]}>
            {/* ── Background Media ── */}
            {isSlideshow ? (
                <SlideshowItem
                    urls={mediaUrls}
                    isActive={isActive}
                    isModalVisible={isModalVisible}
                    style={[styles.mediaFill, { height: containerHeight }]}
                />
            ) : isVideo ? (
                <VideoItem
                    uri={item.media_url}
                    isActive={isActive}
                    shouldPreload={shouldPreload}
                    isModalVisible={isModalVisible}
                    style={[styles.mediaFill, { height: containerHeight }]}
                />
            ) : (
                <Image
                    source={{ uri: getTransformedImageUrl(item.media_url, 1080) }}
                    style={[styles.mediaFill, { height: containerHeight }]}
                    resizeMode="cover"
                />
            )}

            {/* ── Gradient Overlay ── */}
            <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.85)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            {/* ── Top Brand Bar (first item only) ── */}
            {index === 0 && (
                <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.brandTitle}>HAPA</Text>
                </View>
            )}

            {/* ── Bottom Overlay ── */}
            <View style={[styles.bottomOverlay, { paddingBottom: 20 }]}>

                {/* Left: Venue info + caption */}
                <View style={styles.infoSection}>
                    {/* HAPA Global hub is hidden/unclickable as it's just a backend storage hub */}
                    {item.venue_name !== 'HAPA Global' && item.venue_owner_id ? (
                        <TouchableOpacity
                            style={styles.venueBadge}
                            onPress={() => item.venue_id && router.push(`/venue/${item.venue_id}`)}
                            activeOpacity={0.8}
                        >
                            <Image
                                source={{ uri: item.venue_image || 'https://via.placeholder.com/100' }}
                                style={styles.venueIcon}
                            />
                            <View style={{ marginLeft: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Text style={styles.venueName} numberOfLines={1}>{item.venue_name}</Text>
                                    {isElite && (
                                        <Ionicons name="checkmark-circle" size={14} color="#FFD700" />
                                    )}
                                    {isPro && (
                                        <Ionicons name="checkmark-circle" size={14} color="#1D9BF0" />
                                    )}
                                </View>
                                {item.author_alias && (
                                    <Text style={styles.authorText}>by {item.author_alias}</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.venueBadge}>
                            <Text style={styles.hashtagText}>
                                {item.hashtag ? `#${item.hashtag}` : 'HAPA Vibe'}
                            </Text>
                            {item.author_alias && (
                                <Text style={[styles.authorText, { marginLeft: 8, marginTop: 0 }]}>by {item.author_alias}</Text>
                            )}
                        </View>
                    )}

                    {!!item.caption && (
                        <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text>
                    )}

                    {/* Event Banner */}
                    {isEvent && (
                        <TouchableOpacity 
                            style={styles.eventBanner} 
                            onPress={() => item.cta_url && router.push(item.cta_url)}
                            activeOpacity={0.9}
                        >
                            <View style={styles.eventBannerInfo}>
                                <Text style={styles.eventBannerTitle}>Upcoming Event</Text>
                                <Text style={styles.eventDateText}>
                                    {new Date(item.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}
                                </Text>
                            </View>
                            <View style={styles.eventBannerCTA}>
                                <Text style={styles.eventBannerCTAText}>{item.cta_label || 'Book Tickets'}</Text>
                                <Ionicons name="chevron-forward" size={14} color="black" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Right: Action buttons */}
                <View style={styles.actionColumn}>

                    {/* Like */}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(item.id)}>
                        <View style={styles.iconCircle}>
                            <Ionicons
                                name={item.is_liked ? 'heart' : 'heart-outline'}
                                size={28}
                                color={item.is_liked ? '#FF4FA3' : 'white'}
                            />
                        </View>
                        <Text style={styles.actionLabel}>{item.metrics?.likes || 0}</Text>
                    </TouchableOpacity>

                    {/* Comment */}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onComment(item)}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="chatbubble-outline" size={22} color="white" />
                        </View>
                        <Text style={styles.actionLabel}>{item.metrics?.comments || 0}</Text>
                    </TouchableOpacity>

                    {/* Share */}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(item)}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="share-social-outline" size={22} color="white" />
                        </View>
                        <Text style={styles.actionLabel}>{item.metrics?.shares || 0}</Text>
                    </TouchableOpacity>

                    {/* Directions (venue posts only) */}
                    {item.venue_owner_id && (
                        <TouchableOpacity
                            style={styles.directionsBtn}
                            onPress={() => {
                                logWalkin(item.venue_id, 'directions_tap');
                                openDirections(item.venue_lat, item.venue_lng, item.venue_name);
                            }}
                        >
                            <Ionicons name="navigate" size={18} color="white" />
                            <Text style={styles.directionsLabel}>GO</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            {/* Upload Progress Overlay */}
            {item.isPending && (
                <View style={[StyleSheet.absoluteFill, styles.pendingOverlay]}>
                    <ActivityIndicator size="large" color={Colors.cta.primary} />
                    <Text style={styles.pendingText}>Posting vibe...</Text>
                </View>
            )}
        </View>
    );
});

// ─── DISCOVER SCREEN ──────────────────────────────────────────────────────────
export default function DiscoverScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();

    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const { pendingPost } = useUpload();

    const activeIndexRef = useRef(0);

    const [liveWallVisible, setLiveWallVisible] = useState(false);
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [listHeight, setListHeight] = useState(height); // Fix for paging gap

    const listRef = useRef<any>(null);

    // ── Feed loader ────────────────────────────────────────────────────────────
    const loadFeed = useCallback(async (isRefresh = false, silent = false) => {
        if (!isRefresh && !silent && posts.length === 0) setLoading(true);
        if (isRefresh) setRefreshing(true);

        const query = new URLSearchParams();
        if (params.category) query.append('category', params.category as string);
        if (params.hashtag) query.append('hashtag', params.hashtag as string);
        const url = `/api/discover/feed?${query.toString()}`;

        console.log('[Discover] Loading feed...', { isRefresh, url });

        try {
            const data = await apiFetch(url);
            console.log('[Discover] Feed loaded successfully. Post count:', data.posts?.length || 0);

            if (data.posts?.length > 0) {
                // Log the first item's venue mapping to check hub linking
                const first = data.posts[0];
                console.log('[Discover] First post sample:', {
                    id: first.id,
                    venue_id: first.venue_id,
                    venue_name: first.venue_name,
                    is_user_post: first.is_user_post,
                    hashtag: first.hashtag
                });
            }

            setPosts(data.posts || []);
            activeIndexRef.current = 0;
            DeviceEventEmitter.emit('feedActiveIndex');
            logger.info('Discover', 'Feed successfully updated', { count: data.posts?.length });
        } catch (e: any) {
            logger.error('Discover', 'Feed Load Failure', e);
            Alert.alert('Error', 'Could not load vibes. Check your connection.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [params.category, params.hashtag]);

    // Memory pressure and lifecycle monitoring
    useEffect(() => {
        logger.info('Discover', 'Screen mounted');
        return () => logger.info('Discover', 'Screen unmounted');
    }, []);

    useEffect(() => {
        if (isFocused) {
            // Trigger a silent background refresh every time the tab is focused
            loadFeed(false, true);
            // Force scroll to top so user always sees the absolute latest vibes
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
    }, [isFocused, loadFeed]);

    // Scroll to a specific postId if provided as param (e.g. from a notification)
    useEffect(() => {
        if (posts.length > 0 && params.postId) {
            const idx = posts.findIndex(p => p.id === params.postId);
            if (idx !== -1) {
                setTimeout(() => {
                    listRef.current?.scrollToIndex({ index: idx, animated: false });
                    activeIndexRef.current = idx;
                    DeviceEventEmitter.emit('feedActiveIndex');
                }, 150);
            }
        }
    }, [posts, params.postId]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const handleLike = useCallback(async (postId: string) => {
        try {
            // Optimistic update
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, is_liked: !p.is_liked, metrics: { ...p.metrics, likes: (p.metrics?.likes || 0) + (p.is_liked ? -1 : 1) } } : p
            ));

            const res = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
            // Re-sync with server response if needed (API returns metrics, but not is_liked)
            if (res && res.metrics) {
                setPosts(prev => prev.map(p =>
                    p.id === postId ? { ...p, metrics: res.metrics } : p
                ));
            }
        } catch (e) {
            console.error(e);
            // Revert on error
            setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, is_liked: !p.is_liked, metrics: { ...p.metrics, likes: (p.metrics?.likes || 0) + (p.is_liked ? 1 : -1) } } : p
            ));
        }
    }, []);

    const handleShare = useCallback(async (post: any) => {
        try {
            await Share.share({
                message: `Check out this vibe at ${post.venue_name || post.hashtag} on HAPA! ${post.media_url}`,
            });
            const res = await sharePost(post.id);
            setPosts(prev => prev.map(p =>
                p.id === post.id
                    ? { ...p, metrics: res?.metrics ?? { ...p.metrics, shares: (p.metrics?.shares || 0) + 1 } }
                    : p
            ));
        } catch (e) { console.error(e); }
    }, []);

    const handleComment = useCallback((post: any) => {
        setSelectedPost(post);
        setLiveWallVisible(true);
    }, []);

    // ── FlashList viewability — single callback, stable ref ───────────────────
    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index ?? 0;
            if (activeIndexRef.current !== newIndex) {
                logger.debug('Discover', `Swiped to index ${newIndex}`);
                activeIndexRef.current = newIndex;
                DeviceEventEmitter.emit('feedActiveIndex');
            }
        }
    }, []);

    // Combine pending post (if any) with fetched posts
    const displayPosts = React.useMemo(() => {
        if (!pendingPost) return posts;

        // Ensure we don't duplicate if the feed already fetched the actual server post
        const alreadyExists = posts.some(p => p.media_url === pendingPost.media_url);
        if (alreadyExists) return posts;

        return [{ ...pendingPost, isPending: true }, ...posts];
    }, [posts, pendingPost]);

    const renderItem = useCallback(({ item, index }: { item: any; index: number }) => (
        <PostItem
            item={item}
            index={index}
            activeIndexRef={activeIndexRef}
            totalCount={displayPosts.length}
            insets={insets}
            onLike={handleLike}
            onShare={handleShare}
            onComment={handleComment}
            isModalVisible={liveWallVisible}
            router={router}
            containerHeight={listHeight}
        />
    ), [displayPosts.length, insets, handleLike, handleShare, handleComment, liveWallVisible, router, listHeight]);

    const getItemType = useCallback((item: any) => {
        const mediaUrls = typeof item.media_url === 'string' && item.media_url.startsWith('[') ? JSON.parse(item.media_url) : [item.media_url];
        if (mediaUrls.length > 1) return 'slideshow';
        if (isVideoUrl(item.media_url)) return 'video';
        return 'image';
    }, []);
    // NOTE: using activeIndexRef + DeviceEventEmitter to manage active states.

    if (loading) return <DiscoverSkeleton />;

    // FlashList type definitions in this SDK version are incomplete.
    // Cast once here so all props pass through without per-prop @ts-ignore.
    const List = FlashList as any;

    return (
        <View 
            style={styles.container} 
            onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        >
            <List
                ref={listRef}
                data={displayPosts}
                renderItem={renderItem}
                keyExtractor={(item: any, index) => item.id?.toString() || item._id?.toString() || `pending-${index}`}
                estimatedItemSize={listHeight}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
                onRefresh={() => loadFeed(true)}
                refreshing={refreshing}
                removeClippedSubviews={false}
                getItemType={getItemType}
            />

            {selectedPost && (
                <LiveWall
                    visible={liveWallVisible}
                    onClose={() => setLiveWallVisible(false)}
                    // Only pass venueId if it's a real venue, not the global hub
                    venueId={selectedPost.venue_name === 'HAPA Global' ? undefined : selectedPost.venue_id}
                    postId={selectedPost.id}
                    hashtag={selectedPost.hashtag}
                    title={selectedPost.venue_name || `#${selectedPost.hashtag}`}
                    onCommentPosted={() => {
                        // Optimistic comment count update
                        setPosts(prev => prev.map(p =>
                            p.id === selectedPost.id
                                ? { ...p, metrics: { ...p.metrics, comments: (p.metrics?.comments || 0) + 1 } }
                                : p
                        ));
                    }}
                />
            )}
        </View>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    slide: { width, height },
    mediaFill: {
        ...StyleSheet.absoluteFillObject,
        width,
        height,
    },
    topBar: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    brandTitle: {
        fontFamily: 'Notable_400Regular',
        fontSize: 24,
        color: 'white',
        letterSpacing: 2,
    },
    bottomOverlay: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 15,
    },
    infoSection: {
        flex: 1,
        marginBottom: 10,
        paddingRight: 8,
    },
    venueBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 30,
        alignSelf: 'flex-start',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        maxWidth: '90%',
    },
    venueIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1.5,
        borderColor: 'white',
    },
    venueName: {
        color: 'white',
        fontSize: 16,
        fontWeight: '900',
        textShadowColor: 'black',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
        maxWidth: 160,
    },
    hashtagText: {
        fontSize: 20,
        fontWeight: '900',
        color: '#FF4FA3',
    },
    authorText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 11,
        fontWeight: '500',
    },
    caption: {
        color: 'white',
        fontSize: 14,
        lineHeight: 20,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    actionColumn: {
        alignItems: 'center',
        gap: 14,
        marginBottom: 10,
    },
    actionBtn: { alignItems: 'center' },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        marginBottom: 3,
    },
    actionLabel: {
        color: 'white',
        fontSize: 11,
        fontWeight: '700',
        textShadowColor: 'black',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    directionsBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.cta.primary,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 10,
        elevation: 8,
        marginTop: 4,
    },
    directionsLabel: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    pendingOverlay: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    pendingText: {
        color: 'white',
        marginTop: 12,
        fontWeight: 'bold',
        fontSize: 16,
    },
    multiBadge: {
        position: 'absolute',
        top: 10, right: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    multiBadgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    activeDot: {
        backgroundColor: 'white',
        width: 18,
        height: 6,
        borderRadius: 3,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    inactiveDot: {
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    paginationDots: {
        position: 'absolute',
        bottom: '27%',
        flexDirection: 'row',
        alignSelf: 'center',
        gap: 6,
        zIndex: 10,
    },
    swipeHintContainer: {
        position: 'absolute',
        bottom: '30%',
        alignSelf: 'center',
        alignItems: 'center',
        gap: 10,
    },
    swipeHintCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    swipeHintText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    itemCounter: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    itemCounterText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    // Event Ad Banner
    eventBanner: {
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    eventBannerInfo: {
        flex: 1,
    },
    eventBannerTitle: {
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        opacity: 0.6,
    },
    eventDateText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    eventBannerCTA: {
        backgroundColor: '#FFD700', // Gold for premium feel
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    eventBannerCTAText: {
        color: '#000',
        fontSize: 13,
        fontWeight: 'bold',
    }
});
