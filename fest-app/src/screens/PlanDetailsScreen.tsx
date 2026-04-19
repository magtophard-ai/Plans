import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList, Modal, Platform, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { usePlansStore } from '../stores/plansStore';
import { useAuthStore } from '../stores/authStore';
import { useInvitationsStore } from '../stores/invitationsStore';
import { formatDateShort } from '../utils/dates';
import { ACTIVITY_LABELS, type ActivityType, type Plan, type PlanProposal, type PlanParticipant, type Message, type ParticipantStatus } from '../types';
import { mockUsers } from '../mocks';
import { EmptyState } from '../components/EmptyState';
import { ScreenContainer } from '../components/ScreenContainer';
import type { PlansStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<PlansStackParamList, 'PlanDetails'>;

const STATUS_LABELS: Record<string, string> = { going: 'Иду', thinking: 'Думаю', cant: 'Не могу', invited: 'Приглашение' };
const STATUS_COLORS: Record<string, string> = { going: theme.colors.going, thinking: theme.colors.thinking, cant: theme.colors.cant, invited: theme.colors.invited };
const MAX_VOTES_PER_TYPE = 2;

export const PlanDetailsScreen = ({ route, navigation }: Props) => {
  const { planId } = route.params;
  const plans = usePlansStore((s) => s.plans);
  const messages = usePlansStore((s) => s.messages);
  const { updateParticipantStatus, addProposal, vote, unvote, finalizePlan, unfinalizePlan, cancelPlan, completePlan, addMessage, addPlan, inviteParticipant, removeParticipant, leavePlan, fetchPlan, apiUpdateParticipantStatus, apiRemoveParticipant, apiCancelPlan, apiCompletePlan } = usePlansStore();
  const addInvitation = useInvitationsStore((s) => s.addInvitation);
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'details' | 'chat'>('details');
  const [chatInput, setChatInput] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);

  React.useEffect(() => { fetchPlan(planId); }, [planId]);

  const plan = plans.find((p) => p.id === planId);
  if (!plan || !user) return <ScreenContainer><View style={s.inner}><EmptyState text="План не найден" /></View></ScreenContainer>;

  const isCreator = plan.creator_id === user.id;
  const myParticipation = plan.participants?.find((p) => p.user_id === user.id);
  const planMessages = messages[planId] || [];

  const handleSend = () => {
    if (!chatInput.trim()) return;
    addMessage(planId, {
      id: `msg-${Date.now()}`,
      context_type: 'plan',
      context_id: planId,
      sender_id: user.id,
      text: chatInput.trim(),
      type: 'user',
      reference_id: null,
      created_at: new Date().toISOString(),
      sender: user,
    });
    setChatInput('');
  };

  const handleSetStatus = (status: ParticipantStatus) => {
    if (myParticipation) apiUpdateParticipantStatus(planId, user.id, status);
  };

  const handleInviteFriend = (friendId: string) => {
    inviteParticipant(planId, friendId);
    addInvitation('plan', planId, user.id, friendId);
    setShowInviteModal(false);
  };

  const handleRemoveParticipant = (userId: string) => {
    Alert.alert('Удалить участника', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => apiRemoveParticipant(planId, userId) },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Покинуть план', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Покинуть', style: 'destructive', onPress: () => { apiRemoveParticipant(planId, user!.id); navigation.goBack(); } },
    ]);
  };

  const handleRepeat = () => {
    const newId = `plan-${Date.now()}`;
    const participants: PlanParticipant[] = (plan.participants ?? [])
      .filter((p) => p.user_id !== user.id)
      .map((p) => ({
        id: `pp-${Date.now()}-${p.user_id}`,
        plan_id: '',
        user_id: p.user_id,
        status: 'invited' as const,
        joined_at: new Date().toISOString(),
        user: p.user,
      }));

    const newPlan: Plan = {
      id: newId,
      creator_id: user.id,
      title: plan.title,
      activity_type: plan.activity_type,
      linked_event_id: null,
      place_status: 'undecided',
      time_status: 'undecided',
      confirmed_place_text: null,
      confirmed_place_lat: null,
      confirmed_place_lng: null,
      confirmed_time: null,
      lifecycle_state: 'active',
      pre_meet_enabled: false,
      pre_meet_place_text: null,
      pre_meet_time: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants: [
        { id: `pp-me-${Date.now()}`, plan_id: '', user_id: user.id, status: 'going' as const, joined_at: new Date().toISOString(), user },
        ...participants,
      ],
      proposals: [],
    };

    addPlan(newPlan);
    participants.forEach((p) => addInvitation('plan', newId, user.id, p.user_id));
    navigation.replace('PlanDetails', { planId: newId });
  };

  const nonParticipants = mockUsers.filter(
    (u) => u.id !== user.id && !(plan.participants || []).some((p) => p.user_id === u.id)
  );

  return (
    <ScreenContainer>
      <View style={s.inner}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Назад</Text>
        </TouchableOpacity>
        <View style={s.headerRow}>
          <Text style={s.title}>{plan.title}</Text>
          <Text style={s.activity}>{ACTIVITY_LABELS[plan.activity_type]}</Text>
        </View>

        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tab, tab === 'details' && s.tabActive]} onPress={() => setTab('details')}>
            <Text style={[s.tabText, tab === 'details' && s.tabTextActive]}>Детали</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'chat' && s.tabActive]} onPress={() => setTab('chat')}>
            <Text style={[s.tabText, tab === 'chat' && s.tabTextActive]}>Чат</Text>
          </TouchableOpacity>
        </View>

        {tab === 'details' ? (
          <DetailsTab plan={plan} isCreator={isCreator} myStatus={myParticipation?.status ?? 'invited'} onSetStatus={handleSetStatus} onVote={vote} onUnvote={unvote} onFinalize={finalizePlan} onUnfinalize={unfinalizePlan} onCancel={cancelPlan} onComplete={completePlan} onAddProposal={addProposal} onRepeat={handleRepeat} onInvite={() => setShowInviteModal(true)} onRemove={isCreator ? handleRemoveParticipant : undefined} onLeave={!isCreator && myParticipation ? handleLeave : undefined} onApiCancel={apiCancelPlan} onApiComplete={apiCompletePlan} />
        ) : (
          <ChatTab messages={planMessages} input={chatInput} setInput={setChatInput} onSend={handleSend} planId={planId} onVote={vote} onUnvote={unvote} userId={user.id} />
        )}

        <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => setShowInviteModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>Пригласить в план</Text>
              {nonParticipants.length === 0 ? (
                <Text style={s.modalEmpty}>Все друзья уже в плане</Text>
              ) : (
                <FlatList data={nonParticipants} keyExtractor={(u) => u.id} renderItem={({ item }) => (
                  <TouchableOpacity style={s.inviteRow} onPress={() => handleInviteFriend(item.id)}>
                    <View style={s.inviteAvatar}><Text style={s.inviteLetter}>{item.name[0]}</Text></View>
                    <Text style={s.inviteName}>{item.name}</Text>
                    <Text style={s.invitePlus}>+</Text>
                  </TouchableOpacity>
                )} style={{ maxHeight: 300 }} />
              )}
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowInviteModal(false)}>
                <Text style={s.modalCancelText}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenContainer>
  );
};

