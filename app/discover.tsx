
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Dimensions, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SkeletonBox } from '@/components/Skeleton';
import { apiFetch } from '@/lib/api';
import { estimateTravelTime, getUserCityAndCoords, UserLocation } from '@/lib/location';
import { getTimeAgo } from '@/lib/time';

const { width } = Dimensions.get('window');

// Bottom Bar Config
const TAB_WIDTH = 240;
const TAB_ITEM_WIDTH = TAB_WIDTH / 2;

export default function DiscoverScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('home');
    const [stories, setStories] = useState<any[]>([]);
    const [venues, setVenues] = useState<any[]>([]);
    const [highlights, setHighlights] = useState<{ venue: any; post: any }[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
    const [loadingFeed, setLoadingFeed] = useState(true);
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [loadingLocation, setLoadingLocation] = useState(true);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const translateX = useSharedValue(0);

    const handleTabPress = (tab: 'home' | 'search') => {
        setActiveTab(tab);
        if (tab === 'home') {
            translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
        } else {
            translateX.value = withSpring(TAB_ITEM_WIDTH, { damping: 15, stiffness: 120 });
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    useEffect(() => {
        const loadLocationAndFeed = async () => {
            try {
                setLoadingLocation(true);
                const loc = await getUserCityAndCoords();
                if (loc) {
                    setUserLocation(loc);
                }
            } catch {
                // ignore, fall back to default city
            } finally {
                setLoadingLocation(false);
            }

            try {
                setLoadingFeed(true);
                const params =
                    userLocation != null
                        ? `?lat=${encodeURIComponent(
                            userLocation.latitude,
                        )}&lng=${encodeURIComponent(userLocation.longitude)}`
                        : '';
                const data = await apiFetch(`/api/discover/feed${params}`);
                const vs = data.venues || [];
                const ps = data.posts || [];

                setVenues(vs);

                // Stories strip – one bubble per venue for now (requires a post)
                const venueStories: any[] = [];
                vs.forEach((v: any) => {
                    // Find latest post for this venue
                    const venuePosts = (ps as any[]).filter(p => p.venue_id === v.id);
                    if (venuePosts.length > 0) {
                        // Sort by created_at desc
                        venuePosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                        const latestPost = venuePosts[0];
                        venueStories.push({
                            id: latestPost.id, // Link to POST ID, not Venue ID
                            venueId: v.id,
                            name: v.name,
                            image: v.images?.[0],
                            active: true,
                            latitude: v.latitude,
                            longitude: v.longitude,
                        });
                    }
                });
                setStories(venueStories);

                // Compute hero post per venue (latest by created_at)
                const latestPerVenue: Record<string, any> = {};
                (ps as any[]).forEach((p) => {
                    const venueId = p.venue_id;
                    if (!venueId) return;
                    const existing = latestPerVenue[venueId];
                    if (!existing) {
                        latestPerVenue[venueId] = p;
                    } else {
                        const a = new Date(p.created_at ?? 0).getTime();
                        const b = new Date(existing.created_at ?? 0).getTime();
                        if (a > b) {
                            latestPerVenue[venueId] = p;
                        }
                    }
                });

                const heroItems: { venue: any; post: any }[] = [];
                Object.entries(latestPerVenue).forEach(([venueId, post]) => {
                    const venue = vs.find((v: any) => v.id === venueId);
                    if (venue) {
                        heroItems.push({ venue, post });
                    }
                });
                setHighlights(heroItems);
            } catch (e) {
                // Fallback: empty feed on error for now
                setVenues([]);
                setStories([]);
                setHighlights([]);
            } finally {
                setLoadingFeed(false);
            }
        };

        loadLocationAndFeed();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchLocationSuggestions = async (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length < 3) {
            setLocationSuggestions([]);
            return;
        }

        try {
            const params =
                userLocation != null
                    ? `?q=${encodeURIComponent(trimmed)}&lat=${encodeURIComponent(
                        userLocation.latitude,
                    )}&lng=${encodeURIComponent(userLocation.longitude)}`
                    : `?q=${encodeURIComponent(trimmed)}`;
            const res = await apiFetch(`/api/locations/suggest${params}`);
            setLocationSuggestions(res.suggestions || []);
        } catch {
            setLocationSuggestions([]);
        }
    };

    const fetchSearchResults = async (text: string) => {
        if (!text.trim()) {
            setSearchResults([]);
            return;
        }
        try {
            const params =
                userLocation != null
                    ? `?q=${encodeURIComponent(text.trim())}&lat=${encodeURIComponent(
                        userLocation.latitude,
                    )}&lng=${encodeURIComponent(userLocation.longitude)}`
                    : `?q=${encodeURIComponent(text.trim())}`;
            const data = await apiFetch(`/api/discover/search${params}`);
            setSearchResults(data.venues || []);
        } catch {
            setSearchResults([]);
        }
    };

    const handleSearchChange = (text: string) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setSearchResults([]);
            setLocationSuggestions([]);
            return;
        }

        // Fetch suggestions as we type
        fetchLocationSuggestions(text);

        // Also fetch live results (optional, but good for UX)
        // Check if we effectively want this or wait for submit.
        fetchSearchResults(text);
    };

    const handleSearchSubmit = () => {
        // Hides suggestions and ensures we have the latest results
        setLocationSuggestions([]);
        fetchSearchResults(searchQuery);
    };



    return (
        <ScreenWrapper>

            {/* HOME VIEW */}
            {activeTab === 'home' && (
                <>
                    {/* Fixed Top Section: Header & Stories */}
                    <View style={styles.fixedTopSection}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View>
                                {loadingLocation ? (
                                    <SkeletonBox width={140} height={24} borderRadius={12} />
                                ) : (
                                    <Text style={styles.cityText}>
                                        {userLocation?.city || 'Your City'}
                                    </Text>
                                )}
                                <View style={styles.subHeader}>
                                    <Text style={styles.fireEmoji}>🔥</Text>
                                    <Text style={styles.subHeaderText}>Top 5 Places Today</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={styles.iconButton}
                                activeOpacity={0.7}
                                onPress={() => router.replace('/')}
                            >
                                <Ionicons name="log-out-outline" size={24} color={Colors.text.primary} />
                            </TouchableOpacity>
                        </View>

                        {/* Stories Ring - Fixed */}
                        <View style={styles.storiesContainer}>
                            <FlatList
                                data={stories}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={item => item.id}
                                contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.storyItem}
                                        onPress={() => router.push({ pathname: '/story/[id]', params: { id: item.id, venueId: item.venueId } })}
                                        activeOpacity={0.8}
                                    >
                                        <LinearGradient
                                            colors={item.active ? ['#FF4FA3', '#FFD700'] : ['transparent', 'transparent']}
                                            style={styles.gradientBorder}
                                        >
                                            <View style={styles.avatarInner}>
                                                <Image source={{ uri: item.image }} style={styles.avatar} />
                                            </View>
                                        </LinearGradient>
                                        <Text style={styles.storyName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.distanceText}>
                                            {userLocation && item.latitude && item.longitude
                                                ? estimateTravelTime(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude)
                                                : ''}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </View>

                    {/* Scrollable Feed Section */}
                    <ScrollView
                        style={styles.scrollContainer}
                        contentContainerStyle={styles.contentContainer}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Feed Section Title */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Vibes Today</Text>
                        </View>

                        {/* Vertical Feed */}
                        <View style={styles.feedContainer}>
                            {highlights.length === 0 ? (
                                <>
                                    {[1, 2, 3].map((i) => (
                                        <View key={i} style={styles.venueCard}>
                                            <SkeletonBox width="100%" height={380} borderRadius={16} />
                                        </View>
                                    ))}
                                </>
                            ) : (
                                highlights.map(({ venue, post }) => (
                                    <TouchableOpacity
                                        key={post.id}
                                        style={styles.venueCard}
                                        activeOpacity={0.95}
                                        onPress={() => router.push(`/venue/${venue.id}`)}
                                    >
                                        <Image source={{ uri: post.media_url }} style={styles.cardImage} resizeMode="cover" />

                                        {/* Card Overlay Content */}
                                        <LinearGradient
                                            colors={['transparent', 'rgba(0,0,0,0.8)', '#141414']}
                                            style={styles.cardGradientOverlay}
                                        />



                                        <View style={styles.cardContent}>
                                            <View style={styles.cardRow}>
                                                <Text style={styles.venueName}>{venue.name}</Text>
                                                <View style={styles.timeBadge}>
                                                    <Text style={styles.timeAgo}>{getTimeAgo(post.created_at)}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.venueArea}>{venue.area}</Text>
                                            <View style={styles.eventRow}>
                                                <Ionicons name="flash" size={12} color="#FFD700" style={{ marginRight: 4 }} />
                                                <Text style={styles.eventName}>{venue.type}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>
                    </ScrollView>
                </>
            )}

            {/* SEARCH VIEW */}
            {activeTab === 'search' && (
                <View style={[styles.scrollContainer, { paddingTop: 60 }]}>
                    <View style={styles.searchHeaderContainer}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" style={{ marginRight: 10 }} />
                            <TextInput
                                placeholder="Search where vibes are?"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                style={styles.searchInput}
                                autoFocus={false}
                                value={searchQuery}
                                onChangeText={handleSearchChange}
                                returnKeyType="search"
                                onSubmitEditing={handleSearchSubmit}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={handleSearchSubmit}>
                                    <Ionicons name="arrow-forward-circle" size={24} color="white" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {showSuggestions && locationSuggestions.length > 0 && (
                        <View style={styles.suggestionList}>
                            {locationSuggestions.map((s: any) => (
                                <TouchableOpacity
                                    key={s.id}
                                    style={styles.suggestionItem}
                                    onPress={() => {
                                        // Use the NAME for searching, as the address isn't always searchable
                                        const value = s.name;
                                        setSearchQuery(value);
                                        // Hide suggestions immediately
                                        setShowSuggestions(false);
                                        // Perform search
                                        fetchSearchResults(value);
                                    }}
                                >
                                    <Text style={styles.suggestionText}>{s.name}</Text>
                                    {!!s.address && (
                                        <Text style={styles.suggestionSubText} numberOfLines={1}>
                                            {s.address}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <ScrollView
                        contentContainerStyle={styles.contentContainer}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={[styles.sectionTitle, { marginLeft: 20, marginBottom: 16 }]}>
                            {searchQuery.length > 0 ? "Search Results" : "Near You"}
                        </Text>

                        <View style={styles.feedContainer}>
                            {searchQuery.length > 0 && searchResults.length === 0 ? (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>
                                        No venues found for "{searchQuery}"
                                    </Text>
                                </View>
                            ) : (
                                (searchQuery.length > 0 ? searchResults : venues).map((venue) => (
                                    <TouchableOpacity
                                        key={venue.id}
                                        style={styles.searchCard}
                                        activeOpacity={0.95}
                                        onPress={() => router.push(`/venue/${venue.id}`)}
                                    >
                                        {/* Top Image Section */}
                                        <View style={styles.searchCardImageWrapper}>
                                            <Image source={{ uri: venue.images?.[0] }} style={styles.searchCardImage} resizeMode="cover" />
                                            <View style={styles.searchCardLogoContainer}>
                                                <Image source={{ uri: venue.images?.[0] }} style={styles.searchCardLogo} />
                                            </View>
                                        </View>

                                        {/* Bottom Info Section */}
                                        <View style={styles.searchCardInfo}>
                                            <View style={styles.cardRow}>
                                                <Text style={styles.searchCardName}>{venue.name}</Text>
                                                <Text style={styles.searchCardTime}>Now</Text>
                                            </View>
                                            <Text style={styles.searchCardArea}>{venue.area}</Text>
                                            <Text style={styles.searchCardEvent}>{venue.type}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* Bottom Bar Container */}
            <View style={styles.bottomBarWrapper}>
                <BlurView intensity={20} tint="dark" style={styles.bottomBar}>

                    {/* Sliding Indicator */}
                    <View style={styles.switchContainer}>
                        <Animated.View style={[styles.activeIndicator, animatedStyle]} />

                        <TouchableOpacity
                            activeOpacity={1}
                            style={styles.navItem}
                            onPress={() => handleTabPress('home')}
                        >
                            <Ionicons
                                name="home"
                                size={24}
                                color={activeTab === 'home' ? 'white' : 'rgba(255,255,255,0.5)'}
                            />
                            <Text style={[
                                styles.navText,
                                { color: activeTab === 'home' ? 'white' : 'rgba(255,255,255,0.5)' }
                            ]}>Home</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={1}
                            style={styles.navItem}
                            onPress={() => handleTabPress('search')}
                        >
                            <Ionicons
                                name="search"
                                size={24}
                                color={activeTab === 'search' ? 'white' : 'rgba(255,255,255,0.5)'}
                            />
                            <Text style={[
                                styles.navText,
                                { color: activeTab === 'search' ? 'white' : 'rgba(255,255,255,0.5)' }
                            ]}>Search</Text>
                        </TouchableOpacity>
                    </View>

                </BlurView>
            </View>

        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    fixedTopSection: {
        paddingBottom: 10,
        backgroundColor: 'transparent',
        zIndex: 10,
    },
    scrollContainer: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 120,
    },
    header: {
        paddingHorizontal: 16, // iOS margin
        paddingTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cityText: {
        fontSize: 32,
        fontWeight: '800',
        color: Colors.text.primary,
        letterSpacing: -0.5,
    },
    subHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    fireEmoji: {
        fontSize: 16,
        marginRight: 6,
    },
    subHeaderText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 15, // iOS Footnote
        fontWeight: '500',
    },
    iconButton: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    storiesContainer: {
        marginTop: 24,
    },
    storyItem: {
        alignItems: 'center',
        width: 76,
    },
    gradientBorder: {
        width: 72,
        height: 72,
        borderRadius: 36,
        padding: 3,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInner: {
        backgroundColor: '#1C1C1C',
        width: '100%',
        height: '100%',
        borderRadius: 36,
        padding: 2,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 34,
        backgroundColor: '#333',
    },
    storyName: {
        color: Colors.text.primary,
        fontSize: 12,
        marginTop: 6,
        fontWeight: '600',
        textAlign: 'center',
    },
    distanceText: {
        color: Colors.text.secondary,
        fontSize: 10,
        marginTop: 2,
    },
    sectionHeader: {
        paddingHorizontal: 16,
        marginTop: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 22, // title 2
        fontWeight: 'bold',
        color: Colors.text.primary,
        letterSpacing: 0.5,
    },
    feedContainer: {
        paddingHorizontal: 16,
        gap: 24,
    },
    venueCard: {
        backgroundColor: '#1C1C1C',
        borderRadius: 16, // iOS Card radius
        overflow: 'hidden',
        height: 380,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    cardGradientOverlay: {
        ...StyleSheet.absoluteFillObject,
        top: '40%',
    },
    likeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    cardLogoContainer: {
        position: 'absolute',
        top: 16,
        left: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.95)',
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardLogo: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    cardContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16, // iOS margin
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    venueName: {
        color: Colors.text.primary,
        fontSize: 20,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    timeBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    timeAgo: {
        color: 'white',
        fontSize: 10,
        fontWeight: '700',
    },
    venueArea: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 8,
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    eventName: {
        color: Colors.cta.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    bottomBarWrapper: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        borderRadius: 100,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
        backgroundColor: 'rgba(28, 28, 28, 0.9)',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    switchContainer: {
        flexDirection: 'row',
        position: 'relative',
        width: TAB_WIDTH,
        height: 56,
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 30,
    },
    activeIndicator: {
        position: 'absolute',
        left: 0,
        width: TAB_ITEM_WIDTH,
        height: '100%',
        backgroundColor: Colors.cta.primary,
        borderRadius: 30,
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
    },
    navItem: {
        width: TAB_ITEM_WIDTH,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        zIndex: 1,
    },
    navText: {
        fontWeight: '700',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    // SEARCH STYLES
    searchHeaderContainer: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)', // Glass effect
        borderRadius: 12, // iOS search bar style
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        color: 'white',
        fontSize: 17, // iOS body size
    },
    suggestionList: {
        marginHorizontal: 16,
        marginTop: 8,
        backgroundColor: 'rgba(0,0,0,0.9)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    suggestionItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    suggestionText: {
        color: Colors.text.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    suggestionSubText: {
        color: Colors.text.secondary,
        fontSize: 12,
        marginTop: 2,
    },
    searchCard: {
        backgroundColor: '#1C1C1C',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 16,
    },
    searchCardImageWrapper: {
        height: 140,
        position: 'relative',
    },
    searchCardImage: {
        width: '100%',
        height: '100%',
    },
    searchCardLogoContainer: {
        position: 'absolute',
        top: 10,
        left: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'white',
        padding: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchCardLogo: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    searchCardInfo: {
        padding: 16,
    },
    searchCardName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    searchCardTime: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    searchCardArea: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginTop: 2,
    },
    searchCardEvent: {
        color: 'white',
        fontWeight: '600',
        marginTop: 8,
    },
});
