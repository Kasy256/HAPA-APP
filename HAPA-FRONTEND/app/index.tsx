import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import { isVenueOwner } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import HapaLogo from '../assets/images/hapa.png';

const LAUNCH_PREF_KEY = 'hapa_active_role'; // 'discover' | 'promote'

export default function StartScreen() {
    const router = useRouter();
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [checking, setChecking] = useState(true);

    // On mount: check if user has a saved launch preference or an active session
    useEffect(() => {
        const checkPreference = async () => {
            try {
                // 1. Check if user is a logged-in venue owner
                const { data: { session } } = await supabase.auth.getSession();
                const ownerLoggedIn = session && (await isVenueOwner());

                const pref = await AsyncStorage.getItem(LAUNCH_PREF_KEY);

                // 2. If owner is logged in AND their last mode was 'promote' (or first time)
                if (ownerLoggedIn && (pref === 'promote' || !pref)) {
                    router.replace('/(venue)');
                    return;
                }

                // 3. Otherwise, honor the preference if it exists
                if (pref === 'discover') {
                    router.replace('/discover');
                    return;
                }
                
                // If they specifically want to promote but aren't logged in, send to login
                if (pref === 'promote' && !ownerLoggedIn) {
                    router.replace('/venue-login');
                    return;
                }
            } catch (e) {
                console.warn('[StartScreen] Error during routing check:', e);
            }
            setChecking(false);
        };
        checkPreference();
    }, []);

    const handleDiscover = async () => {
        if (dontShowAgain) {
            await AsyncStorage.setItem(LAUNCH_PREF_KEY, 'discover');
        }
        router.push('/discover');
    };

    const handlePromote = async () => {
        if (dontShowAgain) {
            await AsyncStorage.setItem(LAUNCH_PREF_KEY, 'promote');
        }
        
        const ownerLoggedIn = await isVenueOwner();
        if (ownerLoggedIn) {
            router.push('/(venue)');
        } else {
            router.push('/venue-login');
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

                <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setDontShowAgain(prev => !prev)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkbox, dontShowAgain && styles.checkboxChecked]}>
                        {dontShowAgain && <Ionicons name="checkmark" size={16} color="white" />}
                    </View>
                    <Text style={styles.checkboxText}>Don't show this again</Text>
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
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        gap: 12,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: Colors.cta.primary,
        borderColor: Colors.cta.primary,
    },
    checkboxText: {
        color: Colors.text.secondary,
        fontSize: 15,
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
