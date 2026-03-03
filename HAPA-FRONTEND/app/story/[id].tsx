
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiFetch, isVideoUrl } from '@/lib/api';

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
                    setPosts([data.post]);
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

                    const allPosts = postsData.posts || [];
                    if (allPosts.length === 0) {
                        router.back();
                        return;
                    }

                    const idx = allPosts.findIndex((p: any) => p.id === postId);
                    setPosts(allPosts);
                    setCurrentIndex(idx >= 0 ? idx : 0);
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

    // Video Player
    const player = useVideoPlayer(currentPost?.media_url ?? '', player => {
        if (currentIsVideo) {
            player.loop = true;
            player.play();
        }
    });

    // Track buffering state so we can show a spinner and pause auto-progress
    useEffect(() => {
        if (!currentIsVideo) {
            setVideoBuffering(false);
            return;
        }
        const sub = player.addListener('statusChange', (ev: any) => {
            if (ev.status === 'loading') {
                setVideoBuffering(true);
            } else {
                setVideoBuffering(false);
            }
        });
        return () => sub.remove();
    }, [player, currentIsVideo]);

    useEffect(() => {
        if (currentPost?.media_url && currentIsVideo) {
            setVideoBuffering(true);
            player.replace(currentPost.media_url);
            player.loop = true;
            player.play();
        } else {
            player.pause();
        }
    }, [currentPost?.media_url, currentIsVideo]);

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
            {/* Media Content */}
            {currentIsVideo ? (
                <View style={styles.image}>
                    <VideoView
                        style={{ width: '100%', height: '100%' }}
                        player={player}
                        contentFit="cover"
                        nativeControls={false}
                    />
                    {videoBuffering && (
                        <View style={styles.bufferingOverlay}>
                            <ActivityIndicator size="large" color="white" />
                        </View>
                    )}
                </View>
            ) : (
                <Image source={{ uri: currentPost.media_url }} style={styles.image} resizeMode="cover" />
            )}

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
                            <Text style={styles.venueName}>{venue?.name || 'Venue'}</Text>
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
