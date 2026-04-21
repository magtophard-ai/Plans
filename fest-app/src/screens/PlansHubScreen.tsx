import React from 'react';
import { View, Text, StyleSheet, FlatList, Platform, ActivityIndicator } from 'react-native';
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
import { Aurora, FadeIn, Pressable, Tilt, Badge, TabIndicator, Tab } from '../motion';

type Props = NativeStackScreenProps<PlansStackParamList, 'PlansList'>;
type HubSection = 'active' | 'invitations' | 'groups' | 'past';

const STATUS_LABELS: Record<string, string> = {
  going: 'Иду',
  thinking: 'Думаю',
  cant: 'Не могу',
  invited: 'Приглашение',
};
const STATUS_COLORS: Record<string, string> = {
  going: theme.colors.going,
  thinking: theme.colors.thinking,
  cant: theme.colors.cant,
  invited: theme.colors.invited,
};

export const PlansHubScreen = ({ navigation }: Props) => {
  const [section, setSection] = React.useState<HubSection>('active');
  const plans = usePlansStore((s) => s.plans);
  const plansLoading = usePlansStore((s) => s.loading);
  const plansError = usePlansStore((s) => s.error);
  const userId = useAuthStore((s) => s.user?.id) ?? '';
  const groups = useGroupsStore((s) => s.groups);
  const groupsLoading = useGroupsStore((s) => s.loading);
  const groupsError = useGroupsStore((s) => s.error);
  const fetchGroups = useGroupsStore((s) => s.fetchGroups);
  const {
    invitations,
    loading: invLoading,
    error: invError,
    accept,
    decline,
    fetchInvitations,
  } = useInvitationsStore();
  const fetchMyPlans = usePlansStore((s) => s.fetchMyPlans);
  const [accepting, setAccepting] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchMyPlans();
    fetchInvitations();
    fetchGroups();
  }, [fetchMyPlans, fetchInvitations, fetchGroups]);

  const handleAccept = async (id: string) => {
    if (accepting) return;
    setAccepting(id);
    await accept(id);
    setAccepting(null);
  };

  const handleDecline = async (id: string) => {
    if (declining) return;
    setDeclining(id);
    await decline(id);
    setDeclining(null);
  };

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const activePlans = plans.filter(
    (p) => p.lifecycle_state === 'active' || p.lifecycle_state === 'finalized',
  );
  const pastPlans = plans.filter((p) => p.lifecycle_state === 'completed');

  const sections: { key: HubSection; label: string; count: number }[] = [
    { key: 'active', label: 'Активные', count: activePlans.length },
    { key: 'invitations', label: 'Приглашения', count: pendingInvitations.length },
    { key: 'groups', label: 'Группы', count: groups.length },
    { key: 'past', label: 'Прошедшие', count: pastPlans.length },
  ];

  const activeIndex = sections.findIndex((x) => x.key === section);
  const [tabBarWidth, setTabBarWidth] = React.useState(0);

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <FadeIn delay={60} direction="down" distance={10}>
            <View style={s.headerBlock}>
              <Text style={s.eyebrow}>FEST · Твои</Text>
              <Text style={s.headerTitle}>Планы</Text>
              <Text style={s.headerSub}>
                {activePlans.length} активных · {pendingInvitations.length} приглашений
              </Text>
            </View>
          </FadeIn>

          <FadeIn delay={140} direction="up" distance={8}>
            <View
              style={s.tabsContainer}
              onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width - 8)}
            >
              <View style={s.tabsInner}>
                <TabIndicator
                  count={sections.length}
                  activeIndex={activeIndex}
                  containerWidth={tabBarWidth}
                  color={theme.colors.primary}
                  height={undefined}
                  style={s.indicator}
                />
                {sections.map((sec) => {
                  const isActive = section === sec.key;
                  return (
                    <Pressable
                      key={sec.key}
                      style={s.tab}
                      onPress={() => setSection(sec.key)}
                      activeScale={0.97}
                    >
                      <Tab active={isActive}>
                        <View style={s.tabContent}>
                          <Text style={[s.tabText, isActive && s.tabTextActive]}>
                            {sec.label}
                          </Text>
                          {sec.count > 0 ? (
                            <View style={[s.tabBadge, isActive && s.tabBadgeActive]}>
                              <Text
                                style={[
                                  s.tabBadgeText,
                                  isActive && s.tabBadgeTextActive,
                                ]}
                              >
                                {sec.count}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Tab>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </FadeIn>

          {section === 'active' && plansError ? (
            <Text style={s.errorBanner}>{plansError}</Text>
          ) : null}
          {section === 'invitations' && invError ? (
            <Text style={s.errorBanner}>{invError}</Text>
          ) : null}
          {section === 'groups' && groupsError ? (
            <Text style={s.errorBanner}>{groupsError}</Text>
          ) : null}

          {(section === 'active' && plansLoading && activePlans.length === 0) ||
          (section === 'invitations' && invLoading && pendingInvitations.length === 0) ||
          (section === 'groups' && groupsLoading && groups.length === 0) ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <>
              {section === 'active' && (
                <FlatList
                  data={activePlans}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item, index }) => (
                    <PlanCard
                      index={index}
                      plan={item}
                      userId={userId}
                      onPress={() => navigation.navigate('PlanDetails', { planId: item.id })}
                    />
                  )}
                  contentContainerStyle={s.list}
                  ListEmptyComponent={<EmptyState text="Нет активных планов" />}
                />
              )}
              {section === 'invitations' && (
                <FlatList
                  data={pendingInvitations}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item, index }) => (
                    <InvitationCard
                      index={index}
                      invitation={item}
                      onAccept={() => handleAccept(item.id)}
                      onDecline={() => handleDecline(item.id)}
                      accepting={accepting === item.id}
                      declining={declining === item.id}
                      onOpen={() => {
                        if (item.type === 'plan' && item.plan)
                          navigation.navigate('PlanDetails', { planId: item.target_id });
                        if (item.type === 'group')
                          navigation.navigate('GroupDetails', { groupId: item.target_id });
                      }}
                    />
                  )}
                  contentContainerStyle={s.list}
                  ListEmptyComponent={<EmptyState text="Нет приглашений" />}
                />
              )}
              {section === 'groups' && (
                <FlatList
                  data={groups}
                  keyExtractor={(g) => g.id}
                  renderItem={({ item, index }) => (
                    <GroupCard
                      index={index}
                      group={item}
                      onPress={() => navigation.navigate('GroupDetails', { groupId: item.id })}
                    />
                  )}
                  contentContainerStyle={s.list}
                  ListEmptyComponent={<EmptyState text="Нет групп" />}
                />
              )}
              {section === 'past' && (
                <FlatList
                  data={pastPlans}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item, index }) => (
                    <PlanCard
                      index={index}
                      plan={item}
                      userId={userId}
                      onPress={() => navigation.navigate('PlanDetails', { planId: item.id })}
                    />
                  )}
                  contentContainerStyle={s.list}
                  ListEmptyComponent={<EmptyState text="Нет прошедших планов" />}
                />
              )}
            </>
          )}
        </View>
      </ScreenContainer>
    </View>
  );
};

