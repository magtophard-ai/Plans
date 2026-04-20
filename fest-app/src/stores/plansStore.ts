import { create } from 'zustand';
import type { Plan, PlanProposal, PlanParticipant, ParticipantStatus, PlanLifecycle, Message, Vote } from '../types';
import * as plansApi from '../api/plans';

interface PlansState {
  plans: Plan[];
  messages: Record<string, Message[]>;
  loading: boolean;
  fetchMyPlans: () => Promise<void>;
  fetchPlan: (planId: string) => Promise<void>;
  apiCreatePlan: (data: Parameters<typeof plansApi.createPlan>[0]) => Promise<string>;
  apiUpdateParticipantStatus: (planId: string, userId: string, status: ParticipantStatus) => Promise<void>;
  apiRemoveParticipant: (planId: string, userId: string) => Promise<void>;
  apiCancelPlan: (planId: string) => Promise<void>;
  apiCompletePlan: (planId: string) => Promise<void>;
  apiFinalize: (planId: string, placeProposalId?: string, timeProposalId?: string) => Promise<void>;
  apiUnfinalize: (planId: string) => Promise<void>;
  apiCreateProposal: (planId: string, data: Parameters<typeof plansApi.createProposal>[1]) => Promise<void>;
  apiVote: (planId: string, proposalId: string) => Promise<void>;
  apiUnvote: (planId: string, proposalId: string) => Promise<void>;
  apiRepeat: (planId: string) => Promise<string | null>;
  apiFetchMessages: (planId: string, before?: string) => Promise<void>;
  apiSendMessage: (planId: string, text: string) => Promise<void>;
  apiFetchProposals: (planId: string) => Promise<void>;
  apiInviteParticipant: (planId: string, inviteeId: string) => Promise<void>;
  pushMessage: (planId: string, msg: Message) => void;
  pushProposal: (planId: string, proposal: PlanProposal) => void;
  pushVote: (planId: string, proposalId: string, voterId: string, action: 'added' | 'removed', voteId?: string, createdAt?: string) => void;
}

const upsertPlan = (plans: Plan[], updated: Plan): Plan[] =>
  plans.some((p) => p.id === updated.id)
    ? plans.map((p) => (p.id === updated.id ? updated : p))
    : [updated, ...plans];

