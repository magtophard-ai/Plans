import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Switch, Platform, Alert } from 'react-native';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { usePlansStore } from '../stores/plansStore';
import { useGroupsStore } from '../stores/groupsStore';
import { useFriendsStore } from '../stores/friendsStore';
import { ACTIVITY_LABELS, type ActivityType } from '../types';
import { ScreenContainer } from '../components/ScreenContainer';
import { Aurora, FadeIn, Stagger, Pressable, TabIndicator, Tab, Tilt, Confetti } from '../motion';

const MAX_PARTICIPANTS = 15;

interface FriendItem {
  id: string;
  name: string;
  selected: boolean;
}

interface Props {
  linkedEventId?: string;
  linkedEventTitle?: string;
  linkedEventVenue?: string;
  linkedEventTime?: string;
  linkedEventStartsAt?: string;
  onDone: (newPlanId: string) => void;
  preselectedGroupIds?: string[];
}

type StepKey = 'details' | 'people' | 'confirm';
const STEP_KEYS: StepKey[] = ['details', 'people', 'confirm'];
const STEP_LABELS: Record<StepKey, string> = {
  details: 'Детали',
  people: 'Люди',
  confirm: 'Готово',
};

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  cinema: '🎬',
  coffee: '☕',
  bar: '🍸',
  walk: '🌿',
  dinner: '🍝',
  sport: '⚽',
  exhibition: '🖼️',
  other: '✨',
};

