import { api, camelize } from './client';
import type { Plan, ParticipantStatus, PlanProposal, Message } from '../types';

interface PlansResponse {
  plans: Plan[];
  total: number;
}

export const fetchPlans = (params?: { lifecycle?: string; participant?: string }) => {
  const qs = new URLSearchParams();
  if (params?.lifecycle) qs.set('lifecycle', params.lifecycle);
  if (params?.participant) qs.set('participant', params.participant);
  const q = qs.toString();
  return api<PlansResponse>(`/plans${q ? '?' + q : ''}`).then((r) => camelize<PlansResponse>(r));
};

export const fetchPlan = (id: string) =>
  api<{ plan: Plan }>(`/plans/${id}`).then((r) => camelize<{ plan: Plan }>(r).plan);

export const createPlan = (data: {
  title: string;
  activity_type: string;
  linked_event_id?: string;
  confirmed_place_text?: string;
  confirmed_time?: string;
  pre_meet_enabled?: boolean;
  pre_meet_place_text?: string;
  pre_meet_time?: string;
  participant_ids: string[];
}) => api<{ plan: Plan }>('/plans', { method: 'POST', body: data }).then((r) => camelize<{ plan: Plan }>(r).plan);

export const updateParticipantStatus = (planId: string, userId: string, status: ParticipantStatus) =>
  api(`/plans/${planId}/participants/${userId}`, { method: 'PATCH', body: { status } });

export const removeParticipant = (planId: string, userId: string) =>
  api(`/plans/${planId}/participants/${userId}`, { method: 'DELETE' });

export const cancelPlan = (planId: string) =>
  api(`/plans/${planId}/cancel`, { method: 'POST' });

export const completePlan = (planId: string) =>
  api(`/plans/${planId}/complete`, { method: 'POST' });

export const fetchProposals = (planId: string, type?: string, status?: string) => {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (status) qs.set('status', status);
  const q = qs.toString();
  return api<{ proposals: PlanProposal[] }>(`/plans/${planId}/proposals${q ? '?' + q : ''}`).then((r) => camelize<{ proposals: PlanProposal[] }>(r));
};

export const createProposal = (planId: string, data: {
  type: string;
  value_text: string;
  value_lat?: number;
  value_lng?: number;
  value_datetime?: string;
}) => api<{ proposal: PlanProposal }>(`/plans/${planId}/proposals`, { method: 'POST', body: data }).then((r) => camelize<{ proposal: PlanProposal }>(r));

export const voteOnProposal = (planId: string, proposalId: string) =>
  api<{ vote: { id: string; proposal_id: string; voter_id: string; created_at: string } }>(`/plans/${planId}/proposals/${proposalId}/vote`, { method: 'POST' });

export const unvoteProposal = (planId: string, proposalId: string) =>
  api(`/plans/${planId}/proposals/${proposalId}/vote`, { method: 'DELETE' });

export const finalizePlan = (planId: string, placeProposalId?: string, timeProposalId?: string) => {
  const body: Record<string, string> = {};
  if (placeProposalId) body.place_proposal_id = placeProposalId;
  if (timeProposalId) body.time_proposal_id = timeProposalId;
  return api<{ plan: Plan }>(`/plans/${planId}/finalize`, { method: 'POST', body }).then((r) => camelize<{ plan: Plan }>(r));
};

export const unfinalizePlan = (planId: string) =>
  api<{ plan: Plan }>(`/plans/${planId}/unfinalize`, { method: 'POST' }).then((r) => camelize<{ plan: Plan }>(r));

export const repeatPlan = (planId: string) =>
  api<{ plan: Plan }>(`/plans/${planId}/repeat`, { method: 'POST' }).then((r) => camelize<{ plan: Plan }>(r));

export const fetchMessages = (planId: string, before?: string, limit?: number) => {
  const qs = new URLSearchParams();
  if (before) qs.set('before', before);
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString();
  return api<{ messages: Message[] }>(`/plans/${planId}/messages${q ? '?' + q : ''}`).then((r) => camelize<{ messages: Message[] }>(r));
};

export const sendMessage = (planId: string, text: string, clientMessageId?: string) =>
  api<{ message: Message }>(`/plans/${planId}/messages`, { method: 'POST', body: { text, client_message_id: clientMessageId || undefined } }).then((r) => camelize<{ message: Message }>(r));

export const inviteParticipant = (planId: string, inviteeId: string) =>
  api(`/plans/${planId}/participants`, { method: 'POST', body: { user_id: inviteeId } });

export interface PlanPreview {
  id: string;
  title: string;
  activityType: string;
  lifecycleState: string;
  confirmedPlaceText: string | null;
  confirmedTime: string | null;
  shareToken: string;
  creator: { id: string; name: string; username: string; avatarUrl: string | null } | null;
  participantCount: number;
  maxParticipants: number;
}

export const fetchPlanByToken = (token: string) =>
  api<{ plan: PlanPreview }>(`/plans/by-token/${encodeURIComponent(token)}`).then((r) =>
    camelize<{ plan: PlanPreview }>(r)
  );

export const joinPlanByToken = (token: string) =>
  api<{ already_joined: boolean; plan: Plan }>(`/plans/by-token/${encodeURIComponent(token)}/join`, { method: 'POST' }).then((r) =>
    camelize<{ alreadyJoined: boolean; plan: Plan }>(r)
  );
