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
  const {
    friends, loading: friendsLoading, error: friendsError, fetchFriends,
    searchResults, searchQuery, searchLoading, searchUsers, clearSearch, addFriend, removeFriend,
    incomingRequests, fetchRequests, acceptFriendRequest, declineFriendRequest,
  } = useFriendsStore();
  const savedEvents = events.filter((e) => savedIds.has(e.id));
  const [showSaved, setShowSaved] = React.useState(false);
  const [showFriends, setShowFriends] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(user?.name ?? '');
  const [localQuery, setLocalQuery] = React.useState('');
  const [mutatingId, setMutatingId] = React.useState<string | null>(null);
  const navigation = useNavigation();

  React.useEffect(() => { fetchFriends(); fetchRequests(); }, []);

  React.useEffect(() => {
    if (!showFriends) return;
    const handle = setTimeout(() => { searchUsers(localQuery); }, 250);
    return () => clearTimeout(handle);
  }, [localQuery, showFriends]);

  React.useEffect(() => {
    if (!showFriends) { clearSearch(); setLocalQuery(''); }
  }, [showFriends]);

  const handleAddFriend = async (friendId: string) => {
    if (mutatingId) return;
    setMutatingId(friendId);
    try { await addFriend(friendId); } catch {} finally { setMutatingId(null); }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (mutatingId) return;
    setMutatingId(friendId);
    try { await removeFriend(friendId); } catch {} finally { setMutatingId(null); }
  };

  const handleAcceptRequest = async (friendId: string) => {
    if (mutatingId) return;
    setMutatingId(friendId);
    try { await acceptFriendRequest(friendId); } catch {} finally { setMutatingId(null); }
  };

  const handleDeclineRequest = async (friendId: string) => {
    if (mutatingId) return;
    setMutatingId(friendId);
    try { await declineFriendRequest(friendId); } catch {} finally { setMutatingId(null); }
  };

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

  if (showFriends) {
    const hasQuery = localQuery.trim().length > 0;
    const data = hasQuery ? searchResults : friends;
    const listLoading = hasQuery ? searchLoading : friendsLoading;

    const goToProfile = (uid: string) => (navigation as any).navigate('PublicProfile', { userId: uid });

    return (
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
            <View style={s.searchWrap}>
              <TextInput
                style={s.searchInput}
                value={localQuery}
                onChangeText={setLocalQuery}
                placeholder="Найти друзей по имени или @username"
                placeholderTextColor={theme.colors.textTertiary}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {localQuery.length > 0 ? (
                <Pressable onPress={() => setLocalQuery('')} style={s.searchClear} hitSlop={8} activeScale={0.9}>
                  <Text style={s.searchClearText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
            {friendsError ? <Text style={s.errorBanner}>{friendsError}</Text> : null}
            {!hasQuery && incomingRequests.length > 0 ? (
              <View style={s.requestsBlock}>
                <Text style={s.sectionHeader}>Входящие заявки</Text>
                {incomingRequests.map((item) => {
                  const busy = mutatingId === item.id;
                  return (
                    <Pressable key={item.id} style={s.friendRow} onPress={() => goToProfile(item.id)} activeScale={0.98}>
                      <View style={s.friendAvatar}><Text style={s.friendLetter}>{item.name[0]}</Text></View>
                      <View style={s.friendInfo}>
                        <Text style={s.friendName}>{item.name}</Text>
                        <Text style={s.friendUsername}>@{item.username}</Text>
                      </View>
                      <View style={s.requestActions}>
                        <Pressable
                          style={s.requestAccept}
                          onPress={() => handleAcceptRequest(item.id)}
                          activeScale={0.9}
                          hitSlop={4}
                          disabled={busy}
                        >
                          <Text style={s.requestAcceptText}>{busy ? '...' : 'Принять'}</Text>
                        </Pressable>
                        <Pressable
                          style={s.requestDecline}
                          onPress={() => handleDeclineRequest(item.id)}
                          activeScale={0.9}
                          hitSlop={4}
                          disabled={busy}
                        >
                          <Text style={s.requestDeclineText}>✕</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
                <Text style={s.sectionHeader}>Мои друзья</Text>
              </View>
            ) : null}
            {listLoading ? <ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} /> : (
              <FlatList
                data={data}
                keyExtractor={(u) => u.id}
                renderItem={({ item, index }) => {
                  const isFriend = hasQuery
                    ? item.friendship_status === 'friend'
                    : true;
                  const busy = mutatingId === item.id;
                  return (
                    <FadeIn delay={80 + index * 30} distance={10}>
                      <Tilt maxTilt={3} liftOnHover={2}>
                        <Pressable style={s.friendRow} onPress={() => goToProfile(item.id)} activeScale={0.98}>
                          <View style={s.friendAvatar}><Text style={s.friendLetter}>{item.name[0]}</Text></View>
                          <View style={s.friendInfo}>
                            <Text style={s.friendName}>{item.name}</Text>
                            <Text style={s.friendUsername}>@{item.username}</Text>
                          </View>
                          {hasQuery ? (
                            isFriend ? (
                              <Pressable
                                style={s.friendActionGhost}
                                onPress={() => handleRemoveFriend(item.id)}
                                activeScale={0.9}
                                hitSlop={4}
                                disabled={busy}
                              >
                                <Text style={s.friendActionGhostText}>{busy ? '...' : 'В друзьях'}</Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                style={s.friendActionPrimary}
                                onPress={() => handleAddFriend(item.id)}
                                activeScale={0.9}
                                hitSlop={4}
                                disabled={busy}
                              >
                                <Text style={s.friendActionPrimaryText}>{busy ? '...' : '＋ Добавить'}</Text>
                              </Pressable>
                            )
                          ) : null}
                        </Pressable>
                      </Tilt>
                    </FadeIn>
                  );
                }}
                contentContainerStyle={s.list}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <EmptyState text={hasQuery ? 'Никого не найдено' : 'Нет друзей — попробуйте найти кого-то выше'} />
                }
              />
            )}
          </View>
        </ScreenContainer>
      </View>
    );
  }

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
                    <View style={s.badgeGroup}>
                      {incomingRequests.length > 0 ? (
                        <View style={s.badgeAlert}><Text style={s.badgeAlertText}>{incomingRequests.length}</Text></View>
                      ) : null}
                      <View style={s.badgePill}><Text style={s.menuBadge}>{friends.length}</Text></View>
                    </View>
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
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  badgeAlert: { backgroundColor: theme.colors.accent + 'cc', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  badgeAlertText: { ...theme.typography.captionBold, color: theme.colors.textInverse, fontWeight: '800' },
  menuBadge: { ...theme.typography.captionBold, color: theme.colors.primary, fontWeight: '800' },
  requestsBlock: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  sectionHeader: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  requestAccept: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full, ...theme.shadows.sm },
  requestAcceptText: { ...theme.typography.captionBold, color: theme.colors.textInverse, fontWeight: '800' },
  requestDecline: { borderWidth: 1.5, borderColor: theme.colors.error + '66', paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full },
  requestDeclineText: { ...theme.typography.captionBold, color: theme.colors.error, fontWeight: '800' },
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
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md, backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: theme.borderRadius.full, borderWidth: 1, borderColor: 'rgba(108,92,231,0.18)', paddingHorizontal: theme.spacing.md, ...theme.shadows.sm, ...Platform.select({ web: { backdropFilter: 'blur(10px)' } as any }) },
  searchInput: { flex: 1, ...theme.typography.body, color: theme.colors.textPrimary, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
  searchClear: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
  searchClearText: { fontSize: 14, color: theme.colors.textTertiary, fontWeight: '700' },
  friendActionPrimary: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full, ...theme.shadows.sm },
  friendActionPrimaryText: { ...theme.typography.captionBold, color: theme.colors.textInverse, fontWeight: '700' },
  friendActionGhost: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full, borderWidth: 1, borderColor: theme.colors.primary + '55' },
  friendActionGhostText: { ...theme.typography.captionBold, color: theme.colors.primary, fontWeight: '700' },
});
