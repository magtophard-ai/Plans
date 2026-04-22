import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { springs } from './springs';
import { useReduceMotion } from './a11y';

type Props = {
  count: number;
  activeIndex: number;
  containerWidth: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  height?: number;
  gap?: number;
};

// Morphing pill indicator — slides between tabs AND briefly stretches/squeezes
// during the transition (morph effect) for a distinct, physical feel.
export const TabIndicator = ({
  count,
  activeIndex,
  containerWidth,
  color = theme.colors.primary,
  style,
  height,
  gap = 0,
}: Props) => {
  const reduce = useReduceMotion();
  const progress = useSharedValue(activeIndex);

  React.useEffect(() => {
    if (reduce) { progress.value = activeIndex; return; }
    progress.value = withSpring(activeIndex, springs.morph);
  }, [activeIndex, reduce]);

  const tabWidth = count > 0 ? containerWidth / count : 0;

  const animated = useAnimatedStyle(() => {
    const positions = Array.from({ length: count }, (_, i) => i);
    const translateX = interpolate(
      progress.value,
      positions,
      positions.map((i) => i * tabWidth + gap / 2),
      Extrapolation.CLAMP,
    );
    // Morph width: stretches slightly between tabs, shrinks when settled.
    const fractional = Math.abs(progress.value - Math.round(progress.value));
    const widthScale = 1 + fractional * 0.35;
    return {
      transform: [{ translateX }, { scaleX: widthScale }],
      width: tabWidth - gap,
    };
  });

  if (containerWidth <= 0 || count === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.indicator, { backgroundColor: color, height }, style, animated]}
    />
  );
};

const s = StyleSheet.create({
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 9999,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
});

// Static inset wrapper around TabIndicator — handy when laid out on top of tab labels.
export const Tab = ({
  active,
  children,
  style,
}: {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const reduce = useReduceMotion();
  const opacity = useSharedValue(active ? 1 : 0.55);
  React.useEffect(() => {
    if (reduce) { opacity.value = active ? 1 : 0.55; return; }
    opacity.value = withSpring(active ? 1 : 0.55, springs.smooth);
  }, [active, reduce]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
};
