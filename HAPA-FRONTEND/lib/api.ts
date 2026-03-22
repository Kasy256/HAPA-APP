import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseClient';

const ACCESS_TOKEN_KEY = 'hapa_access_token';
const REFRESH_TOKEN_KEY = 'hapa_refresh_token';
/** Separate flag — only set after a real OTP login. Anonymous sessions do NOT set this. */
const VENUE_OWNER_KEY = 'hapa_is_venue_owner';

export async function saveAuthTokens(accessToken: string, refreshToken: string) {
  _cachedToken = accessToken;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  const stored = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (stored) _cachedToken = stored;
  return stored;
}

export async function clearAuthTokens() {
  _cachedToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(VENUE_OWNER_KEY);
}

/** Mark the current user as an authenticated venue owner (set after OTP success). */
export async function setVenueOwner(value: boolean) {
  if (value) {
    await SecureStore.setItemAsync(VENUE_OWNER_KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(VENUE_OWNER_KEY);
  }
}

/** Returns true only if the user has completed OTP login (not just anonymous). */
export async function isVenueOwner(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(VENUE_OWNER_KEY);
  return val === '1';
}

const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase Config] Missing URL or Anon Key. Check app.config.js and .env');
}

/** In-memory token cache to avoid reading SecureStore on every single API call. */
let _cachedToken: string | null = null;

/**
 * Generates a Supabase Image Transformation URL for a given media URL.
 * This vastly reduces bandwidth and speeds up image loading in feeds.
 * @param url The original Supabase Storage public URL
 * @param width Target width in pixels (default: 800)
 * @param quality JPEG quality 0-100 (default: 90)
 * @param resize Resize mode 'cover' or 'contain' (default: 'cover')
 */
export function getTransformedImageUrl(
  url: string | undefined | null,
  width = 800,
  quality = 90,
  resize: 'cover' | 'contain' = 'cover'
): string {
  if (!url) return '';
  // Supabase Image Transformation only works for URLs in the /storage/v1/object/public/ path
  if (!url.includes('/storage/v1/object/public/')) return url;
  // Append transformation query params
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}width=${width}&quality=${quality}&resize=${resize}`;
}

/**
 * Checks whether a media URL points to a video file based on its extension.
 */
export function isVideoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  // Strip query params before checking extension
  const clean = url.split('?')[0].toLowerCase();
  return /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/.test(clean);
}

type ApiOptions = RequestInit & { auth?: boolean };

/**
 * Path mapper to route legacy API calls to the correct Supabase Edge Functions.
 */
const PATH_MAP: Record<string, string> = {
  '/api/auth': 'auth',
  '/api/discover': 'discovery',
  '/api/locations/suggest': 'google-maps',
  '/api/payments': 'payments',
  '/api/posts': 'posts',
  '/api/venues': 'venues',
  '/api/reports': 'reports',
};

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const method = options.method || (options.body ? 'POST' : 'GET');
  console.log(`[Supabase API] Invoking: ${method} ${path}`);

  // Determine which Edge Function to call
  const matchedKey = Object.keys(PATH_MAP).find(key => path.startsWith(key));
  const functionName = matchedKey ? PATH_MAP[matchedKey] : null;

  if (!functionName) {
    throw new Error(`No Edge Function mapped for path: ${path}`);
  }

  // Sub-path: everything after the matched prefix
  const relativePath = path.replace(matchedKey!, '');

  // Auth token retrieval
  const storedToken = await getAccessToken();

  let sessionToken = storedToken;
  if (!sessionToken) {
    // Fallback to Supabase SDK session
    const session = (await supabase.auth.getSession()).data.session;
    sessionToken = session?.access_token || null;
  }

  // Supabase gateway requires apikey for project identification.
  // Authorization header should only contain a USER JWT, not the anon key.
  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'x-sub-path': relativePath || '/',
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  console.log(`[Supabase API] Auth State:`, {
    hasSession: !!sessionToken,
    usingAnon: !sessionToken,
    tokenPreview: sessionToken ? (sessionToken.substring(0, 10) + '...') : 'none',
  });

  const functionUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;

  let response;
  try {
    response = await fetch(functionUrl, {
      method,
      headers,
      body: options.body,
    });
  } catch (netErr: any) {
    console.error(`[Supabase API] Network failure invoking ${functionName}:`, netErr);
    throw new Error('Network request failed. Please check your internet connection and try again.');
  }

  if (!response.ok) {
    let errorBody: any = {};
    try {
      errorBody = await response.json();
    } catch { }
    console.error(`[Supabase API] Error from ${functionName}:`, {
      status: response.status,
      url: functionUrl,
      body: errorBody,
    });

    // Auto-logout on 401: stale token — clear stored credentials so the user
    // is prompted to re-authenticate rather than getting cryptic error messages.
    if (response.status === 401) {
      console.warn('[Supabase API] 401 received — clearing auth tokens and signing out.');
      await clearAuthTokens();
      await supabase.auth.signOut();
    }

    throw new Error(
      errorBody?.error || errorBody?.message || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

export async function loginWithSupabase(supabaseAccessToken: string) {
  return apiFetch('/api/auth/login-supabase', {
    method: 'POST',
    body: JSON.stringify({ access_token: supabaseAccessToken }),
  });
}

export async function deletePost(postId: string) {
  return apiFetch(`/api/posts/${postId}`, {
    method: 'DELETE',
  });
}
