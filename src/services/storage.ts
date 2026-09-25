import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'tailshare_server_url';
const DEVICE_NAME_KEY = 'tailshare_device_name';
const RECENT_SERVERS_KEY = 'tailshare_recent_servers';

export const DEFAULT_SERVER_URL = 'http://100.110.205.27:40506';

export async function getServerUrl(): Promise<string> {
  try {
    const url = await AsyncStorage.getItem(SERVER_URL_KEY);
    return url || DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export async function saveServerUrl(url: string): Promise<void> {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanUrl);
    
    // Also add to recents
    const recents = await getRecentServers();
    const updated = [cleanUrl, ...recents.filter(u => u !== cleanUrl)].slice(0, 5);
    await AsyncStorage.setItem(RECENT_SERVERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save server URL:', err);
  }
}

export async function getRecentServers(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SERVERS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return [
    'http://100.110.205.27:40506',
    'http://cuker-h610m-hvs-m-2-r2-0.tail474821.ts.net:40506',
    'https://share.abbas.my.id'
  ];
}

export async function getDeviceName(): Promise<string> {
  try {
    const name = await AsyncStorage.getItem(DEVICE_NAME_KEY);
    return name || 'iPhone';
  } catch {
    return 'iPhone';
  }
}

export async function saveDeviceName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_NAME_KEY, name.trim());
  } catch (err) {
    console.warn('Failed to save device name:', err);
  }
}
