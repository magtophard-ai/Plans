import { api, camelize } from './client';
import type { Invitation } from '../types';

interface InvitationsResponse {
  invitations: Invitation[];
}

export const fetchInvitations = (status?: string) => {
  const qs = status ? `?status=${status}` : '';
  return api<InvitationsResponse>(`/invitations${qs}`).then((r) => camelize<InvitationsResponse>(r));
};

export const acceptInvitation = (id: string) =>
  api(`/invitations/${id}`, { method: 'PATCH', body: { status: 'accepted' } });

export const declineInvitation = (id: string) =>
  api(`/invitations/${id}`, { method: 'PATCH', body: { status: 'declined' } });
