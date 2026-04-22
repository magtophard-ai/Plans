import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { useGroupsStore } from '../stores/groupsStore';
import { usePlansStore } from '../stores/plansStore';
import { ACTIVITY_LABELS } from '../types';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable, Tilt } from '../motion';
import type { PlansStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<PlansStackParamList, 'GroupDetails'>;

export const GroupDetailsScreen = ({ route, navigation }: Props) => {
  const { groupId } = route.params;
  const groups = useGroupsStore((s) => s.groups);
  const groupsLoading = useGroupsStore((s) => s.loading);
  const groupsError = useGroupsStore((s) => s.error);
  const fetchGroup = useGroupsStore((s) => s.fetchGroup);
  const plans = usePlansStore((s) => s.plans);
  const apiCreatePlan = usePlansStore((s) => s.apiCreatePlan);
  const user = useAuthStore((s) => s.user);
  const [creatingPlan, setCreatingPlan] = React.useState(false);

  React.useEffect(() => {
    fetchGroup(groupId);
  }, [fetchGroup, groupId]);

  const group = groups.find((g) => g.id === groupId);

  if (!group && groupsLoading) {
    return (
      <View style={s.root}>
        <Aurora />
        <ScreenContainer>
          <View style={s.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
        </ScreenContainer>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={s.root}>
        <Aurora />
        <ScreenContainer>
          <View style={s.inner}>
            {groupsError ? <Text style={s.errorBanner}>{groupsError}</Text> : null}
            <EmptyState text="Группа не найдена" />
          </View>
        </ScreenContainer>
      </View>
    );
  }

  const groupMemberIds = new Set((group.members ?? []).map((m) => m.user_id));
  const groupPlans = plans.filter((p) =>
    p.participants?.some((pp) => groupMemberIds.has(pp.user_id))
  );
  const activePlans = groupPlans.filter((p) => p.lifecycle_state === 'active' || p.lifecycle_state === 'finalized');
  const pastPlans = groupPlans.filter((p) => p.lifecycle_state === 'completed');

  const handleCreatePlanWithGroup = async () => {
    if (!user || creatingPlan) return;
    const memberIds = (group!.members ?? []).filter((m) => m.user_id !== user.id).map((m) => m.user_id);
    setCreatingPlan(true);
    try {
      const planId = await apiCreatePlan({
        title: `План: ${group!.name}`,
        activity_type: 'other',
        participant_ids: memberIds,
      });
      if (planId) navigation.replace('PlanDetails', { planId });
    } catch {} finally {
      setCreatingPlan(false);
    }
  };

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <ScrollView style={s.inner} contentContainerStyle={s.content}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()} activeScale={0.92}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>

          <FadeIn delay={40} direction="down">
            <View style={s.heroWrap}>
              <View style={s.headerGlow} />
              <View style={s.headerCircle}>
                <Text style={s.headerLetter}>{group.name[0]}</Text>
              </View>
              <Text style={s.eyebrow}>Группа</Text>
              <Text style={s.groupName}>{group.name}</Text>
              <Text style={s.groupMeta}>{group.members?.length ?? 0} человек</Text>
            </View>
          </FadeIn>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Участники</Text>
            <Stagger baseDelay={120} step={35}>
              {(group.members ?? []).map((m) => (
                <Tilt key={m.id} maxTilt={3} liftOnHover={2}>
                  <View style={s.memberRow}>
                    <View style={s.avatar}><Text style={s.avatarLetter}>{m.user?.name?.[0] ?? '?'}</Text></View>
                    <Text style={s.memberName}>{m.user?.name ?? 'Неизвестный'}</Text>
                  </View>
                </Tilt>
              ))}
            </Stagger>
          </View>

          {activePlans.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Предстоящие планы</Text>
              <Stagger baseDelay={60} step={45}>
                {activePlans.map((p) => (
                  <Tilt key={p.id} maxTilt={4} liftOnHover={3}>
                    <Pressable style={s.planCard} onPress={() => navigation.navigate('PlanDetails', { planId: p.id })} activeScale={0.97}>
                      <Text style={s.planTitle}>{p.title}</Text>
                      <Text style={s.planMeta}>{ACTIVITY_LABELS[p.activity_type]} · {p.participants?.length ?? 0} чел.</Text>
                    </Pressable>
                  </Tilt>
                ))}
              </Stagger>
            </View>
          ) : null}

          {pastPlans.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Прошедшие планы</Text>
              <Stagger baseDelay={60} step={45}>
                {pastPlans.map((p) => (
                  <Tilt key={p.id} maxTilt={4} liftOnHover={3}>
                    <Pressable style={[s.planCard, s.planCardPast]} onPress={() => navigation.navigate('PlanDetails', { planId: p.id })} activeScale={0.97}>
                      <Text style={s.planTitle}>{p.title}</Text>
                      <Text style={s.planMeta}>{ACTIVITY_LABELS[p.activity_type]}</Text>
                    </Pressable>
                  </Tilt>
                ))}
              </Stagger>
            </View>
          ) : null}

          <Pressable
            style={[s.createBtn, creatingPlan && s.btnDisabled]}
            onPress={handleCreatePlanWithGroup}
            disabled={creatingPlan}
            activeScale={0.96}
          >
            <Text style={s.createBtnText}>{creatingPlan ? 'Создание...' : 'Создать план с группой'}</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  content: { paddingBottom: theme.spacing.xxxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  heroWrap: { alignItems: 'center', paddingVertical: theme.spacing.md },
  headerGlow: { position: 'absolute', top: 4, width: 140, height: 140, borderRadius: 70, backgroundColor: theme.colors.primary + '1A', ...Platform.select({ web: { filter: 'blur(24px)' } as any }) },
  headerCircle: { width: Platform.select({ web: 76, default: 96 }), height: Platform.select({ web: 76, default: 96 }), borderRadius: Platform.select({ web: 38, default: 48 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.primary + '55', marginBottom: theme.spacing.md },
  headerLetter: { fontFamily: theme.fonts.display, fontSize: Platform.select({ web: 30, default: 38 }), color: theme.colors.primaryDark },
  eyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 4 },
  groupName: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 30 : 26, lineHeight: Platform.OS === 'web' ? 34 : 30, color: theme.colors.primaryDark, letterSpacing: -0.8, textAlign: 'center', paddingHorizontal: theme.spacing.lg },
  groupMeta: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg },
  sectionTitle: { fontFamily: theme.fonts.displayMedium, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.12)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md, borderWidth: 1.5, borderColor: theme.colors.primary + '33' },
  avatarLetter: { fontFamily: theme.fonts.display, fontSize: 16, color: theme.colors.primaryDark },
  memberName: { ...theme.typography.body, color: theme.colors.textPrimary, fontWeight: '600' },
  planCard: { backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.14)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  planCardPast: { opacity: 0.75 },
  planTitle: { fontFamily: theme.fonts.displayMedium, fontSize: 16, color: theme.colors.textPrimary, marginBottom: 4 },
  planMeta: { ...theme.typography.caption, color: theme.colors.textSecondary },
  createBtn: { marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingVertical: theme.spacing.md, alignItems: 'center', ...theme.shadows.md },
  btnDisabled: { opacity: 0.5 },
  createBtnText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  errorBanner: { ...theme.typography.caption, color: theme.colors.error, textAlign: 'center', padding: theme.spacing.sm, backgroundColor: theme.colors.error + '11', marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
});
