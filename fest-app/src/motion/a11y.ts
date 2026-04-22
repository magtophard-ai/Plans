import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// React to OS-level "reduce motion" setting.
// On web we read `prefers-reduced-motion`; on native we use AccessibilityInfo.
export const useReduceMotion = (): boolean => {
  const [reduce, setReduce] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      if (!mq) return;
      const update = () => { if (!cancelled) setReduce(mq.matches); };
      update();
      try { mq.addEventListener('change', update); } catch { mq.addListener(update); }
      return () => {
        cancelled = true;
        try { mq.removeEventListener('change', update); } catch { mq.removeListener(update); }
      };
    }

    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (!cancelled) setReduce(Boolean(v));
    }).catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
      if (!cancelled) setReduce(Boolean(v));
    });

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  return reduce;
};
