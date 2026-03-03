import { Notable_400Regular, useFonts } from '@expo-google-fonts/notable';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { GlobalUploadProgress } from '@/components/GlobalUploadProgress';
import { useColorScheme } from '@/components/useColorScheme';
import { UploadProvider } from '@/contexts/UploadContext';
import { clearAuthTokens, getAccessToken, loginWithSupabase, saveAuthTokens } from '@/lib/api';
import { signInAnonymously, supabase } from '@/lib/supabaseClient';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Notable_400Regular,
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      checkAuth();
    }
  }, [loaded]);

  async function checkAuth() {
    try {
      // 1. Check if we already have existing tokens or a Supabase session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const existingToken = await getAccessToken();

      if (currentSession) {
        console.log('[Auth] Found active Supabase session, verifying...');
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (!error && user) {
            console.log('[Auth] Active Supabase session is valid.');
            return;
          }
          console.log('[Auth] Active session invalid or expired, clearing...');
          await supabase.auth.signOut();
        } catch (err) {
          console.log('[Auth] Session verification failed:', err);
          await supabase.auth.signOut();
        }
      }

      if (existingToken) {
        console.log('[Auth] Found stored token, restoring session...');
        try {
          const { data: { user }, error } = await supabase.auth.getUser(existingToken);
          if (!error && user) {
            console.log('[Auth] Stored token is valid. Setting session...');
            await supabase.auth.setSession({
              access_token: existingToken,
              refresh_token: '',
            });
            return;
          }
          console.log('[Auth] Stored token invalid or expired, re-authenticating...');
          await clearAuthTokens();
          await supabase.auth.signOut();
        } catch (err) {
          console.log('[Auth] Token restoration failed:', err);
          await clearAuthTokens();
        }
      }

      console.log('[Auth] No token found, attempting anonymous sign-in...');

      // 2. No token? Sign in anonymously with Supabase
      const { session: anonymousSession } = await signInAnonymously();
      if (!anonymousSession?.access_token) {
        throw new Error('Failed to get Supabase anonymous session');
      }

      // 3. Exchange Supabase token for Flask token
      const response = await loginWithSupabase(anonymousSession.access_token);

      if (response?.access_token && response?.refresh_token) {
        await saveAuthTokens(response.access_token, response.refresh_token);
        console.log('[Auth] Anonymous login successful, tokens saved.');
      }
    } catch (e) {
      console.error('[Auth] Auto-login failed:', e);
    }
  }

  if (!loaded) {
    return null;
  }

  return <UploadProvider><RootLayoutNav /></UploadProvider>;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(venue)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="discover" options={{ headerShown: false }} />
          <Stack.Screen name="story/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="venue/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="venue-login" options={{ headerShown: false }} />
          <Stack.Screen name="venue-onboarding" options={{ headerShown: false }} />
        </Stack>
        {/* Instagram-style upload progress bar — shows on all screens during background uploads */}
        <GlobalUploadProgress />
      </View>
    </ThemeProvider>
  );
}
