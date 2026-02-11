import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import HapaLogo from '../assets/images/hapalogo.png';

export default function StartScreen() {
    const router = useRouter();

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
                    onPress={() => router.push('/discover')}
                    activeOpacity={0.9}
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
                    onPress={() => router.push('/venue-login')}
                    activeOpacity={0.9}
                >
                    <View style={styles.iconContainer}>
                        <Ionicons name="megaphone-outline" size={32} color={Colors.cta.primary} />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.cardTitle}>Promote</Text>
                        <Text style={styles.cardSubtitle}>Post and manage your venue</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.checkboxContainer}>
                    <View style={styles.checkbox} />
                    <Text style={styles.checkboxText}>Don't show this again</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Urban. Live. Instant.</Text>
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16, // iOS standard margin
        justifyContent: 'space-between',
        paddingVertical: 40,
    },
    header: {
        alignItems: 'center',
        marginTop: 64, // Multiple of 8
    },
    logoIcon: {
        width: 96,
        height: 96,
        marginBottom: 16,
    },
    logoText: {
        fontSize: 48, // Title 1 style
        fontFamily: 'Notable_400Regular',
        color: Colors.text.primary,
        letterSpacing: 2,
    },
    tagline: {
        fontSize: 17, // iOS Body size
        color: Colors.text.primary,
        marginTop: 16,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    actions: {
        gap: 16, // Multiple of 8
    },
    card: {
        backgroundColor: '#1C1C1C',
        padding: 24,
        borderRadius: 16, // iOS standard card radius
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: Colors.card.border,
    },
    iconContainer: {
        // Icon styling
    },
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 20, // Title 2/3 style
        fontWeight: '700',
        color: Colors.text.primary,
    },
    cardSubtitle: {
        fontSize: 15, // iOS secondary text size
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
    },
    checkboxText: {
        color: Colors.text.secondary,
        fontSize: 15,
    },
    footer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    footerText: {
        color: Colors.text.secondary,
        fontSize: 13, // iOS Footnote size
    },
});
