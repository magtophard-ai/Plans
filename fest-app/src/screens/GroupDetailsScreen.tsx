import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { useGroupsStore } from '../stores/groupsStore';
import { usePlansStore } from '../stores/plansStore';
import { formatDateShort } from '../utils/dates';
import { ACTIVITY_LABELS, type ActivityType } from '../types';
import { ScreenContainer } from '../components/ScreenContainer';
import type { PlansStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<PlansStackParamList, 'GroupDetails'>;

export const GroupDetailsScreen = ({ route, navigation }: Props) => {
  const { groupId } = route.params;
  const groups = useGroupsStore((s) => s.groups);
  const plans = usePlansStore((s) => s.plans);
  const apiCreatePlan = usePlansStore((s) => s.apiCreatePlan);
  const user = useAuthStore((s) => s.user);

  const group = groups.find((g) => g.id === groupId);

  if (!group) return <ScreenContainer><View style={s.inner}><Text style={s.empty}>Группа не найдена</Text></View></ScreenContainer>;

  const groupMemberIds = new Set((group.members ?? []).map((m) => m.user_id));
  const groupPlans = plans.filter((p) =>
    p.participants?.some((pp) => groupMemberIds.has(pp.user_id))
  );
  const activePlans = groupPlans.filter((p) => p.lifecycle_state === 'active' || p.lifecycle_state === 'finalized');
  const pastPlans = groupPlans.filter((p) => p.lifecycle_state === 'completed');

  const handleCreatePlanWithGroup = async () => {
    if (!user) return;
    const memberIds = (group.members ?? []).filter((m) => m.user_id !== user.id).map((m) => m.user_id);
    try {
      const planId = await apiCreatePlan({
        title: `План: ${group.name}`,
        activity_type: 'other',
        participant_ids: memberIds,
      });
      if (planId) navigation.replace('PlanDetails', { planId });
    } catch {}
  };

  return (
    <ScreenContainer>
      <ScrollView style={s.inner} contentContainerStyle={s.content}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Назад</Text>
        </TouchableOpacity>
        <View style={s.headerCircle}>
          <Text style={s.headerLetter}>{group.name[0]}</Text>
        </View>
        <Text style={s.groupName}>{group.name}</Text>
        <Text style={s.groupMeta}>{group.members?.length ?? 0} чел.</Text>

        <Text style={s.sectionTitle}>Участники</Text>
        {group.members?.map((m) => (
          <View key={m.id} style={s.memberRow}>
            <View style={s.avatar}><Text style={s.avatarLetter}>{m.user?.name?.[0] ?? '?'}</Text></View>
            <Text style={s.memberName}>{m.user?.name ?? 'Неизвестный'}</Text>
          </View>
        ))}

        {activePlans.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Предстоящие планы</Text>
            {activePlans.map((p) => (
              <TouchableOpacity key={p.id} style={s.planCard} onPress={() => navigation.navigate('PlanDetails', { planId: p.id })}>
                <Text style={s.planTitle}>{p.title}</Text>
                <Text style={s.planMeta}>{ACTIVITY_LABELS[p.activity_type]} · {p.participants?.length ?? 0} чел.</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {pastPlans.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Прошедшие планы</Text>
            {pastPlans.map((p) => (
              <TouchableOpacity key={p.id} style={s.planCard} onPress={() => navigation.navigate('PlanDetails', { planId: p.id })}>
                <Text style={s.planTitle}>{p.title}</Text>
                <Text style={s.planMeta}>{ACTIVITY_LABELS[p.activity_type]}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity style={s.createBtn} onPress={handleCreatePlanWithGroup}>
          <Text style={s.createBtnText}>Создать план с группой</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
};

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, ...Platform.select({ web: { paddingBottom: theme.spacing.xxl } }) },
  backBtn: { marginBottom: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }) },
  backText: { ...theme.typography.body, color: theme.colors.primary },
  headerCircle: { width: Platform.select({ web: 56, default: 72 }), height: Platform.select({ web: 56, default: 72 }), borderRadius: Platform.select({ web: 28, default: 36 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.md },
  headerLetter: { fontSize: Platform.select({ web: 22, default: 28 }), fontWeight: '700', color: theme.colors.primary },
  groupName: { ...theme.typography.h2, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs, ...Platform.select({ web: { ...theme.typography.h3 } }) },
  groupMeta: { ...theme.typography.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing.lg },
  sectionTitle: { ...theme.typography.h4, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md, ...Platform.select({ web: { marginTop: theme.spacing.sm } }) },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Platform.select({ web: 4, default: theme.spacing.sm }) },
  avatar: { width: Platform.select({ web: 30, default: 36 }), height: Platform.select({ web: 30, default: 36 }), borderRadius: Platform.select({ web: 15, default: 18 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.sm },
  avatarLetter: { fontSize: Platform.select({ web: 13, default: 16 }), fontWeight: '700', color: theme.colors.primary },
  memberName: { ...theme.typography.body, color: theme.colors.textPrimary },
  planCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), marginBottom: theme.spacing.sm, ...theme.shadows.sm },
  planTitle: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  planMeta: { ...theme.typography.caption, color: theme.colors.textTertiary },
  createBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.xl }), alignItems: 'center', marginTop: theme.spacing.xl },
  createBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: Platform.select({ web: 15, default: 16 }) },
  empty: { ...theme.typography.body, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 100 },
});
