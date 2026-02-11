
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiFetch } from '@/lib/api';

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

    const postId = useMemo(() => (Array.isArray(id) ? id[0] : (id as string)), [id]);
    const vId = useMemo(() => (Array.isArray(venueId) ? venueId[0] : (venueId as string)), [venueId]);

    // Load Data
    useEffect(() => {
        const load = async () => {
            try {
                if (vId) {
                    // Fetch all stories for this venue
                    const data = await apiFetch(`/api/posts/venue/${vId}`);
                    const allPosts = data.posts || [];

                    if (allPosts.length === 0) {
                        router.back();
                        return;
                    }

                    // Find index of the clicked post
                    const idx = allPosts.findIndex((p: any) => p.id === postId);
                    setPosts(allPosts);
                    setCurrentIndex(idx >= 0 ? idx : 0);

                    const venueData = await apiFetch(`/api/venues/${vId}`);
                    setVenue(venueData.venue);
                } else {
                    const data = await apiFetch(`/api/posts/${postId}`);
                    setPosts([data.post]);
                    setCurrentIndex(0);
                    setVenue(data.venue);
                }
            } catch (e) {
                console.error("Failed to load story", e);
                router.back();
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [postId, vId]);

    const currentPost = posts[currentIndex];

    // Video Player
    const player = useVideoPlayer(currentPost?.media_url, player => {
        if (currentPost?.media_type === 'video') {
            player.loop = true;
            player.play();
        }
    });

    useEffect(() => {
        if (currentPost?.media_type === 'video') {
            player.replaceAsync(currentPost.media_url);
            player.play();
        } else {
            player.pause();
        }
    }, [currentPost, player]);

    // Auto Progress Timer
    useEffect(() => {
        if (loading || !currentPost) return;

        setProgress(0);
        const intervalMs = 100;
        const durationMs = currentPost.media_type === 'video' ? 10000 : 5000;
        const step = (intervalMs / durationMs) * 100;

        const timer = setInterval(() => {
            setProgress(old => {
                if (old >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                return old + step;
            });
        }, intervalMs);

        return () => clearInterval(timer);
    }, [currentIndex, loading, currentPost]);

    // Handle Progress Completion (Navigation)
    // We use a separate effect to avoid "updating component while rendering" error
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
            // Revert on error (optional)
        }
    };

    if (loading || !currentPost) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="white" style={{ marginTop: 100 }} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Media Content */}
            {currentPost.media_type === 'video' ? (
                <VideoView
                    style={styles.image}
                    player={player}
                    contentFit="cover"
                    nativeControls={false}
                />
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
});
