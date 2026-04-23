import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Pressable, SplitText, springs } from '../motion';

export const AuthScreen = () => {
  const [phoneDigits, setPhoneDigits] = useState('7');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const { sendOtp, verifyOtp, loading, error, clearError } = useAuthStore();

  const formStage = useSharedValue(0);
  useEffect(() => {
    formStage.value = withSpring(otpSent ? 1 : 0, springs.smooth);
  }, [otpSent]);

  const phoneCardStyle = useAnimatedStyle(() => {
    const translateX = interpolate(formStage.value, [0, 1], [0, -40], Extrapolation.CLAMP);
    const opacity = interpolate(formStage.value, [0, 0.5, 1], [1, 0, 0], Extrapolation.CLAMP);
    return { transform: [{ translateX }], opacity };
  });

  const codeCardStyle = useAnimatedStyle(() => {
    const translateX = interpolate(formStage.value, [0, 1], [40, 0], Extrapolation.CLAMP);
    const opacity = interpolate(formStage.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateX }], opacity };
  });

  // Ambient "breathing" dot next to the brand mark
  const pulse = useSharedValue(0);
  useEffect(() => {
    const loop = () => {
      pulse.value = withSpring(1, { ...springs.smooth, damping: 24 }, () => {
        pulse.value = withDelay(400, withSpring(0, { ...springs.smooth, damping: 24 }));
      });
    };
    loop();
    const t = setInterval(loop, 2400);
    return () => clearInterval(t);
  }, []);
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.4]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.9, 0.4]),
  }));

  const formatPhone = (digits: string) => {
    const local = digits.slice(1, 11);
    const part1 = local.slice(0, 3);
    const part2 = local.slice(3, 6);
    const part3 = local.slice(6, 8);
    const part4 = local.slice(8, 10);

    let formatted = '+7';
    if (local.length > 0) {
      formatted += ` (${part1}`;
      if (local.length >= 3) formatted += ')';
    }
    if (local.length > 3) formatted += ` ${part2}`;
    if (local.length > 6) formatted += ` ${part3}`;
    if (local.length > 8) formatted += ` ${part4}`;
    return formatted;
  };

  const normalizePhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) return '7';
    let normalized = digits;
    if (normalized[0] === '8') normalized = `7${normalized.slice(1)}`;
    if (normalized[0] !== '7') normalized = `7${normalized}`;
    return normalized.slice(0, 11);
  };

  const formattedPhone = formatPhone(phoneDigits);
  const apiPhone = `+${phoneDigits}`;
  const isPhoneComplete = phoneDigits.length === 11;
  const isCodeComplete = code.length >= 4;

  const handleSendOtp = () => {
    if (loading || !isPhoneComplete) return;
    clearError();
    sendOtp(apiPhone).then(() => setOtpSent(true)).catch(() => {});
  };

  const handleVerify = () => {
    if (loading || !isCodeComplete) return;
    clearError();
    verifyOtp(code);
  };

  const handleBack = () => {
    clearError();
    setCode('');
    setOtpSent(false);
  };

  return (
    <View style={s.root}>
      <Aurora intensity="strong" />
      <ScreenContainer>
        <KeyboardAvoidingView
          style={s.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FadeIn delay={60} direction="down" distance={10} style={s.brandRow}>
            <Text style={s.brandMark}>FEST</Text>
            <Animated.View style={[s.brandDot, dotStyle]} />
          </FadeIn>

          <View style={s.heroWrap}>
            <SplitText text="Планы?" style={s.hero} delay={180} step={60} distance={32} />
            <FadeIn delay={720} direction="up" distance={10}>
              <Text style={s.heroSub}>Собирайтесь. Быстро. Красиво.</Text>
            </FadeIn>
          </View>

          <FadeIn delay={900} direction="up" distance={14}>
            <Text style={s.subtitle}>
              {otpSent ? `Код отправлен на ${formattedPhone}` : 'Войдите по номеру телефона'}
            </Text>
          </FadeIn>

          {error ? (
            <FadeIn delay={0} direction="down" distance={6}>
              <Text style={s.errorText}>{error}</Text>
            </FadeIn>
          ) : null}

          <View style={s.formStage}>
            {!otpSent ? (
              <Animated.View style={[s.formCard, phoneCardStyle]}>
                <View style={s.inputWrap}>
                  <Text style={s.inputLabel}>Телефон</Text>
                  <TextInput
                    style={s.input}
                    placeholder="+7 (941) 223 22 22"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={formattedPhone}
                    onChangeText={(value) => setPhoneDigits(normalizePhoneInput(value))}
                    keyboardType="phone-pad"
                    autoFocus
                    editable={!loading}
                  />
                </View>
                <Pressable
                  style={[s.primaryBtn, (!isPhoneComplete || loading) && s.primaryBtnDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading || !isPhoneComplete}
                  activeScale={0.97}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <Text style={s.primaryBtnText}>Получить код</Text>
                  )}
                </Pressable>
                <Text style={s.hint}>Мы отправим SMS с кодом подтверждения</Text>
              </Animated.View>
            ) : (
              <Animated.View style={[s.formCard, codeCardStyle]}>
                <View style={s.inputWrap}>
                  <Text style={s.inputLabel}>Код из SMS</Text>
                  <TextInput
                    style={[s.input, s.inputOtp]}
                    placeholder="1111"
                    placeholderTextColor={theme.colors.textTertiary}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoFocus
                    editable={!loading}
                    maxLength={6}
                  />
                </View>
                <Pressable
                  style={[s.primaryBtn, (!isCodeComplete || loading) && s.primaryBtnDisabled]}
                  onPress={handleVerify}
                  disabled={loading || !isCodeComplete}
                  activeScale={0.97}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <Text style={s.primaryBtnText}>Войти</Text>
                  )}
                </Pressable>
                <Pressable style={s.secondaryBtn} onPress={handleBack} activeScale={0.98}>
                  <Text style={s.secondaryBtnText}>Изменить номер</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    ...Platform.select({ web: { maxWidth: 460, alignSelf: 'center', width: '100%' } }),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  brandMark: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 6,
    color: theme.colors.primaryDark,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    backgroundColor: theme.colors.accent,
  },
  heroWrap: {
    marginBottom: theme.spacing.xl,
  },
  hero: {
    fontFamily: theme.fonts.display,
    fontSize: Platform.OS === 'web' ? 76 : 60,
    lineHeight: Platform.OS === 'web' ? 82 : 66,
    color: theme.colors.primaryDark,
    letterSpacing: -2.5,
  },
  heroSub: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  formStage: {
    minHeight: 240,
  },
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(18px) saturate(140%)',
      } as any,
      default: {
        ...theme.shadows.md,
      },
    }),
  },
  inputWrap: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  input: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primaryLight,
  },
  inputOtp: {
    letterSpacing: 10,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  primaryBtnDisabled: {
    backgroundColor: theme.colors.primaryLight,
    shadowOpacity: 0,
  },
  primaryBtnText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  secondaryBtnText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
