import React from 'react';
import { View, FlatList, Text, StyleSheet, Platform, ScrollView, Image } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { useEventsStore } from '../stores/eventsStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { formatDateShort } from '../utils/dates';
import { CATEGORY_CHIPS } from '../utils/constants';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { HomeStackParamList, RootStackParamList } from '../navigation/types';
import type { Event, EventCategory } from '../types';
import { Aurora, FadeIn, Pressable, Tilt, NotificationBell } from '../motion';

type NavType = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  BottomTabNavigationProp<Record<string, object | undefined>>
>;

// Wrap Image so its scaling can be driven by scroll offset for a parallax hero feel.
const AnimatedImage = Animated.createAnimatedComponent(Image);

export const HomeScreen = () => {
  const {
    events,
    interestedIds,
    savedIds,
    categoryFilter,
    loading,
    error,
    toggleInterest,
    toggleSave,
    setCategoryFilter,
    fetchEvents,
  } = useEventsStore();
  const navigation = useNavigation<NavType>();
  const unread = useNotificationsStore((s) => s.unreadCount);

  React.useEffect(() => {
    fetchEvents();
  }, []);

  const filtered = categoryFilter ? events.filter((e) => e.category === categoryFilter) : events;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const heroStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80, 160], [1, 0.7, 0.3], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 200], [0, -40], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const formatSocialProof = (event: Event) => {
    if (!event.friendsInterested?.length && !(event.friendsPlanCount ?? 0)) return null;
    if ((event.friendsPlanCount ?? 0) > 0)
      return `У ${event.friendsInterested?.[0]?.name ?? 'друга'} уже есть план`;
    const names = event.friendsInterested!.map((f) => f.name);
    if (names.length === 1) return `${names[0]} интересуется`;
    return `${names[0]} и ещё ${names.length - 1} интересуются`;
  };

  const renderHeader = () => (
    <Animated.View style={[s.heroWrap, heroStyle]}>
      <FadeIn delay={60} direction="down" distance={8}>
        <View style={s.brandRow}>
          <Text style={s.brandMark}>FEST</Text>
          <View style={s.brandDot} />
          <Text style={s.brandCity}>Москва</Text>
        </View>
      </FadeIn>
      <FadeIn delay={140} direction="up" distance={14}>
        <Text style={s.heroTitle}>Что-то{'\n'}интересное</Text>
      </FadeIn>
      <FadeIn delay={240} direction="up" distance={10}>
        <Text style={s.heroSub}>{filtered.length} событий вокруг вас сегодня</Text>
      </FadeIn>
    </Animated.View>
  );

  const renderItem = ({ item, index }: { item: Event; index: number }) => {
    const isInterested = interestedIds.has(item.id);
    const isSaved = savedIds.has(item.id);
    const proof = formatSocialProof(item);
    return (
      <FadeIn delay={140 + index * 60} direction="up" distance={18}>
        <Tilt style={s.card}>
          <Pressable
            style={s.cardInner}
            onPress={() => navigation.navigate('EventDetails', { eventId: item.id })}
            activeScale={0.98}
          >
            <View style={s.coverContainer}>
              <AnimatedImage source={{ uri: item.cover_image_url }} style={s.cover} />
              <View pointerEvents="none" style={s.coverOverlay} />
              <View style={s.coverTags}>
                <Text style={s.coverTag}>{formatDateShort(item.starts_at)}</Text>
              </View>
              <Pressable
                style={s.saveBtn}
                onPress={() => toggleSave(item.id)}
                activeScale={0.85}
                hitSlop={8}
              >
                <Text style={[s.saveIcon, isSaved && s.saveIconActive]}>
                  {isSaved ? '★' : '☆'}
                </Text>
              </Pressable>
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={s.cardVenue}>{item.venue?.name}</Text>
              {proof ? <Text style={s.socialProof}>{proof}</Text> : null}
              <View style={s.actions}>
                <Pressable
                  style={[s.interestBtn, isInterested && s.interestActive]}
                  onPress={() => toggleInterest(item.id)}
                  activeScale={0.94}
                >
                  <Text style={[s.interestText, isInterested && s.interestTextActive]}>
                    {isInterested ? '✓ интересно' : 'интересно'}
                  </Text>
                </Pressable>
                <Pressable
                  style={s.planBtn}
                  onPress={() =>
                    navigation.navigate('CreatePlanFromEvent', { eventId: item.id })
                  }
                  activeScale={0.95}
                >
                  <Text style={s.planBtnText}>Планы?</Text>
                </Pressable>
              </View>
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
        <View style={s.topBar}>
          <View style={s.topBarSpacer} />
          <NotificationBell
            count={unread}
            onPress={() => navigation.navigate('Notifications' as any)}
          />
        </View>

        <Animated.FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <>
              {renderHeader()}
              <View style={s.chipsOuter}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chipsContent}
                >
                  {CATEGORY_CHIPS.map((chip, index) => {
                    const isActive = categoryFilter === chip.key;
                    return (
                      <FadeIn
                        key={String(chip.key ?? 'all')}
                        delay={200 + index * 45}
                        direction="right"
                        distance={14}
                      >
                        <Pressable
                          style={[s.chip, isActive && s.chipActive]}
                          onPress={() =>
                            setCategoryFilter(chip.key as EventCategory | null)
                          }
                          activeScale={0.94}
                        >
                          <Text style={[s.chipText, isActive && s.chipTextActive]}>
                            {chip.label}
                          </Text>
                        </Pressable>
                      </FadeIn>
                    );
                  })}
                </ScrollView>
              </View>
              {error ? <Text style={s.errorBanner}>{error}</Text> : null}
            </>
          }
          refreshing={loading && filtered.length > 0}
          onRefresh={fetchEvents}
          ListEmptyComponent={
            loading ? (
              <View style={s.loaderSkeleton}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={s.skeletonCard} />
                ))}
              </View>
            ) : (
              <EmptyState text="Нет мероприятий" />
            )
          }
        />
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  topBarSpacer: { flex: 1 },
  heroWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  brandMark: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 5,
    color: theme.colors.primaryDark,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 10,
    backgroundColor: theme.colors.accent,
  },
  brandCity: {
    fontFamily: theme.fonts.displayMedium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  heroTitle: {
    fontFamily: theme.fonts.display,
    fontSize: Platform.OS === 'web' ? 52 : 44,
    lineHeight: Platform.OS === 'web' ? 56 : 48,
    color: theme.colors.primaryDark,
    letterSpacing: -2,
    marginBottom: theme.spacing.sm,
  },
  heroSub: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  chipsOuter: {
    marginBottom: theme.spacing.lg,
  },
  chipsContent: {
    paddingHorizontal: theme.spacing.lg,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.18)',
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  chipTextActive: { color: theme.colors.textInverse },
  errorBanner: {
    ...theme.typography.caption,
    color: theme.colors.error,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    gap: 14,
  },
  card: {
    borderRadius: theme.borderRadius.xxl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 40px -20px rgba(108,92,231,0.25)',
      } as any,
      default: theme.shadows.lg,
    }),
  },
  cardInner: { padding: 0 },
  coverContainer: {
    width: '100%',
    height: Platform.select({ web: 220, default: 240 }),
    position: 'relative',
  },
  cover: { width: '100%', height: '100%' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)',
      } as any,
      default: {
        backgroundColor: 'rgba(0,0,0,0.15)',
      },
    }),
  },
  coverTags: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    gap: 8,
  },
  coverTag: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.textInverse,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  saveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  saveIcon: { fontSize: 18, color: theme.colors.textSecondary },
  saveIconActive: { color: theme.colors.accent },
  cardBody: {
    padding: theme.spacing.lg,
    ...Platform.select({ web: { padding: theme.spacing.md } }),
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  cardVenue: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  socialProof: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  interestBtn: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  interestActive: {
    backgroundColor: theme.colors.primaryLight + '22',
    borderColor: theme.colors.primaryLight,
  },
  interestText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  interestTextActive: { color: theme.colors.primary, fontWeight: '800' },
  planBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginLeft: 'auto',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  planBtnText: {
    color: theme.colors.textInverse,
    ...theme.typography.captionBold,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  loaderSkeleton: { gap: 14 },
  skeletonCard: {
    height: 280,
    borderRadius: theme.borderRadius.xxl,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.08)',
  },
});
