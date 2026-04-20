import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Image, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { formatDateShort } from '../utils/dates';
import { CATEGORY_CHIPS } from '../utils/constants';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import { searchEvents } from '../api/search';
import type { Event, EventCategory } from '../types';

type DateFilter = null | 'today' | 'week' | 'weekend';

const DATE_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: null, label: 'Любая дата' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Эта неделя' },
  { key: 'weekend', label: 'Выходные' },
];

export const SearchScreen = () => {
  const navigation = useNavigation();
  const [results, setResults] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<EventCategory | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof searchEvents>[0] = {};
      if (query.trim()) params.q = query.trim();
      if (catFilter) params.category = catFilter;
      if (dateFilter) {
        const now = new Date();
        if (dateFilter === 'today') {
          const end = new Date(now);
          end.setHours(23, 59, 59, 999);
          params.date_from = now.toISOString();
          params.date_to = end.toISOString();
        } else if (dateFilter === 'week') {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay() + 1);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7);
          params.date_from = weekStart.toISOString();
          params.date_to = weekEnd.toISOString();
        } else if (dateFilter === 'weekend') {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay() + 1);
          weekStart.setHours(0, 0, 0, 0);
          const sat = new Date(weekStart);
          sat.setDate(weekStart.getDate() + 5);
          const sun = new Date(sat);
          sun.setDate(sat.getDate() + 1);
          sun.setHours(23, 59, 59, 999);
          params.date_from = sat.toISOString();
          params.date_to = sun.toISOString();
        }
      }
      const res = await searchEvents({ ...params, limit: 50 });
      setResults(res.events);
      setTotal(res.total);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [query, catFilter, dateFilter]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim() || catFilter || dateFilter) {
        doSearch();
      } else if (searched) {
        setResults([]);
        setTotal(0);
        setSearched(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, catFilter, dateFilter]);

  const goToEvent = (eventId: string) => {
    (navigation as any).navigate('HomeTab', {
      screen: 'EventDetails',
      params: { eventId },
    });
  };

  const renderItem = ({ item }: { item: Event }) => (
    <TouchableOpacity style={s.resultCard} onPress={() => goToEvent(item.id)} activeOpacity={0.7}>
      <Image source={{ uri: item.cover_image_url }} style={s.resultImage} />
      <View style={s.resultBody}>
        <Text style={s.resultTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.resultVenue} numberOfLines={1}>{item.venue?.name}</Text>
        <Text style={s.resultMeta}>{formatDateShort(item.starts_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer>
      <View style={s.inner}>
        <View style={s.searchRow}>
          <TextInput style={s.searchInput} placeholder="Поиск мероприятий, мест..." placeholderTextColor={theme.colors.textTertiary} value={query} onChangeText={setQuery} onSubmitEditing={doSearch} returnKeyType="search" />
        </View>
        <View style={s.chipsRow}>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={CATEGORY_CHIPS} keyExtractor={(c) => String(c.key ?? 'all')} renderItem={({ item: chip }) => (
            <TouchableOpacity style={[s.chip, catFilter === chip.key && s.chipActive]} onPress={() => setCatFilter(chip.key)}>
              <Text style={[s.chipText, catFilter === chip.key && s.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          )} />
        </View>
        <View style={s.chipsRow}>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={DATE_OPTIONS} keyExtractor={(d) => String(d.key ?? 'any')} renderItem={({ item }) => (
            <TouchableOpacity style={[s.chip, dateFilter === item.key && s.chipActive]} onPress={() => setDateFilter(item.key)}>
              <Text style={[s.chipText, dateFilter === item.key && s.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          )} />
        </View>
        {searched && (
          <Text style={s.resultCount}>{total} мероприяти{total === 1 ? 'е' : total < 5 ? 'я' : 'й'}</Text>
        )}
        <FlatList data={results} keyExtractor={(e) => e.id} renderItem={renderItem} contentContainerStyle={s.list} ListEmptyComponent={searched && !loading ? <EmptyState text="Ничего не найдено" /> : null} showsVerticalScrollIndicator={false} refreshing={loading} onRefresh={doSearch} />
      </View>
    </ScreenContainer>
  );
};

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  searchRow: { margin: theme.spacing.lg },
  searchInput: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), fontSize: 16, color: theme.colors.textPrimary, borderWidth: 1, borderColor: theme.colors.borderLight, ...theme.shadows.sm },
  chipsRow: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.xs },
  chip: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, marginRight: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.textInverse },
  resultCount: { ...theme.typography.caption, color: theme.colors.textTertiary, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  resultCard: { flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm, overflow: 'hidden', ...theme.shadows.sm },
  resultImage: { width: Platform.select({ web: 80, default: 100 }), height: Platform.select({ web: 72, default: 90 }) },
  resultBody: { flex: 1, padding: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), justifyContent: 'center' },
  resultTitle: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  resultVenue: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 2 },
  resultMeta: { ...theme.typography.small, color: theme.colors.textTertiary },
});
