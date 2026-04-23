// Persistent storage for auth tokens.
//
// Web: `localStorage` (synchronous, survives reload).
// Native (iOS / Android): `AsyncStorage` (persistent across app kills —
// `localStorage` is unavailable on React Native, so the previous implementation
// silently dropped the session on every cold start).
//
// In-memory mirror keeps the first read after login synchronous.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ACCESS_KEY = 'fest_auth_token';
const REFRESH_KEY = 'fest_refresh_token';

let cachedAccess: string | null = null;
let cachedRefresh: string | null = null;

const hasLocalStorage = () =>
  Platform.OS === 'web' && typeof localStorage !== 'undefined';

export async function loadTokens(): Promise<{ access: string | null; refresh: string | null }> {
  if (cachedAccess !== null || cachedRefresh !== null) {
    return { access: cachedAccess, refresh: cachedRefresh };
  }
  try {
    if (hasLocalStorage()) {
      cachedAccess = localStorage.getItem(ACCESS_KEY);
      cachedRefresh = localStorage.getItem(REFRESH_KEY);
      return { access: cachedAccess, refresh: cachedRefresh };
    }
    const [access, refresh] = await Promise.all([
      AsyncStorage.getItem(ACCESS_KEY),
      AsyncStorage.getItem(REFRESH_KEY),
    ]);
    cachedAccess = access;
    cachedRefresh = refresh;
    return { access, refresh };
  } catch {
    return { access: null, refresh: null };
  }
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  cachedAccess = access;
  cachedRefresh = refresh;
  try {
    if (hasLocalStorage()) {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
      return;
    }
    await Promise.all([
      AsyncStorage.setItem(ACCESS_KEY, access),
      AsyncStorage.setItem(REFRESH_KEY, refresh),
    ]);
  } catch {
    // Best effort — in-memory cache still keeps this session alive.
  }
}

export async function clearTokens(): Promise<void> {
  cachedAccess = null;
  cachedRefresh = null;
  try {
    if (hasLocalStorage()) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      return;
    }
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_KEY),
      AsyncStorage.removeItem(REFRESH_KEY),
    ]);
  } catch {
    // ignore
  }
}