const DetailsTab = ({ plan, isCreator, myStatus, onSetStatus, onVote, onUnvote, onFinalize, onUnfinalize, onCancel, onComplete, onAddProposal, onRepeat, onInvite, onRemove, onLeave, onApiCancel, onApiComplete }: {
  plan: Plan; isCreator: boolean; myStatus: ParticipantStatus;
  onSetStatus: (s: ParticipantStatus) => void;
  onVote: (planId: string, proposalId: string, userId: string) => void;
  onUnvote: (planId: string, proposalId: string, userId: string) => void;
  onFinalize: (planId: string, placeProposalId?: string, timeProposalId?: string) => void;
  onUnfinalize: (planId: string) => void;
  onCancel: (planId: string) => void;
  onComplete: (planId: string) => void;
  onAddProposal: (planId: string, proposal: PlanProposal) => void;
  onRepeat: () => void;
  onInvite: () => void;
  onRemove?: (userId: string) => void;
  onLeave?: () => void;
  onApiCancel: (planId: string) => void;
  onApiComplete: (planId: string) => void;
}) => {
  const user = useAuthStore((s) => s.user);
  const [propModalVisible, setPropModalVisible] = useState(false);
  const [propType, setPropType] = useState<'place' | 'time'>('place');
  const [propValue, setPropValue] = useState('');
  const [propTimeValue, setPropTimeValue] = useState('');

  const statusBtns: { key: ParticipantStatus; label: string }[] = [
    { key: 'going', label: 'Иду' },
    { key: 'thinking', label: 'Думаю' },
    { key: 'cant', label: 'Не могу' },
  ];

  const placeProposals = plan.proposals?.filter((p) => p.type === 'place' && p.status === 'active') || [];
  const timeProposals = plan.proposals?.filter((p) => p.type === 'time' && p.status === 'active') || [];
  const canPropose = plan.lifecycle_state === 'active';
  const placeUndecided = !plan.confirmed_place_text && canPropose;
  const timeUndecided = !plan.confirmed_time && canPropose;

  const myVotesForPlace = placeProposals.filter((pr) => pr.votes?.some((v) => v.voter_id === user?.id)).length;
  const myVotesForTime = timeProposals.filter((pr) => pr.votes?.some((v) => v.voter_id === user?.id)).length;

  const handleAddProposal = () => {
    if (!user) return;
    if (propType === 'place' && propValue.trim()) {
      onAddProposal(plan.id, {
        id: `prop-${Date.now()}`,
        plan_id: plan.id,
        proposer_id: user.id,
        type: 'place',
        value_text: propValue.trim(),
        value_lat: null,
        value_lng: null,
        value_datetime: null,
        status: 'active',
        created_at: new Date().toISOString(),
        votes: [],
      });
    } else if (propType === 'time' && propTimeValue.trim()) {
      onAddProposal(plan.id, {
        id: `prop-${Date.now()}`,
        plan_id: plan.id,
        proposer_id: user.id,
        type: 'time',
        value_text: propTimeValue.trim(),
        value_lat: null,
        value_lng: null,
        value_datetime: propTimeValue.trim(),
        status: 'active',
        created_at: new Date().toISOString(),
        votes: [],
      });
    }
    setPropValue('');
    setPropTimeValue('');
    setPropModalVisible(false);
  };

  const isCompleted = plan.lifecycle_state === 'completed';
  const isCancelled = plan.lifecycle_state === 'cancelled';

  return (
    <>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {plan.linked_event && (
          <TouchableOpacity style={s.linkedEvent} onPress={() => {}}>
            <Text style={s.linkedText}>📎 {plan.linked_event.title}</Text>
          </TouchableOpacity>
        )}

        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Участники</Text>
          {isCreator && canPropose && (
            <TouchableOpacity style={s.addPropBtn} onPress={onInvite}>
              <Text style={s.addPropBtnText}>+ Пригласить</Text>
            </TouchableOpacity>
          )}
        </View>
        {plan.participants?.map((p) => (
          <View key={p.id} style={s.participantRow}>
            <Text style={s.participantName}>{p.user?.name ?? '???'}{p.user_id === plan.creator_id ? ' (создатель)' : ''}</Text>
            <View style={s.participantRight}>
              <Text style={[s.statusBadge, { backgroundColor: STATUS_COLORS[p.status] + '22', color: STATUS_COLORS[p.status] }]}>{STATUS_LABELS[p.status]}</Text>
              {isCreator && p.user_id !== plan.creator_id && onRemove && (
                <TouchableOpacity onPress={() => onRemove(p.user_id)} style={s.removeBtn}>
                  <Text style={s.removeBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {onLeave && !isCompleted && !isCancelled && (
          <TouchableOpacity style={s.leaveBtn} onPress={onLeave}>
            <Text style={s.leaveBtnText}>Покинуть план</Text>
          </TouchableOpacity>
        )}

        {!isCompleted && !isCancelled && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>Ваш статус</Text>
            <View style={s.statusRow}>
              {statusBtns.map((btn) => (
                <TouchableOpacity key={btn.key} style={[s.statusBtn, myStatus === btn.key && { backgroundColor: STATUS_COLORS[btn.key] + '22', borderColor: STATUS_COLORS[btn.key] }]} onPress={() => onSetStatus(btn.key)}>
                  <Text style={[s.statusBtnText, myStatus === btn.key && { color: STATUS_COLORS[btn.key] }]}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={s.divider} />
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Место</Text>
          {placeUndecided && (
            <TouchableOpacity style={s.addPropBtn} onPress={() => { setPropType('place'); setPropModalVisible(true); }}>
              <Text style={s.addPropBtnText}>+ Предложить</Text>
            </TouchableOpacity>
          )}
        </View>
        {plan.confirmed_place_text ? (
          <Text style={s.confirmed}>{plan.confirmed_place_text} ✓</Text>
        ) : (
          <>
            {placeProposals.map((prop) => (
              <ProposalCard key={prop.id} proposal={prop} userId={user?.id ?? ''} planId={plan.id} onVote={onVote} onUnvote={onUnvote} isCreator={isCreator} onFinalize={onFinalize} proposalType="place" votesUsed={myVotesForPlace} maxVotes={MAX_VOTES_PER_TYPE} />
            ))}
            {placeProposals.length === 0 && <Text style={s.undecided}>Ещё не предложено</Text>}
          </>
        )}

        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Время</Text>
          {timeUndecided && (
            <TouchableOpacity style={s.addPropBtn} onPress={() => { setPropType('time'); setPropModalVisible(true); }}>
              <Text style={s.addPropBtnText}>+ Предложить</Text>
            </TouchableOpacity>
          )}
        </View>
        {plan.confirmed_time ? (
          <Text style={s.confirmed}>{formatDateShort(plan.confirmed_time)} ✓</Text>
        ) : (
          <>
            {timeProposals.map((prop) => (
              <ProposalCard key={prop.id} proposal={prop} userId={user?.id ?? ''} planId={plan.id} onVote={onVote} onUnvote={onUnvote} isCreator={isCreator} onFinalize={onFinalize} proposalType="time" votesUsed={myVotesForTime} maxVotes={MAX_VOTES_PER_TYPE} />
            ))}
            {timeProposals.length === 0 && <Text style={s.undecided}>Ещё не предложено</Text>}
          </>
        )}

        {plan.pre_meet_enabled && (
          <>
            <View style={s.divider} />
            <Text style={s.sectionTitle}>Встреча до</Text>
            {plan.pre_meet_place_text && <Text style={s.meta}>{plan.pre_meet_place_text}</Text>}
            {plan.pre_meet_time && <Text style={s.meta}>{formatDateShort(plan.pre_meet_time)}</Text>}
          </>
        )}

        {isCreator && !isCompleted && !isCancelled && (
          <View style={s.divider}>
            {plan.lifecycle_state === 'active' && plan.place_status === 'confirmed' && plan.time_status === 'confirmed' && (
              <TouchableOpacity style={s.finalizeBtn} onPress={() => onFinalize(plan.id)}>
                <Text style={s.finalizeBtnText}>Подтвердить план</Text>
              </TouchableOpacity>
            )}
            {plan.lifecycle_state === 'finalized' && (
              <TouchableOpacity style={s.unfinalizeBtn} onPress={() => onUnfinalize(plan.id)}>
                <Text style={s.unfinalizeBtnText}>Отменить подтверждение</Text>
              </TouchableOpacity>
            )}
            {plan.lifecycle_state === 'active' && !(plan.place_status === 'confirmed' && plan.time_status === 'confirmed') && (
              <TouchableOpacity style={s.completeBtn} onPress={() => onApiComplete(plan.id)}>
                <Text style={s.completeBtnText}>Завершить план</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.cancelBtn} onPress={() => onApiCancel(plan.id)}>
              <Text style={s.cancelBtnText}>Отменить план</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCancelled && (
          <View style={s.cancelledBanner}>
            <Text style={s.cancelledText}>План отменён</Text>
          </View>
        )}

        {isCompleted && (
          <TouchableOpacity style={s.repeatBtn} onPress={onRepeat}>
            <Text style={s.repeatBtnText}>Повторить</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={propModalVisible} transparent animationType="slide" onRequestClose={() => setPropModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>{propType === 'place' ? 'Предложить место' : 'Предложить время'}</Text>
            {propType === 'place' ? (
              <TextInput style={s.modalInput} placeholder="Название места" placeholderTextColor={theme.colors.textTertiary} value={propValue} onChangeText={setPropValue} autoFocus />
            ) : (
              <TextInput style={s.modalInput} placeholder="Например: Суббота 18:00" placeholderTextColor={theme.colors.textTertiary} value={propTimeValue} onChangeText={setPropTimeValue} autoFocus />
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setPropModalVisible(false)}>
                <Text style={s.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSubmitBtn} onPress={handleAddProposal}>
                <Text style={s.modalSubmitText}>Предложить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const ProposalCard = ({ proposal, userId, planId, onVote, onUnvote, isCreator, onFinalize, proposalType, votesUsed, maxVotes }: {
  proposal: PlanProposal; userId: string; planId: string;
  onVote: (planId: string, proposalId: string, userId: string) => void;
  onUnvote: (planId: string, proposalId: string, userId: string) => void;
  isCreator: boolean; onFinalize: (planId: string, placeProposalId?: string, timeProposalId?: string) => void;
  proposalType: 'place' | 'time';
  votesUsed: number;
  maxVotes: number;
}) => {
  const hasVoted = proposal.votes?.some((v) => v.voter_id === userId);
  const voteCount = proposal.votes?.length ?? 0;
  const canVote = !hasVoted && votesUsed < maxVotes;

  return (
    <View style={s.proposalCard}>
      <Text style={s.proposalValue}>{proposal.type === 'time' && proposal.value_datetime ? formatDateShort(proposal.value_datetime) : proposal.value_text}</Text>
      <View style={s.proposalActions}>
        <TouchableOpacity
          style={[s.voteBtn, hasVoted && s.voteBtnActive, !hasVoted && !canVote && s.voteBtnDisabled]}
          onPress={() => hasVoted ? onUnvote(planId, proposal.id, userId) : canVote ? onVote(planId, proposal.id, userId) : null}
          disabled={!hasVoted && !canVote}
        >
          <Text style={s.voteBtnText}>{hasVoted ? '✓' : '👍'} {voteCount}</Text>
        </TouchableOpacity>
        {isCreator && (
          <TouchableOpacity style={s.pickBtn} onPress={() => onFinalize(planId, proposalType === 'place' ? proposal.id : undefined, proposalType === 'time' ? proposal.id : undefined)}>
            <Text style={s.pickBtnText}>Выбрать</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const ChatTab = ({ messages: msgs, input, setInput, onSend, planId, onVote, onUnvote, userId }: { messages: Message[]; input: string; setInput: (v: string) => void; onSend: () => void; planId: string; onVote: (planId: string, proposalId: string, userId: string) => void; onUnvote: (planId: string, proposalId: string, userId: string) => void; userId: string }) => {
  const plans = usePlansStore((s) => s.plans);
  const plan = plans.find((p) => p.id === planId);

  const getProposal = (refId: string) => plan?.proposals?.find((pr) => pr.id === refId);

  return (
    <View style={s.chatContainer}>
      <FlatList data={[...msgs].reverse()} keyExtractor={(m) => m.id} renderItem={({ item }) => {
        if (item.type === 'proposal_card' && item.reference_id) {
          const prop = getProposal(item.reference_id);
          return (
            <View style={s.msgProposalCard}>
              <Text style={s.msgProposalLabel}>{prop?.type === 'place' ? '📍 Место' : '🕐 Время'}</Text>
              <Text style={s.msgProposalValue}>{prop?.value_text ?? 'Предложение'}</Text>
              {prop && prop.status === 'active' && (
                <View style={s.msgProposalActions}>
                  <TouchableOpacity
                    style={[s.voteBtn, prop.votes?.some((v) => v.voter_id === userId) && s.voteBtnActive]}
                    onPress={() => prop.votes?.some((v) => v.voter_id === userId) ? onUnvote(planId, prop.id, userId) : onVote(planId, prop.id, userId)}
                  >
                    <Text style={s.voteBtnText}>{prop.votes?.some((v) => v.voter_id === userId) ? '✓' : '👍'} {prop.votes?.length ?? 0}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }
        if (item.type === 'system') {
          return (
            <View style={[s.msgBubble, s.msgSystem]}>
              <Text style={s.msgText}>{item.text}</Text>
            </View>
          );
        }
        return (
          <View style={s.msgBubble}>
            <Text style={s.msgSender}>{item.sender?.name ?? ''}</Text>
            <Text style={s.msgText}>{item.text}</Text>
          </View>
        );
      }} contentContainerStyle={s.chatList} inverted ListEmptyComponent={<EmptyState text="Нет сообщений" />} />
      <View style={s.chatInputRow}>
        <TextInput style={s.chatInput} placeholder="Сообщение..." placeholderTextColor={theme.colors.textTertiary} value={input} onChangeText={setInput} />
        <TouchableOpacity style={s.sendBtn} onPress={onSend}>
          <Text style={s.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  inner: { flex: 1, backgroundColor: theme.colors.background },
  backBtn: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xs, ...Platform.select({ web: { paddingTop: theme.spacing.lg } }) },
  backText: { ...theme.typography.body, color: theme.colors.primary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  title: { ...theme.typography.h3, color: theme.colors.textPrimary, flex: 1 },
  activity: { ...theme.typography.caption, color: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '22', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full },
  tabRow: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, gap: theme.spacing.sm },
  tab: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.textInverse, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, ...Platform.select({ web: { paddingBottom: theme.spacing.xxl } }) },
  linkedEvent: { backgroundColor: theme.colors.primaryLight + '15', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.lg },
  linkedText: { ...theme.typography.caption, color: theme.colors.primary },
  sectionTitle: { ...theme.typography.h4, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: theme.spacing.sm },
  addPropBtn: { backgroundColor: theme.colors.primaryLight + '22', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, marginTop: theme.spacing.sm },
  addPropBtnText: { ...theme.typography.small, color: theme.colors.primary, fontWeight: '600' },
  participantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Platform.select({ web: 2, default: theme.spacing.xs }) },
  participantName: { ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 },
  participantRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  statusBadge: { ...theme.typography.small, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full, overflow: 'hidden', fontWeight: '600' },
  removeBtn: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  removeBtnText: { color: theme.colors.error, fontSize: 14, fontWeight: '600' },
  leaveBtn: { marginTop: theme.spacing.md, paddingVertical: theme.spacing.md, borderRadius: theme.borderRadius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  leaveBtnText: { ...theme.typography.body, color: theme.colors.error },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: theme.spacing.lg, ...Platform.select({ web: { marginVertical: theme.spacing.md } }) },
  statusRow: { flexDirection: 'row', gap: theme.spacing.sm },
  statusBtn: { flex: 1, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center' },
  statusBtnText: { ...theme.typography.body, color: theme.colors.textSecondary },
  confirmed: { ...theme.typography.body, color: theme.colors.going, fontWeight: '600' },
  undecided: { ...theme.typography.caption, color: theme.colors.textTertiary, fontStyle: 'italic' },
  proposalCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.borderLight, ...theme.shadows.sm },
  proposalValue: { ...theme.typography.body, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  proposalActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  voteBtn: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  voteBtnActive: { backgroundColor: theme.colors.primaryLight + '22', borderColor: theme.colors.primaryLight },
  voteBtnDisabled: { opacity: 0.4 },
  voteBtnText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  pickBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  pickBtnText: { color: theme.colors.textInverse, fontWeight: '600', fontSize: 13 },
  finalizeBtn: { backgroundColor: theme.colors.going, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), alignItems: 'center', marginBottom: theme.spacing.md },
  finalizeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  unfinalizeBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  unfinalizeBtnText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 15 },
  completeBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  completeBtnText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 15 },
  cancelBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.lg }), alignItems: 'center' },
  cancelBtnText: { color: theme.colors.error, fontWeight: '600', fontSize: 15 },
  cancelledBanner: { backgroundColor: theme.colors.error + '15', borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', marginTop: theme.spacing.lg },
  cancelledText: { ...theme.typography.body, color: theme.colors.error, fontWeight: '600' },
  repeatBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: Platform.select({ web: theme.spacing.md, default: theme.spacing.xl }), alignItems: 'center', marginTop: theme.spacing.lg },
  repeatBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: Platform.select({ web: 16, default: 18 }) },
  meta: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xxl, borderTopRightRadius: theme.borderRadius.xxl, padding: theme.spacing.xxl, ...Platform.select({ web: { padding: theme.spacing.lg } }) },
  modalTitle: { ...theme.typography.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  modalInput: { backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, fontSize: 16, color: theme.colors.textPrimary, borderWidth: 1, borderColor: theme.colors.borderLight, marginBottom: theme.spacing.lg },
  modalActions: { flexDirection: 'row', gap: theme.spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: theme.spacing.lg, borderRadius: theme.borderRadius.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  modalCancelText: { ...theme.typography.body, color: theme.colors.textSecondary },
  modalSubmitBtn: { flex: 1, backgroundColor: theme.colors.primary, paddingVertical: theme.spacing.lg, borderRadius: theme.borderRadius.md, alignItems: 'center' },
  modalSubmitText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },
  modalEmpty: { ...theme.typography.body, color: theme.colors.textTertiary, textAlign: 'center', paddingVertical: theme.spacing.xl },
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  inviteAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryLight + '33', alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md },
  inviteLetter: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  inviteName: { ...theme.typography.body, color: theme.colors.textPrimary, flex: 1 },
  invitePlus: { ...theme.typography.h4, color: theme.colors.primary },
  chatContainer: { flex: 1 },
  chatList: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, ...Platform.select({ web: { paddingVertical: theme.spacing.xs } }) },
  msgBubble: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), marginBottom: theme.spacing.sm, ...theme.shadows.sm },
  msgSystem: { backgroundColor: theme.colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: theme.colors.primaryLight },
  msgProposalCard: { backgroundColor: theme.colors.primaryLight + '11', borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.primaryLight + '33' },
  msgProposalLabel: { ...theme.typography.caption, color: theme.colors.primary, marginBottom: theme.spacing.xs, fontWeight: '600' },
  msgProposalValue: { ...theme.typography.body, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  msgProposalActions: { flexDirection: 'row', gap: theme.spacing.sm },
  msgSender: { ...theme.typography.captionBold, color: theme.colors.primary, marginBottom: 2 },
  msgText: { ...theme.typography.body, color: theme.colors.textPrimary },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), borderTopWidth: 1, borderTopColor: theme.colors.borderLight, backgroundColor: theme.colors.surface, gap: theme.spacing.sm },
  chatInput: { flex: 1, backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: Platform.select({ web: theme.spacing.sm, default: theme.spacing.md }), fontSize: 15, color: theme.colors.textPrimary },
  sendBtn: { backgroundColor: theme.colors.primary, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: theme.colors.textInverse, fontSize: 18, fontWeight: '700' },
});
