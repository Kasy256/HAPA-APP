import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { useSubscription } from '@/hooks/useSubscription';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function VenueLayout() {
  const { refresh } = useSubscription();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      if (url.includes('payment=success')) {
        refresh();
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, [refresh]);

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
            fontSize: 10,
            fontWeight: '700',
            marginBottom: Platform.OS === 'ios' ? 0 : 8,
        },
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
            title: 'Dashboard',
            tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={22} color={color} />
            )
        }} 
      />
      


      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={24} color={color} />
          )
        }}
      />

      <Tabs.Screen
        name="promote"
        options={{
          title: 'Promote',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "megaphone" : "megaphone-outline"} size={22} color={color} />
          )
        }}
      />

      <Tabs.Screen 
        name="profile" 
        options={{ 
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
            )
        }} 
      />

      {/* Hidden Utility Screens */}
      <Tabs.Screen name="edit-profile" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="subscription" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
    createBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.cta.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -8,
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    }
});
