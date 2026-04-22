import React from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable } from '../motion';
import * as usersApi from '../api/users';
import type { User, FriendshipStatus } from '../types';
import type { RootStackParamList } from '../navigation/types';

type PublicProfileRoute = RouteProp<RootStackParamList, 'PublicProfile'>;

const labelForStatus = (status: FriendshipStatus): string => {
  switch (status) {
    case 'friend':
      return 'В друзьях';
    case 'request_sent':
      return 'Запрос отправлен';
    case 'request_received':
      return 'Хочет добавить вас';
    default:
      return '';
  }
};

export const PublicProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<PublicProfileRoute>();
  const { userId } = route.params;

  const me = useAuthStore((s) => s.user);
  const { addFriend, removeFriend, acceptFriendRequest, declineFriendRequest } = useFriendsStore();

  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mutating, setMutating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await usersApi.fetchUser(userId);
      setUser(u);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => { load(); }, [load]);

  const isMe = me?.id === userId;
  const status: FriendshipStatus = (user?.friendship_status ?? null) as FriendshipStatus;

  const handleAdd = async () => {
    if (!user || mutating) return;
    setMutating(true);
    try {
      await addFriend(user.id);
      const refreshed = await usersApi.fetchUser(user.id);
      setUser(refreshed);
    } catch {
      // error surfaced via friendsStore.error
    } finally {
      setMutating(false);
    }
  };

  const handleAccept = async () => {
    if (!user || mutating) return;
    setMutating(true);
    try {
      await acceptFriendRequest(user.id);
      setUser((prev) => (prev ? { ...prev, friendship_status: 'friend' } : prev));
    } catch {
      // error surfaced via friendsStore.error
    } finally {
      setMutating(false);
    }
  };

  const handleDecline = async () => {
    if (!user || mutating) return;
    setMutating(true);
    try {
      await declineFriendRequest(user.id);
      setUser((prev) => (prev ? { ...prev, friendship_status: null } : prev));
    } catch {
      // error surfaced via friendsStore.error
    } finally {
      setMutating(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!user || mutating) return;
    setMutating(true);
    try {
      await removeFriend(user.id);
      setUser((prev) => (prev ? { ...prev, friendship_status: null } : prev));
    } catch {
      // error surfaced via friendsStore.error
    } finally {
      setMutating(false);
    }
  };

  const handleRemove = async () => {
    if (!user || mutating) return;
    const go = async () => {
      setMutating(true);
      try {
        await removeFriend(user.id);
        setUser((prev) => (prev ? { ...prev, friendship_status: null } : prev));
      } catch {
        // error surfaced via friendsStore.error
      } finally {
        setMutating(false);
      }
    };
    if (Platform.OS === 'web') {
      // web Alert is non-blocking / limited; go straight through
      await go();
    } else {
      Alert.alert('Удалить из друзей?', user.name, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: go },
      ]);
    }
  };

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.inner}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()} activeScale={0.92}>
            <Text style={s.backText}>← Назад</Text>
          </Pressable>

          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={s.loader} />
          ) : error || !user ? (
            <View style={s.errorWrap}>
              <Text style={s.errorBanner}>{error || 'Профиль не найден'}</Text>
              <Pressable style={s.retryBtn} onPress={load} activeScale={0.95}>
                <Text style={s.retryBtnText}>Повторить</Text>
              </Pressable>
            </View>
          ) : (
            <Stagger baseDelay={60} step={50}>
              <FadeIn delay={20} direction="down">
                <View style={s.avatarWrap}>
                  <View style={s.avatarGlow} />
                  <View style={s.avatarCircle}>
                    <Text style={s.avatarLetter}>{user.name[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                </View>
              </FadeIn>

              <Text style={s.eyebrow}>Профиль</Text>
              <Text style={s.name}>{user.name}</Text>
              <Text style={s.username}>@{user.username}</Text>

              {status && !isMe ? (
                <View style={s.statusPill}>
                  <Text style={s.statusPillText}>{labelForStatus(status)}</Text>
                </View>
              ) : null}

              {!isMe ? (
                <View style={s.actions}>
                  {status === 'friend' ? (
                    <Pressable style={[s.actionBtn, s.actionBtnGhost]} onPress={handleRemove} activeScale={0.97} disabled={mutating}>
                      <Text style={s.actionBtnGhostText}>{mutating ? '...' : 'Удалить из друзей'}</Text>
                    </Pressable>
                  ) : status === 'request_sent' ? (
                    <Pressable style={[s.actionBtn, s.actionBtnGhost]} onPress={handleCancelRequest} activeScale={0.97} disabled={mutating}>
                      <Text style={s.actionBtnGhostText}>{mutating ? '...' : 'Отменить заявку'}</Text>
                    </Pressable>
                  ) : status === 'request_received' ? (
                    <View style={s.actionRow}>
                      <Pressable style={[s.actionBtn, s.actionBtnHalf]} onPress={handleAccept} activeScale={0.97} disabled={mutating}>
                        <Text style={s.actionBtnText}>{mutating ? '...' : 'Принять'}</Text>
                      </Pressable>
                      <Pressable style={[s.actionBtn, s.actionBtnGhost, s.actionBtnHalf]} onPress={handleDecline} activeScale={0.97} disabled={mutating}>
                        <Text style={s.actionBtnGhostText}>{mutating ? '...' : 'Отклонить'}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={s.actionBtn} onPress={handleAdd} activeScale={0.97} disabled={mutating}>
                      <Text style={s.actionBtnText}>{mutating ? '...' : '＋ Добавить в друзья'}</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text style={s.selfHint}>Это ваш профиль</Text>
              )}
            </Stagger>
          )}
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  inner: { flex: 1, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '700' },
  loader: { marginTop: 80 },
  errorWrap: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xl, gap: theme.spacing.md },
  errorBanner: { ...theme.typography.caption, color: theme.colors.error, textAlign: 'center', padding: theme.spacing.sm, backgroundColor: theme.colors.error + '11' },
  retryBtn: { alignSelf: 'center', backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.full },
  retryBtnText: { ...theme.typography.bodyBold, color: theme.colors.textInverse },
  avatarWrap: { alignItems: 'center', justifyContent: 'center', marginTop: Platform.select({ web: theme.spacing.xl, default: theme.spacing.xxxl }), marginBottom: theme.spacing.md },
  avatarGlow: { position: 'absolute', width: Platform.select({ web: 132, default: 148 }), height: Platform.select({ web: 132, default: 148 }), borderRadius: Platform.select({ web: 66, default: 74 }), backgroundColor: theme.colors.primary + '22', ...Platform.select({ web: { filter: 'blur(22px)' } as any }) },
  avatarCircle: { width: Platform.select({ web: 88, default: 100 }), height: Platform.select({ web: 88, default: 100 }), borderRadius: Platform.select({ web: 44, default: 50 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.primary + '55' },
  avatarLetter: { fontFamily: theme.fonts.display, fontSize: Platform.select({ web: 32, default: 40 }), color: theme.colors.primaryDark },
  eyebrow: { fontFamily: theme.fonts.displayMedium, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: theme.colors.accent, textAlign: 'center', marginBottom: 4 },
  name: { fontFamily: theme.fonts.display, fontSize: Platform.OS === 'web' ? 30 : 28, lineHeight: Platform.OS === 'web' ? 34 : 32, color: theme.colors.primaryDark, textAlign: 'center', letterSpacing: -0.8, marginBottom: theme.spacing.xs },
  username: { ...theme.typography.caption, color: theme.colors.textTertiary, textAlign: 'center', marginBottom: theme.spacing.md },
  statusPill: { alignSelf: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.primaryLight + '22', marginBottom: theme.spacing.lg },
  statusPillText: { ...theme.typography.captionBold, color: theme.colors.primary },
  actions: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md },
  actionRow: { flexDirection: 'row', gap: theme.spacing.sm },
  actionBtn: { backgroundColor: theme.colors.primary, paddingVertical: theme.spacing.md, borderRadius: theme.borderRadius.lg, alignItems: 'center', ...theme.shadows.sm },
  actionBtnHalf: { flex: 1 },
  actionBtnText: { ...theme.typography.bodyBold, color: theme.colors.textInverse, letterSpacing: 0.2 },
  actionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.error + '66' },
  actionBtnGhostText: { ...theme.typography.bodyBold, color: theme.colors.error, letterSpacing: 0.2 },
  selfHint: { ...theme.typography.caption, color: theme.colors.textTertiary, textAlign: 'center', marginTop: theme.spacing.md },
});
