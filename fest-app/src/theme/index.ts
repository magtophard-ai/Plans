import { Platform } from 'react-native';

const colors = {
  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  primaryDark: '#4834D4',
  accent: '#FD79A8',
  accentLight: '#FDCB6E',

  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F3FE',

  textPrimary: '#2D3436',
  textSecondary: '#636E72',
  textTertiary: '#B2BEC3',
  textInverse: '#FFFFFF',

  success: '#00B894',
  warning: '#FDCB6E',
  error: '#E17055',
  info: '#74B9FF',

  border: '#DFE6E9',
  borderLight: '#F0F0F0',

  going: '#00B894',
  thinking: '#FDCB6E',
  cant: '#E17055',
  invited: '#74B9FF',

  shadow: 'rgba(0,0,0,0.06)',
  overlay: 'rgba(0,0,0,0.4)',
} as const;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

const DISPLAY_FONT = 'Unbounded_700Bold';
const DISPLAY_FONT_MEDIUM = 'Unbounded_500Medium';

const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  h4: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionBold: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  small: { fontSize: 11, fontWeight: '400' as const, lineHeight: 16 },
  displayHero: { fontFamily: DISPLAY_FONT, fontSize: 40, lineHeight: 46, letterSpacing: -1.2 },
  displayLarge: { fontFamily: DISPLAY_FONT, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  displayMedium: { fontFamily: DISPLAY_FONT, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  displayEyebrow: { fontFamily: DISPLAY_FONT_MEDIUM, fontSize: 12, lineHeight: 16, letterSpacing: 1.6, textTransform: 'uppercase' as const },
} as const;

const fonts = {
  display: DISPLAY_FONT,
  displayMedium: DISPLAY_FONT_MEDIUM,
} as const;

const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

const webSpacing = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  xxxl: 30,
} as const;

const ws = Platform.OS === 'web' ? webSpacing : spacing;

export const theme = {
  colors,
  spacing: ws,
  mobileSpacing: spacing,
  webSpacing,
  typography,
  fonts,
  borderRadius,
  shadows,
  Platform,
} as const;

export type Theme = typeof theme;
