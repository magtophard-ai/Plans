import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { useConnectivityStore } from '../stores/connectivityStore';
import { usePlansStore } from '../stores/plansStore';
import { setOnStatusChange } from '../api/ws';

// Single source of truth for the strip we render at the top of the app
// when something networky is wrong. We collapse three signals into one
// banner so the user never sees two stacked indicators:
//
//   - online === false                 -> "Нет соединения"  (red)
//   - wsStatus === 'reconnecting'      -> "Восстанавливаем соединение…" (amber)
//   - lastNetworkErrorAt < 8s ago      -> "Сервер недоступен"  (amber)
//
// The component installs both the `online` listener (web) and the WS
// status hook the first time it mounts. Those installations are
// idempotent because each one just overwrites a single global handler.

const RECENT_ERROR_WINDOW_MS = 8000;

const installListeners = (() => {
  let installed = false;
  return () => {
    if (installed) return;
    installed = true;

    setOnStatusChange((status) => {
      useConnectivityStore.getState().setWsStatus(status);
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const set = useConnectivityStore.getState().setOnline;
      const w: any = window;
      const initial = typeof w.navigator?.onLine === 'boolean' ? w.navigator.onLine : null;
      set(initial);
      const onOnline = () => set(true);
      const onOffline = () => set(false);
      w.addEventListener?.('online', onOnline);
      w.addEventListener?.('offline', onOffline);
    }

    // Auto-clear the inline `sendMessage` op-error once the underlying
    // connectivity issue recovers. Without this, the strip inside the
    // chat footer ("Нет соединения. Проверьте интернет.") lingers until
    // the user retries or unmounts PlanDetails, which is confusing once
    // the top banner has already cleared itself.
    //
    // We react to two concrete recovery transitions:
    //   - browser online: false → true   (regained network)
    //   - WS: 'reconnecting' → 'connected' (backend/WS healed)
    // Both are the exact inverse of the conditions that surface the
    // send-time error, so clearing is never premature.
    let prev = useConnectivityStore.getState();
    useConnectivityStore.subscribe((state) => {
      const backOnline = prev.online === false && state.online === true;
      const wsHealed = prev.wsStatus === 'reconnecting' && state.wsStatus === 'connected';
      if (backOnline || wsHealed) {
        usePlansStore.getState().clearOpError('sendMessage');
      }
      prev = state;
    });
  };
})();

export const ConnectivityBanner = () => {
  React.useEffect(() => {
    installListeners();
  }, []);

  const online = useConnectivityStore((s) => s.online);
  const wsStatus = useConnectivityStore((s) => s.wsStatus);
  const lastNetworkErrorAt = useConnectivityStore((s) => s.lastNetworkErrorAt);

  // Re-evaluate the "recent error" window every couple of seconds so the
  // banner auto-hides without forcing an unrelated state change.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!lastNetworkErrorAt) return;
    const t = setTimeout(() => force((n) => n + 1), RECENT_ERROR_WINDOW_MS + 200);
    return () => clearTimeout(t);
  }, [lastNetworkErrorAt]);

  let label: string | null = null;
  let tone: 'error' | 'warn' | null = null;

  if (online === false) {
    label = 'Нет соединения';
    tone = 'error';
  } else if (wsStatus === 'reconnecting') {
    label = 'Восстанавливаем соединение…';
    tone = 'warn';
  } else if (
    lastNetworkErrorAt &&
    Date.now() - lastNetworkErrorAt < RECENT_ERROR_WINDOW_MS
  ) {
    label = 'Сервер недоступен. Повторите попытку.';
    tone = 'warn';
  }

  if (!label) return null;

  return (
    <View
      style={[s.banner, tone === 'error' ? s.bannerError : s.bannerWarn]}
      pointerEvents="none"
      accessibilityRole="alert"
    >
      <Text style={s.text}>{label}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  banner: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerError: { backgroundColor: theme.colors.error + 'EE' },
  bannerWarn: { backgroundColor: theme.colors.warning + 'EE' },
  text: {
    ...theme.typography.captionBold,
    color: theme.colors.textInverse,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
