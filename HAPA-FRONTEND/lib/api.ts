import * as SecureStore from 'expo-secure-store';

const DEFAULT_BASE_URL = 'http://localhost:5000';

export const API_BASE_URL =
  (process.env.EXPO_API_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL;

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

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  console.log(`[API] Fetching: ${options.method || 'GET'} ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.auth) {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    console.error('[API] JSON Parse Error. Raw response:', text);
    throw new Error(`Failed to parse API response: ${text.substring(0, 100)}...`);
  }

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || 'Request failed';
    throw new Error(message);
  }

  return data;
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
    auth: true,
  });
}

