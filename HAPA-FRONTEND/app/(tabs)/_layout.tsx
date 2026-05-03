import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#121212',
                    height: 64 + insets.bottom,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: 'rgba(255,255,255,0.1)',
                    elevation: 0,
                },
                tabBarActiveTintColor: Colors.cta.primary,
                tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '700',
                    marginBottom: Platform.OS === 'ios' ? 0 : 8,
                },
            }}
        >
            <Tabs.Screen 
                name="discover" 
                options={{ 
                    title: 'Discover',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? "flash" : "flash-outline"} size={24} color={color} />
                    )
                }} 
            />
            
            {/* Custom Post Button Slot */}
            <Tabs.Screen 
                name="post-redirect"
                options={{
                    title: 'Post',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={24} color={color} />
                    )
                }}
            />

            <Tabs.Screen 
                name="search" 
                options={{ 
                    title: 'Search',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons name={focused ? "search" : "search-outline"} size={24} color={color} />
                    )
                }} 
            />

        </Tabs>
    );
}

const styles = StyleSheet.create({
    centerPostBtnContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    centerPostBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: Colors.cta.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -20, // Lift it above the bar
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    }
});
