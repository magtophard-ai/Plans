import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const ScreenContainer = ({ children, style }: Props) => {
  const insets = useSafeAreaInsets();
  const nativeInsets = Platform.OS === 'web' ? null : { paddingTop: insets.top };
  return <View style={[s.root, nativeInsets, style]}>{children}</View>;
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: { maxWidth: 600, width: '100%', alignSelf: 'center' },
    }),
  },
});
