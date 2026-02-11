
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SkeletonBox, SkeletonCircle } from '@/components/Skeleton';
import { apiFetch } from '@/lib/api';
import { getTimeAgo } from '@/lib/time';
import { getVenueStatusText, isVenueOpen } from '@/lib/venue';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

export default function PublicVenueProfileScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [venue, setVenue] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);

    const venueId = useMemo(() => (Array.isArray(id) ? id[0] : (id as string)), [id]);

    useEffect(() => {
        const load = async () => {
            try {
                const v = await apiFetch(`/api/venues/${venueId}`);
                setVenue(v.venue);
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

    const images = (venue?.images?.length ? venue.images : []) as string[];

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    }).current;

    return (
        <View style={styles.container}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>

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
                            onViewableItemsChanged={onViewableItemsChanged}
                            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
                            renderItem={({ item }) => (
                                <Image source={{ uri: item }} style={styles.slideImage} resizeMode="cover" />
                            )}
                        />
                    ) : (
                        <View style={[styles.slideImage, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
                    )}

                    {/* Header Gradient Overlay */}
                    <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent']} style={styles.headerGradient} />

                    {/* Back Button */}
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={28} color="white" />
                    </TouchableOpacity>

                    {/* Pagination Indicator (1 of 4) */}
                    {!loading && images.length > 0 && (
                        <View style={styles.paginationBadge}>
                            <Text style={styles.paginationText}>
                                {activeIndex + 1} of {images.length}
                            </Text>
                        </View>
                    )}
                </View>

                <ScreenWrapper style={styles.contentWrapper}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarRow}>
                            {loading ? (
                                <SkeletonCircle size={80} />
                            ) : (
                                <Image
                                    source={{ uri: venue?.images?.[0] }}
                                    style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
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
                                        <Text style={styles.venueName}>{venue?.name ?? 'Venue'}</Text>
                                        <Text style={styles.category}>
                                            {venue?.type ?? 'Venue'} • {venue?.area ?? ''}
                                        </Text>
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
                            <TouchableOpacity style={styles.actionButton}>
                                <Ionicons name="call-outline" size={20} color="white" />
                                <Text style={styles.actionText}>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton}>
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

                    {/* Bigger Post Cards (Horizontal Scroll) */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.postsContainer}
                    >
                        {loading ? (
                            <>
                                {[1, 2, 3].map(i => (
                                    <View key={i} style={styles.postCard}>
                                        <SkeletonBox width="100%" height={250} borderRadius={16} />
                                    </View>
                                ))}
                            </>
                        ) : (
                            posts.map(p => (
                                <TouchableOpacity
                                    key={p.id}
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
                                        <Text style={styles.postTime}>{getTimeAgo(p.created_at)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>

                    {/* Spacer for bottom */}
                    <View style={{ height: 40 }} />

                </ScreenWrapper>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background.gradient[2],
    },
    slideshowContainer: {
        height: HEADER_HEIGHT,
        width: '100%',
        position: 'relative',
    },
    slideImage: {
        width: width,
        height: HEADER_HEIGHT,
    },
    headerGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    backButton: {
        position: 'absolute',
        top: 50,
        left: 20,
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    paginationBadge: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    paginationText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
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
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: 'white',
    },
    headerInfo: {
        flex: 1,
    },
    venueName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.text.primary,
    },
    category: {
        color: Colors.text.secondary,
        fontSize: 14,
        marginTop: 4,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 6,
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
    postsContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 16,
    },
    postCard: {
        width: 160,
        height: 250,
        borderRadius: 16,
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
        left: 12,
        right: 12,
    },
    postCaption: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    postTime: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 10,
    }
});
