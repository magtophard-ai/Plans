import { create } from 'zustand';
import type { Plan, PlanProposal, Vote, PlanParticipant, ParticipantStatus, PlanLifecycle } from '../types';
import { mockPlans, mockMessages } from '../mocks';
import type { Message } from '../types';
import { useNotificationsStore } from './notificationsStore';
import { useAuthStore } from './authStore';
import { mockUsers } from '../mocks';
import * as plansApi from '../api/plans';

const MAX_VOTES_PER_TYPE = 2;
const MAX_PARTICIPANTS = 15;

interface PlansState {
  plans: Plan[];
  messages: Record<string, Message[]>;
  loading: boolean;
  addPlan: (plan: Plan) => void;
  updatePlanState: (planId: string, state: PlanLifecycle) => void;
  finalizePlan: (planId: string, placeProposalId?: string, timeProposalId?: string) => void;
  unfinalizePlan: (planId: string) => void;
  cancelPlan: (planId: string) => void;
  completePlan: (planId: string) => void;
  updateParticipantStatus: (planId: string, userId: string, status: ParticipantStatus) => void;
  addProposal: (planId: string, proposal: PlanProposal) => void;
  vote: (planId: string, proposalId: string, userId: string) => void;
  unvote: (planId: string, proposalId: string, userId: string) => void;
  addMessage: (planId: string, message: Message) => void;
  inviteParticipant: (planId: string, userId: string) => void;
  removeParticipant: (planId: string, userId: string) => void;
  leavePlan: (planId: string, userId: string) => void;
  fetchMyPlans: () => Promise<void>;
  fetchPlan: (planId: string) => Promise<void>;
  apiCreatePlan: (data: Parameters<typeof plansApi.createPlan>[0]) => Promise<string>;
  apiUpdateParticipantStatus: (planId: string, userId: string, status: ParticipantStatus) => Promise<void>;
  apiRemoveParticipant: (planId: string, userId: string) => Promise<void>;
  apiCancelPlan: (planId: string) => Promise<void>;
  apiCompletePlan: (planId: string) => Promise<void>;
}

