import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Animated,
    Alert,
    Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const ShutterProgress = ({ progressAnim }: { progressAnim: Animated.Value }) => {
    const rotateRight = progressAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['45deg', '225deg', '225deg'],
        extrapolate: 'clamp'
    });

    const rotateLeft = progressAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['45deg', '45deg', '225deg'],
        extrapolate: 'clamp'
    });

    return (
        <View style={StyleSheet.absoluteFill}>
            <View style={{ width: 42, height: 84, position: 'absolute', right: 0, overflow: 'hidden' }}>
                <Animated.View style={{
                    width: 84, height: 84, borderRadius: 42,
                    borderWidth: 6, borderColor: 'transparent',
                    borderBottomColor: '#FF3B30', borderLeftColor: '#FF3B30',
                    position: 'absolute', left: -42,
                    transform: [{ rotate: rotateRight }]
                }} />
            </View>
            <View style={{ width: 42, height: 84, position: 'absolute', left: 0, overflow: 'hidden' }}>
                <Animated.View style={{
                    width: 84, height: 84, borderRadius: 42,
                    borderWidth: 6, borderColor: 'transparent',
                    borderTopColor: '#FF3B30', borderRightColor: '#FF3B30',
                    position: 'absolute', left: 0,
                    transform: [{ rotate: rotateLeft }]
                }} />
            </View>
        </View>
    );
};

