import React from 'react';
import { View, Text, StyleSheet, Platform, FlatList, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useNotificationsStore } from '../stores/notificationsStore';
import { formatTimeAgo } from '../utils/dates';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootStackParamList } from '../navigation/types';
import type { NotificationType } from '../types';
import { Aurora, FadeIn, Pressable, Tilt } from '../motion';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_LABELS: Record<NotificationType, string> = {
  plan_invite: 'Приглашение в план',
  group_invite: 'Приглашение в группу',
  proposal_created: 'Новое предложение',
  plan_finalized: 'План подтверждён',
  plan_unfinalized: 'Подтверждение отменено',
  event_time_changed: 'Время изменилось',
  event_cancelled: 'Мероприятие отменено',
  plan_reminder: 'Напоминание',
  plan_completed: 'План завершён',
};

const TYPE_ICONS: Record<NotificationType, string> = {
  plan_invite: '✉️',
  group_invite: '👥',
  proposal_created: '💡',
  plan_finalized: '✨',
  plan_unfinalized: '↩',
  event_time_changed: '🕐',
  event_cancelled: '✕',
  plan_reminder: '⏰',
  plan_completed: '🎉',
};

const TYPE_ACCENT: Record<NotificationType, string> = {
  plan_invite: theme.colors.primary,
  group_invite: theme.colors.accent,
  proposal_created: theme.colors.info,
  plan_finalized: theme.colors.success,
  plan_unfinalized: theme.colors.thinking,
  event_time_changed: theme.colors.warning,
  event_cancelled: theme.colors.error,
  plan_reminder: theme.colors.primaryLight,
  plan_completed: theme.colors.success,
};

const PLAN_TYPES: NotificationType[] = ['plan_invite', 'proposal_created', 'plan_finalized', 'plan_unfinalized', 'plan_reminder', 'plan_completed'];
const GROUP_TYPES: NotificationType[] = ['group_invite'];
const EVENT_TYPES: NotificationType[] = ['event_time_changed', 'event_cancelled'];

export const NotificationsScreen = ({ navigation }: Props) => {
  const { notifications, markRead, markAllRead, unreadCount, loading, error, fetchNotifications } = useNotificationsStore();

  React.useEffect(() => { fetchNotifications(); }, []);

  const handleTap = (item: typeof notifications[0]) => {
    markRead(item.id);
    const payload = item.payload;
    if (PLAN_TYPES.includes(item.type) && payload.plan_id) {
      (navigation as any).navigate('PlansTab', {
        screen: 'PlanDetails',
        params: { planId: payload.plan_id as string },
      });
    } else if (GROUP_TYPES.includes(item.type) && payload.group_id) {
      (navigation as any).navigate('PlansTab', {
        screen: 'GroupDetails',
        params: { groupId: payload.group_id as string },
      });
    } else if (EVENT_TYPES.includes(item.type) && payload.event_id) {
      (navigation as any).navigate('HomeTab', {
        screen: 'EventDetails',
        params: { eventId: payload.event_id as string },
      });
    }
  };

  const renderItem = ({ item, index }: { item: typeof notifications[0]; index: number }) => {
    const payload = item.payload as Record<string, string>;
    const accent = TYPE_ACCENT[item.type];
    return (
      <FadeIn delay={index * 55} direction="up" distance={14}>
        <Tilt style={[s.card, !item.read && s.cardUnread]} maxTilt={3} liftOnHover={2}>
          <Pressable
            style={s.cardInner}
            onPress={() => handleTap(item)}
            activeScale={0.98}
          >
            <View style={[s.iconWrap, { backgroundColor: accent + '1A', borderColor: accent + '55' }]}>
              <Text style={s.icon}>{TYPE_ICONS[item.type]}</Text>
            </View>
            <View style={s.cardTextCol}>
              <View style={s.cardHeader}>
                <Text style={s.typeLabel} numberOfLines={1}>{TYPE_LABELS[item.type]}</Text>
                {!item.read ? <View style={s.unreadDot} /> : null}
              </View>
              {payload.inviter_name ? <Text style={s.payloadText}>от {payload.inviter_name}</Text> : null}
              {payload.proposer_name ? <Text style={s.payloadText}>от {payload.proposer_name}</Text> : null}
              {payload.plan_title ? <Text style={s.payloadTitle} numberOfLines={1}>{payload.plan_title}</Text> : null}
              <Text style={s.time}>{formatTimeAgo(item.created_at)}</Text>
            </View>
          </Pressable>
        </Tilt>
      </FadeIn>
    );
  };

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <FadeIn delay={60} direction="down" distance={12}>
            <View style={s.topRow}>
              <Pressable onPress={() => navigation.goBack()} activeScale={0.92} hitSlop={12}>
                <Text style={s.backText}>← Назад</Text>
              </Pressable>
              {unreadCount > 0 ? (
                <Pressable onPress={markAllRead} activeScale={0.94} hitSlop={8}>
                  <Text style={s.markAll}>Прочитать все</Text>
                </Pressable>
              ) : <View style={s.markAllPlaceholder} />}
            </View>
          </FadeIn>

          <FadeIn delay={110} direction="down" distance={14}>
            <View style={s.heroBlock}>
              <Text style={s.eyebrow}>FEST · Входящие</Text>
              <Text style={s.headerTitle}>Уведомления</Text>
              <Text style={s.headerSub}>
                {unreadCount > 0 ? `${unreadCount} новых` : 'Всё прочитано'}
              </Text>
            </View>
          </FadeIn>

          {error ? <Text style={s.errorBanner}>{error}</Text> : null}

          {loading && notifications.length === 0 ? (
            <View style={s.loader}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(n) => n.id}
              renderItem={renderItem}
              contentContainerStyle={s.list}
              refreshing={loading && notifications.length > 0}
              onRefresh={fetchNotifications}
              ListEmptyComponent={<EmptyState text="Нет уведомлений" />}
            />
          )}
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.select({ web: theme.spacing.lg, default: theme.spacing.xl }),
    paddingBottom: theme.spacing.xs,
  },
  heroBlock: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  eyebrow: {
    fontFamily: theme.fonts.displayMedium,
    fontSize: 11,
    letterSpacing: 4,
    color: theme.colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: theme.fonts.display,
    fontSize: Platform.OS === 'web' ? 40 : 32,
    lineHeight: Platform.OS === 'web' ? 44 : 36,
    color: theme.colors.primaryDark,
    letterSpacing: -1.5,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  markAll: { ...theme.typography.caption, color: theme.colors.primary, fontWeight: '700' },
  markAllPlaceholder: { width: 80 },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, gap: 10 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.08)',
    ...Platform.select({
      web: { boxShadow: '0 10px 24px -16px rgba(108,92,231,0.22)' } as any,
      default: theme.shadows.sm,
    }),
  },
  cardUnread: {
    borderColor: theme.colors.primary + '44',
    backgroundColor: theme.colors.primary + '06',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }),
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  cardTextCol: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  typeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    flex: 1,
    letterSpacing: -0.2,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 3,
  },
  payloadText: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 },
  payloadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 4,
  },
  time: { ...theme.typography.small, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    ...theme.typography.caption,
    color: theme.colors.error,
    textAlign: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.error + '11',
  },
});
