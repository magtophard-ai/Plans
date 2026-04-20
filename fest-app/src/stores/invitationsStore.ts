import { create } from 'zustand';
import type { Invitation, InvitationStatus } from '../types';
import * as invitationsApi from '../api/invitations';
import { usePlansStore } from './plansStore';

interface InvitationsState {
  invitations: Invitation[];
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  fetchInvitations: () => Promise<void>;
}

export const useInvitationsStore = create<InvitationsState>((set, get) => ({
  invitations: [],

  accept: async (id) => {
    const inv = get().invitations.find((i) => i.id === id);
    if (!inv) return;
    try {
      await invitationsApi.acceptInvitation(id);
      set((s) => ({
        invitations: s.invitations.map((i) =>
          i.id === id ? { ...i, status: 'accepted' as InvitationStatus } : i
        ),
      }));
      if (inv.type === 'plan') {
        await usePlansStore.getState().fetchPlan(inv.target_id);
      }
    } catch {}
  },

  decline: async (id) => {
    try {
      await invitationsApi.declineInvitation(id);
      set((s) => ({
        invitations: s.invitations.map((i) =>
          i.id === id ? { ...i, status: 'declined' as InvitationStatus } : i
        ),
      }));
    } catch {}
  },

  fetchInvitations: async () => {
    try {
      const res = await invitationsApi.fetchInvitations('pending');
      set({ invitations: res.invitations });
    } catch {}
  },
}));
