const KEY = 'fest_pending_join_token';

export function setPendingJoinToken(token: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, token);
}

export function getPendingJoinToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function clearPendingJoinToken() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}

/**
 * Extract a share token from a URL of the form:
 *   fest://p/:token
 *   http(s)://<host>/p/:token
 *   /p/:token
 * Returns null if no token found.
 */
export function extractShareTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/p\/([a-zA-Z0-9_-]+)(?:[/?#].*)?$/);
  return match ? match[1] : null;
}
