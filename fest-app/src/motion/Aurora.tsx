import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  interpolateColor,
  Extrapolation,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { easings } from './springs';

type Props = {
  intensity?: 'subtle' | 'strong';
  style?: StyleProp<ViewStyle>;
};

// Aurora — animated color blobs behind every screen.
// Drifts slowly, shifts hue — creates a living, premium background.
// No SVG dependency — just blurred circles with mix-blend on web.
export const Aurora = ({ intensity = 'subtle', style }: Props) => {
  const drift = useSharedValue(0);

  React.useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: easings.drift }), -1, true);
  }, []);

  const baseOpacity = intensity === 'strong' ? 0.42 : 0.24;

  const blob1 = useAnimatedStyle(() => {
    const tx = interpolate(drift.value, [0, 1], [-40, 60], Extrapolation.CLAMP);
    const ty = interpolate(drift.value, [0, 1], [-30, 40], Extrapolation.CLAMP);
    const scale = interpolate(drift.value, [0, 1], [1, 1.18], Extrapolation.CLAMP);
    const color = interpolateColor(
      drift.value,
      [0, 0.5, 1],
      [theme.colors.primary, '#8B7CF6', theme.colors.primaryLight],
    );
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob2 = useAnimatedStyle(() => {
    const tx = interpolate(drift.value, [0, 1], [50, -30], Extrapolation.CLAMP);
    const ty = interpolate(drift.value, [0, 1], [40, -30], Extrapolation.CLAMP);
    const scale = interpolate(drift.value, [0, 1], [1.1, 0.92], Extrapolation.CLAMP);
    const color = interpolateColor(
      drift.value,
      [0, 0.5, 1],
      [theme.colors.accent, '#FFA8C5', theme.colors.accentLight],
    );
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob3 = useAnimatedStyle(() => {
    const tx = interpolate(drift.value, [0, 1], [-20, 30], Extrapolation.CLAMP);
    const ty = interpolate(drift.value, [0, 1], [20, -40], Extrapolation.CLAMP);
    const scale = interpolate(drift.value, [0, 1], [0.9, 1.15], Extrapolation.CLAMP);
    const color = interpolateColor(
      drift.value,
      [0, 0.5, 1],
      ['#74B9FF', '#A29BFE', '#FDCB6E'],
    );
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  return (
    <View pointerEvents="none" style={[s.root, style]}>
      <View style={s.tint} />
      <Animated.View
        style={[s.blob, s.blobA, { opacity: baseOpacity }, blob1]}
      />
      <Animated.View
        style={[s.blob, s.blobB, { opacity: baseOpacity * 0.9 }, blob2]}
      />
      <Animated.View
        style={[s.blob, s.blobC, { opacity: baseOpacity * 0.75 }, blob3]}
      />
      {Platform.OS === 'web' ? <View style={s.veil} /> : null}
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
  },
  blob: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    ...Platform.select({
      web: {
        filter: 'blur(80px)',
      } as any,
    }),
  },
  blobA: { top: -180, left: -160 },
  blobB: { bottom: -200, right: -160 },
  blobC: { top: '35%', right: '-25%' },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
