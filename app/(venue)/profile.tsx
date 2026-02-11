
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SkeletonBox, SkeletonCircle } from '@/components/Skeleton';

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

    // Track View
    useEffect(() => {
        if (venue?.id) {
            // Fire and forget
            apiFetch(`/api/venues/${venue.id}/view`, { method: 'POST', auth: true }).catch(() => { });
        }
    }, [venue?.id]);

    if (!venue && !loading) {
        return (
            <ScreenWrapper>
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
                                <Text style={styles.name}>{venue?.name}</Text>
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
                                    {venue?.area ? `${venue.area}, ${venue.city}` : venue?.city}
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
                                    <Image source={{ uri: post.media_url }} style={styles.gridImage} />
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
        padding: 20, // Reduced from 24
        marginTop: -60, // Pulled up more (was -50)
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
});
