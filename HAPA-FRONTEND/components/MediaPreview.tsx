import { isVideoUrl } from '@/lib/api';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect } from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
    uri: string | undefined | null;
    style?: StyleProp<ViewStyle>;
    resizeMode?: 'cover' | 'contain';
    /** If true, the video will autoplay muted as a preview (default: true) */
    autoplay?: boolean;
};

/**
 * Renders either an Image or a muted auto-playing VideoView depending on the media URL.
 * Used in feeds and grids so video posts don't appear as gray boxes.
 */
export function MediaPreview({ uri, style, resizeMode = 'cover', autoplay = true }: Props) {
    const isVideo = isVideoUrl(uri);

    // Always call the hook — React rules of hooks require it.
    // When it's not a video we pass an empty string; the player won't load anything meaningful.
    const player = useVideoPlayer(isVideo ? (uri ?? '') : '', (p) => {
        if (isVideo && autoplay) {
            p.loop = true;
            p.volume = 0;   // muted preview
            p.play();
        }
    });

    // Restart playback if the URI changes
    useEffect(() => {
        if (isVideo && uri && autoplay) {
            player.replaceAsync(uri);
            player.loop = true;
            player.volume = 0;
            player.play();
        }
    }, [uri]);

    if (!uri) {
        return <View style={[{ backgroundColor: '#333' }, style]} />;
    }

    if (isVideo) {
        return (
            <View style={[{ backgroundColor: '#000' }, style]} pointerEvents="none">
                <VideoView
                    style={{ width: '100%', height: '100%' }}
                    player={player}
                    contentFit={resizeMode}
                    nativeControls={false}
                />
                {/* Small play icon badge so users know it's a video */}
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
            </View>
        );
    }

    return <Image source={{ uri }} style={style as any} resizeMode={resizeMode} />;
}
