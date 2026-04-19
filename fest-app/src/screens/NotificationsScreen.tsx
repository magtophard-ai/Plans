import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useNotificationsStore } from '../stores/notificationsStore';
import { formatTimeAgo } from '../utils/dates';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootStackParamList } from '../navigation/types';
import type { NotificationType } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_LABELS: Record<NotificationType, string> = {
  plan_invite: 'Приглашение в план',
  group_invite: 'Приглашение в группу',
  proposal_created: 'Новое предложение',
  plan_finalized: 'План подтверждён',
  plan_unfinalized: 'Подтверждение отменено',
  event_time_changed: 'Время мероприятия изменилось',
  event_cancelled: 'Мероприятие отменено',
  plan_reminder: 'Напоминание о плане',
  plan_completed: 'План завершён',
};

const PLAN_TYPES: NotificationType[] = ['plan_invite', 'proposal_created', 'plan_finalized', 'plan_unfinalized', 'plan_reminder', 'plan_completed'];
const GROUP_TYPES: NotificationType[] = ['group_invite'];
const EVENT_TYPES: NotificationType[] = ['event_time_changed', 'event_cancelled'];

export const NotificationsScreen = ({ navigation }: Props) => {
  const { notifications, markRead, markAllRead, unreadCount, fetchNotifications } = useNotificationsStore();

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

  const renderItem = ({ item }: { item: typeof notifications[0] }) => (
    <TouchableOpacity style={[s.card, !item.read && s.cardUnread]} onPress={() => handleTap(item)} activeOpacity={0.7}>
      <View style={s.cardContent}>
        <View style={s.cardTextCol}>
          <Text style={s.typeLabel}>{TYPE_LABELS[item.type]}</Text>
          {(item.payload as Record<string, string>).inviter_name && <Text style={s.payloadText}>от {(item.payload as Record<string, string>).inviter_name}</Text>}
          {(item.payload as Record<string, string>).proposer_name && <Text style={s.payloadText}>от {(item.payload as Record<string, string>).proposer_name}</Text>}
          {(item.payload as Record<string, string>).plan_title && <Text style={s.payloadText}>{(item.payload as Record<string, string>).plan_title}</Text>}
        </View>
        <Text style={s.time}>{formatTimeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
      <View style={s.inner}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.backText}>← Назад</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Уведомления</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={s.markAll}>Прочитать все</Text>
            </TouchableOpacity>
          )}
        </View>
        <FlatList data={notifications} keyExtractor={(n) => n.id} renderItem={renderItem} contentContainerStyle={s.list} ListEmptyComponent={<EmptyState text="Нет уведомлений" />} />
      </View>
    </ScreenContainer>
  );
};

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: Platform.select({ web: theme.spacing.lg, default: theme.spacing.xl }), paddingBottom: theme.spacing.md },
  headerTitle: { ...theme.typography.h4, color: theme.colors.textPrimary },
  backText: { ...theme.typography.body, color: theme.colors.primary },
  markAll: { ...theme.typography.caption, color: theme.colors.primary },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), marginBottom: theme.spacing.sm, ...theme.shadows.sm },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTextCol: { flex: 1 },
  typeLabel: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  payloadText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  time: { ...theme.typography.caption, color: theme.colors.textTertiary, marginLeft: theme.spacing.md },
});
