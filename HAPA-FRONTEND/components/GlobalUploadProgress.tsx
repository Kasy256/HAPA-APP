/**
 * GlobalUploadProgress - Instagram-style upload progress bar.
 * Shows a thin animated bar at the very top of the screen during background uploads.
 * Consumed from UploadContext, so it's completely passive - no props required.
 */

import { useUpload } from '@/contexts/UploadContext';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export function GlobalUploadProgress() {
    const { uploadState, uploadProgress } = useUpload();
    const progressAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (uploadState === 'uploading') {
            // Fade in bar
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        } else if (uploadState === 'success' || uploadState === 'error') {
            // Brief pause then fade out
            setTimeout(() => {
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }).start();
            }, 1200);
        }
    }, [uploadState]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: uploadProgress,
            duration: 350,
            useNativeDriver: false, // width can't use native driver
        }).start();
    }, [uploadProgress]);

    if (uploadState === 'idle') return null;

    const barColor = uploadState === 'error' ? '#FF4444' : '#FF4FA3';
    const label = uploadState === 'uploading' ? 'Posting vibe...' : uploadState === 'success' ? '✓ Posted!' : '✗ Upload failed';

    return (
        <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
            {/* Thin progress bar */}
            <View style={styles.track}>
                <Animated.View
                    style={[
                        styles.bar,
                        {
                            backgroundColor: barColor,
                            width: progressAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                            }),
                        },
                    ]}
                />
            </View>
            {/* Status pill */}
            <View style={[styles.pill, { backgroundColor: barColor }]}>
                <Text style={styles.pillText}>{label}</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        alignItems: 'center',
    },
    track: {
        width: '100%',
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    bar: {
        height: 3,
        borderRadius: 1.5,
    },
    pill: {
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    pillText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
    },
});
