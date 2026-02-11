import 'dotenv/config';

export default {
    expo: {
        name: 'HAPA',
        slug: 'hapa-app',
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/images/hapalogo.png',
        scheme: 'hapatemp',
        userInterfaceStyle: 'automatic',
        newArchEnabled: true,
        splash: {
            image: './assets/images/hapalogo.png',
            resizeMode: 'contain',
            backgroundColor: '#000000'
        },
        ios: {
            supportsTablet: true
        },
        android: {
            adaptiveIcon: {
                foregroundImage: './assets/images/hapalogo.png',
                backgroundColor: '#000000'
            },
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false
        },
        web: {
            bundler: 'metro',
            output: 'static',
            favicon: './assets/images/hapalogo.png'
        },
        plugins: [
            'expo-router',
            '@react-native-community/datetimepicker',
            'expo-font',
            'expo-secure-store',
            'expo-video'
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            router: {},
            eas: {
                projectId: '83c9f1da-e7b4-4ce8-888e-5c199f15f010'
            },
            EXPO_API_BASE_URL: process.env.EXPO_API_BASE_URL,
            EXPO_SUPABASE_URL: process.env.EXPO_SUPABASE_URL,
            EXPO_SUPABASE_ANON_KEY: process.env.EXPO_SUPABASE_ANON_KEY,
        }
    }
};
