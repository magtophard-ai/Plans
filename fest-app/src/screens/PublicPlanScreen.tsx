import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState } from '../components/EmptyState';
import { Aurora, FadeIn, Pressable } from '../motion';
import { useAuthStore } from '../stores/authStore';
import { fetchPlanByToken, joinPlanByToken, type PlanPreview } from '../api/plans';
import { ACTIVITY_LABELS, type ActivityType } from '../types';
import { setPendingJoinToken, clearPendingJoinToken } from '../utils/pendingJoin';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicPlan'>;

export const PublicPlanScreen = ({ route }: Props) => {
  const { token } = route.params;
  const navigation = useNavigation<any>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [preview, setPreview] = React.useState<PlanPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  const loadPreview = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { plan } = await fetchPlanByToken(token);
      setPreview(plan);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить план');
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const openPlanDetails = React.useCallback((planId: string) => {
    navigation.reset({
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'MainTabs', state: { routes: [{ name: 'PlansTab' }], index: 0 } },
      ] as any,
    });
    // After reset, navigate to PlanDetails within the Plans stack.
    setTimeout(() => {
      navigation.navigate('MainTabs', {
        screen: 'PlansTab',
        params: { screen: 'PlanDetails', params: { planId } },
      } as any);
    }, 0);
  }, [navigation]);

  const handleJoin = React.useCallback(async () => {
    if (!isAuthenticated) {
      setPendingJoinToken(token);
      // Auth screen is shown at App root when !isAuthenticated, so just log out / refresh state.
      // In practice an unauthenticated deep link lands on AuthScreen directly (see App.tsx).
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      const res = await joinPlanByToken(token);
      clearPendingJoinToken();
      openPlanDetails(res.plan.id);
    } catch (e: any) {
      setError(e?.message || 'Не удалось присоединиться');
    } finally {
      setJoining(false);
    }
  }, [isAuthenticated, joining, token, openPlanDetails]);

  const canJoin = preview && (preview.lifecycleState === 'active' || preview.lifecycleState === 'finalized');

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} />
          ) : error ? (
            <EmptyState text={error} />
          ) : preview ? (
            <FadeIn delay={40} direction="down">
              <Text style={s.eyebrow}>Приглашение в план</Text>
              <Text style={s.title}>{preview.title}</Text>
              <Text style={s.meta}>
                {ACTIVITY_LABELS[preview.activityType as ActivityType] ?? 'Другое'} ·
                {' '}участников: {preview.participantCount}/{preview.maxParticipants}
              </Text>
              {preview.creator ? (
                <Text style={s.author}>от {preview.creator.name} · @{preview.creator.username}</Text>
              ) : null}
              {preview.confirmedPlaceText ? (
                <Text style={s.row}>📍 {preview.confirmedPlaceText}</Text>
              ) : null}

              <View style={s.actions}>
                {canJoin ? (
                  isAuthenticated ? (
                    <Pressable
                      style={s.primaryBtn}
                      onPress={handleJoin}
                      activeScale={0.96}
                      disabled={joining}
                    >
                      <Text style={s.primaryBtnText}>{joining ? '...' : 'Присоединиться'}</Text>
                    </Pressable>
                  ) : (
                    <View style={s.hintBox}>
                      <Text style={s.hintText}>Войдите, чтобы присоединиться к плану</Text>
                    </View>
                  )
                ) : (
                  <View style={s.hintBox}>
                    <Text style={s.hintText}>
                      {preview.lifecycleState === 'cancelled' ? 'План отменён' : 'План уже завершён'}
                    </Text>
                  </View>
                )}
              </View>
            </FadeIn>
          ) : null}
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  inner: { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md, justifyContent: 'center' },
  loader: { marginTop: theme.spacing.xl },
  eyebrow: { ...theme.typography.caption, color: theme.colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { ...theme.typography.h1, color: theme.colors.textPrimary },
  meta: { ...theme.typography.caption, color: theme.colors.textSecondary },
  author: { ...theme.typography.caption, color: theme.colors.textTertiary },
  row: { ...theme.typography.body, color: theme.colors.textPrimary, marginTop: theme.spacing.xs },
  actions: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
  primaryBtn: { backgroundColor: theme.colors.primary, paddingVertical: theme.spacing.md, borderRadius: theme.borderRadius.full, alignItems: 'center', ...theme.shadows.md },
  primaryBtnText: { ...theme.typography.bodyBold, color: theme.colors.textInverse, fontWeight: '700' },
  hintBox: { padding: theme.spacing.md, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.primary + '10' },
  hintText: { ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: 'center' },
});
