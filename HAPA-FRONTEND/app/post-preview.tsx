import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/lib/api';
import { useUpload } from '@/contexts/UploadContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// ─── PREVIEW SCREEN ───────────────────────────────────────────────────────────
// Owns ONLY the video player. The camera is fully unmounted (by navigation)
// before this screen initialises — zero hardware contention.
export default function PreviewScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { items: itemsJson } = useLocalSearchParams<{ items: string }>();
    const capturedItems = React.useMemo(() => {
        try { return JSON.parse(itemsJson || '[]'); } catch { return []; }
    }, [itemsJson]);

    const firstItem = capturedItems[0] || {};

    const [tagType, setTagType] = useState<'@' | '#'>('@');
    const [tagValue, setTagValue] = useState('');
    const [caption, setCaption] = useState('');
    const { startUpload } = useUpload();

    const [nearbyVenues, setNearbyVenues] = useState<any[]>([]);
    const [selectedVenue, setSelectedVenue] = useState<any | null>(null);
    const [isIdle, setIsIdle] = useState(false);
    const [hasFetchedLocation, setHasFetchedLocation] = useState(false);

    // Gap 2: Reset idle state on any user interaction
    const resetIdleTimer = useCallback(() => {
        setIsIdle(false);
    }, []);

    const findNearbyVenues = useCallback(async () => {
        if (hasFetchedLocation) return;
        try {
            console.log('[PostPreview] Starting hardware-safe location fetch...');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            let loc = await Location.getLastKnownPositionAsync({});
            if (!loc) {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            }

            if (loc) {
                const res = await apiFetch(
                    `/api/discover/feed?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}&radius_km=2`
                );
                const venues = (res.venues || []).filter((v: any) => v.name !== 'HAPA Global');
                setNearbyVenues(venues);
                setHasFetchedLocation(true);
                console.log('[PostPreview] Location fetch successful.');
            }
        } catch (e) {
            console.warn('[Preview] Location fetch failed safely:', e);
        }
    }, [hasFetchedLocation]);

    // Fetch immediately for images
    useEffect(() => {
        if (firstItem.type === 'image') {
            findNearbyVenues();
        }
    }, [firstItem.type, findNearbyVenues]);

    // Inactivity Guard: Pause video if user is idle for more than 1 minute
    useEffect(() => {
        if (isIdle) return; // Don't restart timer if already idle
        const idleTimer = setTimeout(() => {
            console.log('[PostPreview] Inactivity detected. Pausing video to save resources.');
            setIsIdle(true);
        }, 60000); // 60 seconds
        return () => clearTimeout(idleTimer);
    }, [isIdle, caption, tagValue, selectedVenue]);

    const handlePost = useCallback(async () => {
        if (capturedItems.length === 0) return;

        if (tagType === '@' && !selectedVenue) {
            Alert.alert('Tag a venue', 'Please select a venue or switch to #hashtag');
            return;
        }
        if (tagType === '#' && !tagValue.trim()) {
            Alert.alert('Add a hashtag', 'Please enter a hashtag for this vibe');
            return;
        }

        console.log('[PostPreview] Handoff to background upload...');
        
        // Fire and forget upload to the global context
        startUpload({
            items: capturedItems,
            caption: caption.trim() || undefined,
            venue_id: tagType === '@' ? selectedVenue?.id : undefined,
            hashtag: tagType === '#' ? tagValue.trim() : undefined,
        });

        // Instant navigation back to feed (TikTok pattern)
        router.replace('/(tabs)/discover');
    }, [capturedItems, tagType, selectedVenue, tagValue, caption, router, startUpload]);

    if (capturedItems.length === 0) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>No media found. Please go back and try again.</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: Colors.cta.primary, marginTop: 12 }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScreenWrapper style={{ backgroundColor: 'black' }}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Vibe</Text>
                <TouchableOpacity onPress={handlePost}>
                    <Text style={styles.shareText}>Share</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView 
                    style={styles.form} 
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    onTouchStart={resetIdleTimer}
                >
                    {/* Media Preview */}
                    <View style={styles.previewContainer}>
                        {firstItem.type === 'video' ? (
                            <VideoPreview uri={firstItem.uri} isIdle={isIdle} onResume={resetIdleTimer} onReady={findNearbyVenues} />
                        ) : (
                            <Image source={{ uri: firstItem.uri }} style={styles.previewMedia} />
                        )}
                        {capturedItems.length > 1 && (
                            <View style={styles.multiBadge}>
                                <Ionicons name="copy" size={14} color="white" />
                                <Text style={styles.multiBadgeText}>{capturedItems.length} items</Text>
                            </View>
                        )}
                    </View>

                    {/* Tag selector */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Where is this vibe?</Text>
                        <View style={styles.tagToggle}>
                            <TouchableOpacity
                                style={[styles.toggleBtn, tagType === '@' && styles.toggleBtnActive]}
                                onPress={() => { setTagType('@'); resetIdleTimer(); }}
                            >
                                <Text style={styles.toggleText}>@ Venue</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toggleBtn, tagType === '#' && styles.toggleBtnActive]}
                                onPress={() => { setTagType('#'); resetIdleTimer(); }}
                            >
                                <Text style={styles.toggleText}># Hashtag</Text>
                            </TouchableOpacity>
                        </View>

                        {tagType === '@' ? (
                            <View style={styles.venuePicker}>
                                {nearbyVenues.length === 0 && (
                                    <Text style={styles.searchingText}>Searching nearby venues...</Text>
                                )}
                                {nearbyVenues.map(v => (
                                    <TouchableOpacity
                                        key={v.id}
                                        style={[styles.venueItem, selectedVenue?.id === v.id && styles.venueItemActive]}
                                        onPress={() => { setSelectedVenue(v); resetIdleTimer(); }}
                                    >
                                        <Text style={styles.venueItemText}>{v.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. ALCHEMIST"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                value={tagValue}
                                onChangeText={(t) => { setTagValue(t); resetIdleTimer(); }}
                                autoCapitalize="characters"
                            />
                        )}
                    </View>

                    {/* Caption */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Caption</Text>
                        <TextInput
                            style={[styles.input, { height: 100 }]}
                            placeholder="What's the vibe?"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            multiline
                            value={caption}
                            onChangeText={(t) => { setCaption(t); resetIdleTimer(); }}
                        />
                    </View>
                    <View style={{ height: 100 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
}

// Lives here safely — camera is 100% gone when this component mounts.
const VideoPreview = React.memo(({ uri, isIdle, onResume, onReady }: { uri: string; isIdle: boolean; onResume: () => void; onReady: () => void }) => {
    const isFocused = useIsFocused();
    const [hasTriggeredReady, setHasTriggeredReady] = useState(false);

    // Initialise player once
    const player = useVideoPlayer(uri, p => {
        p.loop = true;
        p.volume = 1.0;
        p.muted = false;
    });

    // Clash 5: Fetch location only after player is ready (hardware serialisation)
    useEffect(() => {
        if (!player || hasTriggeredReady) return;
        
        const subscription = player.addListener('statusChange', ({ status }) => {
            if (status === 'readyToPlay' && !hasTriggeredReady) {
                setHasTriggeredReady(true);
                onReady();
            }
        });

        return () => subscription.remove();
    }, [player, hasTriggeredReady, onReady]);

    useEffect(() => {
        if (!player) return;
        
        const active = isFocused && !isIdle;
        if (active) {
            player.play();
        } else {
            player.pause();
        }

        return () => {
            // Player disposal is handled by expo-video hook
        };
    }, [isFocused, isIdle, player]);

    return (
        <View style={[styles.previewMedia, { overflow: 'hidden' }]}>
            <VideoView
                key={uri}
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
            />
            {isIdle && (
                <View style={[StyleSheet.absoluteFill, styles.previewOverlay]}>
                    <TouchableOpacity style={styles.resumeBtn} onPress={onResume}>
                        <Ionicons name="play-circle" size={60} color="white" />
                        <Text style={styles.resumeText}>Paused to save power</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    errorContainer: {
        flex: 1, backgroundColor: 'black',
        justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    errorText: { color: 'white', textAlign: 'center', fontSize: 16 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    shareText: { color: Colors.cta.primary, fontSize: 18, fontWeight: 'bold' },
    form: { padding: 20 },
    previewMedia: {
        width: '100%',
        height: 420,
        borderRadius: 16,
        marginBottom: 24,
        backgroundColor: '#111',
    },
    inputGroup: { marginBottom: 24 },
    label: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
    tagToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 4,
        marginBottom: 12,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    toggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
    toggleText: { color: 'white', fontWeight: '600' },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 15,
        color: 'white',
        fontSize: 16,
    },
    searchingText: { color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
    venuePicker: { gap: 8 },
    venueItem: {
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
    },
    venueItemActive: {
        backgroundColor: 'rgba(189, 49, 21, 0.25)',
        borderColor: Colors.cta.primary,
        borderWidth: 1,
    },
    venueItemText: { color: 'white', fontSize: 15 },
    previewOverlay: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
    },
    resumeBtn: { alignItems: 'center' },
    resumeText: { color: 'white', marginTop: 10, fontSize: 14, fontWeight: '600' },
    previewContainer: { position: 'relative' },
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
});
