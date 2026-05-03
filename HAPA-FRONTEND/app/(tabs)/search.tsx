import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, FlatList, Image, Dimensions } from 'react-native';
import { apiFetch } from '@/lib/api';
import { SearchSkeleton } from '@/components/SkeletonLoader';

const { width } = Dimensions.get('window');

const CATEGORIES = [
    { id: 'nightclubs', name: 'Nightclubs', icon: 'musical-notes', color: '#8E44AD', image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=400' },
    { id: 'bars', name: 'Bars', icon: 'wine', color: '#E67E22', image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400' },
    { id: 'jazz', name: 'Jazz', icon: 'mic', color: '#2C3E50', image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=400' },
    { id: 'rooftops', name: 'Rooftops', icon: 'business', color: '#3498DB', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400' },
    { id: 'restaurants', name: 'Restaurants', icon: 'restaurant', color: '#27AE60', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400' },
    { id: 'cafes', name: 'Cafes', icon: 'cafe', color: '#D35400', image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400' },
];

export default function SearchScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [stories, setStories] = useState<any[]>([]);
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchCategory, setSearchCategory] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        fetchStories();
    }, []);

    const fetchStories = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/discover/feed');
            const venues = (res.venues || []).filter((v: any) => v.name !== 'HAPA Global');
            setStories(venues.slice(0, 5) || []);
        } catch (e) {
            console.error('Failed to fetch stories:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryPress = async (categoryId: string) => {
        setSearchCategory(categoryId);
        setSearchQuery('');
        setIsSearching(true);
        setSearchLoading(true);
        try {
            // Fetch venues for this category
            const res = await apiFetch(`/api/discover/feed?category=${categoryId}`);
            setResults(res.venues || []);
        } catch (e) {
            console.error('Failed to fetch category venues:', e);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleSearch = async (text: string) => {
        setSearchQuery(text);
        setSearchCategory(null);
        if (text.length > 2) {
            setIsSearching(true);
            setSearchLoading(true);
            try {
                const res = await apiFetch(`/api/discover/search?q=${text}`);
                setResults(res.venues || []);
            } catch (e) {
                console.error('Search failed:', e);
            } finally {
                setSearchLoading(false);
            }
        } else if (text.length === 0) {
            setIsSearching(false);
            setResults([]);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchCategory(null);
        setIsSearching(false);
        setResults([]);
    };

    if (loading) return <SearchSkeleton />;

    return (
        <ScreenWrapper style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Search Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Explore</Text>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Venues or #hashtags"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={searchQuery}
                            onChangeText={handleSearch}
                        />
                        {isSearching && (
                            <TouchableOpacity onPress={clearSearch}>
                                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {isSearching ? (
                    <View style={styles.resultsSection}>
                        <View style={styles.resultsHeader}>
                            <Text style={styles.sectionTitle}>
                                {searchCategory 
                                    ? `Venues in ${CATEGORIES.find(c => c.id === searchCategory)?.name}` 
                                    : 'Search Results'}
                            </Text>
                            <Text style={styles.resultsCount}>{results.length} found</Text>
                        </View>
                        
                        {searchLoading ? (
                            <View style={{ padding: 40 }}>
                                <SearchSkeleton />
                            </View>
                        ) : results.length > 0 ? (
                            <View style={styles.venueGrid}>
                                {results.map(venue => (
                                    <VenueCard 
                                        key={venue.id} 
                                        venue={venue} 
                                        onPress={() => router.push(`/venue/${venue.id}`)} 
                                    />
                                ))}
                            </View>
                        ) : (
                            <View style={styles.noResults}>
                                <Ionicons name="search-outline" size={64} color="rgba(255,255,255,0.1)" />
                                <Text style={styles.noResultsText}>No venues found matching your search.</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <>
                        {/* Stories Ring (Top 5 Places) */}
                        <View style={styles.storiesSection}>
                            <Text style={styles.sectionTitle}>Top Places Tonight</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesContainer}>
                                {stories.map(story => (
                                    <TouchableOpacity key={story.id} style={styles.storyItem} onPress={() => router.push(`/venue/${story.id}`)}>
                                        <View style={styles.storyRing}>
                                            <Image source={{ uri: story.images?.[0] }} style={styles.storyImage} />
                                        </View>
                                        <Text style={styles.storyName} numberOfLines={1}>{story.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Spotify-style Category Grid */}
                        <View style={styles.categoriesSection}>
                            <Text style={styles.sectionTitle}>Browse Categories</Text>
                            <View style={styles.categoryGrid}>
                                {CATEGORIES.map(cat => (
                                    <TouchableOpacity 
                                        key={cat.id} 
                                        style={[styles.categoryCard, { backgroundColor: cat.color }]}
                                        onPress={() => handleCategoryPress(cat.id)}
                                    >
                                        <Text style={styles.categoryName}>{cat.name}</Text>
                                        <Image 
                                            source={{ uri: cat.image }} 
                                            style={[styles.categoryImage, { opacity: 0.4 }]} 
                                        />
                                        <Ionicons name={cat.icon as any} size={40} color="rgba(255,255,255,0.2)" style={styles.categoryIcon} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </ScreenWrapper>
    );
}

// ─── VENUE CARD COMPONENT ──────────────────────────────────────────────────
function VenueCard({ venue, onPress }: { venue: any, onPress: () => void }) {
    // Parse images array if it's a string
    const images = typeof venue.images === 'string' ? JSON.parse(venue.images) : (venue.images || []);
    const categories = typeof venue.categories === 'string' ? JSON.parse(venue.categories) : (venue.categories || []);

    return (
        <TouchableOpacity style={styles.venueCard} onPress={onPress}>
            <Image source={{ uri: images[0] }} style={styles.venueImage} />
            <View style={styles.venueInfo}>
                <View style={styles.venueNameRow}>
                    <Text style={styles.venueNameText} numberOfLines={1}>{venue.name}</Text>
                    {venue.tier === 'elite' && (
                        <Ionicons name="checkmark-circle" size={16} color="#FFD700" />
                    )}
                    {venue.tier === 'pro' && (
                        <Ionicons name="checkmark-circle" size={16} color="#1D9BF0" />
                    )}
                </View>
                <Text style={styles.venueType} numberOfLines={1}>
                    {venue.type} • {venue.area || venue.city}
                </Text>
                {categories.length > 0 && (
                    <View style={styles.venueTags}>
                        {categories.slice(0, 2).map((cat: string) => (
                            <View key={cat} style={styles.venueTag}>
                                <Text style={styles.venueTagText}>{cat}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        padding: 20,
    },
    title: {
        fontSize: 34,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 20,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchInput: {
        flex: 1,
        color: 'white',
        fontSize: 17,
        marginLeft: 8,
    },
    storiesSection: {
        marginBottom: 30,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginLeft: 20,
        marginBottom: 15,
    },
    storiesContainer: {
        paddingHorizontal: 15,
    },
    storyItem: {
        alignItems: 'center',
        width: 80,
        marginHorizontal: 5,
    },
    storyRing: {
        width: 70,
        height: 70,
        borderRadius: 35,
        borderWidth: 2,
        borderColor: Colors.cta.primary,
        padding: 2,
        marginBottom: 8,
    },
    storyImage: {
        width: '100%',
        height: '100%',
        borderRadius: 31,
    },
    storyName: {
        color: 'white',
        fontSize: 12,
        textAlign: 'center',
    },
    categoriesSection: {
        paddingBottom: 40,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 15,
        gap: 10,
    },
    categoryCard: {
        width: (width - 40) / 2,
        height: 100,
        borderRadius: 8,
        padding: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    categoryName: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        zIndex: 2,
    },
    categoryImage: {
        position: 'absolute',
        right: -10,
        bottom: -10,
        width: 80,
        height: 80,
        borderRadius: 40,
        transform: [{ rotate: '20deg' }],
    },
    categoryIcon: {
        position: 'absolute',
        left: 10,
        bottom: 10,
    },
    // Results
    resultsSection: {
        paddingBottom: 40,
    },
    resultsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 20,
        marginBottom: 10,
    },
    resultsCount: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
    venueGrid: {
        paddingHorizontal: 20,
        gap: 16,
    },
    venueCard: {
        flexDirection: 'row',
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        overflow: 'hidden',
        height: 100,
    },
    venueImage: {
        width: 100,
        height: 100,
    },
    venueInfo: {
        flex: 1,
        padding: 12,
        justifyContent: 'center',
    },
    venueNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    venueNameText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    venueType: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginBottom: 8,
    },
    venueTags: {
        flexDirection: 'row',
        gap: 6,
    },
    venueTag: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    venueTagText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    noResults: {
        padding: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noResultsText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 20,
    }
});
