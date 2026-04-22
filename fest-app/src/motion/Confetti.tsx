import React from 'react';
import { StyleSheet, View, Platform, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { theme } from '../theme';

type Props = {
  trigger: boolean;
  pieces?: number;
  durationMs?: number;
};

// Lightweight confetti — absolute-positioned pieces fall + rotate.
// Triggered imperatively via `trigger` prop flipping true.
export const Confetti = ({ trigger, pieces = 28, durationMs = 1800 }: Props) => {
  const { width: ww, height: wh } = useWindowDimensions();
  const w = Math.min(ww, 600);
  const h = Math.min(wh, 900);

  // Stable per-piece config generated once.
  const config = React.useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const startX = Math.random() * w;
        const driftX = (Math.random() - 0.5) * 160;
        const rotateTo = (Math.random() - 0.5) * 900;
        const sz = 8 + Math.random() * 8;
        const delay = Math.random() * 260;
        return { c, startX, driftX, rotateTo, sz, delay };
      }),
    [pieces, w],
  );

  if (!trigger) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {config.map((p, i) => (
        <Piece
          key={`${i}`}
          color={p.c}
          startX={p.startX}
          driftX={p.driftX}
          rotateTo={p.rotateTo}
          size={p.sz}
          delay={p.delay}
          fallHeight={h}
          durationMs={durationMs}
        />
      ))}
    </View>
  );
};

const Piece = ({
  color,
  startX,
  driftX,
  rotateTo,
  size,
  delay,
  fallHeight,
  durationMs,
}: {
  color: string;
  startX: number;
  driftX: number;
  rotateTo: number;
  size: number;
  delay: number;
  fallHeight: number;
  durationMs: number;
}) => {
  const t = useSharedValue(0);

  React.useEffect(() => {
    t.value = withDelay(
      delay,
      withTiming(1, { duration: durationMs, easing: Easing.out(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => {
    const ty = interpolate(t.value, [0, 1], [-40, fallHeight + 60], Extrapolation.CLAMP);
    const tx = interpolate(t.value, [0, 1], [0, driftX], Extrapolation.CLAMP);
    const rot = interpolate(t.value, [0, 1], [0, rotateTo], Extrapolation.CLAMP);
    const opacity = interpolate(t.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateX: tx }, { translateY: ty }, { rotate: `${rot}deg` }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX,
          top: 0,
          width: size,
          height: size * 0.42,
          backgroundColor: color,
          borderRadius: 2,
        },
        animated,
      ]}
    />
  );
};

const CONFETTI_COLORS = [
  theme.colors.primary,
  theme.colors.accent,
  theme.colors.accentLight,
  theme.colors.info,
  theme.colors.success,
  '#A29BFE',
  '#FD79A8',
];

// Tiny pulse halo that fires from a point — used for "level up" moments.
export const PulseHalo = ({
  trigger,
  color = theme.colors.primary,
  size = 120,
}: {
  trigger: boolean;
  color?: string;
  size?: number;
}) => {
  const v = useSharedValue(0);
  React.useEffect(() => {
    if (!trigger) return;
    v.value = 0;
    v.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), 1, false);
  }, [trigger]);
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.2, 1], [0, 0.5, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(v.value, [0, 1], [0.4, 2.2], Extrapolation.CLAMP) }],
  }));
  if (!trigger) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          alignSelf: 'center',
          top: '40%',
          ...Platform.select({
            web: {
              filter: 'blur(1px)',
            } as any,
          }),
        },
        animated,
      ]}
    />
  );
};