const PlanCard = ({
  plan,
  userId,
  onPress,
  index,
}: {
  plan: Plan;
  userId: string;
  onPress: () => void;
  index: number;
}) => {
  const statusLabel =
    plan.lifecycle_state === 'finalized'
      ? '✓ Подтверждён'
      : plan.lifecycle_state === 'completed'
      ? 'Завершён'
      : 'Активный';
  const myStatus = plan.participants?.find((p) => p.user_id === userId)?.status ?? 'invited';
  const color = STATUS_COLORS[myStatus];
  const label = STATUS_LABELS[myStatus];

  return (
    <FadeIn delay={index * 55} direction="up" distance={14}>
      <Tilt style={s.card}>
        <Pressable style={s.cardInner} onPress={onPress} activeScale={0.98}>
          <View style={s.cardRow}>
            <View style={s.cardTitleCol}>
              <Text style={s.cardTitle} numberOfLines={1}>
                {plan.title}
              </Text>
              <Text style={s.cardMeta}>
                {statusLabel} · {plan.participants?.length ?? 0} чел.
              </Text>
              {plan.confirmed_time ? (
                <Text style={s.cardMeta}>{formatDateShort(plan.confirmed_time)}</Text>
              ) : null}
            </View>
            <Badge label={label} color={color} pulse={myStatus === 'going'} />
          </View>
        </Pressable>
      </Tilt>
    </FadeIn>
  );
};

