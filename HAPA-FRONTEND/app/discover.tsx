
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { useUpload } from '@/contexts/UploadContext';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Location from 'expo-location';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MediaPreview } from '@/components/MediaPreview';
import { SkeletonBox } from '@/components/Skeleton';
import { apiFetch, clearAuthTokens, getTransformedImageUrl, isVideoUrl } from '@/lib/api';
import { estimateTravelTime, getUserCityAndCoords, UserLocation, getLocationPermission } from '@/lib/location';
import { openDirections } from '@/lib/directions';
import { getTimeAgo } from '@/lib/time';

const { width } = Dimensions.get('window');

// Bottom Bar Config
const TAB_WIDTH = 240;
const TAB_ITEM_WIDTH = TAB_WIDTH / 2;

export default function DiscoverScreen() {
    const router = useRouter();
    const { pendingPost } = useUpload();
    const [activeTab, setActiveTab] = useState('home');
    const [venues, setVenues] = useState<any[]>([]);
    const [nearbyVenues, setNearbyVenues] = useState<any[]>([]);
    const [rawPosts, setRawPosts] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
    const [loadingFeed, setLoadingFeed] = useState(true);
    const [loadingNearby, setLoadingNearby] = useState(false);
    const [feedError, setFeedError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [loadingLocation, setLoadingLocation] = useState(true);
    const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const translateX = useSharedValue(0);

    const handleTabPress = useCallback((tab: 'home' | 'search') => {
        setActiveTab(tab);
        if (tab === 'home') {
            translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
        } else {
            translateX.value = withSpring(TAB_ITEM_WIDTH, { damping: 15, stiffness: 120 });
        }
    }, [translateX]);

    const handleSignOut = useCallback(async () => {
        await clearAuthTokens();
        await AsyncStorage.removeItem('hapa_launch_preference');
        router.replace('/');
    }, [router]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    const loadFeed = useCallback(async (loc: UserLocation | null) => {
        try {
            setLoadingFeed(true);
            setFeedError(null);
            // Discover Feed (Home) uses City filtering as per requirements
            const cityParam = loc?.city ? `?city=${encodeURIComponent(loc.city)}` : '';
            const data = await apiFetch(`/api/discover/feed${cityParam}`);
            setVenues(data.venues || []);
            setRawPosts(data.posts || []);
        } catch (e: any) {
            setFeedError(e?.message || 'Could not load vibes. Check your connection.');
            setVenues([]);
            setRawPosts([]);
        } finally {
            setLoadingFeed(false);
            setRefreshing(false);
        }
    }, []);

    const loadNearby = useCallback(async (loc: UserLocation) => {
        try {
            setLoadingNearby(true);
            // Search Tab "Near You" uses Coordinates
            const params = `?lat=${encodeURIComponent(loc.latitude)}&lng=${encodeURIComponent(loc.longitude)}&radius_km=10`;
            const data = await apiFetch(`/api/discover/feed${params}`);
            setNearbyVenues(data.venues || []);
        } catch (e) {
            console.error('Near You error:', e);
            setNearbyVenues([]);
        } finally {
            setLoadingNearby(false);
        }
    }, []);

    // Memoized: stories strip — computed only when venues or rawPosts change
    const stories = useMemo(() => {
        const result: any[] = [];
        // Max 5 places for stories (Top 5 Places Today)
        const cityVenues = venues.slice(0, 15); // Take a sample to find posts
        for (const v of cityVenues) {
            if (result.length >= 5) break;

            const venuePosts = rawPosts.filter((p: any) => p.venue_id === v.id);
            if (venuePosts.length > 0) {
                venuePosts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                result.push({
                    id: venuePosts[0].id,
                    venueId: v.id,
                    name: v.name,
                    image: v.images?.[0],
                    active: true,
                    lat: v.lat,
                    lng: v.lng,
                });
            }
        }

        // Optimistic UI: Inject pending post to stories strip
        if (pendingPost) {
            // Find the venue for this post (we don't have the exact venue_id in pendingPost, but we can assume it's the current user's venue which should be one of the venues in the feed or near you)
            // Just use a placeholder name and image for now, or find it from the list
            result.unshift({
                id: pendingPost.id,
                venueId: 'me', // Assuming the pending post is for the current user's venue
                name: 'Your venue',
                image: pendingPost.media_type === 'image' ? pendingPost.media_url : undefined,
                active: true,
                isPending: true,
                lat: userLocation?.latitude,
                lng: userLocation?.longitude,
            });
        }

        return result;
    }, [venues, rawPosts, pendingPost, userLocation]);

    // Memoized: hero card per venue — computed only when rawPosts or venues change
    const highlights = useMemo(() => {
        const latestPerVenue: Record<string, any> = {};
        rawPosts.forEach((p: any) => {
            const venueId = p.venue_id;
            if (!venueId) return;
            const existing = latestPerVenue[venueId];
            if (!existing || new Date(p.created_at).getTime() > new Date(existing.created_at).getTime()) {
                latestPerVenue[venueId] = p;
            }
        });
        return Object.entries(latestPerVenue).reduce((acc: { venue: any; post: any }[], [venueId, post]) => {
            const venue = venues.find((v: any) => v.id === venueId);
            if (venue) acc.push({ venue, post });
            return acc;
        }, []);
    }, [venues, rawPosts]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadFeed(userLocation);
    }, [loadFeed, userLocation]);

    const requestLocation = async () => {
        try {
            setLoadingLocation(true);
            const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
            setLocationPermission(status as any);

            if (status === 'granted') {
                const loc = await getUserCityAndCoords();
                if (loc) {
                    setUserLocation(loc);
                    await Promise.all([
                        loadFeed(loc),
                        loadNearby(loc)
                    ]);
                }
            } else if (!canAskAgain) {
                Alert.alert(
                    'Location Permission Required',
                    'HAPA needs location access to find vibes near you. Please enable it in your device settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]
                );
            }
        } catch (e) {
            console.error('Location error:', e);
            await loadFeed(null);
        } finally {
            setLoadingLocation(false);
        }
    };

    useEffect(() => {
        const checkInitialPermission = async () => {
            const { status } = await Location.getForegroundPermissionsAsync();
            setLocationPermission(status as any);

            if (status === 'granted') {
                const loc = await getUserCityAndCoords();
                if (loc) {
                    setUserLocation(loc);
                    await Promise.all([
                        loadFeed(loc),
                        loadNearby(loc)
                    ]);
                } else {
                    await loadFeed(null);
                }
                setLoadingLocation(false);
            } else {
                // If not granted, we show the gate, so we still set loading to false to show the UI
                setLoadingLocation(false);
            }
        };

        checkInitialPermission();
    }, [loadFeed]);

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
            const params = new URLSearchParams({
                q: text.trim(),
            });

            if (userLocation) {
                params.append('lat', userLocation.latitude.toString());
                params.append('lng', userLocation.longitude.toString());
            }

            const data = await apiFetch(`/api/discover/search?${params.toString()}`);
            setSearchResults(data.venues || []);
        } catch (e) {
            console.error('Search error:', e);
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



    if (loadingLocation) {
        return (
            <ScreenWrapper>
                <View style={[styles.scrollContainer, { justifyContent: 'center', alignItems: 'center' }]}>
                    <SkeletonBox width={100} height={100} borderRadius={50} />
                    <View style={{ marginTop: 24 }}>
                        <SkeletonBox width={200} height={32} borderRadius={16} />
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

    if (locationPermission !== 'granted') {
        return (
            <ScreenWrapper>
                <View style={styles.gateOverlay}>
                    <View style={styles.gateContent}>
                        <View style={styles.permissionCircle}>
                            <Ionicons name="location" size={48} color={Colors.cta.primary} />
                        </View>
                        <Text style={styles.permissionTitle}>Enable Location Access</Text>
                        <Text style={styles.permissionText}>
                            Allow HAPA to use your location to find the hottest vibes and venues near you right now.
                            This helps us show you places you can actually reach in your city.
                        </Text>

                        <TouchableOpacity
                            style={styles.permissionButton}
                            onPress={requestLocation}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.permissionButtonText}>ALLOW LOCATION ACCESS</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.gateSignOutButton}
                            onPress={handleSignOut}
                        >
                            <Text style={styles.gateSignOutText}>Sign Out</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

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
                                onPress={handleSignOut}
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
                                        style={[styles.storyItem, item.isPending && { opacity: 0.7 }]}
                                        onPress={() => {
                                            if (!item.isPending) {
                                                router.push({ pathname: '/story/[id]', params: { id: item.id, venueId: item.venueId } });
                                            }
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <LinearGradient
                                            colors={item.active ? ['#FF4FA3', '#FFD700'] : ['transparent', 'transparent']}
                                            style={styles.gradientBorder}
                                        >
                                            <View style={styles.avatarInner}>
                                                {item.image ? (
                                                    <Image source={{ uri: item.image }} style={styles.avatar} />
                                                ) : (
                                                    <View style={styles.avatar} />
                                                )}
                                            </View>
                                        </LinearGradient>
                                        <Text style={styles.storyName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.distanceText}>
                                            {userLocation && item.lat && item.lng
                                                ? estimateTravelTime(userLocation.latitude, userLocation.longitude, item.lat, item.lng)
                                                : item.isPending ? 'Sending...' : ''}
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
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={Colors.cta.primary}
                                colors={[Colors.cta.primary]}
                            />
                        }
                    >
                        {/* Feed Section Title */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Vibes Today</Text>
                        </View>

                        {/* Vertical Feed */}
                        <View style={styles.feedContainer}>
                            {loadingFeed && highlights.length === 0 ? (
                                <>
                                    {[1, 2, 3].map((i) => (
                                        <View key={i} style={styles.venueCard}>
                                            <SkeletonBox width="100%" height={380} borderRadius={16} />
                                        </View>
                                    ))}
                                </>
                            ) : feedError ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.4)" />
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 16, textAlign: 'center' }}>
                                        {feedError}
                                    </Text>
                                    <TouchableOpacity
                                        style={{ marginTop: 20, backgroundColor: Colors.cta.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
                                        onPress={() => loadFeed(userLocation)}
                                    >
                                        <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Try Again</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : highlights.length === 0 ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <Ionicons name="sparkles-outline" size={48} color="rgba(255,255,255,0.4)" />
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: '700', marginTop: 16 }}>
                                        No Vibes Yet
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                                        Venues near you haven't posted today.
                                        Pull down to refresh.
                                    </Text>
                                </View>
                            ) : (
                                highlights.map(({ venue, post }) => (
                                    <TouchableOpacity
                                        key={post.id}
                                        style={styles.venueCard}
                                        activeOpacity={0.95}
                                        onPress={() => router.push(`/venue/${venue.id}`)}
                                    >
                                        <MediaPreview uri={isVideoUrl(post.media_url) ? post.media_url : getTransformedImageUrl(post.media_url, 800)} style={styles.cardImage} />

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

                                            {(venue.lat && venue.lng) && (
                                                <TouchableOpacity
                                                    style={styles.directionsButton}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        openDirections(venue.lat, venue.lng, venue.name);
                                                    }}
                                                >
                                                    <Ionicons name="navigate" size={16} color="white" />
                                                    <Text style={styles.directionsButtonText}>GET DIRECTIONS</Text>
                                                </TouchableOpacity>
                                            )}
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
                            {locationPermission !== 'granted' && searchQuery.length === 0 ? (
                                <View style={styles.permissionContainer}>
                                    <View style={styles.permissionCircle}>
                                        <Ionicons name="location" size={32} color={Colors.cta.primary} />
                                    </View>
                                    <Text style={styles.permissionTitle}>Location Access Required</Text>
                                    <Text style={styles.permissionText}>
                                        Something went wrong. Please ensure location is enabled to use search.
                                    </Text>
                                    <TouchableOpacity style={styles.permissionButton} onPress={requestLocation}>
                                        <Text style={styles.permissionButtonText}>RETRY LOCATION</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : searchQuery.length > 0 && searchResults.length === 0 ? (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>
                                        No venues found for "{searchQuery}"
                                    </Text>
                                </View>
                            ) : (
                                (searchQuery.length > 0 ? searchResults : nearbyVenues).map((venue) => (
                                    <TouchableOpacity
                                        key={venue.id}
                                        style={styles.searchCard}
                                        activeOpacity={0.95}
                                        onPress={() => router.push(`/venue/${venue.id}`)}
                                    >
                                        {/* Top Image Section */}
                                        <View style={styles.searchCardImageWrapper}>
                                            <Image source={{ uri: getTransformedImageUrl(venue.images?.[0], 400) }} style={styles.searchCardImage} resizeMode="cover" />
                                            <View style={styles.searchCardLogoContainer}>
                                                <Image source={{ uri: getTransformedImageUrl(venue.images?.[0], 80, 90, 'contain') }} style={styles.searchCardLogo} />
                                            </View>
                                        </View>

                                        {/* Bottom Info Section */}
                                        <View style={styles.searchCardInfo}>
                                            <View style={styles.cardRow}>
                                                <Text style={styles.searchCardName} numberOfLines={1}>{venue.name}</Text>
                                                {userLocation && venue.lat && venue.lng && (
                                                    <Text style={styles.searchCardDistance}>
                                                        {estimateTravelTime(userLocation.latitude, userLocation.longitude, venue.lat, venue.lng)}
                                                    </Text>
                                                )}
                                            </View>
                                            <Text style={styles.searchCardTagline} numberOfLines={1}>
                                                {venue.categories?.length > 0 ? venue.categories.join(' • ') : venue.type}
                                            </Text>

                                            {(venue.lat && venue.lng) && (
                                                <TouchableOpacity
                                                    style={styles.searchDirectionsButton}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        openDirections(venue.lat, venue.lng, venue.name);
                                                    }}
                                                >
                                                    <Ionicons name="navigate" size={14} color="white" />
                                                    <Text style={styles.searchDirectionsText}>DIRECTIONS</Text>
                                                </TouchableOpacity>
                                            )}
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
        fontSize: 22,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    gateOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        backgroundColor: '#141414',
    },
    gateContent: {
        alignItems: 'center',
        width: '100%',
    },
    permissionCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    permissionTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: 'white',
        textAlign: 'center',
        marginBottom: 16,
    },
    permissionText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    permissionButton: {
        backgroundColor: Colors.cta.primary,
        paddingVertical: 18,
        paddingHorizontal: 32,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    permissionButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    gateSignOutButton: {
        marginTop: 32,
        padding: 12,
    },
    gateSignOutText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 15,
        fontWeight: '600',
    },
    permissionContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
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
    directionsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.cta.primary,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 12,
        gap: 6,
    },
    directionsButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
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
    searchDirectionsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignSelf: 'flex-end',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        marginTop: -20, // Pull it up to align with text
        gap: 4,
    },
    searchDirectionsText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '700',
    },
    searchCardName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
        flex: 1,
        marginRight: 8,
    },
    searchCardDistance: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.cta.primary,
    },
    searchCardTagline: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginTop: 4,
    },
});
