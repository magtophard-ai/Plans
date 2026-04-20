import { create } from 'zustand';
import type { Notification } from '../types';
import * as notificationsApi from '../api/notifications';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  fetchNotifications: () => Promise<void>;
  pushNotification: (n: Notification) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  markRead: (id) => {
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length });
    notificationsApi.markNotificationRead(id).catch(() => {});
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    notificationsApi.markAllNotificationsRead().catch(() => {});
  },

  fetchNotifications: async () => {
    try {
      const res = await notificationsApi.fetchNotifications(50);
      set({ notifications: res.notifications, unreadCount: res.unreadCount });
    } catch {}
  },

  pushNotification: (n) => {
    set((s) => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  },
}));
