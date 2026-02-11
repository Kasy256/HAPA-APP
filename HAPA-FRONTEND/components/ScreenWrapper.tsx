
import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

export function ScreenWrapper({ children, style }: ScreenWrapperProps) {
    return (
        <LinearGradient
            colors={Colors.background.gradient}
            style={styles.container}
            locations={[0, 0.35, 0.8]} // Targeted stops for the red-dark palette
        >
            <StatusBar style="light" />
            <SafeAreaView style={[styles.safeArea, style]}>
                {children}
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
});
