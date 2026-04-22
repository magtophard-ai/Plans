import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Platform, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useEventsStore } from '../stores/eventsStore';
import { formatDateFull } from '../utils/dates';
import { CATEGORY_LABELS } from '../utils/constants';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable, Tilt } from '../motion';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'EventDetails'>;

export const EventDetailsScreen = ({ route, navigation }: Props) => {
  const { eventId } = route.params;
  const { events, interestedIds, savedIds, loading, error, toggleInterest, toggleSave } = useEventsStore();
  const event = events.find((e) => e.id === eventId);

  if (loading && !event) return <View style={s.root}><Aurora /><ScreenContainer><View style={s.inner}><ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} /></View></ScreenContainer></View>;
  if (!event) return <View style={s.root}><Aurora /><ScreenContainer><View style={s.inner}><Text style={s.empty}>{error || 'Мероприятие не найдено'}</Text></View></ScreenContainer></View>;

  const isInterested = interestedIds.has(event.id);
  const isSaved = savedIds.has(event.id);

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <ScrollView style={s.inner} contentContainerStyle={s.scrollContent}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()} activeScale={0.92} hitSlop={12}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>

          <FadeIn delay={60} direction="down" distance={12}>
            <View style={s.heroWrap}>
              <Image source={{ uri: event.cover_image_url }} style={s.hero} />
              <View style={s.heroOverlay} />
            </View>
          </FadeIn>

          <View style={s.body}>
            <Stagger baseDelay={120} step={50}>
              <Text style={s.category}>{CATEGORY_LABELS[event.category] ?? event.category}</Text>
              <Text style={s.title}>{event.title}</Text>
              <Text style={s.venue}>{event.venue?.name}</Text>
              <Text style={s.meta}>{formatDateFull(event.starts_at)}</Text>
              {event.venue ? (
                <Pressable onPress={() => navigation.navigate('VenueDetails', { venueId: event.venue!.id })} activeScale={0.97}>
                  <Text style={s.venueLink}>{event.venue.address} →</Text>
                </Pressable>
              ) : null}
              {event.price_info ? <Text style={s.meta}>{event.price_info}</Text> : null}

              {event.friendsInterested && event.friendsInterested.length > 0 ? (
                <Tilt style={s.proofTilt} maxTilt={3} liftOnHover={2}>
                  <View style={s.proof}>
                    <Text style={s.proofEyebrow}>Друзья</Text>
                    <Text style={s.proofText}>{event.friendsInterested.map((f) => f.name).join(', ')} интересуются</Text>
                  </View>
                </Tilt>
              ) : null}

              <View style={s.divider} />
              <Text style={s.description}>{event.description}</Text>
              <View style={{ height: 96 }} />
            </Stagger>
          </View>
        </ScrollView>

        <View style={s.bottomBar}>
          <Pressable
            style={[s.actionBtn, isInterested && s.actionActive]}
            onPress={() => toggleInterest(event.id)}
            activeScale={0.94}
          >
            <Text style={[s.actionText, isInterested && s.actionTextActive]}>интересно</Text>
          </Pressable>
          <Pressable onPress={() => toggleSave(event.id)} activeScale={0.88} hitSlop={10}>
            <Text style={[s.saveIcon, isSaved && s.saveIconActive]}>{isSaved ? '★' : '☆'}</Text>
          </Pressable>
          <Pressable
            style={s.planBtn}
            onPress={() => navigation.navigate('CreatePlanFromEvent', { eventId: event.id })}
            activeScale={0.95}
          >
            <Text style={s.planBtnText}>Планы?</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.xxxl },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  heroWrap: { marginHorizontal: theme.spacing.lg, borderRadius: theme.borderRadius.xl, overflow: 'hidden', ...theme.shadows.md, position: 'relative' },
  hero: { width: '100%', height: Platform.select({ web: 220, default: 260 }), aspectRatio: Platform.select({ web: 16 / 8, default: undefined }) },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(108,92,231,0.08)' },
  body: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, ...Platform.select({ web: { paddingTop: theme.spacing.md } }) },
  category: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 6 },
  title: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 32 : 28, lineHeight: Platform.OS === 'web' ? 36 : 32, color: theme.colors.primaryDark, letterSpacing: -1, marginBottom: theme.spacing.sm },
  venue: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  meta: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  venueLink: { ...theme.typography.captionBold, color: theme.colors.primary, marginBottom: theme.spacing.xs },
  proofTilt: { marginTop: theme.spacing.md },
  proof: { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: 'rgba(108,92,231,0.18)', ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  proofEyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 4 },
  proofText: { ...theme.typography.caption, color: theme.colors.primaryDark, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(108,92,231,0.12)', marginVertical: theme.spacing.lg },
  description: { ...theme.typography.body, color: theme.colors.textPrimary, lineHeight: 22 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(108,92,231,0.15)',
    backgroundColor: 'rgba(255,255,255,0.88)',
    gap: theme.spacing.md,
    ...Platform.select({ web: { backdropFilter: 'blur(18px)' } as any }),
  },
  actionBtn: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderWidth: 1, borderColor: 'rgba(108,92,231,0.18)' },
  actionActive: { backgroundColor: theme.colors.primaryLight + '30', borderColor: theme.colors.primary },
  actionText: { ...theme.typography.caption, color: theme.colors.textSecondary, fontWeight: '700' },
  actionTextActive: { color: theme.colors.primaryDark, fontWeight: '800' },
  saveIcon: { fontSize: 26, color: theme.colors.textTertiary, paddingHorizontal: theme.spacing.sm },
  saveIconActive: { color: theme.colors.accent },
  planBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.xxl, paddingVertical: theme.spacing.md, marginLeft: 'auto', ...theme.shadows.sm },
  planBtnText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  empty: { ...theme.typography.body, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 100 },
  loader: { marginTop: 100 },
});