const InvitationCard = ({
  invitation,
  onAccept,
  onDecline,
  accepting,
  declining,
  onOpen,
  index,
}: {
  invitation: Invitation;
  onAccept: () => void;
  onDecline: () => void;
  accepting: boolean;
  declining: boolean;
  onOpen: () => void;
  index: number;
}) => (
  <FadeIn delay={index * 55} direction="up" distance={14}>
    <Tilt style={s.card}>
      <Pressable style={s.cardInner} onPress={onOpen} activeScale={0.98}>
        <Text style={s.cardTitle}>
          {invitation.type === 'plan'
            ? invitation.plan?.title ?? 'Приглашение в план'
            : 'Приглашение в группу'}
        </Text>
        <Text style={s.cardMeta}>
          {invitation.type === 'plan' ? 'Приглашение в план' : 'Приглашение в группу'}
        </Text>
        <View style={s.inviteActions}>
          <Pressable
            style={[s.acceptBtn, accepting && s.btnDisabled]}
            onPress={onAccept}
            disabled={accepting}
            activeScale={0.95}
          >
            <Text style={s.acceptBtnText}>{accepting ? '...' : 'Принять'}</Text>
          </Pressable>
          <Pressable
            style={[s.declineBtn, declining && s.btnDisabled]}
            onPress={onDecline}
            disabled={declining}
            activeScale={0.95}
          >
            <Text style={s.declineBtnText}>{declining ? '...' : 'Отклонить'}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Tilt>
  </FadeIn>
);

const GroupCard = ({
  group,
  onPress,
  index,
}: {
  group: Group;
  onPress: () => void;
  index: number;
}) => (
  <FadeIn delay={index * 55} direction="up" distance={14}>
    <Tilt style={s.card}>
      <Pressable style={s.cardInner} onPress={onPress} activeScale={0.98}>
        <Text style={s.cardTitle}>{group.name}</Text>
        <Text style={s.cardMeta}>{group.members?.length ?? 0} чел.</Text>
      </Pressable>
    </Tilt>
  </FadeIn>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  headerBlock: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.select({ web: theme.spacing.xl, default: theme.spacing.xxl }),
    paddingBottom: theme.spacing.md,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
    color: theme.colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: Platform.OS === 'web' ? 52 : 44,
    lineHeight: Platform.OS === 'web' ? 56 : 48,
    fontWeight: '900',
    color: theme.colors.primaryDark,
    letterSpacing: -2,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  tabsContainer: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: theme.borderRadius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.15)',
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)' } as any,
    }),
  },
  tabsInner: {
    flexDirection: 'row',
    position: 'relative',
  },
  indicator: {
    top: 0,
    bottom: 0,
    height: '100%',
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  tabTextActive: { color: theme.colors.textInverse, fontWeight: '800' },
  tabBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
  tabBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
  tabBadgeTextActive: { color: theme.colors.textInverse },
  errorBanner: {
    ...theme.typography.caption,
    color: theme.colors.error,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.08)',
    ...Platform.select({
      web: {
        boxShadow: '0 14px 34px -18px rgba(108,92,231,0.25)',
      } as any,
      default: theme.shadows.md,
    }),
  },
  cardInner: { padding: theme.spacing.lg },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  cardTitleCol: { flex: 1 },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.3,
  },
  cardMeta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  acceptBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  acceptBtnText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 14 },
  declineBtn: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  declineBtnText: { color: theme.colors.textSecondary, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
