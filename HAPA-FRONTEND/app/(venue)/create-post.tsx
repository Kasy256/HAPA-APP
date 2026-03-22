
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { PaywallModal } from '@/components/PaywallModal';
import { Colors } from '@/constants/Colors';
import { useSubscription } from '@/hooks/useSubscription';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CreatePostScreen() {
    const router = useRouter();
    const subscription = useSubscription();
    const [showPaywall, setShowPaywall] = useState(false);

    const handleShareVibe = () => {
        // Gate: check post limit before allowing submit
        if (!subscription.loading && !subscription.canPost && !subscription.isUnlimited) {
            setShowPaywall(true);
            return;
        }
        // TODO: actual post submit logic goes here
    };

    return (
        <ScreenWrapper style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>New Post</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="close" size={28} color={Colors.text.primary} />
                </TouchableOpacity>
            </View>

            <View style={styles.placeholderContainer}>
                <View style={styles.previewPlaceholder}>
                    <Ionicons name="image-outline" size={64} color={Colors.text.secondary} />
                    <Text style={styles.previewText}>Select Photo or Video</Text>
                </View>

                <TouchableOpacity style={styles.selectButton}>
                    <Text style={styles.selectButtonText}>Open Gallery</Text>
                </TouchableOpacity>
            </View>

            {/* Post limit indicator for free tier */}
            {!subscription.loading && subscription.tier === 'free' && (
                <View style={styles.limitRow}>
                    <Ionicons name="flash-outline" size={14} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.limitText}>
                        {subscription.postsToday}/3 posts today (free plan)
                    </Text>
                </View>
            )}

            <TouchableOpacity style={styles.postButton} onPress={handleShareVibe}>
                <Text style={styles.postButtonText}>Share Vibe</Text>
            </TouchableOpacity>

            <PaywallModal
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                reason="post_limit"
                postsToday={subscription.postsToday}
            />
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 20,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text.primary,
    },
    placeholderContainer: {
        flex: 1,
        gap: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewPlaceholder: {
        width: '100%',
        aspectRatio: 9 / 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        borderStyle: 'dashed',
    },
    previewText: {
        color: Colors.text.secondary,
        marginTop: 16,
    },
    selectButton: {
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 50,
    },
    selectButtonText: {
        color: Colors.text.primary,
    },
    limitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        marginBottom: 8,
    },
    limitText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
    },
    postButton: {
        backgroundColor: Colors.cta.primary,
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 'auto',
    },
    postButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
