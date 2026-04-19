import { api, camelize } from './client';
import type { Plan, ParticipantStatus } from '../types';

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
  api<Plan>(`/plans/${id}`).then((r) => camelize<Plan>(r));

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
}) => api<Plan>('/plans', { method: 'POST', body: data }).then((r) => camelize<Plan>(r));

export const updateParticipantStatus = (planId: string, userId: string, status: ParticipantStatus) =>
  api(`/plans/${planId}/participants/${userId}`, { method: 'PATCH', body: { status } });

export const removeParticipant = (planId: string, userId: string) =>
  api(`/plans/${planId}/participants/${userId}`, { method: 'DELETE' });

export const cancelPlan = (planId: string) =>
  api(`/plans/${planId}/cancel`, { method: 'POST' });

export const completePlan = (planId: string) =>
  api(`/plans/${planId}/complete`, { method: 'POST' });
