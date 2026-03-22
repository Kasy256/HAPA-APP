import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import * as SecureStore from 'expo-secure-store';

// Custom Storage provider for Supabase Auth to use Expo SecureStore
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] EXPO_SUPABASE_URL or EXPO_SUPABASE_ANON_KEY are not set in app.config.js extra. ' +
    'Media uploads will fail until these are configured.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Compress an image to a max width/height and quality before uploading.
 * This is the same approach Instagram/WhatsApp use to make uploads feel instant.
 * A raw 4K photo (8MB+) becomes ~400KB-800KB after compression.
 */
async function compressImage(fileUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    fileUri,
    [{ resize: { width: 1440 } }], // Resize to max 1440px wide (portrait or landscape)
    {
      compress: 0.82,  // ~82% quality — visually lossless, huge size reduction
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

/**
 * Upload media to Supabase Storage using ArrayBuffer.
 * 
 * We use base64-arraybuffer because React Native's Blob and FormData 
 * native implementations sometimes fail with Supabase Storage fetch clients (`Network request failed`).
 * Since we compress the image first, the memory overhead of base64 processing is now negligible 
 * compared to uploading raw 10MB+ images previously.
 */
export async function uploadMedia(
  fileUri: string,
  {
    bucket = 'media',
    folder = 'venues',
    type = 'image'
  }: { bucket?: string; folder?: string; type?: 'image' | 'video' } = {},
): Promise<string> {
  const extension = type === 'video' ? 'mp4' : 'jpg';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const contentType = type === 'video' ? 'video/mp4' : 'image/jpeg';

  // Step 1: Compress image before upload (skip for video — video compression is complex)
  let uploadUri = fileUri;
  if (type === 'image') {
    console.log('[uploadMedia] Compressing image...');
    uploadUri = await compressImage(fileUri);
    console.log('[uploadMedia] Compression done. Uploading...');
  }

  // Step 2: Read as base64 and decode to ArrayBuffer for stable RN Supabase upload
  const base64File = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: 'base64' as any,
  });
  const fileBytes = decode(base64File);

  // Step 3: Upload via Supabase SDK
  const { error } = await supabase.storage.from(bucket).upload(fileName, fileBytes, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });

  if (error) {
    throw error;
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

/**
 * Ensures every app user (registered or not) has a stable Supabase session.
 * - If already signed in (real or anonymous) → returns existing token
 * - If not → signs in anonymously (silent, no UI needed)
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[Supabase] Anonymous sign-in failed:', error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (e) {
    console.warn('[Supabase] ensureAnonymousSession error:', e);
    return null;
  }
}

