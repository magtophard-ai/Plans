import { Platform } from 'react-native';

// Thin wrapper around expo-haptics. No-ops on web and if the module is missing.
// Kept sync + fire-and-forget — haptic feedback should never block UI.

type Impact = 'light' | 'medium' | 'heavy';

let Haptics: typeof import('expo-haptics') | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Haptics = require('expo-haptics');
  } catch {
    Haptics = null;
  }
}

export const hapticTap = (impact: Impact = 'light') => {
  if (!Haptics) return;
  try {
    const style = impact === 'heavy'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : impact === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(style);
  } catch {}
};

export const hapticSuccess = () => {
  if (!Haptics) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
};

export const hapticWarning = () => {
  if (!Haptics) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
};

export const hapticSelection = () => {
  if (!Haptics) return;
  try { Haptics.selectionAsync(); } catch {}
};
