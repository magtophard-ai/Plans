import { create } from 'zustand';

// Lightweight connectivity signal aggregated from three sources:
//   1. Browser online/offline events (web only — `online` stays `null`
//      on native because we intentionally don't pull NetInfo).
//   2. WebSocket reconnect status from `api/ws.ts`.
//   3. Recent network failures bubbling out of `api/client.ts`.
//
// `<ConnectivityBanner />` reads this state and shows a single banner.
// Stores can also call `setNetworkErrorRecorded()` / `setOnline()` from
// non-API code paths if useful — keep this dependency-free so it can
// be imported from `api/client.ts` without creating a cycle.

export type WsStatus = 'idle' | 'connected' | 'reconnecting';

export interface ConnectivityState {
  online: boolean | null;
  wsStatus: WsStatus;
  lastNetworkErrorAt: number | null;
  setOnline: (online: boolean | null) => void;
  setWsStatus: (status: WsStatus) => void;
  recordNetworkError: () => void;
  recordNetworkSuccess: () => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  online: null,
  wsStatus: 'idle',
  lastNetworkErrorAt: null,
  setOnline: (online) => set({ online }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  recordNetworkError: () => set({ lastNetworkErrorAt: Date.now() }),
  recordNetworkSuccess: () => set({ lastNetworkErrorAt: null }),
}));

// Pure synchronous getter so non-React code (api/client.ts) can ask
// "are we currently offline?" without subscribing to the store.
export const isCurrentlyOffline = (): boolean =>
  useConnectivityStore.getState().online === false;
