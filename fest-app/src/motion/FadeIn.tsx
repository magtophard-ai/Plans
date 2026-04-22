import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { springs } from './springs';
import { useReduceMotion } from './a11y';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

type Props = {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  direction?: Direction;
  style?: StyleProp<ViewStyle>;
};

// Single entry animation used across screens. Spring-based, not timing — more alive.
export const FadeIn = ({
  children,
  delay = 0,
  distance = 16,
  direction = 'up',
  style,
}: Props) => {
  const reduce = useReduceMotion();
  const progress = useSharedValue(reduce ? 1 : 0);

  React.useEffect(() => {
    if (reduce) { progress.value = 1; return; }
    progress.value = withDelay(delay, withSpring(1, springs.entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    const offset = interpolate(progress.value, [0, 1], [distance, 0], Extrapolation.CLAMP);
    let translateX = 0;
    let translateY = 0;
    if (direction === 'up') translateY = offset;
    else if (direction === 'down') translateY = -offset;
    else if (direction === 'left') translateX = offset;
    else if (direction === 'right') translateX = -offset;
    return {
      opacity,
      transform: [{ translateX }, { translateY }],
    };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

// Stagger helper — wraps each child with incremental delay.
type StaggerProps = {
  children: React.ReactNode;
  baseDelay?: number;
  step?: number;
  distance?: number;
  direction?: Direction;
};

export const Stagger = ({
  children,
  baseDelay = 80,
  step = 55,
  distance = 14,
  direction = 'up',
}: StaggerProps) => {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <FadeIn
          key={i}
          delay={baseDelay + i * step}
          distance={distance}
          direction={direction}
        >
          {child}
        </FadeIn>
      ))}
    </>
  );
};

// Pulse — looping scale for badges/dots
export const Pulse = ({
  children,
  enabled = true,
  from = 1,
  to = 1.25,
  duration = 1400,
  style,
}: {
  children: React.ReactNode;
  enabled?: boolean;
  from?: number;
  to?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const reduce = useReduceMotion();
  const v = useSharedValue(from);
  React.useEffect(() => {
    if (!enabled || reduce) {
      v.value = from;
      return;
    }
    // Sequential ping-pong using withTiming; kept simple.
    const animate = () => {
      v.value = withTiming(to, { duration: duration / 2 }, () => {
        v.value = withTiming(from, { duration: duration / 2 });
      });
    };
    animate();
    const t = setInterval(animate, duration);
    return () => clearInterval(t);
  }, [enabled, from, to, duration, reduce]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: v.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
};
