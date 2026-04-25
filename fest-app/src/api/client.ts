import { NativeModules, Platform } from 'react-native';
import { useConnectivityStore, isCurrentlyOffline } from '../stores/connectivityStore';

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const getApiBase = () => {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return trimTrailingSlashes(fromEnv);

  if (Platform.OS === 'web') return 'http://localhost:3001/api';

  const scriptURL = NativeModules.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/https?:\/\/([^/:]+)/);
  const host = match?.[1] || 'localhost';
  return `http://${host}:3001/api`;
};

const getWsBase = (apiBase: string) => {
  const fromEnv = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();
  if (fromEnv) return trimTrailingSlashes(fromEnv);

  try {
    const parsed = new URL(apiBase);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = parsed.pathname.replace(/\/+$/, '');
    const wsPath = basePath.endsWith('/api') ? `${basePath}/ws` : '/api/ws';
    return `${protocol}//${parsed.host}${wsPath}`;
  } catch {
    return 'ws://localhost:3001/api/ws';
  }
};

export const API_BASE = getApiBase();
export const WS_BASE = getWsBase(API_BASE);

let authToken: string | null = null;

export const setToken = (token: string | null) => { authToken = token; };
export const getToken = () => authToken;

export const api = async <T>(path: string, options: { method?: string; body?: unknown; noAuth?: boolean } = {}): Promise<T> => {
  const { method = 'GET', body, noAuth = false } = options;
  const headers: Record<string, string> = {};
  // Only advertise a JSON body when we actually have one. Fastify rejects
  // bodyless POSTs that declare Content-Type: application/json.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!noAuth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // Short-circuit mutating calls when the browser tells us we're offline.
  // Reads still hit fetch() so the failure path (and connectivity banner)
  // still fires for transient TCP errors. Native stays untouched —
  // `online` is `null` there.
  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (isMutation && isCurrentlyOffline()) {
    const error: any = new Error('Нет соединения. Проверьте интернет.');
    error.code = 'OFFLINE';
    useConnectivityStore.getState().recordNetworkError();
    throw error;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    // fetch() throws TypeError on DNS / TCP / CORS / abort failures.
    // Mark connectivity so the banner can pick it up.
    useConnectivityStore.getState().recordNetworkError();
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}

    if (res.status >= 500 || res.status === 0) {
      useConnectivityStore.getState().recordNetworkError();
    }

    const message = payload?.message || `HTTP ${res.status}`;
    const error: any = new Error(message);
    error.status = res.status;
    error.code = payload?.code;
    error.body = payload ?? text;
    throw error;
  }

  // 2xx — server reachable.
  useConnectivityStore.getState().recordNetworkSuccess();

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return undefined as T;
};

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

// Keep BOTH snake_case and camelCase keys on every object.
// - Frontend types in src/types are declared snake_case (matches backend).
// - Most screens/stores read snake_case; a few legacy spots read camelCase.
// Duplicating keys makes both styles work without a project-wide refactor.
export const camelize = <T>(obj: unknown): T => {
  if (Array.isArray(obj)) return obj.map((v) => camelize(v)) as T;
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const recursed = camelize(v);
      out[k] = recursed;
      const camel = toCamel(k);
      if (camel !== k) out[camel] = recursed;
    }
    return out as T;
  }
  return obj as T;
};
