import 'dotenv/config';

export default {
    expo: {
        name: 'HAPA',
        slug: 'hapa-app',
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/images/hapalogo.png',
        scheme: 'hapapp',
        userInterfaceStyle: 'automatic',
        newArchEnabled: true,
        splash: {
            image: './assets/images/hapalogo.png',
            resizeMode: 'contain',
            backgroundColor: '#141414'
        },
        ios: {
            supportsTablet: true,
            bundleIdentifier: 'com.hapa.app',
            config: {
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
            }
        },
        android: {
            package: 'com.hapa.app',
            config: {
                googleMaps: {
                    apiKey: process.env.GOOGLE_MAPS_API_KEY
                }
            },
            adaptiveIcon: {
                foregroundImage: './assets/images/hapalogo.png',
                backgroundColor: '#FFFFFF'
            },
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false,
            permissions: [
                'ACCESS_FINE_LOCATION',
                'ACCESS_COARSE_LOCATION',
                'CAMERA',
                'RECORD_AUDIO',
                'READ_MEDIA_IMAGES',
                'READ_MEDIA_VIDEO',
                'READ_MEDIA_VISUAL_USER_SELECTED',
            ],
            intentFilters: [
                {
                    action: 'VIEW',
                    data: [{ scheme: 'hapapp' }],
                    category: ['BROWSABLE', 'DEFAULT'],
                },
            ],
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
            'expo-video',
            [
                'expo-location',
                {
                    locationWhenInUsePermission: 'HAPA needs your location to show venues and vibes near you.',
                },
            ],
            [
                'expo-camera',
                {
                    cameraPermission: 'Allow HAPA to use your camera to capture vibes.',
                    microphonePermission: 'Allow HAPA to use your microphone to record sound for vibes.',
                },
            ],
            [
                'expo-image-picker',
                {
                    photosPermission: 'Allow HAPA to access your photos to share vibes from your gallery.',
                },
            ],
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
