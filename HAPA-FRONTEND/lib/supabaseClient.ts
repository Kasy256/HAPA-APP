import { createClient } from '@supabase/supabase-js';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] EXPO_SUPABASE_URL or EXPO_SUPABASE_ANON_KEY are not set in app.config.js extra. ' +
    'Media uploads will fail until these are configured.',
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function uploadImage(
  fileUri: string,
  {
    bucket = 'media',
    folder = 'venues',
  }: { bucket?: string; folder?: string } = {},
): Promise<string> {
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  // In React Native / Expo, fetching a local file URI with fetch() often fails
  // with "Network request failed". Instead, read the file as base64 and convert
  // it to an ArrayBuffer that Supabase Storage can accept.
  const base64File = await FileSystem.readAsStringAsync(fileUri, {
    // Using string literal to avoid issues with EncodingType on some SDK versions
    encoding: 'base64' as any,
  });

  const fileBytes = decode(base64File);

  const { error } = await supabase.storage.from(bucket).upload(fileName, fileBytes, {
    cacheControl: '3600',
    upsert: false,
    contentType: 'image/jpeg',
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

