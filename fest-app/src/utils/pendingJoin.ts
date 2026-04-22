// Stash for a deep-link share token seen pre-auth so we can navigate to
// PublicPlan right after the user signs in.
//
// Web: persist to localStorage so the token survives a page reload (OTP flow
// can re-render the app).
// Native (iOS / Android): React Native has no `localStorage`. The in-memory
// fallback works because the app process stays alive during the OTP flow.
// AsyncStorage isn't needed because (a) cold-start with a deep link is
// re-delivered by Linking.getInitialURL() in App.tsx, and (b) a warm-start
// deep link re-invokes `usePendingJoinCapture` which will re-stash the token.
const KEY = 'fest_pending_join_token';
let inMemoryToken: string | null = null;

const hasLocalStorage = () => typeof localStorage !== 'undefined';

export function setPendingJoinToken(token: string) {
  inMemoryToken = token;
  if (hasLocalStorage()) localStorage.setItem(KEY, token);
}

export function getPendingJoinToken(): string | null {
  if (hasLocalStorage()) return localStorage.getItem(KEY);
  return inMemoryToken;
}

export function clearPendingJoinToken() {
  inMemoryToken = null;
  if (hasLocalStorage()) localStorage.removeItem(KEY);
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
