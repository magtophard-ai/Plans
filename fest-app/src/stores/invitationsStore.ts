import { create } from 'zustand';
import type { Invitation, InvitationStatus, InvitationType, PlanParticipant } from '../types';
import { mockInvitations } from '../mocks';
import { usePlansStore } from './plansStore';
import { useAuthStore } from './authStore';
import { useGroupsStore } from './groupsStore';
import { useNotificationsStore } from './notificationsStore';
import * as invitationsApi from '../api/invitations';

interface InvitationsState {
  invitations: Invitation[];
  addInvitation: (type: InvitationType, targetId: string, inviterId: string, inviteeId: string) => void;
  accept: (id: string) => void;
  decline: (id: string) => void;
  fetchInvitations: () => Promise<void>;
}

export const useInvitationsStore = create<InvitationsState>((set, get) => ({
  invitations: mockInvitations,
  addInvitation: (type, targetId, inviterId, inviteeId) => {
    const inv: Invitation = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      target_id: targetId,
      inviter_id: inviterId,
      invitee_id: inviteeId,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    set((s) => ({ invitations: [inv, ...s.invitations] }));
    const inviter = useAuthStore.getState().user;
    useNotificationsStore.getState().addNotification(
      inviteeId,
      type === 'plan' ? 'plan_invite' : 'group_invite',
      { [type === 'plan' ? 'plan_id' : 'group_id']: targetId, inviter_name: inviter?.name ?? '' },
    );
  },
  accept: (id) => {
    const inv = get().invitations.find((i) => i.id === id);
    if (!inv) return;
    const userId = useAuthStore.getState().user?.id;
    if (inv.type === 'plan' && userId) {
      const plansStore = usePlansStore.getState();
      const plan = plansStore.plans.find((p) => p.id === inv.target_id);
      const alreadyIn = plan?.participants?.some((p) => p.user_id === userId);
      if (!alreadyIn) {
        const newParticipant: PlanParticipant = {
          id: `pp-accept-${Date.now()}`,
          plan_id: inv.target_id,
          user_id: userId,
          status: 'going',
          joined_at: new Date().toISOString(),
          user: useAuthStore.getState().user ?? undefined,
        };
        usePlansStore.setState((s) => ({
          plans: s.plans.map((p) => p.id === inv.target_id
            ? { ...p, participants: [...(p.participants || []), newParticipant] }
            : p),
        }));
      }
    }
    if (inv.type === 'group' && userId) {
      useGroupsStore.getState().addMember(inv.target_id, userId);
    }
    set((s) => ({
      invitations: s.invitations.map((i) => i.id === id ? { ...i, status: 'accepted' as InvitationStatus } : i),
    }));
  },
  decline: (id) => set((s) => ({
    invitations: s.invitations.map((i) => i.id === id ? { ...i, status: 'declined' as InvitationStatus } : i),
  })),
  fetchInvitations: async () => {
    try {
      const res = await invitationsApi.fetchInvitations('pending');
      set({ invitations: res.invitations });
    } catch {}
  },
}));