// ─── CAMERA SCREEN ────────────────────────────────────────────────────────────
// Owns ONLY the camera. On completion it navigates AWAY — the OS releases the
// camera hardware before the preview screen ever initialises. This is the
// same pattern as Instagram Reels and TikTok (different native view controllers
// per phase = automatic hardware handoff).
export default function CameraScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();

    const [camPerm, requestCamPerm] = useCameraPermissions();
    const [micPerm, requestMicPerm] = useMicrophonePermissions();

    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [capturedItems, setCapturedItems] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);

    const cameraRef = useRef<any>(null);
    const timerRef = useRef<any>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;

    // ── Navigate to preview — camera unmounts, OS releases hardware ───────────
    const goToPreview = useCallback((items: { uri: string; type: 'image' | 'video' }[]) => {
        router.push({
            pathname: '/post-preview',
            params: { 
                items: JSON.stringify(items) 
            },
        });
    }, [router]);

    const isRecordingRef = useRef(false);
    const recordingStartTime = useRef<number>(0);

    const stopRecording = useCallback(() => {
        console.log('[Camera] stopRecording called. isRecording:', isRecordingRef.current);
        if (cameraRef.current && isRecordingRef.current) {
            const now = Date.now();
            const elapsed = now - recordingStartTime.current;
            
            if (elapsed < 1000) {
                console.log('[Camera] Too short, delaying stop by:', 1000 - elapsed);
                setTimeout(stopRecording, 1000 - elapsed);
                return;
            }

            console.log('[Camera] Calling native stopRecording');
            cameraRef.current.stopRecording();
            progressAnim.stopAnimation();
        }
    }, [progressAnim]);

    // ── Take photo ────────────────────────────────────────────────────────────
    const takePicture = useCallback(async () => {
        if (!cameraRef.current || isRecordingRef.current) return;
        console.log('[Camera] takePicture called');
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
            if (photo?.uri) {
                setCapturedItems(prev => [...prev, { uri: photo.uri, type: 'image' }]);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
        } catch (e) {
            console.error('[Camera] takePicture failed:', e);
            Alert.alert('Camera Error', 'Failed to capture image. Please try again.');
        }
    }, []);

    // ── Start recording ───────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        if (!cameraRef.current || isRecordingRef.current) return;
        console.log('[Camera] startRecording initiating...');

        isRecordingRef.current = true;
        setIsRecording(true);
        setRecordingTime(0);
        recordingStartTime.current = Date.now();

        progressAnim.setValue(0);
        Animated.timing(progressAnim, {
            toValue: 1,
            duration: 60000,
            useNativeDriver: true,
        }).start();

        timerRef.current = setInterval(() => {
            setRecordingTime(prev => {
                if (prev >= 59) {
                    stopRecording();
                    return 60;
                }
                return prev + 1;
            });
        }, 1000);

        try {
            console.log('[Camera] recordAsync starting...');
            const result = await cameraRef.current.recordAsync({
                maxDuration: 60,
                quality: '1080p',
                mute: false,
            });

            console.log('[Camera] recordAsync finished. URI:', result?.uri);
            if (result?.uri) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                // 🚀 TIKTOK PATTERN: For video, navigate to preview IMMEDIATELY on release
                goToPreview([{ uri: result.uri, type: 'video' }]);
            }
        } catch (e: any) {
            if (!e.message?.includes('before any data could be produced')) {
                console.error('[Camera] recordAsync error:', e);
            }
        } finally {
            console.log('[Camera] recording cleanup');
            if (timerRef.current) clearInterval(timerRef.current);
            isRecordingRef.current = false;
            setIsRecording(false);
            progressAnim.stopAnimation();
        }
    }, [stopRecording, progressAnim]);

    // ── Permission gates ──────────────────────────────────────────────────────
    if (!camPerm || !micPerm) {
        return <View style={styles.container} />;
    }

    if (!camPerm.granted || !micPerm.granted) {
        return (
            <View style={[styles.permContainer, { paddingTop: insets.top + 20 }]}>
                <Ionicons name="camera-outline" size={64} color="white" style={{ marginBottom: 16 }} />
                <Text style={styles.permText}>
                    HAPA needs camera & microphone access to capture your vibes
                </Text>
                <TouchableOpacity
                    style={styles.permBtn}
                    onPress={async () => { await requestCamPerm(); await requestMicPerm(); }}
                >
                    <Text style={styles.permBtnText}>Grant Access</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Camera UI ─────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Camera is only active when this screen is focused. 
                This ensures the hardware is released for the Preview screen. */}
            {isFocused ? (
                <CameraView
                    style={styles.camera}
                    ref={cameraRef}
                    mode="video" 
                    facing={facing}
                    videoQuality="720p"
                    mute={false}
                />
            ) : (
                <View style={[styles.camera, { backgroundColor: 'black' }]} />
            )}

            {/* Overlay — NOT a child of CameraView */}
            <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

                {/* Top bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity 
                        style={styles.iconBtn} 
                        onPress={() => router.navigate('/(tabs)/discover')}
                    >
                        <Ionicons name="close" size={30} color="white" />
                    </TouchableOpacity>

                    {isRecording && (
                        <View style={styles.recordingBadge}>
                            <View style={styles.redDot} />
                            <Text style={styles.recordingText}>{recordingTime}s / 60s</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                    >
                        <Ionicons name="camera-reverse-outline" size={30} color="white" />
                    </TouchableOpacity>

                    {capturedItems.length > 0 && (
                        <TouchableOpacity 
                            style={styles.nextBtn} 
                            onPress={() => goToPreview(capturedItems)}
                        >
                            <Text style={styles.nextText}>Next ({capturedItems.length})</Text>
                            <Ionicons name="chevron-forward" size={20} color="white" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Bottom shutter area */}
                <View style={styles.bottomBar}>
                    {/* Tiny thumbnails of captured items */}
                    {capturedItems.length > 0 && (
                        <View style={styles.thumbnailStrip}>
                            {capturedItems.map((item, idx) => (
                                <View key={idx} style={styles.miniThumb}>
                                    <Image source={{ uri: item.uri }} style={styles.miniThumbImg} />
                                    {item.type === 'video' && (
                                        <View style={styles.miniVideoIcon}>
                                            <Ionicons name="videocam" size={8} color="white" />
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                    <Pressable
                        style={[styles.shutterRing, isRecording && styles.shutterRingRecording]}
                        onPress={takePicture}
                        onLongPress={startRecording}
                        onPressOut={stopRecording}
                        delayLongPress={250}
                    >
                        {isRecording && <ShutterProgress progressAnim={progressAnim} />}
                        <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
                    </Pressable>
                    <Text style={styles.hint}>
                        {isRecording ? '🔴 Release to stop' : 'Tap for photo  •  Hold for video'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    camera: { flex: 1 },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    iconBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderRadius: 22,
    },
    recordingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 8,
    },
    redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
    recordingText: { color: 'white', fontSize: 13, fontWeight: '700' },
    bottomBar: {
        alignItems: 'center',
        paddingBottom: 20,
        gap: 14,
    },
    shutterRing: {
        width: 84,
        height: 84,
        borderRadius: 42,
        borderWidth: 6,
        borderColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutterRingRecording: {
        borderColor: 'rgba(255, 59, 48, 0.3)',
        transform: [{ scale: 1.12 }],
    },
    shutterInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'white',
    },
    shutterInnerRecording: {
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        width: 32,
        height: 32,
    },
    hint: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 13,
        textAlign: 'center',
    },
    permContainer: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    permText: {
        color: 'white',
        textAlign: 'center',
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 28,
    },
    permBtn: {
        backgroundColor: Colors.cta.primary,
        paddingVertical: 14,
        paddingHorizontal: 36,
        borderRadius: 12,
    },
    permBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.cta.primary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 4,
    },
    nextText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    thumbnailStrip: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    miniThumb: {
        width: 40,
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'white',
        overflow: 'hidden',
    },
    miniThumbImg: { width: '100%', height: '100%' },
    miniVideoIcon: {
        position: 'absolute',
        top: 2, right: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 4,
        padding: 2,
    }
});
