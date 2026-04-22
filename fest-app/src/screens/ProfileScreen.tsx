import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, Platform, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useEventsStore } from '../stores/eventsStore';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable, Tilt } from '../motion';

export const ProfileScreen = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { events, savedIds } = useEventsStore();
  const { friends, loading: friendsLoading, error: friendsError, fetchFriends } = useFriendsStore();
  const savedEvents = events.filter((e) => savedIds.has(e.id));
  const [showSaved, setShowSaved] = React.useState(false);
  const [showFriends, setShowFriends] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(user?.name ?? '');
  const navigation = useNavigation();

  React.useEffect(() => { fetchFriends(); }, []);

  const handleSaveProfile = () => {
    setEditing(false);
  };

  if (showSaved) return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <Pressable style={s.backBtn} onPress={() => setShowSaved(false)} activeScale={0.92}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>
          <FadeIn delay={40} direction="down">
            <View style={s.subHero}>
              <Text style={s.eyebrow}>Коллекция</Text>
              <Text style={s.subHeroTitle}>Сохранённые</Text>
            </View>
          </FadeIn>
          <FlatList
            data={savedEvents}
            keyExtractor={(e) => e.id}
            renderItem={({ item, index }) => (
              <FadeIn delay={80 + index * 35} distance={10}>
                <Tilt maxTilt={4} liftOnHover={3}>
                  <Pressable style={s.savedCard} onPress={() => (navigation as any).navigate('HomeTab', { screen: 'EventDetails', params: { eventId: item.id } })} activeScale={0.97}>
                    <Image source={{ uri: item.cover_image_url }} style={s.savedImage} />
                    <View style={s.savedBody}>
                      <Text style={s.savedTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.savedMeta}>{item.venue?.name}</Text>
                    </View>
                  </Pressable>
                </Tilt>
              </FadeIn>
            )}
            contentContainerStyle={s.list}
            ListEmptyComponent={<EmptyState text="Ничего не сохранено" />}
          />
        </View>
      </ScreenContainer>
    </View>
  );

  if (showFriends) return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <Pressable style={s.backBtn} onPress={() => setShowFriends(false)} activeScale={0.92}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>
          <FadeIn delay={40} direction="down">
            <View style={s.subHero}>
              <Text style={s.eyebrow}>Круг</Text>
              <Text style={s.subHeroTitle}>Друзья</Text>
            </View>
          </FadeIn>
          {friendsError ? <Text style={s.errorBanner}>{friendsError}</Text> : null}
          {friendsLoading ? <ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} /> : (
            <FlatList
              data={friends}
              keyExtractor={(u) => u.id}
              renderItem={({ item, index }) => (
                <FadeIn delay={80 + index * 30} distance={10}>
                  <Tilt maxTilt={3} liftOnHover={2}>
                    <View style={s.friendRow}>
                      <View style={s.friendAvatar}><Text style={s.friendLetter}>{item.name[0]}</Text></View>
                      <View style={s.friendInfo}>
                        <Text style={s.friendName}>{item.name}</Text>
                        <Text style={s.friendUsername}>@{item.username}</Text>
                      </View>
                    </View>
                  </Tilt>
                </FadeIn>
              )}
              contentContainerStyle={s.list}
              ListEmptyComponent={<EmptyState text="Нет друзей" />}
            />
          )}
        </View>
      </ScreenContainer>
    </View>
  );

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <FadeIn delay={40} direction="down">
            <View style={s.avatarWrap}>
              <View style={s.avatarGlow} />
              <View style={s.avatarCircle}>
                <Text style={s.avatarLetter}>{user?.name?.[0] ?? '?'}</Text>
              </View>
            </View>
          </FadeIn>

          <Stagger baseDelay={140} step={55}>
            <Text style={s.eyebrowCenter}>Профиль</Text>
            {editing ? (
              <View style={s.editRow}>
                <TextInput style={s.editInput} value={editName} onChangeText={setEditName} autoFocus />
                <Pressable style={s.editSaveBtn} onPress={handleSaveProfile} activeScale={0.9}>
                  <Text style={s.editSaveBtnText}>✓</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setEditName(user?.name ?? ''); setEditing(true); }} activeScale={0.97}>
                <Text style={s.name}>{user?.name ?? 'Гость'} <Text style={s.editPen}>✎</Text></Text>
              </Pressable>
            )}
            <Text style={s.username}>@{user?.username ?? ''}</Text>

            <View style={s.menu}>
              <Tilt maxTilt={3} liftOnHover={2}>
                <Pressable style={s.menuItem} onPress={() => setShowFriends(true)} activeScale={0.97}>
                  <View style={s.menuRow}>
                    <Text style={s.menuText}>Друзья</Text>
                    <View style={s.badgePill}><Text style={s.menuBadge}>{friends.length}</Text></View>
                  </View>
                </Pressable>
              </Tilt>
              <Tilt maxTilt={3} liftOnHover={2}>
                <Pressable style={s.menuItem} onPress={() => setShowSaved(true)} activeScale={0.97}>
                  <View style={s.menuRow}>
                    <Text style={s.menuText}>Сохранённые</Text>
                    {savedEvents.length > 0 ? <View style={s.badgePill}><Text style={s.menuBadge}>{savedEvents.length}</Text></View> : null}
                  </View>
                </Pressable>
              </Tilt>
              <Pressable style={s.menuItem} onPress={logout} activeScale={0.97}>
                <Text style={[s.menuText, { color: theme.colors.error, fontWeight: '700' }]}>Выйти</Text>
              </Pressable>
            </View>
          </Stagger>
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  avatarWrap: { alignItems: 'center', justifyContent: 'center', marginTop: Platform.select({ web: theme.spacing.xl, default: theme.spacing.xxxl }), marginBottom: theme.spacing.md },
  avatarGlow: { position: 'absolute', width: Platform.select({ web: 112, default: 132 }), height: Platform.select({ web: 112, default: 132 }), borderRadius: Platform.select({ web: 56, default: 66 }), backgroundColor: theme.colors.primary + '18', ...Platform.select({ web: { filter: 'blur(18px)' } as any }) },
  avatarCircle: { width: Platform.select({ web: 72, default: 88 }), height: Platform.select({ web: 72, default: 88 }), borderRadius: Platform.select({ web: 36, default: 44 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.primary + '55' },
  avatarLetter: { fontFamily: theme.fonts.display, fontSize: Platform.select({ web: 28, default: 34 }), color: theme.colors.primaryDark },
  eyebrowCenter: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, textAlign: 'center', marginBottom: 4 },
  name: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 28 : 26, lineHeight: Platform.OS === 'web' ? 32 : 30, color: theme.colors.primaryDark, textAlign: 'center', letterSpacing: -0.8, marginBottom: theme.spacing.xs },
  editPen: { fontFamily: undefined, fontSize: 16, color: theme.colors.primary },
  username: { ...theme.typography.caption, color: theme.colors.textTertiary, textAlign: 'center', marginBottom: theme.spacing.lg },
  editRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  editInput: { ...theme.typography.h3, color: theme.colors.textPrimary, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, paddingBottom: 2, minWidth: 120, textAlign: 'center' },
  editSaveBtn: { backgroundColor: theme.colors.primary, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...theme.shadows.sm },
  editSaveBtnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: '800' },
  menu: { width: '100%', paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  menuItem: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: theme.borderRadius.lg,
    padding: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }),
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.14)',
    ...theme.shadows.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }),
  },
  menuText: { ...theme.typography.body, color: theme.colors.textPrimary, fontWeight: '600' },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 },
  badgePill: { backgroundColor: theme.colors.primaryLight + '22', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  menuBadge: { ...theme.typography.captionBold, color: theme.colors.primary, fontWeight: '800' },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  subHero: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  eyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginBottom: 4 },
  subHeroTitle: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 32 : 28, lineHeight: Platform.OS === 'web' ? 36 : 32, color: theme.colors.primaryDark, letterSpacing: -1 },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
  savedCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,92,231,0.12)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  savedImage: { width: Platform.select({ web: 64, default: 80 }), height: Platform.select({ web: 64, default: 80 }) },
  savedBody: { flex: 1, padding: theme.spacing.md, justifyContent: 'center' },
  savedTitle: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  savedMeta: { ...theme.typography.caption, color: theme.colors.textTertiary },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.12)', ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md, borderWidth: 1.5, borderColor: theme.colors.primary + '33' },
  friendLetter: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.primaryDark },
  friendInfo: { flex: 1 },
  friendName: { ...theme.typography.bodyBold, color: theme.colors.textPrimary, marginBottom: 2 },
  friendUsername: { ...theme.typography.caption, color: theme.colors.textTertiary },
  loader: { marginTop: 40 },
  errorBanner: { ...theme.typography.caption, color: theme.colors.error, textAlign: 'center', padding: theme.spacing.sm, backgroundColor: theme.colors.error + '11', marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
});
