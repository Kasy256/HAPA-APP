import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

const DASHBOARD_URL = 'https://get-hapa.web.app/dashboard';
const TOKEN_KEY = 'hapa_access_token';

export interface OpenDashboardParams {
  venueId:   string;
  venueName: string;
  email?:    string;
  tab?:      'plans' | 'boost' | 'manage';
  postId?:   string;
}

export async function openDashboard(params: OpenDashboardParams): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY) ?? '';

  const url = new URL(DASHBOARD_URL);
  url.searchParams.set('venue_id',   params.venueId);
  url.searchParams.set('venue_name', params.venueName);
  if (token)         url.searchParams.set('token',    token);
  if (params.email)  url.searchParams.set('email',    params.email);
  if (params.tab)    url.searchParams.set('tab',      params.tab);
  if (params.postId) url.searchParams.set('post_id',  params.postId);

  await Linking.openURL(url.toString());
}

export const openUpgrade = (p: Omit<OpenDashboardParams, 'tab'>) =>
  openDashboard({ ...p, tab: 'plans' });

export const openBoost = (p: Omit<OpenDashboardParams, 'tab'> & { postId: string }) =>
  openDashboard({ ...p, tab: 'boost' });

export const openManage = (p: Omit<OpenDashboardParams, 'tab'>) =>
  openDashboard({ ...p, tab: 'manage' });
