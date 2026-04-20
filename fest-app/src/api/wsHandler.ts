import { setHandler, setOnReconnect, getSubscriptions } from './ws';
import { usePlansStore } from '../stores/plansStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import type { Message, Notification, PlanProposal } from '../types';

export function initWsHandler() {
  setHandler((channel, event, payload) => {
    if (channel.startsWith('plan:')) {
      const planId = channel.slice(5);

      if (event === 'plan.message.created') {
        const msg = payload as Message;
        usePlansStore.getState().pushMessage(planId, msg);
      }

      if (event === 'plan.proposal.created') {
        const proposal = payload as PlanProposal;
        usePlansStore.getState().pushProposal(planId, proposal);
      }

      if (event === 'plan.vote.changed') {
        const { proposalId, voterId, action, voteId, createdAt } = payload as {
          proposalId: string;
          planId: string;
          voterId: string;
          action: 'added' | 'removed';
          voteId?: string;
          createdAt?: string;
        };
        usePlansStore.getState().pushVote(planId, proposalId, voterId, action, voteId, createdAt);
      }

      if (event === 'plan.finalized' || event === 'plan.unfinalized') {
        usePlansStore.getState().fetchPlan(planId);
        usePlansStore.getState().apiFetchMessages(planId);
      }
    }

    if (channel.startsWith('user:') && event === 'notification.created') {
      const n = payload as {
        notificationId: string;
        type: string;
        payload: Record<string, unknown>;
        createdAt: string;
      };
      const notification: Notification = {
        id: n.notificationId,
        user_id: channel.slice(5),
        type: n.type as any,
        payload: n.payload,
        read: false,
        created_at: n.createdAt,
      };
      useNotificationsStore.getState().pushNotification(notification);
    }
  });

  setOnReconnect(() => {
    useNotificationsStore.getState().fetchNotifications();
    const subs = getSubscriptions();
    for (const ch of subs) {
      if (ch.startsWith('plan:')) {
        const planId = ch.slice(5);
        usePlansStore.getState().fetchPlan(planId);
        usePlansStore.getState().apiFetchMessages(planId);
      }
    }
  });
}