export const usePlansStore = create<PlansState>((set, get) => ({
  plans: [],
  messages: {},
  loading: false,

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
      set((s) => ({ plans: upsertPlan(s.plans, plan) }));
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
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              participants: p.participants?.map((pp) =>
                pp.user_id === userId ? { ...pp, status } : pp
              ),
            }
      ),
    }));
  },

  apiRemoveParticipant: async (planId, userId) => {
    await plansApi.removeParticipant(planId, userId);
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              participants: (p.participants || []).filter(
                (pp) => pp.user_id !== userId
              ),
            }
      ),
    }));
  },

  apiCancelPlan: async (planId) => {
    await plansApi.cancelPlan(planId);
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id === planId ? { ...p, lifecycle_state: 'cancelled' as PlanLifecycle } : p
      ),
    }));
  },

  apiCompletePlan: async (planId) => {
    await plansApi.completePlan(planId);
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id === planId ? { ...p, lifecycle_state: 'completed' as PlanLifecycle } : p
      ),
    }));
  },

  apiFinalize: async (planId, placeProposalId, timeProposalId) => {
    const res = await plansApi.finalizePlan(planId, placeProposalId, timeProposalId);
    set((s) => ({ plans: upsertPlan(s.plans, res.plan) }));
  },

  apiUnfinalize: async (planId) => {
    const res = await plansApi.unfinalizePlan(planId);
    set((s) => ({ plans: upsertPlan(s.plans, res.plan) }));
  },

  apiCreateProposal: async (planId, data) => {
    const res = await plansApi.createProposal(planId, data);
    const proposal = res.proposal;
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              proposals: [...(p.proposals || []), proposal],
              place_status:
                proposal.type === 'place' && p.place_status === 'undecided'
                  ? 'proposed'
                  : p.place_status,
              time_status:
                proposal.type === 'time' && p.time_status === 'undecided'
                  ? 'proposed'
                  : p.time_status,
            }
      ),
      messages: {
        ...s.messages,
        [planId]: [
          ...(s.messages[planId] || []),
          {
            id: `msg-prop-${proposal.id}`,
            context_type: 'plan',
            context_id: planId,
            sender_id: proposal.proposer_id,
            text: '',
            type: 'proposal_card' as const,
            reference_id: proposal.id,
            client_message_id: null,
            created_at: proposal.created_at,
            sender: undefined,
          },
        ],
      },
    }));
  },

  apiVote: async (planId, proposalId) => {
    const prevPlans = get().plans;
    const plan = prevPlans.find((p) => p.id === planId);
    const proposal = plan?.proposals?.find((pr) => pr.id === proposalId);
    const userId = proposal?.votes?.length;

    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              proposals: p.proposals?.map((pr) =>
                pr.id !== proposalId
                  ? pr
                  : {
                      ...pr,
                      votes: [
                        ...(pr.votes || []),
                        {
                          id: `vote-opt-${Date.now()}`,
                          proposal_id: proposalId,
                          voter_id: '__optimistic__',
                          created_at: new Date().toISOString(),
                        },
                      ],
                    }
              ),
            }
      ),
    }));

    try {
      const res = await plansApi.voteOnProposal(planId, proposalId);
      const vote = (res as { vote: { id: string; proposal_id: string; voter_id: string; created_at: string } }).vote;
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id !== planId
            ? p
            : {
                ...p,
                proposals: p.proposals?.map((pr) =>
                  pr.id !== proposalId
                    ? pr
                    : {
                        ...pr,
                        votes: [
                          ...(pr.votes || []).filter(
                            (v) => v.voter_id !== '__optimistic__'
                          ),
                          vote,
                        ],
                      }
                ),
              }
        ),
      }));
    } catch {
      set({ plans: prevPlans });
    }
  },

  apiUnvote: async (planId, proposalId) => {
    const prevPlans = get().plans;
    const plan = prevPlans.find((p) => p.id === planId);
    const myVote = plan?.proposals
      ?.find((pr) => pr.id === proposalId)
      ?.votes?.find((v) => v.voter_id !== '__optimistic__');

    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              proposals: p.proposals?.map((pr) =>
                pr.id !== proposalId
                  ? pr
                  : {
                      ...pr,
                      votes: (pr.votes || []).filter(
                        (v) =>
                          v.voter_id === '__optimistic__' ||
                          v.id !== myVote?.id
                      ),
                    }
              ),
            }
      ),
    }));

    try {
      await plansApi.unvoteProposal(planId, proposalId);
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id !== planId
            ? p
            : {
                ...p,
                proposals: p.proposals?.map((pr) =>
                  pr.id !== proposalId
                    ? pr
                    : {
                        ...pr,
                        votes: (pr.votes || []).filter(
                          (v) => v.id !== myVote?.id
                        ),
                      }
                ),
              }
        ),
      }));
    } catch {
      set({ plans: prevPlans });
    }
  },

  apiRepeat: async (planId) => {
    try {
      const res = await plansApi.repeatPlan(planId);
      const newPlan = res.plan;
      set((s) => ({ plans: [newPlan, ...s.plans] }));
      return newPlan.id;
    } catch {
      return null;
    }
  },

  apiFetchMessages: async (planId, before) => {
    try {
      const res = await plansApi.fetchMessages(planId, before);
      const fetched = res.messages;
      set((s) => {
        const existing = s.messages[planId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const merged = [...existing, ...fetched.filter((m) => !existingIds.has(m.id))];
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { messages: { ...s.messages, [planId]: merged } };
      });
    } catch {}
  },

  apiSendMessage: async (planId, text) => {
    const clientMessageId = `cmid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: Message = {
      id: `optimistic-${clientMessageId}`,
      context_type: 'plan',
      context_id: planId,
      sender_id: '__pending__',
      text,
      type: 'user',
      reference_id: null,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
    };
    set((s) => ({
      messages: {
        ...s.messages,
        [planId]: [...(s.messages[planId] || []), optimisticMsg],
      },
    }));
    try {
      const res = await plansApi.sendMessage(planId, text, clientMessageId);
      const msg = res.message;
      set((s) => {
        const existing = s.messages[planId] || [];
        const idx = existing.findIndex(
          (m) => m.client_message_id === clientMessageId || m.id === msg.id
        );
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = msg;
          return { messages: { ...s.messages, [planId]: updated } };
        }
        return {
          messages: {
            ...s.messages,
            [planId]: [...existing, msg].sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            ),
          },
        };
      });
    } catch {
      set((s) => ({
        messages: {
          ...s.messages,
          [planId]: (s.messages[planId] || []).filter(
            (m) => m.client_message_id !== clientMessageId
          ),
        },
      }));
    }
  },

  apiFetchProposals: async (planId) => {
    try {
      const res = await plansApi.fetchProposals(planId);
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id !== planId ? p : { ...p, proposals: res.proposals }
        ),
      }));
    } catch {}
  },

  apiInviteParticipant: async (planId, inviteeId) => {
    try {
      await plansApi.inviteParticipant(planId, inviteeId);
      const plan = await plansApi.fetchPlan(planId);
      set((s) => ({ plans: upsertPlan(s.plans, plan) }));
    } catch {}
  },

  pushMessage: (planId, msg) => {
    set((s) => {
      const existing = s.messages[planId] || [];
      if (msg.client_message_id) {
        const idx = existing.findIndex(
          (m) => m.client_message_id === msg.client_message_id
        );
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = msg;
          return { messages: { ...s.messages, [planId]: updated } };
        }
      }
      if (existing.some((m) => m.id === msg.id)) return s;
      return {
        messages: {
          ...s.messages,
          [planId]: [...existing, msg].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          ),
        },
      };
    });
  },

  pushProposal: (planId, proposal) => {
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              proposals: [...(p.proposals || []), proposal],
              place_status:
                proposal.type === 'place' && p.place_status === 'undecided'
                  ? 'proposed'
                  : p.place_status,
              time_status:
                proposal.type === 'time' && p.time_status === 'undecided'
                  ? 'proposed'
                  : p.time_status,
            }
      ),
    }));
  },

  pushVote: (planId, proposalId, voterId, action, voteId, createdAt) => {
    set((s) => ({
      plans: s.plans.map((p) =>
        p.id !== planId
          ? p
          : {
              ...p,
              proposals: p.proposals?.map((pr) =>
                pr.id !== proposalId
                  ? pr
                  : action === 'added'
                    ? {
                        ...pr,
                        votes: [
                          ...(pr.votes || []).filter(
                            (v) => v.voter_id !== '__optimistic__' && v.voter_id !== voterId
                          ),
                          {
                            id: voteId || `ws-vote-${Date.now()}`,
                            proposal_id: proposalId,
                            voter_id: voterId,
                            created_at: createdAt || new Date().toISOString(),
                          },
                        ],
                      }
                    : {
                        ...pr,
                        votes: (pr.votes || []).filter(
                          (v) =>
                            v.voter_id !== voterId || v.voter_id === '__optimistic__'
                        ),
                      }
              ),
            }
      ),
    }));
  },
}));
