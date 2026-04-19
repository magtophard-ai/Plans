import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { usePlansStore } from '../stores/plansStore';
import { useAuthStore } from '../stores/authStore';
import { useGroupsStore } from '../stores/groupsStore';
import { useInvitationsStore } from '../stores/invitationsStore';
import { formatDateShort } from '../utils/dates';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { PlansStackParamList } from '../navigation/types';
import type { Plan, Group, Invitation } from '../types';

type Props = NativeStackScreenProps<PlansStackParamList, 'PlansList'>;
type HubSection = 'active' | 'invitations' | 'groups' | 'past';

const STATUS_LABELS: Record<string, string> = { going: 'Иду', thinking: 'Думаю', cant: 'Не могу', invited: 'Приглашение' };
const STATUS_COLORS: Record<string, string> = { going: theme.colors.going, thinking: theme.colors.thinking, cant: theme.colors.cant, invited: theme.colors.invited };

export const PlansHubScreen = ({ navigation }: Props) => {
  const [section, setSection] = React.useState<HubSection>('active');
  const plans = usePlansStore((s) => s.plans);
  const userId = useAuthStore((s) => s.user?.id) ?? '';
  const groups = useGroupsStore((s) => s.groups);
  const { invitations, accept, decline, fetchInvitations } = useInvitationsStore();
  const fetchMyPlans = usePlansStore((s) => s.fetchMyPlans);

  React.useEffect(() => { fetchMyPlans(); fetchInvitations(); }, []);

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const activePlans = plans.filter((p) => p.lifecycle_state === 'active' || p.lifecycle_state === 'finalized');
  const pastPlans = plans.filter((p) => p.lifecycle_state === 'completed');

  const sections: { key: HubSection; label: string; count: number }[] = [
    { key: 'active', label: 'Активные', count: activePlans.length },
    { key: 'invitations', label: 'Приглашения', count: pendingInvitations.length },
    { key: 'groups', label: 'Группы', count: groups.length },
    { key: 'past', label: 'Прошедшие', count: pastPlans.length },
  ];

  return (
    <ScreenContainer>
      <View style={s.inner}>
        <Text style={s.header}>Мои планы</Text>
        <View style={s.tabs}>
          {sections.map((sec) => (
            <TouchableOpacity key={sec.key} style={[s.tab, section === sec.key && s.tabActive]} onPress={() => setSection(sec.key)}>
              <Text style={[s.tabText, section === sec.key && s.tabTextActive]}>{sec.label}</Text>
              {sec.count > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{sec.count}</Text></View>}
            </TouchableOpacity>
          ))}
        </View>

        {section === 'active' && (
          <FlatList data={activePlans} keyExtractor={(p) => p.id} renderItem={({ item }) => (
            <PlanCard plan={item} userId={userId} onPress={() => navigation.navigate('PlanDetails', { planId: item.id })} />
          )} contentContainerStyle={s.list} ListEmptyComponent={<EmptyState text="Нет активных планов" />} />
        )}
        {section === 'invitations' && (
          <FlatList data={pendingInvitations} keyExtractor={(i) => i.id} renderItem={({ item }) => (
            <InvitationCard invitation={item} onAccept={() => accept(item.id)} onDecline={() => decline(item.id)} onOpen={() => {
              if (item.type === 'plan' && item.plan) navigation.navigate('PlanDetails', { planId: item.target_id });
              if (item.type === 'group') navigation.navigate('GroupDetails', { groupId: item.target_id });
            }} />
          )} contentContainerStyle={s.list} ListEmptyComponent={<EmptyState text="Нет приглашений" />} />
        )}
        {section === 'groups' && (
          <FlatList data={groups} keyExtractor={(g) => g.id} renderItem={({ item }) => (
            <GroupCard group={item} onPress={() => navigation.navigate('GroupDetails', { groupId: item.id })} />
          )} contentContainerStyle={s.list} ListEmptyComponent={<EmptyState text="Нет групп" />} />
        )}
        {section === 'past' && (
          <FlatList data={pastPlans} keyExtractor={(p) => p.id} renderItem={({ item }) => (
            <PlanCard plan={item} userId={userId} onPress={() => navigation.navigate('PlanDetails', { planId: item.id })} />
          )} contentContainerStyle={s.list} ListEmptyComponent={<EmptyState text="Нет прошедших планов" />} />
        )}
      </View>
    </ScreenContainer>
  );
};

const PlanCard = ({ plan, userId, onPress }: { plan: Plan; userId: string; onPress: () => void }) => {
  const statusLabel = plan.lifecycle_state === 'finalized' ? '✓ Подтверждён' : plan.lifecycle_state === 'completed' ? 'Завершён' : 'Активный';
  const myStatus = plan.participants?.find((p) => p.user_id === userId)?.status ?? 'invited';
  const color = STATUS_COLORS[myStatus];
  const label = STATUS_LABELS[myStatus];

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardRow}>
        <Text style={s.cardTitle}>{plan.title}</Text>
        <Text style={[s.statusBadge, { backgroundColor: color + '22', color }]}>{label}</Text>
      </View>
      <Text style={s.cardMeta}>{statusLabel} · {plan.participants?.length ?? 0} чел.</Text>
      {plan.confirmed_time && <Text style={s.cardMeta}>{formatDateShort(plan.confirmed_time)}</Text>}
    </TouchableOpacity>
  );
};

const InvitationCard = ({ invitation, onAccept, onDecline, onOpen }: { invitation: Invitation; onAccept: () => void; onDecline: () => void; onOpen: () => void }) => (
  <TouchableOpacity style={s.card} onPress={onOpen} activeOpacity={0.7}>
    <Text style={s.cardTitle}>{invitation.type === 'plan' ? (invitation.plan?.title ?? 'Приглашение в план') : 'Приглашение в группу'}</Text>
    <Text style={s.cardMeta}>{invitation.type === 'plan' ? 'Приглашение в план' : 'Приглашение в группу'}</Text>
    <View style={s.inviteActions}>
      <TouchableOpacity style={s.acceptBtn} onPress={onAccept}><Text style={s.acceptBtnText}>Принять</Text></TouchableOpacity>
      <TouchableOpacity style={s.declineBtn} onPress={onDecline}><Text style={s.declineBtnText}>Отклонить</Text></TouchableOpacity>
    </View>
  </TouchableOpacity>
);

const GroupCard = ({ group, onPress }: { group: Group; onPress: () => void }) => (
  <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
    <Text style={s.cardTitle}>{group.name}</Text>
    <Text style={s.cardMeta}>{group.members?.length ?? 0} чел.</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...theme.typography.h2, color: theme.colors.textPrimary, paddingHorizontal: theme.spacing.lg, paddingTop: Platform.select({ web: theme.spacing.lg, default: theme.spacing.xl }), paddingBottom: theme.spacing.sm },
  tabs: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, gap: theme.spacing.sm },
  tab: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.textInverse, fontWeight: '600' },
  tabBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius.full, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), marginBottom: theme.spacing.sm, ...theme.shadows.sm },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xs },
  cardTitle: { ...theme.typography.h4, color: theme.colors.textPrimary, flex: 1 },
  cardMeta: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 2 },
  statusBadge: { ...theme.typography.small, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full, overflow: 'hidden', fontWeight: '600' },
  inviteActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  acceptBtn: { backgroundColor: theme.colors.going, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  acceptBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  declineBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  declineBtnText: { color: theme.colors.error, fontWeight: '600', fontSize: 14 },
});
