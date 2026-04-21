import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TextStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { springs } from './springs';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  delay?: number;
  step?: number;
  distance?: number;
};

// Split-letter reveal — each character springs up individually.
// Used for hero titles to create "wow" first impression.
export const SplitText = ({
  text,
  style,
  delay = 80,
  step = 35,
  distance = 18,
}: Props) => {
  // Split by character, preserving spaces.
  const chars = React.useMemo(() => Array.from(text), [text]);

  return (
    <View style={s.row}>
      {chars.map((ch, i) => (
        <Letter
          key={`${i}-${ch}`}
          char={ch}
          delay={delay + i * step}
          distance={distance}
          style={style}
        />
      ))}
    </View>
  );
};

const Letter = ({
  char,
  delay,
  distance,
  style,
}: {
  char: string;
  delay: number;
  distance: number;
  style?: StyleProp<TextStyle>;
}) => {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, springs.entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [distance, 0], Extrapolation.CLAMP);
    const opacity = progress.value;
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // Render space as a non-breaking space with same style so width is preserved.
  const display = char === ' ' ? '\u00A0' : char;

  return (
    <Animated.View style={animated}>
      <Text style={style}>{display}</Text>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
});
