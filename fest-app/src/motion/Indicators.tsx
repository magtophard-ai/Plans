import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { springs } from './springs';
import { Pressable } from './Pressable';

// Animated badge with optional pulse. Used for statuses ("Иду", "Думаю" etc.).
export const Badge = ({
  label,
  color,
  pulse,
  style,
  textStyle,
}: {
  label: string;
  color: string;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) => {
  const haloV = useSharedValue(0);

  React.useEffect(() => {
    if (pulse) {
      haloV.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    } else {
      haloV.value = 0;
    }
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(haloV.value, [0, 0.3, 1], [0.4, 0.2, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(haloV.value, [0, 1], [1, 1.7], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[s.badgeWrap, style]}>
      {pulse ? (
        <Animated.View
          pointerEvents="none"
          style={[s.badgeHalo, { backgroundColor: color }, haloStyle]}
        />
      ) : null}
      <View style={[s.badge, { backgroundColor: color }]}>
        <Text style={[s.badgeText, textStyle]}>{label}</Text>
      </View>
    </View>
  );
};

// Notification bell with wiggle when count changes.
type BellProps = {
  count: number;
  onPress?: () => void;
  color?: string;
};
export const NotificationBell = ({ count, onPress, color = theme.colors.textPrimary }: BellProps) => {
  const rot = useSharedValue(0);
  const badgeScale = useSharedValue(count > 0 ? 1 : 0);

  React.useEffect(() => {
    if (count > 0) {
      rot.value = withSequence(
        withTiming(-14, { duration: 90 }),
        withTiming(14, { duration: 90 }),
        withTiming(-10, { duration: 90 }),
        withTiming(8, { duration: 90 }),
        withTiming(0, { duration: 120 }),
      );
      badgeScale.value = withSpring(1, springs.bouncy);
    } else {
      badgeScale.value = withSpring(0, springs.snappy);
    }
  }, [count]);

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeScale.value,
  }));

  return (
    <Pressable onPress={onPress} style={s.bellWrap} activeScale={0.88} hitSlop={8}>
      <Animated.View style={bellStyle}>
        <Text style={[s.bellIcon, { color }]}>🔔</Text>
      </Animated.View>
      {count > 0 ? (
        <Animated.View style={[s.bellBadge, badgeStyle]}>
          <Text style={s.bellBadgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
};

// Animated counter — ticks up/down on change.
export const AnimatedCount = ({
  value,
  style,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
}) => {
  const [displayed, setDisplayed] = React.useState(value);
  const prev = React.useRef(value);

  React.useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const delta = end - start;
    const steps = 14;
    let i = 0;
    const int = setInterval(() => {
      i++;
      setDisplayed(Math.round(start + (delta * i) / steps));
      if (i >= steps) {
        clearInterval(int);
        setDisplayed(end);
        prev.current = end;
      }
    }, 20);
    return () => clearInterval(int);
  }, [value]);

  return <Text style={style}>{displayed}</Text>;
};

const s = StyleSheet.create({
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badgeHalo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
  },
  bellWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  bellIcon: {
    fontSize: 22,
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
