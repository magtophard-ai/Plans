import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Image, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { formatDateShort } from '../utils/dates';
import { CATEGORY_CHIPS } from '../utils/constants';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import { searchEvents } from '../api/search';
import { Aurora, FadeIn, Pressable, Tilt } from '../motion';
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
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<EventCategory | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch (e: any) {
      setResults([]);
      setTotal(0);
      setError(e?.message || 'Ошибка поиска');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catFilter, dateFilter]);

  const goToEvent = (eventId: string) => {
    (navigation as any).navigate('HomeTab', {
      screen: 'EventDetails',
      params: { eventId },
    });
  };

  const renderItem = ({ item, index }: { item: Event; index: number }) => (
    <FadeIn delay={40 + index * 35} distance={12}>
      <Tilt maxTilt={4} liftOnHover={3}>
        <Pressable style={s.resultCard} onPress={() => goToEvent(item.id)} activeScale={0.97}>
          <Image source={{ uri: item.cover_image_url }} style={s.resultImage} />
          <View style={s.resultBody}>
            <Text style={s.resultTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.resultVenue} numberOfLines={1}>{item.venue?.name}</Text>
            <Text style={s.resultMeta}>{formatDateShort(item.starts_at)}</Text>
          </View>
        </Pressable>
      </Tilt>
    </FadeIn>
  );

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <FadeIn delay={40} direction="down" distance={10}>
            <View style={s.hero}>
              <Text style={s.eyebrow}>Поиск</Text>
              <Text style={s.heroTitle}>Что будем{'\n'}искать?</Text>
            </View>
          </FadeIn>

          <FadeIn delay={120}>
            <View style={s.searchRow}>
              <Text style={s.searchIcon}>⌕</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Мероприятия, места..."
                placeholderTextColor={theme.colors.textTertiary}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={doSearch}
                returnKeyType="search"
              />
            </View>
          </FadeIn>

          <FadeIn delay={180}>
            <View style={s.chipsRow}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={CATEGORY_CHIPS}
                keyExtractor={(c) => String(c.key ?? 'all')}
                contentContainerStyle={s.chipList}
                renderItem={({ item: chip }) => (
                  <Pressable
                    style={[s.chip, catFilter === chip.key && s.chipActive]}
                    onPress={() => setCatFilter(chip.key)}
                    activeScale={0.92}
                  >
                    <Text style={[s.chipText, catFilter === chip.key && s.chipTextActive]}>{chip.label}</Text>
                  </Pressable>
                )}
              />
            </View>
          </FadeIn>

          <FadeIn delay={220}>
            <View style={s.chipsRow}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={DATE_OPTIONS}
                keyExtractor={(d) => String(d.key ?? 'any')}
                contentContainerStyle={s.chipList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[s.chip, dateFilter === item.key && s.chipActive]}
                    onPress={() => setDateFilter(item.key)}
                    activeScale={0.92}
                  >
                    <Text style={[s.chipText, dateFilter === item.key && s.chipTextActive]}>{item.label}</Text>
                  </Pressable>
                )}
              />
            </View>
          </FadeIn>

          {error ? <Text style={s.errorBanner}>{error}</Text> : null}
          {searched ? (
            <Text style={s.resultCount}>{total} мероприяти{total === 1 ? 'е' : total < 5 ? 'я' : 'й'}</Text>
          ) : null}

          <FlatList
            data={results}
            keyExtractor={(e) => e.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            ListEmptyComponent={searched && !loading ? <EmptyState text="Ничего не найдено" /> : null}
            showsVerticalScrollIndicator={false}
            refreshing={loading}
            onRefresh={doSearch}
          />
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  hero: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.md, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  eyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 6 },
  heroTitle: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 38 : 32, lineHeight: Platform.OS === 'web' ? 42 : 36, color: theme.colors.primaryDark, letterSpacing: -1.2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md, backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.full, borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)', paddingHorizontal: theme.spacing.lg, ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(12px)' } as any }) },
  searchIcon: { fontSize: 18, color: theme.colors.primary, marginRight: theme.spacing.sm },
  searchInput: { flex: 1, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), fontSize: 16, color: theme.colors.textPrimary },
  chipsRow: { paddingLeft: theme.spacing.lg, marginBottom: theme.spacing.xs },
  chipList: { paddingRight: theme.spacing.lg, gap: theme.spacing.sm },
  chip: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.18)' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, ...theme.shadows.sm },
  chipText: { ...theme.typography.caption, color: theme.colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: theme.colors.textInverse, fontWeight: '700' },
  resultCount: { ...theme.typography.caption, color: theme.colors.textTertiary, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  resultCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,92,231,0.12)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  resultImage: { width: Platform.select({ web: 80, default: 100 }), height: Platform.select({ web: 72, default: 90 }) },
  resultBody: { flex: 1, padding: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), justifyContent: 'center' },
  resultTitle: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  resultVenue: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 2 },
  resultMeta: { ...theme.typography.small, color: theme.colors.textTertiary },
  errorBanner: { ...theme.typography.caption, color: theme.colors.error, textAlign: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.error + '11' },
});
