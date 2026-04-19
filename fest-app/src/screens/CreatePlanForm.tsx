import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Platform, Alert } from 'react-native';
import { theme } from '../theme';
import { useAuthStore } from '../stores/authStore';
import { usePlansStore } from '../stores/plansStore';
import { useGroupsStore } from '../stores/groupsStore';
import { useInvitationsStore } from '../stores/invitationsStore';
import { ACTIVITY_LABELS, type ActivityType, type Plan } from '../types';
import { mockUsers } from '../mocks';
import { ScreenContainer } from '../components/ScreenContainer';

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
  onDone: (newPlanId: string) => void;
  preselectedGroupIds?: string[];
}

export const CreatePlanForm = ({ linkedEventId, linkedEventTitle, linkedEventVenue, linkedEventTime, onDone, preselectedGroupIds }: Props) => {
  const user = useAuthStore((s) => s.user);
  const addPlan = usePlansStore((s) => s.addPlan);
  const apiCreatePlan = usePlansStore((s) => s.apiCreatePlan);
  const groups = useGroupsStore((s) => s.groups);
  const addInvitation = useInvitationsStore((s) => s.addInvitation);

  const isFromEvent = !!linkedEventId;

  const [activityType, setActivityType] = useState<ActivityType>(isFromEvent ? 'other' : 'cinema');
  const [title, setTitle] = useState(linkedEventTitle ?? '');
  const [placeText, setPlaceText] = useState(linkedEventVenue ?? '');
  const [timeText, setTimeText] = useState(linkedEventTime ?? '');
  const [preMeetEnabled, setPreMeetEnabled] = useState(false);
  const [preMeetPlace, setPreMeetPlace] = useState('');
  const [preMeetTime, setPreMeetTime] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>(
    (() => {
      const base = mockUsers.filter((u) => u.id !== 'me').map((u) => ({ id: u.id, name: u.name, selected: false }));
      if (preselectedGroupIds?.length) {
        const memberIds = new Set<string>();
        preselectedGroupIds.forEach((gid) => {
          const group = groups.find((g) => g.id === gid);
          (group?.members ?? []).forEach((m) => { if (m.user_id !== 'me') memberIds.add(m.user_id); });
        });
        return base.map((f) => ({ ...f, selected: memberIds.has(f.id) }));
      }
      return base;
    })()
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(preselectedGroupIds?.[0] ?? null);
  const [step, setStep] = useState<'details' | 'people' | 'confirm'>(isFromEvent || !!preselectedGroupIds?.length ? 'people' : 'details');

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
      const memberIds = new Set((group?.members ?? []).map((m) => m.user_id));
      setFriends((prev) => prev.map((f) => ({ ...f, selected: memberIds.has(f.id) })));
    }
  };

  const selectedCount = friends.filter((f) => f.selected).length;

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    const selectedFriendIds = friends.filter((f) => f.selected).map((f) => f.id);
    if (1 + selectedFriendIds.length > MAX_PARTICIPANTS) {
      Alert.alert('Слишком много участников', `Максимум ${MAX_PARTICIPANTS} участников, включая вас`);
      return;
    }

    const participants = friends
      .filter((f) => f.selected)
      .map((f) => ({
        id: `pp-${Date.now()}-${f.id}`,
        plan_id: '',
        user_id: f.id,
        status: 'invited' as const,
        joined_at: new Date().toISOString(),
        user: mockUsers.find((u) => u.id === f.id),
      }));

    const planId = `plan-${Date.now()}`;

    const plan: Plan = {
      id: planId,
      creator_id: user.id,
      title: title.trim(),
      activity_type: activityType,
      linked_event_id: linkedEventId ?? null,
      place_status: placeText.trim() ? 'confirmed' : 'undecided',
      time_status: timeText.trim() ? 'confirmed' : 'undecided',
      confirmed_place_text: placeText.trim() || null,
      confirmed_place_lat: null,
      confirmed_place_lng: null,
      confirmed_time: timeText.trim() || null,
      lifecycle_state: 'active',
      pre_meet_enabled: preMeetEnabled,
      pre_meet_place_text: preMeetEnabled ? preMeetPlace.trim() || null : null,
      pre_meet_time: preMeetEnabled ? preMeetTime.trim() || null : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants: [
        { id: `pp-me-${Date.now()}`, plan_id: '', user_id: user.id, status: 'going', joined_at: new Date().toISOString(), user },
        ...participants,
      ],
      proposals: [],
    };

    addPlan(plan);
    selectedFriendIds.forEach((friendId) => {
      addInvitation('plan', planId, user.id, friendId);
    });

    try {
      const apiPlanId = await apiCreatePlan({
        title: title.trim(),
        activity_type: activityType,
        linked_event_id: linkedEventId ?? undefined,
        confirmed_place_text: placeText.trim() || undefined,
        confirmed_time: timeText.trim() || undefined,
        pre_meet_enabled: preMeetEnabled,
        pre_meet_place_text: preMeetEnabled ? preMeetPlace.trim() || undefined : undefined,
        pre_meet_time: preMeetEnabled ? preMeetTime.trim() || undefined : undefined,
        participant_ids: selectedFriendIds,
      });
      onDone(apiPlanId || planId);
    } catch {
      onDone(planId);
    }
  };

  const activities: ActivityType[] = ['cinema', 'coffee', 'bar', 'walk', 'dinner', 'sport', 'exhibition', 'other'];

  return (
    <ScreenContainer>
      <View style={s.container}>
        <View style={s.stepRow}>
          {['details', 'people', 'confirm'].map((sKey, i) => {
            const labels = ['Детали', 'Люди', 'Готово'];
            const isActive = step === sKey || (step === 'people' && i === 0 && isFromEvent) ? true : false;
            const isPast = (step === 'people' && sKey === 'details') || (step === 'confirm' && (sKey === 'details' || sKey === 'people'));
            return (
              <TouchableOpacity key={sKey} style={[s.stepDot, (isActive || isPast) && s.stepDotActive]} onPress={() => {
                if (sKey === 'details' && !isFromEvent) setStep('details');
                if (sKey === 'people') setStep('people');
                if (sKey === 'confirm' && selectedCount > 0) setStep('confirm');
              }}>
                <Text style={[s.stepLabel, (isActive || isPast) && s.stepLabelActive]}>{labels[i]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {step === 'details' && (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {isFromEvent && (
              <View style={s.linkedBanner}>
                <Text style={s.linkedText}>📎 {linkedEventTitle}</Text>
              </View>
            )}
            <Text style={s.label}>Тип активности</Text>
            <View style={s.activityGrid}>
              {activities.map((act) => (
                <TouchableOpacity key={act} style={[s.activityBtn, activityType === act && s.activityBtnActive]} onPress={() => setActivityType(act)}>
                  <Text style={[s.activityLabel, activityType === act && s.activityLabelActive]}>{ACTIVITY_LABELS[act]}</Text>
                </TouchableOpacity>
              ))}
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

            <TouchableOpacity style={s.nextBtn} onPress={() => setStep('people')}>
              <Text style={s.nextBtnText}>Далее →</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'people' && (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {groups.length > 0 && (
              <>
                <Text style={s.label}>Группы</Text>
                {groups.map((g) => (
                  <TouchableOpacity key={g.id} style={[s.groupCard, selectedGroupId === g.id && s.groupCardActive]} onPress={() => selectGroup(g.id)}>
                    <Text style={[s.groupName, selectedGroupId === g.id && s.groupNameActive]}>{g.name}</Text>
                    <Text style={s.groupMeta}>{g.members?.length ?? 0} чел.</Text>
                  </TouchableOpacity>
                ))}
                <View style={s.divider} />
              </>
            )}
            <Text style={s.label}>Друзья {selectedCount > 0 && <Text style={s.selectedCount}>({selectedCount})</Text>}</Text>
            {friends.map((f) => (
              <TouchableOpacity key={f.id} style={[s.friendRow, f.selected && s.friendRowActive]} onPress={() => toggleFriend(f.id)}>
                <View style={s.friendAvatar}>
                  <Text style={s.friendLetter}>{f.name[0]}</Text>
                </View>
                <Text style={[s.friendName, f.selected && s.friendNameActive]}>{f.name}</Text>
                <Text style={s.checkMark}>{f.selected ? '✓' : ''}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.nextBtn} onPress={() => selectedCount > 0 ? setStep('confirm') : null} disabled={selectedCount === 0}>
              <Text style={[s.nextBtnText, selectedCount === 0 && s.nextBtnTextDisabled]}>Далее →</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'confirm' && (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            <Text style={s.label}>План</Text>
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>{title || 'Без названия'}</Text>
              <Text style={s.summaryMeta}>{ACTIVITY_LABELS[activityType]}</Text>
              {placeText ? <Text style={s.summaryMeta}>📍 {placeText}</Text> : <Text style={s.summaryMetaMuted}>Место не указано</Text>}
              {timeText ? <Text style={s.summaryMeta}>🕐 {timeText}</Text> : <Text style={s.summaryMetaMuted}>Время не указано</Text>}
              {preMeetEnabled && <Text style={s.summaryMeta}>Встреча до: {preMeetPlace}{preMeetPlace && preMeetTime ? ', ' : ''}{preMeetTime}</Text>}
            </View>

            <Text style={s.label}>Приглашены ({selectedCount})</Text>
            {friends.filter((f) => f.selected).map((f) => (
              <View key={f.id} style={s.friendRow}>
                <View style={s.friendAvatar}><Text style={s.friendLetter}>{f.name[0]}</Text></View>
                <Text style={s.friendName}>{f.name}</Text>
              </View>
            ))}

            <TouchableOpacity style={s.createBtn} onPress={handleCreate}>
              <Text style={s.createBtnText}>Создать план</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.md, ...Platform.select({ web: { paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm } }) },
  stepDot: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  stepDotActive: { backgroundColor: theme.colors.primary },
  stepLabel: { ...theme.typography.caption, color: theme.colors.textTertiary },
  stepLabelActive: { color: theme.colors.textInverse, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, ...Platform.select({ web: { paddingBottom: theme.spacing.xxl } }) },
  linkedBanner: { backgroundColor: theme.colors.primaryLight + '15', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.lg },
  linkedText: { ...theme.typography.caption, color: theme.colors.primary },
  label: { ...theme.typography.h4, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md, ...Platform.select({ web: { marginTop: theme.spacing.sm } }) },
  hint: { ...theme.typography.caption, color: theme.colors.textTertiary, fontWeight: '400' },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  activityBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  activityBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  activityLabel: { ...theme.typography.caption, color: theme.colors.textSecondary },
  activityLabelActive: { color: theme.colors.textInverse, fontWeight: '600' },
  input: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, fontSize: 16, color: theme.colors.textPrimary, borderWidth: 1, borderColor: theme.colors.borderLight, marginBottom: theme.spacing.md, ...Platform.select({ web: { padding: theme.spacing.md, marginBottom: theme.spacing.sm } }) },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: theme.spacing.md },
  groupCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.borderLight },
  groupCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '11' },
  groupName: { ...theme.typography.bodyBold, color: theme.colors.textPrimary },
  groupNameActive: { color: theme.colors.primary },
  groupMeta: { ...theme.typography.caption, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: theme.spacing.lg },
  selectedCount: { ...theme.typography.caption, color: theme.colors.primary },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, ...Platform.select({ web: { paddingVertical: theme.spacing.sm } }) },
  friendRowActive: { backgroundColor: theme.colors.primaryLight + '15' },
  friendAvatar: { width: Platform.select({ web: 32, default: 40 }), height: Platform.select({ web: 32, default: 40 }), borderRadius: Platform.select({ web: 16, default: 20 }), backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md },
  friendLetter: { fontSize: Platform.select({ web: 14, default: 18 }), fontWeight: '700', color: theme.colors.primary },
  friendName: { ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 },
  friendNameActive: { color: theme.colors.primary, fontWeight: '600' },
  checkMark: { ...theme.typography.h4, color: theme.colors.primary },
  nextBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: theme.spacing.lg, alignItems: 'center', marginTop: theme.spacing.xl, ...Platform.select({ web: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.lg } }) },
  nextBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },
  nextBtnTextDisabled: { opacity: 0.4 },
  summaryCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.lg, ...theme.shadows.sm },
  summaryTitle: { ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  summaryMeta: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  summaryMetaMuted: { ...theme.typography.caption, color: theme.colors.textTertiary, fontStyle: 'italic', marginBottom: theme.spacing.xs },
  createBtn: { backgroundColor: theme.colors.going, borderRadius: theme.borderRadius.md, paddingVertical: theme.spacing.xl, alignItems: 'center', marginTop: theme.spacing.xl, ...Platform.select({ web: { paddingVertical: theme.spacing.lg } }) },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 18, ...Platform.select({ web: { fontSize: 16 } }) },
});
