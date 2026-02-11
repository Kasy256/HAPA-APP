
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PhoneInput } from '@/components/PhoneInput';
import HapaLogo from '../assets/images/hapalogo.png';

export default function VenueLoginScreen() {
    const router = useRouter();
    const [phoneNumber, setPhoneNumber] = useState('+256 ');
    const [loading, setLoading] = useState(false);

    const handleSendOTP = async () => {
        if (loading) return;

        // Validate phone number
        if (phoneNumber.length < 5) {
            Alert.alert('Error', 'Please enter a valid phone number');
            return;
        }

        try {
            setLoading(true);
            await apiFetch('/api/auth/request-otp', {
                method: 'POST',
                body: JSON.stringify({ phone_number: phoneNumber }),
            });

            router.push({
                pathname: '/verify-otp',
                params: { phone: phoneNumber },
            });
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScreenWrapper>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>

                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Image source={HapaLogo} style={styles.logoImage} resizeMode="contain" />
                    </View>
                    <Text style={styles.logoText}>HAPA</Text>

                    <Text style={styles.title}>Venue Login</Text>
                    <Text style={styles.subtitle}>Sign in or create a new venue profile</Text>
                </View>

                <View style={styles.form}>
                    <PhoneInput
                        label="Phone Number"
                        value={phoneNumber}
                        onChange={setPhoneNumber}
                    />

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleSendOTP}
                        activeOpacity={0.8}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send OTP'}</Text>
                    </TouchableOpacity>
                </View>

            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16, // iOS margin
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoContainer: {
        marginBottom: 10,
    },
    logoImage: {
        width: 80,
        height: 80,
    },
    logoText: {
        fontSize: 48,
        fontFamily: 'Notable_400Regular',
        color: Colors.text.primary,
        letterSpacing: 2,
        marginBottom: 24,
    },
    title: {
        fontSize: 32, // Title 1
        fontWeight: 'bold',
        color: Colors.text.primary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 17, // iOS Body
        color: Colors.text.secondary,
        textAlign: 'center',
    },
    form: {
        width: '100%',
    },
    label: {
        color: Colors.text.primary,
        fontSize: 15, // iOS subhead
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        backgroundColor: '#1C1C1C',
        borderRadius: 12,
        padding: 16,
        color: Colors.text.primary,
        fontSize: 17, // iOS body
        borderWidth: 1,
        borderColor: Colors.card.border,
        marginBottom: 24,
    },
    button: {
        backgroundColor: Colors.cta.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: 'bold',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: Colors.text.secondary,
        opacity: 0.3,
    },
    orText: {
        color: Colors.text.secondary,
        marginHorizontal: 16,
        fontSize: 14,
    },
    secondaryButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)', // Subtle iOS style
    },
    secondaryButtonText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '600',
    },
});
