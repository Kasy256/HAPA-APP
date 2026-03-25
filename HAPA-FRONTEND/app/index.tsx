import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';

import { isVenueOwner } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import HapaLogo from '../assets/images/hapa.png';

export default function StartScreen() {
    const router = useRouter();
    const [checking, setChecking] = useState(false);

    const handleDiscover = () => {
        router.push('/discover');
    };

    const handlePromote = async () => {
        setChecking(true);
        try {
            // Check if user has an active authenticated venue session
            const { data: { session } } = await supabase.auth.getSession();
            const ownerLoggedIn = session && (await isVenueOwner());

            if (ownerLoggedIn) {
                router.push('/(venue)');
            } else {
                router.push('/venue-login');
            }
        } catch (e) {
            console.error('[StartScreen] Error checking auth:', e);
            router.push('/venue-login');
        } finally {
            setChecking(false);
        }
    };

    // Show a brief loading state while checking preferences
    if (checking) {
        return (
            <ScreenWrapper style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' } as any}>
                <Image source={HapaLogo} style={styles.logoIcon} resizeMode="contain" />
                <ActivityIndicator size="small" color={Colors.cta.primary} style={{ marginTop: 20 }} />
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper style={styles.container}>
            <View style={styles.header}>
                <Image source={HapaLogo} style={styles.logoIcon} resizeMode="contain" />
                <Text style={styles.logoText}>HAPA</Text>
                <Text style={styles.tagline}>Check the vibe before you step out</Text>
            </View>

            <View style={styles.actions}>
                {/* Discover Mode */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={handleDiscover}
                    activeOpacity={0.9}
                    accessibilityLabel="Discover Mode: Find venues and vibes"
                    accessibilityRole="button"
                >
                    <View style={styles.iconContainer}>
                        <Ionicons name="wine-outline" size={32} color={Colors.cta.primary} />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.cardTitle}>Discover</Text>
                        <Text style={styles.cardSubtitle}>Find your type of Vibes</Text>
                    </View>
                </TouchableOpacity>

                {/* Promote Mode */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={handlePromote}
                    activeOpacity={0.9}
                    accessibilityLabel="Promote Mode: Post and manage your venue"
                    accessibilityRole="button"
                >
                    <View style={styles.iconContainer}>
                        <Ionicons name="megaphone-outline" size={32} color={Colors.cta.primary} />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.cardTitle}>Promote</Text>
                        <Text style={styles.cardSubtitle}>Post and manage your venue</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <View style={styles.footerLinks}>
                    <TouchableOpacity onPress={() => Linking.openURL('https://get-hapa.web.app/Terms.html')}>
                        <Text style={styles.footerLink}>Terms of Use</Text>
                    </TouchableOpacity>
                    <Text style={styles.footerSeparator}>•</Text>
                    <TouchableOpacity onPress={() => Linking.openURL('https://get-hapa.web.app/Privacy.html')}>
                        <Text style={styles.footerLink}>Privacy Policy</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.footerText}>Urban. Live. Instant.</Text>
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        justifyContent: 'space-between',
        paddingVertical: 40,
    },
    header: {
        alignItems: 'center',
        marginTop: 64,
    },
    logoIcon: {
        width: 96,
        height: 96,
        marginBottom: 16,
    },
    logoText: {
        fontSize: 48,
        fontFamily: 'Notable_400Regular',
        color: Colors.text.primary,
        letterSpacing: 2,
    },
    tagline: {
        fontSize: 17,
        color: Colors.text.primary,
        marginTop: 16,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    actions: {
        gap: 16,
    },
    card: {
        backgroundColor: '#1C1C1C',
        padding: 24,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: Colors.card.border,
    },
    iconContainer: {},
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text.primary,
    },
    cardSubtitle: {
        fontSize: 15,
        color: Colors.text.secondary,
        marginTop: 4,
    },
    footer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    footerLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    footerLink: {
        color: Colors.text.secondary,
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    footerSeparator: {
        color: Colors.text.secondary,
        fontSize: 13,
        opacity: 0.5,
    },
    footerText: {
        color: Colors.text.secondary,
        fontSize: 11,
        opacity: 0.6,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