export const CreatePlanForm = ({ linkedEventId, linkedEventTitle, linkedEventVenue, linkedEventTime, linkedEventStartsAt, onDone, preselectedGroupIds }: Props) => {
  const user = useAuthStore((s) => s.user);
  const apiCreatePlan = usePlansStore((s) => s.apiCreatePlan);
  const planError = usePlansStore((s) => s.operationErrors.create ?? null);
  const clearOpError = usePlansStore((s) => s.clearOpError);
  const clearPlanError = React.useCallback(() => clearOpError('create'), [clearOpError]);
  const groups = useGroupsStore((s) => s.groups);
  const fetchGroups = useGroupsStore((s) => s.fetchGroups);
  const { friends: apiFriends, fetchFriends } = useFriendsStore();

  const isFromEvent = !!linkedEventId;

  useEffect(() => {
    fetchFriends();
    fetchGroups();
  }, [fetchFriends, fetchGroups]);

  const [activityType, setActivityType] = useState<ActivityType>(isFromEvent ? 'other' : 'cinema');
  const [title, setTitle] = useState(linkedEventTitle ?? '');
  const [placeText, setPlaceText] = useState(linkedEventVenue ?? '');
  const [timeText, setTimeText] = useState(linkedEventTime ?? '');
  const [preMeetEnabled, setPreMeetEnabled] = useState(false);
  const [preMeetPlace, setPreMeetPlace] = useState('');
  const [preMeetTime, setPreMeetTime] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(preselectedGroupIds?.[0] ?? null);
  const [step, setStep] = useState<StepKey>(isFromEvent || !!preselectedGroupIds?.length ? 'people' : 'details');
  const [submitting, setSubmitting] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [stepperWidth, setStepperWidth] = useState(0);

  useEffect(() => {
    setFriends((prev) => {
      const selectedIds = new Set(prev.filter((friend) => friend.selected).map((friend) => friend.id));

      if (selectedIds.size === 0 && preselectedGroupIds?.length) {
        preselectedGroupIds.forEach((gid) => {
          const group = groups.find((item) => item.id === gid);
          (group?.members ?? []).forEach((member) => {
            if (member.user_id !== user?.id) selectedIds.add(member.user_id);
          });
        });
      }

      return apiFriends.map((apiFriend) => ({
        id: apiFriend.id,
        name: apiFriend.name,
        selected: selectedIds.has(apiFriend.id),
      }));
    });
  }, [apiFriends, groups, preselectedGroupIds, user?.id]);

  const toggleFriend = (id: string) => {
    setFriends((prev) => prev.map((f) => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  const selectGroup = (groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setFriends((prev) => prev.map((f) => ({ ...f, selected: false })));
    } else {
      setSelectedGroupId(groupId);
      const group = groups.find((g) => g.id === groupId);
      const memberIds = new Set((group?.members ?? []).filter((m) => m.user_id !== user?.id).map((m) => m.user_id));
      setFriends((prev) => prev.map((f) => ({ ...f, selected: memberIds.has(f.id) })));
    }
  };

  const selectedCount = friends.filter((f) => f.selected).length;
  const canProceedToConfirm = selectedCount > 0 || friends.length === 0;

  const handleCreate = async () => {
    if (!user || !title.trim() || submitting) return;
    const selectedFriendIds = friends.filter((f) => f.selected).map((f) => f.id);
    if (1 + selectedFriendIds.length > MAX_PARTICIPANTS) {
      Alert.alert('Слишком много участников', `Максимум ${MAX_PARTICIPANTS} участников, включая вас`);
      return;
    }

    const confirmedTime = isFromEvent ? linkedEventStartsAt?.trim() : timeText.trim();

    setSubmitting(true);
    clearPlanError();
    try {
      const apiPlanId = await apiCreatePlan({
        title: title.trim(),
        activity_type: activityType,
        linked_event_id: linkedEventId ?? undefined,
        confirmed_place_text: placeText.trim() || undefined,
        confirmed_time: confirmedTime || undefined,
        pre_meet_enabled: preMeetEnabled,
        pre_meet_place_text: preMeetEnabled ? preMeetPlace.trim() || undefined : undefined,
        pre_meet_time: preMeetEnabled ? preMeetTime.trim() || undefined : undefined,
        participant_ids: selectedFriendIds,
      });
      setConfettiTrigger(true);
      setTimeout(() => onDone(apiPlanId), 650);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const activities: ActivityType[] = ['cinema', 'coffee', 'bar', 'walk', 'dinner', 'sport', 'exhibition', 'other'];
  const activeStepIndex = STEP_KEYS.indexOf(step);

  return (
    <View style={s.root}>
      <Aurora />
      <ScreenContainer>
        <View style={s.container}>
          <FadeIn delay={40} direction="down" distance={14}>
            <View style={s.heroBlock}>
              <Text style={s.eyebrow}>Новый план</Text>
              <Text style={s.title}>Собираем{'\n'}друзей</Text>
            </View>
          </FadeIn>

          <FadeIn delay={120} direction="up" distance={10}>
            <View
              style={s.stepperRow}
              onLayout={(e) => setStepperWidth(e.nativeEvent.layout.width - 8)}
            >
              <View style={s.stepperInner}>
                <TabIndicator
                  count={STEP_KEYS.length}
                  activeIndex={activeStepIndex}
                  containerWidth={stepperWidth}
                  color={theme.colors.primary}
                  style={s.stepIndicator}
                />
                {STEP_KEYS.map((sKey, i) => {
                  const reachable =
                    sKey === 'details' ? !isFromEvent :
                    sKey === 'people' ? true :
                    selectedCount > 0 || friends.length === 0;
                  return (
                    <Pressable
                      key={sKey}
                      style={s.stepBtn}
                      activeScale={0.96}
                      onPress={() => { if (reachable) setStep(sKey); }}
                    >
                      <Tab active={i === activeStepIndex}>
                        <Text style={[s.stepLabel, i === activeStepIndex && s.stepLabelActive]}>{STEP_LABELS[sKey]}</Text>
                      </Tab>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </FadeIn>

          {step === 'details' && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
              <Stagger step={50} baseDelay={160}>
                {isFromEvent && (
                  <View style={s.linkedBanner}>
                    <Text style={s.linkedText}>📎 {linkedEventTitle}</Text>
                  </View>
                )}
                <Text style={s.label}>Тип активности</Text>
                <View style={s.activityGrid}>
                  {activities.map((act) => {
                    const active = activityType === act;
                    return (
                      <Tilt key={act} style={s.activityTilt} maxTilt={3} liftOnHover={2}>
                        <Pressable
                          style={[s.activityBtn, active && s.activityBtnActive]}
                          onPress={() => setActivityType(act)}
                          activeScale={0.94}
                        >
                          <Text style={[s.activityIcon, active && s.activityIconActive]}>{ACTIVITY_ICONS[act]}</Text>
                          <Text style={[s.activityLabel, active && s.activityLabelActive]}>{ACTIVITY_LABELS[act]}</Text>
                        </Pressable>
                      </Tilt>
                    );
                  })}
                </View>
                <Text style={s.label}>Название плана</Text>
                <TextInput style={s.input} placeholder="Кино в субботу" placeholderTextColor={theme.colors.textTertiary} value={title} onChangeText={setTitle} />
                <Text style={s.label}>Место {isFromEvent && <Text style={s.hint}>(из мероприятия)</Text>}</Text>
                <TextInput style={s.input} placeholder="Решим позже..." placeholderTextColor={theme.colors.textTertiary} value={placeText} onChangeText={setPlaceText} editable={!isFromEvent} />
                <Text style={s.label}>Время {isFromEvent && <Text style={s.hint}>(из мероприятия)</Text>}</Text>
                <TextInput style={s.input} placeholder="Обсудим..." placeholderTextColor={theme.colors.textTertiary} value={timeText} onChangeText={setTimeText} editable={!isFromEvent} />

                <View style={s.switchRow}>
                  <Text style={s.label}>Встретиться до мероприятия</Text>
                  <Switch value={preMeetEnabled} onValueChange={setPreMeetEnabled} trackColor={{ true: theme.colors.primaryLight, false: theme.colors.border }} />
                </View>
                {preMeetEnabled && (
                  <>
                    <TextInput style={s.input} placeholder="Место встречи" placeholderTextColor={theme.colors.textTertiary} value={preMeetPlace} onChangeText={setPreMeetPlace} />
                    <TextInput style={s.input} placeholder="Время встречи" placeholderTextColor={theme.colors.textTertiary} value={preMeetTime} onChangeText={setPreMeetTime} />
                  </>
                )}

                <Pressable style={s.nextBtn} onPress={() => setStep('people')} activeScale={0.97}>
                  <Text style={s.nextBtnText}>Далее →</Text>
                </Pressable>
              </Stagger>
            </ScrollView>
          )}

          {step === 'people' && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
              <Stagger step={45} baseDelay={160}>
                {groups.length > 0 ? <Text style={s.label}>Группы</Text> : null}
                {groups.map((g) => {
                  const active = selectedGroupId === g.id;
                  return (
                    <Tilt key={g.id} style={s.groupTilt} maxTilt={3} liftOnHover={2}>
                      <Pressable
                        style={[s.groupCard, active && s.groupCardActive]}
                        onPress={() => selectGroup(g.id)}
                        activeScale={0.98}
                      >
                        <Text style={[s.groupName, active && s.groupNameActive]}>{g.name}</Text>
                        <Text style={s.groupMeta}>{g.members?.length ?? 0} чел.</Text>
                      </Pressable>
                    </Tilt>
                  );
                })}
                {groups.length > 0 ? <View style={s.divider} /> : null}

                <Text style={s.label}>Друзья {selectedCount > 0 && <Text style={s.selectedCount}>({selectedCount})</Text>}</Text>
                {friends.map((f) => (
                  <Tilt key={f.id} style={s.friendTilt} maxTilt={2} liftOnHover={1.5}>
                    <Pressable
                      style={[s.friendRow, f.selected && s.friendRowActive]}
                      onPress={() => toggleFriend(f.id)}
                      activeScale={0.98}
                    >
                      <View style={s.friendAvatar}>
                        <Text style={s.friendLetter}>{f.name[0]}</Text>
                      </View>
                      <Text style={[s.friendName, f.selected && s.friendNameActive]}>{f.name}</Text>
                      <Text style={s.checkMark}>{f.selected ? '✓' : ''}</Text>
                    </Pressable>
                  </Tilt>
                ))}

                {friends.length === 0 && <Text style={s.emptyHint}>Нет друзей — можно создать план только для себя</Text>}

                <Pressable
                  style={[s.nextBtn, !canProceedToConfirm && s.btnDisabled]}
                  onPress={() => { if (canProceedToConfirm) setStep('confirm'); }}
                  activeScale={0.97}
                >
                  <Text style={[s.nextBtnText, !canProceedToConfirm && s.nextBtnTextDisabled]}>Далее →</Text>
                </Pressable>
              </Stagger>
            </ScrollView>
          )}

          {step === 'confirm' && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
              <Stagger step={55} baseDelay={160}>
                <Text style={s.label}>План</Text>
                <Tilt style={s.summaryTilt} maxTilt={3} liftOnHover={2}>
                  <View style={s.summaryCard}>
                    <Text style={s.summaryActivity}>{ACTIVITY_ICONS[activityType]} {ACTIVITY_LABELS[activityType]}</Text>
                    <Text style={s.summaryTitle}>{title || 'Без названия'}</Text>
                    {placeText ? <Text style={s.summaryMeta}>📍 {placeText}</Text> : <Text style={s.summaryMetaMuted}>Место не указано</Text>}
                    {timeText ? <Text style={s.summaryMeta}>🕐 {timeText}</Text> : <Text style={s.summaryMetaMuted}>Время не указано</Text>}
                    {preMeetEnabled && <Text style={s.summaryMeta}>Встреча до: {preMeetPlace}{preMeetPlace && preMeetTime ? ', ' : ''}{preMeetTime}</Text>}
                  </View>
                </Tilt>

                <Text style={s.label}>Приглашены ({selectedCount})</Text>
                {friends.filter((f) => f.selected).map((f) => (
                  <View key={f.id} style={s.friendRow}>
                    <View style={s.friendAvatar}><Text style={s.friendLetter}>{f.name[0]}</Text></View>
                    <Text style={s.friendName}>{f.name}</Text>
                  </View>
                ))}

                <Pressable
                  style={[s.createBtn, submitting && s.btnDisabled]}
                  onPress={handleCreate}
                  activeScale={0.96}
                >
                  <Text style={s.createBtnText}>{submitting ? 'Создание...' : 'Создать план ✨'}</Text>
                </Pressable>
                {planError && <Text style={s.errorBanner}>{planError}</Text>}
              </Stagger>
            </ScrollView>
          )}

          <Confetti trigger={confettiTrigger} pieces={48} />
        </View>
      </ScreenContainer>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  heroBlock: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.select({ web: theme.spacing.xl, default: theme.spacing.xxl }),
    paddingBottom: theme.spacing.xs,
  },
  eyebrow: {
    fontFamily: theme.fonts.displayMedium,
    fontSize: 11,
    letterSpacing: 4,
    color: theme.colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: Platform.OS === 'web' ? 44 : 36,
    lineHeight: Platform.OS === 'web' ? 48 : 40,
    color: theme.colors.primaryDark,
    letterSpacing: -1.8,
  },
  stepperRow: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: theme.borderRadius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.15)',
    ...Platform.select({ web: { backdropFilter: 'blur(16px)' } as any }),
  },
  stepperInner: { flexDirection: 'row', position: 'relative' },
  stepIndicator: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.primary },
  stepBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stepLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, fontWeight: '700', letterSpacing: 0.3 },
  stepLabelActive: { color: theme.colors.textInverse },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, ...Platform.select({ web: { paddingBottom: theme.spacing.xxl } }) },
  linkedBanner: { backgroundColor: theme.colors.primaryLight + '22', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.primary + '33' },
  linkedText: { ...theme.typography.caption, color: theme.colors.primaryDark, fontWeight: '600' },
  label: { ...theme.typography.h4, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md, ...Platform.select({ web: { marginTop: theme.spacing.sm } }) },
  hint: { ...theme.typography.caption, color: theme.colors.textTertiary, fontWeight: '400' },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  activityTilt: {},
  activityBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.15)' },
  activityBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  activityIcon: { fontSize: 16 },
  activityIconActive: {},
  activityLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, fontWeight: '700' },
  activityLabelActive: { color: theme.colors.textInverse, fontWeight: '800' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.18)',
    marginBottom: theme.spacing.md,
    ...Platform.select({ web: { padding: theme.spacing.md, marginBottom: theme.spacing.sm, backdropFilter: 'blur(8px)' } as any }),
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: theme.spacing.md },
  groupTilt: {},
  groupCard: { backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.15)' },
  groupCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '22' },
  groupName: { ...theme.typography.bodyBold, color: theme.colors.textPrimary },
  groupNameActive: { color: theme.colors.primaryDark },
  groupMeta: { ...theme.typography.caption, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: theme.spacing.lg },
  selectedCount: { ...theme.typography.caption, color: theme.colors.primary, fontWeight: '700' },
  friendTilt: {},
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: 'rgba(108,92,231,0.10)', ...Platform.select({ web: { paddingVertical: theme.spacing.sm } }) },
  friendRowActive: { backgroundColor: theme.colors.primaryLight + '20', borderColor: theme.colors.primary + '55' },
  friendAvatar: { width: Platform.select({ web: 32, default: 40 }), height: Platform.select({ web: 32, default: 40 }), borderRadius: Platform.select({ web: 16, default: 20 }), backgroundColor: theme.colors.primaryLight + '44', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md },
  friendLetter: { fontSize: Platform.select({ web: 14, default: 18 }), fontWeight: '800', color: theme.colors.primaryDark },
  friendName: { ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 },
  friendNameActive: { color: theme.colors.primaryDark, fontWeight: '700' },
  checkMark: { ...theme.typography.h3, color: theme.colors.primary, fontWeight: '800' },
  nextBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingVertical: theme.spacing.lg, alignItems: 'center', marginTop: theme.spacing.xl, ...Platform.select({ web: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.lg } }) },
  nextBtnText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  nextBtnTextDisabled: { opacity: 0.4 },
  btnDisabled: { opacity: 0.55 },
  summaryTilt: {},
  summaryCard: { backgroundColor: 'rgba(255,255,255,0.86)', borderRadius: theme.borderRadius.xl, padding: theme.spacing.xl, marginBottom: theme.spacing.lg, borderWidth: 1, borderColor: 'rgba(108,92,231,0.18)', ...theme.shadows.md, ...Platform.select({ web: { backdropFilter: 'blur(14px)' } as any }) },
  summaryActivity: { ...theme.typography.caption, color: theme.colors.primary, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: theme.spacing.sm },
  summaryTitle: { fontFamily: theme.fonts.display, fontSize: 24, lineHeight: 28, color: theme.colors.primaryDark, letterSpacing: -0.6, marginBottom: theme.spacing.sm },
  summaryMeta: { ...theme.typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  summaryMetaMuted: { ...theme.typography.caption, color: theme.colors.textTertiary, fontStyle: 'italic', marginBottom: theme.spacing.xs },
  createBtn: { backgroundColor: theme.colors.going, borderRadius: theme.borderRadius.full, paddingVertical: theme.spacing.xl, alignItems: 'center', marginTop: theme.spacing.xl, ...theme.shadows.md, ...Platform.select({ web: { paddingVertical: theme.spacing.lg } }) },
  createBtnText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 18, letterSpacing: 0.4, ...Platform.select({ web: { fontSize: 16 } }) },
  errorBanner: { ...theme.typography.caption, color: theme.colors.error, textAlign: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.error + '22', marginTop: theme.spacing.md, borderRadius: theme.borderRadius.md },
  emptyHint: { ...theme.typography.caption, color: theme.colors.textTertiary, textAlign: 'center', marginTop: theme.spacing.md },
});

