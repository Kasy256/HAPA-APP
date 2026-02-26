import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseClient';

const ACCESS_TOKEN_KEY = 'hapa_access_token';
const REFRESH_TOKEN_KEY = 'hapa_refresh_token';

export async function saveAuthTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

type ApiOptions = RequestInit & { auth?: boolean };

/**
 * Path mapper to route legacy API calls to the correct Supabase Edge Functions
 */
const PATH_MAP: Record<string, string> = {
  '/api/auth': 'auth',
  '/api/discover': 'discovery',
  '/api/locations/suggest': 'google-maps',
  '/api/posts': 'posts',
  '/api/venues': 'venues',
};

export async function apiFetch(path: string, options: ApiOptions = {}) {
  console.log(`[Supabase API] Invoking: ${options.method || 'GET'} ${path}`);

  // 1. Determine which Edge Function to call
  const matchedKey = Object.keys(PATH_MAP).find(key => path.startsWith(key));
  const functionName = matchedKey ? PATH_MAP[matchedKey] : null;

  if (!functionName) {
    throw new Error(`No Edge Function mapped for path: ${path}`);
  }

  // 2. Prepare request info
  const relativePath = path.replace(matchedKey!, '');
  const body = options.body ? JSON.parse(options.body as string) : undefined;

  // Note: For simplicity, we handle GET query params as parts of the path if needed,
  // but better to just pass them as body or handled by the function internal router.

  // 3. Invoke Supabase Function
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: options.method as any,
    body: body,
    // Add sub-path if necessary for functions that handle multiple routes
    headers: {
      'x-sub-path': relativePath || '/',
    }
  });

  if (error) {
    console.error(`[Supabase API] Error invoking ${functionName}:`, error);
    throw new Error(error.message || 'Function invocation failed');
  }

  return data;
}

export async function loginWithSupabase(supabaseAccessToken: string) {
  // Directly use the auth function bridge
  return apiFetch('/api/auth/login-supabase', {
    method: 'POST',
    body: JSON.stringify({ access_token: supabaseAccessToken }),
  });
}

export async function deletePost(postId: string) {
  // The posts function handles deletion
  return apiFetch(`/api/posts/${postId}`, {
    method: 'DELETE',
    auth: true,
  });
}

