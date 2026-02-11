import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { API_BASE_URL, apiFetch, saveAuthTokens } from '@/lib/api';
import HapaLogo from '../assets/images/hapalogo.png';

export default function OTPVerificationScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const phoneNumber = params.phone as string || '1234567890';

    const [otp, setOtp] = useState(['', '', '', '', '']);
    const [submitting, setSubmitting] = useState(false);
    const inputRefs = useRef<(TextInput | null)[]>([]);

    useEffect(() => {
        // Auto-focus first input on mount
        inputRefs.current[0]?.focus();

        // If OTP was passed in params (dev mode), show it in a popup
        if (params.otp) {
            setTimeout(() => {
                Alert.alert('Developer OTP', `Your verification code is: ${params.otp}\n\n(This popup only appears in development mode)`);
            }, 500);
        }
    }, [params.otp]);

    const handleOtpChange = (value: string, index: number) => {
        if (value.length > 1) {
            // Handle paste
            const pastedCode = value.slice(0, 5).split('');
            const newOtp = [...otp];
            pastedCode.forEach((char, i) => {
                if (index + i < 5) {
                    newOtp[index + i] = char;
                }
            });
            setOtp(newOtp);

            // Focus last filled input
            const lastFilledIndex = Math.min(index + pastedCode.length, 4);
            inputRefs.current[lastFilledIndex]?.focus();
            return;
        }

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        // Auto-focus next input
        if (value && index < 4) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async () => {
        if (submitting) return;

        const code = otp.join('');
        if (code.length !== 5) {
            Alert.alert('Invalid OTP', 'Please enter the complete 5-digit code.');
            return;
        }

        try {
            setSubmitting(true);
            const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone_number: phoneNumber,
                    code,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to verify OTP');
            }

            // Store JWT tokens for authenticated calls
            await saveAuthTokens(data.access_token, data.refresh_token);

            // After login, check if this user already has a venue.
            // If yes -> go straight into the venue area.
            // If no -> take them to onboarding to create their first profile.
            try {
                const venueRes = await apiFetch('/api/venues/me', { auth: true });
                if (venueRes.venue) {
                    router.replace('/(venue)');
                } else {
                    router.replace('/venue-onboarding');
                }
            } catch {
                // If anything goes wrong with the check, default to the venue area.
                router.replace('/(venue)');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to verify OTP');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResendOTP = () => {
        Alert.alert('OTP Sent', `A new code has been sent to ${phoneNumber}`);
        setOtp(['', '', '', '', '']);
        inputRefs.current[0]?.focus();
    };

    return (
        <ScreenWrapper style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Back Button */}
            <View style={styles.headerBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {/* Logo */}
                <View style={styles.logoContainer}>
                    <Image source={HapaLogo} style={styles.logoImage} resizeMode="contain" />
                    <Text style={styles.logoText}>HAPA</Text>
                </View>

                {/* OTP Input */}
                <View style={styles.otpSection}>
                    <Text style={styles.otpLabel}>OTP Code</Text>
                    <View style={styles.otpContainer}>
                        {otp.map((digit, index) => (
                            <TextInput
                                key={index}
                                ref={(ref) => { inputRefs.current[index] = ref; }}
                                style={styles.otpInput}
                                value={digit}
                                onChangeText={(value) => handleOtpChange(value, index)}
                                onKeyPress={(e) => handleKeyPress(e, index)}
                                keyboardType="number-pad"
                                maxLength={1}
                                selectTextOnFocus
                            />
                        ))}
                    </View>
                </View>

                {/* Verify Button */}
                <TouchableOpacity
                    style={styles.verifyButton}
                    onPress={handleVerify}
                    activeOpacity={0.8}
                >
                    <Text style={styles.verifyButtonText}>{submitting ? 'Verifying...' : 'Verify & Login'}</Text>
                </TouchableOpacity>

                {/* Resend OTP */}
                <View style={styles.resendSection}>
                    <Text style={styles.resendText}>Didn't receive code?</Text>
                    <TouchableOpacity onPress={handleResendOTP}>
                        <Text style={styles.resendButton}>Resend OTP</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>Urban. Live. Instant.</Text>
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerBar: {
        paddingHorizontal: 16, // iOS margin
        paddingTop: 16,
        paddingBottom: 8,
    },
    backButton: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16, // iOS margin
        paddingTop: 48,
        alignItems: 'center',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoImage: {
        width: 70,
        height: 70,
        marginBottom: 8,
    },
    logoIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    logoText: {
        fontSize: 32,
        fontFamily: 'Notable_400Regular',
        color: Colors.text.primary,
        letterSpacing: 2,
    },
    otpSection: {
        width: '100%',
        marginBottom: 32,
    },
    otpLabel: {
        fontSize: 15, // iOS Subheadline
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 12,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    otpInput: {
        flex: 1,
        height: 56,
        backgroundColor: 'rgba(255,255,255,0.1)', // Matches text input style
        borderRadius: 12, // iOS standard radius
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    verifyButton: {
        width: '100%',
        backgroundColor: Colors.cta.primary,
        paddingVertical: 16,
        borderRadius: 12, // iOS standard radius
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    verifyButtonText: {
        color: 'white',
        fontSize: 17, // iOS body bold
        fontWeight: 'bold',
    },
    resendSection: {
        alignItems: 'center',
        gap: 8,
    },
    resendText: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
    },
    resendButton: {
        fontSize: 15,
        fontWeight: 'bold',
        color: Colors.cta.primary,
    },
    footer: {
        paddingBottom: 40,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },
});
