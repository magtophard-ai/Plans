import React from 'react';
import { View, FlatList, TouchableOpacity, Text, Image, StyleSheet, Platform } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useEventsStore } from '../stores/eventsStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { formatDateShort } from '../utils/dates';
import { CATEGORY_CHIPS } from '../utils/constants';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { HomeStackParamList, RootStackParamList } from '../navigation/types';
import type { Event, EventCategory } from '../types';

type NavType = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const HomeScreen = () => {
  const { events, interestedIds, savedIds, categoryFilter, toggleInterest, toggleSave, setCategoryFilter, fetchEvents } = useEventsStore();
  const navigation = useNavigation<NavType>();
  const unread = useNotificationsStore((s) => s.unreadCount);

  React.useEffect(() => { fetchEvents(); }, []);

  const filtered = categoryFilter ? events.filter((e) => e.category === categoryFilter) : events;

  const formatSocialProof = (event: Event) => {
    if (!event.friendsInterested?.length && !(event.friendsPlanCount ?? 0)) return null;
    if ((event.friendsPlanCount ?? 0) > 0) return `У ${event.friendsInterested?.[0]?.name ?? 'друга'} уже есть план`;
    const names = event.friendsInterested!.map((f) => f.name);
    if (names.length === 1) return `${names[0]} интересуется`;
    return `${names[0]} и ещё ${names.length - 1} интересуются`;
  };

  const renderItem = ({ item }: { item: Event }) => {
    const isInterested = interestedIds.has(item.id);
    const isSaved = savedIds.has(item.id);
    const proof = formatSocialProof(item);

    return (
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('EventDetails', { eventId: item.id })} activeOpacity={0.7}>
        <Image source={{ uri: item.cover_image_url }} style={s.cover} />
        <View style={s.cardBody}>
          <Text style={s.cardDate}>{formatDateShort(item.starts_at)}</Text>
          <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={s.cardVenue}>{item.venue?.name}</Text>
          {proof && <Text style={s.socialProof}>{proof}</Text>}
          <View style={s.actions}>
            <TouchableOpacity style={[s.interestBtn, isInterested && s.interestActive]} onPress={() => toggleInterest(item.id)}>
              <Text style={[s.interestText, isInterested && s.interestTextActive]}>интересно</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleSave(item.id)}>
              <Text style={s.saveIcon}>{isSaved ? '★' : '☆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.planBtn} onPress={() => navigation.navigate('CreatePlanFromEvent', { eventId: item.id })}>
              <Text style={s.planBtnText}>Планы?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      <View style={s.inner}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Планы?</Text>
          <TouchableOpacity style={s.bell} onPress={() => navigation.navigate('Notifications')}>
            <Text style={s.bellIcon}>🔔</Text>
            {unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{unread}</Text></View>}
          </TouchableOpacity>
        </View>
        <View style={s.chipsRow}>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={CATEGORY_CHIPS} keyExtractor={(c) => String(c.key ?? 'all')} renderItem={({ item: chip }) => (
            <TouchableOpacity style={[s.chip, categoryFilter === chip.key && s.chipActive]} onPress={() => setCategoryFilter(chip.key)}>
              <Text style={[s.chipText, categoryFilter === chip.key && s.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          )} />
        </View>
        <FlatList data={filtered} keyExtractor={(e) => e.id} renderItem={renderItem} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} ListEmptyComponent={<EmptyState text="Нет мероприятий" />} />
      </View>
    </ScreenContainer>
  );
};

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm },
  headerTitle: { ...theme.typography.h2, color: theme.colors.primary },
  bell: { position: 'relative', padding: theme.spacing.sm },
  bellIcon: { fontSize: 22 },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius.full, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  chipsRow: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  chip: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, marginRight: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.textInverse },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.md, overflow: 'hidden', ...theme.shadows.sm },
  cover: { width: '100%', height: Platform.select({ web: 140, default: 180 }), aspectRatio: Platform.select({ web: 16 / 7, default: undefined }) },
  cardBody: { padding: theme.spacing.lg, ...Platform.select({ web: { padding: theme.spacing.md } }) },
  cardDate: { ...theme.typography.caption, color: theme.colors.primary, marginBottom: theme.spacing.xs },
  cardTitle: { ...theme.typography.h4, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  cardVenue: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  socialProof: { ...theme.typography.caption, color: theme.colors.primaryLight, marginBottom: theme.spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  interestBtn: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  interestActive: { backgroundColor: theme.colors.primaryLight + '22', borderColor: theme.colors.primaryLight },
  interestText: { ...theme.typography.small, color: theme.colors.textSecondary },
  interestTextActive: { color: theme.colors.primary, fontWeight: '600' },
  saveIcon: { fontSize: 20, color: theme.colors.textTertiary, paddingHorizontal: theme.spacing.sm },
  planBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, marginLeft: 'auto' },
  planBtnText: { color: theme.colors.textInverse, fontWeight: '600', fontSize: 14 },
});
