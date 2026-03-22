
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSubscription } from '@/hooks/useSubscription';

function CustomTabBar({ state, descriptors, navigation }: any) {
  const TAB_WIDTH = 280;
  const TAB_ITEM_WIDTH = TAB_WIDTH / 3;
  const activeIndex = state.index;

  const { options: currentOptions } = descriptors[state.routes[activeIndex].key];
  if (currentOptions.tabBarStyle?.display === 'none') {
    return null;
  }

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: withSpring(activeIndex * TAB_ITEM_WIDTH, { damping: 15, stiffness: 120 }) }],
    };
  });

  return (
    <View style={styles.bottomBarWrapper}>
      <BlurView intensity={60} tint="dark" style={styles.bottomBar}>
        <View style={[styles.switchContainer, { width: TAB_WIDTH }]}>
          {/* Animated Indicator */}
          <Animated.View style={[styles.activeIndicator, { width: TAB_ITEM_WIDTH }, animatedStyle]} />

          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];

            // Skip if href is null (standard Expo Router way to hide from tabs)
            if (options.href === null) return null;

            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            // Define Icons
            let iconName: any = 'home';
            if (route.name === 'index') iconName = isFocused ? 'home' : 'home-outline';
            if (route.name === 'create') iconName = isFocused ? 'add-circle' : 'add-circle-outline';
            if (route.name === 'profile') iconName = isFocused ? 'person' : 'person-outline';

            const routeLabel = route.name === 'index' ? 'Home' : route.name === 'create' ? 'Post' : 'Profile';

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={[styles.navItem, { width: TAB_ITEM_WIDTH }]}
                activeOpacity={1}
              >
                <Ionicons
                  name={iconName}
                  size={24}
                  color={isFocused ? 'white' : 'rgba(255,255,255,0.5)'}
                />
                <Text style={[
                  styles.navText,
                  { color: isFocused ? 'white' : 'rgba(255,255,255,0.5)' }
                ]}>
                  {routeLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function VenueLayout() {
  const { refresh } = useSubscription();

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
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute' }
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen
        name="create"
        options={{
          tabBarStyle: { display: 'none' }
        }}
      />
      <Tabs.Screen name="profile" />
      <Tabs.Screen
        name="edit-profile"
        options={{
          tabBarStyle: { display: 'none' },
          href: null,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          tabBarStyle: { display: 'none' },
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bottomBarWrapper: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    borderRadius: 100,
    overflow: 'hidden',
  },
  bottomBar: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 10, 10, 0.8)',
    padding: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    height: 56,
    alignItems: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    height: '100%',
    backgroundColor: Colors.cta.primary,
    borderRadius: 30,
    shadowColor: Colors.cta.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  navItem: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  navText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
