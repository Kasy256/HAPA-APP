
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { apiFetch } from '@/lib/api';

function VideoPreview({ uri }: { uri: string }) {
    const player = useVideoPlayer(uri, player => {
        player.loop = true;
        player.play();
    });

    useFocusEffect(
        useCallback(() => {
            if (player) {
                player.play();
            }
            return () => {
                try {
                    if (player) {
                        player.pause();
                    }
                } catch (e) {
                    // Player already released, ignore
                }
            };
        }, [player])
    );

    return <VideoView style={styles.mediaPreview} player={player} nativeControls={false} contentFit="cover" />;
}

export default function CreatePostScreen() {
    const router = useRouter();
    const cameraRef = useRef<CameraView>(null);
    const [mode, setMode] = useState<'Photo' | 'Video'>('Photo');
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [isRecording, setIsRecording] = useState(false);

    // Preview State
    const [capturedMedia, setCapturedMedia] = useState<{ uri: string; type: 'photo' | 'video' } | null>(null);
    const [posting, setPosting] = useState(false);



    if (!permission || !micPermission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted || !micPermission.granted) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ textAlign: 'center', color: 'white', marginBottom: 20 }}>
                    We need camera and microphone permissions
                </Text>
                <TouchableOpacity onPress={() => { requestPermission(); requestMicPermission(); }} style={styles.permissionButton}>
                    <Text style={styles.permissionText}>Grant Permissions</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    function toggleCameraFacing() {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    }

    async function handleCapture() {
        if (!cameraRef.current) return;

        if (mode === 'Photo') {
            try {
                const photo = await cameraRef.current.takePictureAsync();
                if (photo?.uri) {
                    setCapturedMedia({ uri: photo.uri, type: 'photo' });
                }
            } catch (error) {
                console.error('Failed to take picture:', error);
            }
        } else {
            if (isRecording) {
                cameraRef.current.stopRecording();
                setIsRecording(false);
            } else {
                setIsRecording(true);
                try {
                    const video = await cameraRef.current.recordAsync();
                    if (video?.uri) {
                        setCapturedMedia({ uri: video.uri, type: 'video' });
                    }
                    setIsRecording(false);
                } catch (error) {
                    console.error('Failed to start recording:', error);
                    setIsRecording(false);
                }
            }
        }
    }

    // Render Preview Mode
    if (capturedMedia) {
        return (
            <View style={styles.container}>
                {capturedMedia.type === 'photo' ? (
                    <Image source={{ uri: capturedMedia.uri }} style={styles.mediaPreview} resizeMode="cover" />
                ) : (
                    <VideoPreview uri={capturedMedia.uri} />
                )}

                {/* Top Controls Overlay */}
                <View style={styles.topControls}>
                    <TouchableOpacity onPress={() => setCapturedMedia(null)} style={styles.iconButton}>
                        <Ionicons name="close" size={28} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.postButton}
                        onPress={async () => {
                            if (posting || !capturedMedia) return;
                            try {
                                setPosting(true);
                                const mediaType = capturedMedia.type === 'photo' ? 'image' : 'video';
                                await apiFetch('/api/posts', {
                                    method: 'POST',
                                    auth: true,
                                    body: JSON.stringify({
                                        media_type: mediaType,
                                        media_url: capturedMedia.uri,
                                    }),
                                });
                                // Clear state before navigating back
                                setCapturedMedia(null);
                                router.back();
                            } catch (error: any) {
                                Alert.alert('Error', error.message || 'Failed to post vibe');
                            } finally {
                                setPosting(false);
                            }
                        }}
                    >
                        <Text style={styles.postButtonText}>{posting ? 'Posting...' : 'Post'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Bottom Edit Button */}
                <View style={styles.bottomPreviewControls}>
                    <TouchableOpacity style={styles.editButton}>
                        <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Render Camera Mode
    return (
        <View style={styles.container}>
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mode={mode === 'Video' ? 'video' : 'picture'}
            />

            {/* Top Controls Overlay (Sibling, not Child) */}
            <View style={styles.topControls}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={toggleCameraFacing}>
                    <Ionicons name="camera-reverse-outline" size={28} color="white" />
                </TouchableOpacity>
            </View>

            {/* Bottom Controls Overlay (Sibling, not Child) */}
            <View style={styles.bottomControlsOverlay}>

                {/* Mode Selector */}
                <View style={styles.modeSelector}>
                    <TouchableOpacity onPress={() => setMode('Photo')} style={[styles.modeButton, mode === 'Photo' && styles.activeMode]}>
                        <Text style={[styles.modeText, mode === 'Photo' && styles.activeModeText]}>Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMode('Video')} style={[styles.modeButton, mode === 'Video' && styles.activeMode]}>
                        <Text style={[styles.modeText, mode === 'Video' && styles.activeModeText]}>Video</Text>
                    </TouchableOpacity>
                </View>

                {/* Capture Button Row */}
                <View style={styles.captureRow}>
                    <View style={styles.controlSpacer} />

                    <TouchableOpacity style={styles.captureButtonOuter} onPress={handleCapture} activeOpacity={0.7}>
                        <View style={[
                            styles.captureButtonInner,
                            mode === 'Video' && styles.captureButtonVideo,
                            isRecording && styles.captureButtonRecording
                        ]} />
                    </TouchableOpacity>

                    <View style={styles.controlSpacer} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        position: 'relative',
    },
    mediaPreview: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    topControls: {
        position: 'absolute',
        top: 60,
        left: 16, // iOS margin
        right: 16, // iOS margin
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
    },
    iconButton: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 25,
    },
    postButton: {
        backgroundColor: 'white',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12, // iOS standard radius
    },
    postButtonText: {
        color: 'black',
        fontWeight: 'bold',
        fontSize: 17, // iOS body bold
    },
    bottomPreviewControls: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    editButton: {
        borderWidth: 2,
        borderColor: Colors.cta.primary,
        borderRadius: 12, // iOS standard radius
        paddingHorizontal: 32,
        paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    editButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 17, // iOS body size
    },
    bottomControlsOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 50,
        paddingHorizontal: 20,
        backgroundColor: 'transparent',
        zIndex: 10,
    },
    modeSelector: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 40,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignSelf: 'center',
        borderRadius: 20,
        padding: 4,
    },
    modeButton: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
    },
    activeMode: {
        backgroundColor: Colors.cta.primary,
    },
    modeText: {
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '600',
        fontSize: 15, // iOS subhead
    },
    activeModeText: {
        color: 'white',
    },
    captureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    captureButtonOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'white',
    },
    captureButtonVideo: {
        backgroundColor: 'red',
        borderRadius: 32,
        width: 64,
        height: 64,
    },
    captureButtonRecording: {
        borderRadius: 8,
        width: 32,
        height: 32,
    },
    controlSpacer: {
        width: 44,
        height: 44,
    },
    permissionButton: {
        backgroundColor: Colors.cta.primary,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        alignSelf: 'center',
        marginTop: 24,
    },
    permissionText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 17,
    },
});


