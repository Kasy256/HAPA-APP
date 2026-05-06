
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import { apiFetch, isVideoUrl, sharePost } from '@/lib/api';
import { VerifiedBadge } from '@/components/VerifiedBadge';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function StoryScreen() {
    const { id, venueId } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // State
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [venue, setVenue] = useState<any>(null);
    const [progress, setProgress] = useState(0);
    const [videoBuffering, setVideoBuffering] = useState(false);

    const postId = useMemo(() => (Array.isArray(id) ? id[0] : (id as string)), [id]);
    const vId = useMemo(() => (Array.isArray(venueId) ? venueId[0] : (venueId as string)), [venueId]);

    // Load Data
    useEffect(() => {
        const load = async () => {
            // If we have a single post ID, fetch it immediately to show content fast
            if (!vId && postId) {
                try {
                    const data = await apiFetch(`/api/posts/${postId}`);
                    const p = data.post;
                    
                    // Flatten if it's a slideshow
                    if (typeof p.media_url === 'string' && p.media_url.startsWith('[')) {
                        try {
                            const urls = JSON.parse(p.media_url);
                            if (Array.isArray(urls)) {
                                setPosts(urls.map(url => ({ ...p, media_url: url })));
                                setVenue(data.venue);
                                setLoading(false);
                                return;
                            }
                        } catch (e) { /* fallback */ }
                    }

                    setPosts([p]);
                    setVenue(data.venue);
                    setLoading(false);
                } catch (e) {
                    console.error("Failed to load single story", e);
                    router.back();
                }
                return;
            }

            // If we have a venueId, we need all posts but we should still be fast
            if (vId) {
                try {
                    // Fetch post list and venue in parallel
                    const [postsData, venueData] = await Promise.all([
                        apiFetch(`/api/posts/venue/${vId}`),
                        apiFetch(`/api/venues/${vId}`)
                    ]);

                    const rawPosts = postsData.posts || [];
                    if (rawPosts.length === 0) {
                        router.back();
                        return;
                    }

                    // Flatten multi-media posts into individual story items
                    const flattenedPosts: any[] = [];
                    let targetIndex = 0;
                    
                    rawPosts.forEach((p: any) => {
                        const isCurrentPost = p.id === postId;
                        
                        if (typeof p.media_url === 'string' && p.media_url.startsWith('[')) {
                            try {
                                const urls = JSON.parse(p.media_url);
                                if (Array.isArray(urls)) {
                                    urls.forEach((url, subIdx) => {
                                        // If this was the target post, the first item in the expansion is our starting point
                                        if (isCurrentPost && subIdx === 0) targetIndex = flattenedPosts.length;
                                        flattenedPosts.push({ ...p, media_url: url });
                                    });
                                    return;
                                }
                            } catch (e) { /* fallback to single */ }
                        }
                        
                        if (isCurrentPost) targetIndex = flattenedPosts.length;
                        flattenedPosts.push(p);
                    });

                    setPosts(flattenedPosts);
                    setCurrentIndex(targetIndex);
                    setVenue(venueData.venue);
                } catch (e) {
                    console.error("Failed to load venue stories", e);
                    router.back();
                } finally {
                    setLoading(false);
                }
            }
        };
        load();
    }, [postId, vId]);

    const currentPost = posts[currentIndex];
    const currentIsVideo = currentPost?.media_type === 'video' || isVideoUrl(currentPost?.media_url);
    const isFocused = useIsFocused();

    // TikTok Pattern: Only provide source if focused AND it's a video slide.
    // Releases hardware decoder immediately when user exits or swipes to an image.
    const videoSourceUri = isFocused && currentIsVideo ? (currentPost?.media_url ?? null) : null;

    // Video Player — source is focus-gated
    const player = useVideoPlayer(videoSourceUri, p => {
        p.loop = true;
        p.muted = false;
    });

    // Track buffering state for spinner and auto-progress pausing
    useEffect(() => {
        if (!currentIsVideo || !player) {
            setVideoBuffering(false);
            return;
        }
        const sub = player.addListener('statusChange', (ev: any) => {
            setVideoBuffering(ev.status === 'loading');
        });
        return () => sub.remove();
    }, [player, currentIsVideo, videoSourceUri]);

    // Play/Pause control based on focus and slide type
    useEffect(() => {
        if (!player) return;
        if (isFocused && currentIsVideo) {
            player.loop = true;
            player.play();
        } else {
            player.pause();
        }
    }, [isFocused, currentIsVideo, currentPost?.media_url, player]);

    // Auto Progress Timer — pauses while video is buffering
    useEffect(() => {
        if (loading || !currentPost) return;

        setProgress(0);
        const intervalMs = 100;
        const durationMs = currentIsVideo ? 10000 : 5000;
        const step = (intervalMs / durationMs) * 100;

        const timer = setInterval(() => {
            // Don't advance progress while video is buffering
            if (videoBuffering) return;

            setProgress(old => {
                if (old >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                return old + step;
            });
        }, intervalMs);

        return () => clearInterval(timer);
    }, [currentIndex, loading, currentPost, videoBuffering]);

    // Handle Progress Completion (Navigation)
    useEffect(() => {
        if (progress >= 100) {
            handleNext();
        }
    }, [progress]);

    const handleNext = () => {
        if (currentIndex < posts.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setProgress(0);
        } else {
            router.back();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setProgress(0);
        } else {
            setProgress(0);
        }
    };

    // Track View
    useEffect(() => {
        if (currentPost?.id) {
            apiFetch(`/api/posts/${currentPost.id}/view`, { method: 'POST', auth: true }).catch(() => { });
        }
    }, [currentPost?.id]);

    // Handle Like
    const handleLike = async () => {
        if (!currentPost) return;

        // Optimistic Update
        setPosts(prev => prev.map((p, idx) => {
            if (idx === currentIndex) {
                const isLiked = !p.is_liked;
                return {
                    ...p,
                    is_liked: isLiked,
                    metrics: {
                        ...p.metrics,
                        likes: (p.metrics?.likes || 0) + (isLiked ? 1 : -1)
                    }
                };
            }
            return p;
        }));

        try {
            await apiFetch(`/api/posts/${currentPost.id}/like`, { method: 'POST', auth: true });
        } catch (error) {
            console.error("Failed to like post", error);
        }
    };

    // Handle Share
    const handleShare = async () => {
        if (!currentPost) return;
        try {
            const appUrl = Linking.createURL('/story/' + currentPost.id);
            const webUrl = 'https://www.gethapa.com';
            
            const result = await Share.share({
                message: `Check out this vibe on HAPA! 🕺✨\n\nApp: ${appUrl}\n\nDon't have the app? Download here: ${webUrl}`,
            });

            if (result.action === Share.sharedAction) {
                sharePost(currentPost.id);
            }
        } catch (error) {
            console.error("Error sharing story:", error);
        }
    };


    if (!currentPost && loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="white" style={{ marginTop: 100 }} />
            </View>
        );
    }

    if (!currentPost && !loading) return null;

    return (
        <View style={styles.container}>
            {/* Stable base — always rendered, like TikTok's RecyclerView ViewHolder */}
            <View style={styles.image}>
                {/* Shimmer placeholder — always visible underneath */}
                <LinearGradient
                    colors={['#050505', '#1a1a1a', '#050505']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* Image slide */}
                {!currentIsVideo && (
                    <Image
                        source={{ uri: currentPost.media_url }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                    />
                )}

                {/* Video slide — renders on top of shimmer as soon as first frame is ready */}
                {videoSourceUri && player && (
                    <VideoView
                        player={player}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        nativeControls={false}
                    />
                )}

                {/* Buffering spinner */}
                {videoBuffering && (
                    <View style={styles.bufferingOverlay}>
                        <ActivityIndicator size="large" color="white" />
                    </View>
                )}
            </View>

            {/* Overlay Gradient */}
            <LinearGradient
                colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.overlay}
            />

            <View style={[styles.safeArea, { paddingTop: insets.top + 10 }]}>
                {/* Top Section: Progress & Header */}
                <View>
                    {/* Progress Bars */}
                    <View style={styles.progressBarRow}>
                        {posts.map((_, idx) => (
                            <View key={idx} style={styles.progressBarTrack}>
                                <View
                                    style={[
                                        styles.progressBarFill,
                                        {
                                            width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%',
                                            backgroundColor: 'white'
                                        }
                                    ]}
                                />
                            </View>
                        ))}
                    </View>

                    {/* Header */}
                    <View style={styles.header}>
                        {venue?.images?.[0] ? (
                            <Image source={{ uri: venue.images[0] }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                        )}
                        <View style={styles.headerText}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.venueName} numberOfLines={1}>{venue?.name || 'Venue'}</Text>
                                <VerifiedBadge tier={venue?.tier} size="sm" />
                            </View>
                            <Text style={styles.timeAgo}>
                                {new Date(currentPost.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                            <Ionicons name="close" size={28} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Touch Navigation Overlay (Absolute, covers middle) */}
                <View style={[styles.touchArea, { top: insets.top + 100, bottom: 100 }]}>
                    <TouchableOpacity style={styles.halfTouch} onPress={handlePrev} activeOpacity={1} />
                    <TouchableOpacity style={styles.halfTouch} onPress={handleNext} activeOpacity={1} />
                </View>

                {/* Footer Caption */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.footerRow}>
                        <View style={styles.captionContainer}>
                            {!!currentPost.caption && <Text style={styles.caption}>{currentPost.caption}</Text>}
                        </View>
                        <View style={styles.actionsContainer}>
                            <TouchableOpacity onPress={handleLike} style={styles.actionButton}>
                                <Ionicons
                                    name={currentPost.is_liked ? "heart" : "heart-outline"}
                                    size={28}
                                    color={currentPost.is_liked ? "#ff0050" : "white"}
                                />
                                <Text style={styles.actionText}>{currentPost.metrics?.likes || 0}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
                                <Ionicons name="share-social-outline" size={26} color="white" />
                                <Text style={styles.actionText}>Share</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    image: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
        flex: 1,
        // Removed justifyContent: 'space-between' to control layout manually
    },
    progressBarRow: {
        flexDirection: 'row',
        paddingHorizontal: 10,
        gap: 4,
        marginBottom: 12,
    },
    progressBarTrack: {
        flex: 1,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        zIndex: 20,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'white',
    },
    headerText: {
        flex: 1,
        justifyContent: 'center',
    },
    venueName: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 15,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowRadius: 4,
    },
    timeAgo: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '500',
    },
    closeButton: {
        padding: 8,
    },
    touchArea: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        zIndex: 10,
    },
    halfTouch: {
        flex: 1,
    },
    footer: {
        marginTop: 'auto', // Pushes footer to the bottom
        paddingHorizontal: 20,
        zIndex: 20,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    captionContainer: {
        flex: 1,
        marginRight: 12,
    },
    actionsContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },
    actionButton: {
        alignItems: 'center',
    },
    actionText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
    },
    caption: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    bufferingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
});
