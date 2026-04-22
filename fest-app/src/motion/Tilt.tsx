import React from 'react';
import { Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { springs } from './springs';

type Props = {
  children: React.ReactNode;
  maxTilt?: number;
  liftOnHover?: number;
  style?: StyleProp<ViewStyle>;
};

// Tilt-on-hover — web only. Card subtly tilts toward the cursor for a
// "holding an object" feel. On native, renders children unchanged.
export const Tilt = ({ children, maxTilt = 6, liftOnHover = 4, style }: Props) => {
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const lift = useSharedValue(0);
  const ref = React.useRef<View>(null);

  const onMouseMove = (e: any) => {
    if (Platform.OS !== 'web') return;
    const target = e.currentTarget as HTMLElement | undefined;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const dx = (x - 0.5) * 2;
    const dy = (y - 0.5) * 2;
    rotY.value = withSpring(dx * maxTilt, springs.snappy);
    rotX.value = withSpring(-dy * maxTilt, springs.snappy);
  };

  const onMouseEnter = () => {
    if (Platform.OS !== 'web') return;
    lift.value = withSpring(liftOnHover, springs.snappy);
  };

  const onMouseLeave = () => {
    if (Platform.OS !== 'web') return;
    rotX.value = withSpring(0, springs.smooth);
    rotY.value = withSpring(0, springs.smooth);
    lift.value = withSpring(0, springs.smooth);
  };

  const animated = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rotX.value}deg` },
      { rotateY: `${rotY.value}deg` },
      { translateY: -lift.value },
    ],
  }));

  if (Platform.OS !== 'web') {
    return <View style={style}>{children}</View>;
  }

  // onMouseMove/Enter/Leave only exist on web — we use `any` because RN types
  // don't include DOM mouse events.
  const webProps: any = {
    onMouseMove,
    onMouseEnter,
    onMouseLeave,
  };

  return (
    <Animated.View ref={ref as any} style={[style, animated]} {...webProps}>
      {children}
    </Animated.View>
  );
};
