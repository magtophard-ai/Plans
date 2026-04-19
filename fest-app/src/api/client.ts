const API_BASE = 'http://localhost:3001/api';

let authToken: string | null = null;

export const setToken = (token: string | null) => { authToken = token; };
export const getToken = () => authToken;

export const api = async <T>(path: string, options: { method?: string; body?: unknown; noAuth?: boolean } = {}): Promise<T> => {
  const { method = 'GET', body, noAuth = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!noAuth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw { status: res.status, body: text };
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return undefined as T;
};

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

export const camelize = <T>(obj: unknown): T => {
  if (Array.isArray(obj)) return obj.map((v) => camelize(v)) as T;
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[toCamel(k)] = camelize(v);
    }
    return out as T;
  }
  return obj as T;
};
