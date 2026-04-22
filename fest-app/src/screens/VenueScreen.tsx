import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Platform, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useEventsStore } from '../stores/eventsStore';
import { formatDateShort } from '../utils/dates';
import { CATEGORY_LABELS } from '../utils/constants';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable, Tilt } from '../motion';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'VenueDetails'>;

export const VenueScreen = ({ route, navigation }: Props) => {
  const { venueId } = route.params;
  const { events, loading, error } = useEventsStore();
  const venueEvents = events.filter((e) => e.venue_id === venueId);
  const venue = venueEvents[0]?.venue;

  if (loading && !venue) return <View style={s.root}><Aurora /><ScreenContainer><View style={s.inner}><ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} /></View></ScreenContainer></View>;
  if (!venue) return <View style={s.root}><Aurora /><ScreenContainer><View style={s.inner}><EmptyState text={error || 'Площадка не найдена'} /></View></ScreenContainer></View>;

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <ScrollView style={s.inner} contentContainerStyle={s.content}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()} activeScale={0.92}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>

          <FadeIn delay={40} direction="down" distance={12}>
            <View style={s.coverWrap}>
              <Image source={{ uri: venue.cover_image_url }} style={s.cover} />
              <View style={s.coverOverlay} />
            </View>
          </FadeIn>

          <View style={s.body}>
            <Stagger baseDelay={120} step={50}>
              <Text style={s.eyebrow}>Место</Text>
              <Text style={s.name}>{venue.name}</Text>
              <Text style={s.address}>{venue.address}</Text>
              <Text style={s.description}>{venue.description}</Text>
            </Stagger>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Мероприятия ({venueEvents.length})</Text>
            {venueEvents.length === 0 ? (
              <Text style={s.emptyList}>Нет предстоящих мероприятий</Text>
            ) : (
              <Stagger baseDelay={60} step={40}>
                {venueEvents.map((e) => (
                  <Tilt key={e.id} maxTilt={4} liftOnHover={3}>
                    <Pressable style={s.eventCard} onPress={() => navigation.navigate('EventDetails', { eventId: e.id })} activeScale={0.97}>
                      <Image source={{ uri: e.cover_image_url }} style={s.eventImage} />
                      <View style={s.eventBody}>
                        <Text style={s.eventTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={s.eventMeta}>{CATEGORY_LABELS[e.category] ?? ''} · {formatDateShort(e.starts_at)}</Text>
                        {e.price_info ? <Text style={s.eventMeta}>{e.price_info}</Text> : null}
                      </View>
                    </Pressable>
                  </Tilt>
                ))}
              </Stagger>
            )}
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  content: { paddingBottom: theme.spacing.xxxl },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: Platform.select({ web: theme.spacing.lg, default: theme.spacing.xl }), paddingBottom: theme.spacing.sm },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  coverWrap: { marginHorizontal: theme.spacing.lg, borderRadius: theme.borderRadius.xl, overflow: 'hidden', ...theme.shadows.md, position: 'relative' },
  cover: { width: '100%', height: Platform.select({ web: 170, default: 210 }), aspectRatio: Platform.select({ web: 16 / 7, default: undefined }) },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(108,92,231,0.08)' },
  body: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  eyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 4 },
  name: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 30 : 26, lineHeight: Platform.OS === 'web' ? 34 : 30, color: theme.colors.primaryDark, letterSpacing: -0.8, marginBottom: 6 },
  address: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  description: { ...theme.typography.body, color: theme.colors.textPrimary, lineHeight: 22 },
  section: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg },
  sectionTitle: { fontFamily: theme.fonts.displayMedium, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  eventCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,92,231,0.14)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  eventImage: { width: Platform.select({ web: 64, default: 84 }), height: Platform.select({ web: 64, default: 84 }) },
  eventBody: { flex: 1, padding: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), justifyContent: 'center' },
  eventTitle: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  eventMeta: { ...theme.typography.small, color: theme.colors.textTertiary },
  emptyList: { ...theme.typography.caption, color: theme.colors.textTertiary, textAlign: 'center', marginTop: theme.spacing.lg },
  loader: { marginTop: 100 },
});
