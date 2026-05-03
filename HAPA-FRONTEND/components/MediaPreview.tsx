import { isVideoUrl } from '@/lib/api';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect } from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
    uri: string | undefined | null;
    style?: StyleProp<ViewStyle>;
    resizeMode?: 'cover' | 'contain';
    /** If true, the video will autoplay (default: true) */
    autoplay?: boolean;
    /** Controlled playback state for feeds (TikTok style) */
    shouldPlay?: boolean;
    /** Audio control (default: true/muted for previews) */
    muted?: boolean;
    /** Show the video play badge (default: true) */
    showVideoBadge?: boolean;
};

/**
 * Renders either an Image or an auto-playing VideoView depending on the media URL.
 * Supports active focus-based playback for feeds.
 */
export function MediaPreview({ 
    uri: rawUri, 
    style, 
    resizeMode = 'cover', 
    autoplay = true, 
    shouldPlay = true,
    muted = true,
    showVideoBadge = true
}: Props) {
    // Support slideshow/gallery posts by picking the first URL if it's a JSON array
    const uri = React.useMemo(() => {
        if (typeof rawUri === 'string' && rawUri.startsWith('[')) {
            try {
                const parsed = JSON.parse(rawUri);
                return Array.isArray(parsed) ? parsed[0] : rawUri;
            } catch {
                return rawUri;
            }
        }
        return rawUri;
    }, [rawUri]);

    const isVideo = isVideoUrl(uri);
    
    if (__DEV__ && uri) {
        console.log(`[MediaPreview] Type: ${isVideo ? 'VIDEO' : 'IMAGE'}, Focus: ${shouldPlay}, URI: ${uri?.substring(0, 50)}...`);
    }

    const player = useVideoPlayer(isVideo && uri ? uri : '', (p) => {
        if (isVideo && uri) {
            p.loop = true;
            p.muted = muted;
            p.volume = muted ? 0 : 1.0;
            if (autoplay && shouldPlay) {
                p.play();
            }
        }
    });

    // Control playback based on focus (shouldPlay) and audio (muted)
    useEffect(() => {
        if (!isVideo || !player) return;
        
        player.muted = muted;
        player.volume = muted ? 0 : 1.0;
        player.loop = true; // Hard-lock looping
        
        if (shouldPlay) {
            player.play();
        } else {
            player.pause();
        }
    }, [shouldPlay, muted, isVideo, player]);

    const prevUriRef = React.useRef<string | null>(null);

    // Restart/Replace playback if the URI changes - with cancellation safety
    useEffect(() => {
        let cancelled = false;
        if (!isVideo || !uri || !player) return;
        if (prevUriRef.current === uri) return; // skip if same URI
        prevUriRef.current = uri;
        
        player.replaceAsync(uri).then(() => {
            if (cancelled) return;
            player.loop = true;
            player.volume = muted ? 0 : 1.0;
            if (shouldPlay) player.play();
        }).catch(() => {
            // Silently handle replace errors (e.g. if player is already destroyed)
        });
        
        return () => { cancelled = true; };
    }, [uri, isVideo, player]); // Keep muted and shouldPlay out of deps

    if (!uri) {
        return <View style={[{ backgroundColor: '#333' }, style]} />;
    }

    if (isVideo) {
        return (
            <View style={[{ backgroundColor: '#000' }, style]} pointerEvents="none">
                <VideoView
                    key={uri} // Force remount on URI change to avoid shared object crash
                    style={{ width: '100%', height: '100%' }}
                    player={player}
                    contentFit={resizeMode}
                    nativeControls={false}
                />
                {/* Small play icon badge so users know it's a video */}
                {showVideoBadge && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            borderRadius: 12,
                            padding: 4,
                        }}
                    >
                        <Ionicons name="play" size={14} color="white" />
                    </View>
                )}
            </View>
        );
    }

    return <Image source={{ uri }} style={style as any} resizeMode={resizeMode} />;
}