export const usePlansStore = create<PlansState>((set, get) => ({
  plans: mockPlans,
  messages: mockMessages,
  loading: false,
  addPlan: (plan) => set((s) => ({ plans: [plan, ...s.plans] })),
  updatePlanState: (planId, state) => set((s) => ({
    plans: s.plans.map((p) => p.id === planId ? { ...p, lifecycle_state: state } : p),
  })),
  finalizePlan: (planId, placeProposalId, timeProposalId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    set((s) => ({
      plans: s.plans.map((p) => {
        if (p.id !== planId) return p;
        let updated = { ...p, lifecycle_state: 'finalized' as PlanLifecycle };
        const updatedProposals = [...(p.proposals || [])];
        if (placeProposalId) {
          const prop = updatedProposals.find((pr) => pr.id === placeProposalId);
          if (prop) {
            updated.place_status = 'confirmed';
            updated.confirmed_place_text = prop.value_text;
            updated.confirmed_place_lat = prop.value_lat;
            updated.confirmed_place_lng = prop.value_lng;
          }
          for (let i = 0; i < updatedProposals.length; i++) {
            if (updatedProposals[i].type === 'place' && updatedProposals[i].status === 'active') {
              updatedProposals[i] = { ...updatedProposals[i], status: updatedProposals[i].id === placeProposalId ? 'finalized' as const : 'superseded' as const };
            }
          }
        }
        if (timeProposalId) {
          const prop = updatedProposals.find((pr) => pr.id === timeProposalId);
          if (prop) {
            updated.time_status = 'confirmed';
            updated.confirmed_time = prop.value_datetime;
          }
          for (let i = 0; i < updatedProposals.length; i++) {
            if (updatedProposals[i].type === 'time' && updatedProposals[i].status === 'active') {
              updatedProposals[i] = { ...updatedProposals[i], status: updatedProposals[i].id === timeProposalId ? 'finalized' as const : 'superseded' as const };
            }
          }
        }
        updated.proposals = updatedProposals;
        return updated;
      }),
    }));
    (plan.participants || []).forEach((p) => {
      useNotificationsStore.getState().addNotification(p.user_id, 'plan_finalized', { plan_id: planId, plan_title: plan.title });
    });
  },
  unfinalizePlan: (planId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    set((s) => ({
      plans: s.plans.map((p) => {
        if (p.id !== planId) return p;
        let place_status: typeof p.place_status = p.place_status;
        let time_status: typeof p.time_status = p.time_status;
        if (p.confirmed_place_text && !p.proposals?.some((pr) => pr.type === 'place' && pr.status === 'finalized')) {
          place_status = 'confirmed';
        } else if (p.proposals?.some((pr) => pr.type === 'place' && pr.status === 'finalized')) {
          place_status = 'proposed';
        }
        if (p.confirmed_time && !p.proposals?.some((pr) => pr.type === 'time' && pr.status === 'finalized')) {
          time_status = 'confirmed';
        } else if (p.proposals?.some((pr) => pr.type === 'time' && pr.status === 'finalized')) {
          time_status = 'proposed';
        }
        const proposals = (p.proposals || []).map((pr) =>
          pr.status === 'finalized' || pr.status === 'superseded' ? { ...pr, status: 'active' as const } : pr
        );
        return { ...p, lifecycle_state: 'active', place_status, time_status, proposals };
      }),
    }));
    (plan.participants || []).forEach((p) => {
      useNotificationsStore.getState().addNotification(p.user_id, 'plan_unfinalized', { plan_id: planId, plan_title: plan.title });
    });
  },
  cancelPlan: (planId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    set((s) => ({
      plans: s.plans.map((p) => p.id === planId ? { ...p, lifecycle_state: 'cancelled' } : p),
    }));
  },
  completePlan: (planId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    set((s) => ({
      plans: s.plans.map((p) => p.id === planId ? { ...p, lifecycle_state: 'completed' } : p),
    }));
    (plan.participants || []).forEach((p) => {
      useNotificationsStore.getState().addNotification(p.user_id, 'plan_completed', { plan_id: planId, plan_title: plan.title });
    });
  },
  updateParticipantStatus: (planId, userId, status) => set((s) => ({
    plans: s.plans.map((p) => p.id !== planId ? p : {
      ...p,
      participants: p.participants?.map((pp) => pp.user_id === userId ? { ...pp, status } : pp),
    }),
  })),
  addProposal: (planId, proposal) => {
    const plan = get().plans.find((p) => p.id === planId);
    set((s) => ({
      plans: s.plans.map((p) => p.id !== planId ? p : {
        ...p,
        proposals: [...(p.proposals || []), proposal],
        place_status: proposal.type === 'place' && p.place_status === 'undecided' ? 'proposed' : p.place_status,
        time_status: proposal.type === 'time' && p.time_status === 'undecided' ? 'proposed' : p.time_status,
      }),
    }));
    const proposalMsg: Message = {
      id: `msg-prop-${Date.now()}`,
      context_type: 'plan',
      context_id: planId,
      sender_id: proposal.proposer_id,
      text: '',
      type: 'proposal_card',
      reference_id: proposal.id,
      created_at: new Date().toISOString(),
      sender: mockUsers.find((u) => u.id === proposal.proposer_id),
    };
    set((s) => ({ messages: { ...s.messages, [planId]: [...(s.messages[planId] || []), proposalMsg] } }));
    if (plan) {
      (plan.participants || []).forEach((p) => {
        if (p.user_id !== proposal.proposer_id) {
          useNotificationsStore.getState().addNotification(p.user_id, 'proposal_created', { plan_id: planId, proposer_name: mockUsers.find((u) => u.id === proposal.proposer_id)?.name ?? '' });
        }
      });
    }
  },
  vote: (planId, proposalId, userId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    const proposal = plan.proposals?.find((pr) => pr.id === proposalId);
    if (!proposal) return;
    const myVotesForType = (plan.proposals || []).filter(
      (pr) => pr.type === proposal.type && pr.status === 'active' && pr.votes?.some((v) => v.voter_id === userId)
    ).length;
    const alreadyVotedThis = proposal.votes?.some((v) => v.voter_id === userId);
    if (!alreadyVotedThis && myVotesForType >= MAX_VOTES_PER_TYPE) return;
    set((s) => ({
      plans: s.plans.map((p) => p.id !== planId ? p : {
        ...p,
        proposals: p.proposals?.map((pr) => pr.id !== proposalId ? pr : {
          ...pr,
          votes: [...(pr.votes || []), { id: `vote-${Date.now()}`, proposal_id: proposalId, voter_id: userId, created_at: new Date().toISOString() }],
        }),
      }),
    }));
  },
  unvote: (planId, proposalId, userId) => set((s) => ({
    plans: s.plans.map((p) => p.id !== planId ? p : {
      ...p,
      proposals: p.proposals?.map((pr) => pr.id !== proposalId ? pr : {
        ...pr,
        votes: (pr.votes || []).filter((v) => !(v.proposal_id === proposalId && v.voter_id === userId)),
      }),
    }),
  })),
  addMessage: (planId, message) => set((s) => ({
    messages: { ...s.messages, [planId]: [...(s.messages[planId] || []), message] },
  })),
  inviteParticipant: (planId, userId) => {
    const plan = get().plans.find((p) => p.id === planId);
    if (!plan) return;
    const currentCount = plan.participants?.length ?? 0;
    if (currentCount >= MAX_PARTICIPANTS) return;
    const alreadyIn = plan.participants?.some((p) => p.user_id === userId);
    if (alreadyIn) return;
    const newParticipant: PlanParticipant = {
      id: `pp-inv-${Date.now()}`,
      plan_id: planId,
      user_id: userId,
      status: 'invited',
      joined_at: new Date().toISOString(),
      user: mockUsers.find((u) => u.id === userId),
    };
    set((s) => ({
      plans: s.plans.map((p) => p.id !== planId ? p : {
        ...p,
        participants: [...(p.participants || []), newParticipant],
      }),
    }));
  },
  removeParticipant: (planId, userId) => set((s) => ({
    plans: s.plans.map((p) => p.id !== planId ? p : {
      ...p,
      participants: (p.participants || []).filter((pp) => pp.user_id !== userId),
    }),
  })),
  leavePlan: (planId, userId) => set((s) => ({
    plans: s.plans.map((p) => p.id !== planId ? p : {
      ...p,
      participants: (p.participants || []).filter((pp) => pp.user_id !== userId),
    }),
  })),
  fetchMyPlans: async () => {
    set({ loading: true });
    try {
      const res = await plansApi.fetchPlans({ participant: 'me' });
      set({ plans: res.plans, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  fetchPlan: async (planId) => {
    try {
      const plan = await plansApi.fetchPlan(planId);
      set((s) => ({
        plans: s.plans.some((p) => p.id === planId) ? s.plans.map((p) => p.id === planId ? plan : p) : [plan, ...s.plans],
      }));
    } catch {}
  },
  apiCreatePlan: async (data) => {
    const plan = await plansApi.createPlan(data);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan.id;
  },
  apiUpdateParticipantStatus: async (planId, userId, status) => {
    await plansApi.updateParticipantStatus(planId, userId, status);
    set((s) => ({
      plans: s.plans.map((p) => p.id !== planId ? p : {
        ...p,
        participants: p.participants?.map((pp) => pp.user_id === userId ? { ...pp, status } : pp),
      }),
    }));
  },
  apiRemoveParticipant: async (planId, userId) => {
    await plansApi.removeParticipant(planId, userId);
    set((s) => ({
      plans: s.plans.map((p) => p.id !== planId ? p : {
        ...p,
        participants: (p.participants || []).filter((pp) => pp.user_id !== userId),
      }),
    }));
  },
  apiCancelPlan: async (planId) => {
    await plansApi.cancelPlan(planId);
    set((s) => ({
      plans: s.plans.map((p) => p.id === planId ? { ...p, lifecycle_state: 'cancelled' as PlanLifecycle } : p),
    }));
  },
  apiCompletePlan: async (planId) => {
    await plansApi.completePlan(planId);
    set((s) => ({
      plans: s.plans.map((p) => p.id === planId ? { ...p, lifecycle_state: 'completed' as PlanLifecycle } : p),
    }));
  },
}));
