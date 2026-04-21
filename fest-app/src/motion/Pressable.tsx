import React from 'react';
import { Pressable as RNPressable, Platform } from 'react-native';
import type { PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { springs } from './springs';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
  hoverLift?: number;
  disableHover?: boolean;
  children?: React.ReactNode;
};

// Spring-scale on press + subtle lift on web hover.
export const Pressable = ({
  style,
  activeScale = 0.97,
  hoverLift = 2,
  disableHover,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  children,
  ...rest
}: Props) => {
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: -lift.value }],
    shadowOpacity: Platform.OS === 'web' ? 0.06 + glow.value * 0.08 : undefined,
  }));

  return (
    <AnimatedRNPressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(activeScale, springs.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, springs.press);
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (!disableHover && Platform.OS === 'web') {
          lift.value = withSpring(hoverLift, springs.snappy);
          glow.value = withTiming(1, { duration: 160 });
        }
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        if (!disableHover && Platform.OS === 'web') {
          lift.value = withSpring(0, springs.snappy);
          glow.value = withTiming(0, { duration: 200 });
        }
        onHoverOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children as React.ReactNode}
    </AnimatedRNPressable>
  );
};

const AnimatedRNPressable = Animated.createAnimatedComponent(RNPressable);
