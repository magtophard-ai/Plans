import { create } from 'zustand';
import type { Notification, NotificationType } from '../types';
import { mockNotifications } from '../mocks';
import * as notificationsApi from '../api/notifications';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (userId: string, type: NotificationType, payload: Record<string, unknown>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  fetchNotifications: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter((n) => !n.read).length,
  addNotification: (userId, type, payload) => {
    const n: Notification = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      type,
      payload,
      read: false,
      created_at: new Date().toISOString(),
    };
    const notifications = [n, ...get().notifications];
    set({ notifications, unreadCount: notifications.filter((x) => !x.read).length });
  },
  markRead: (id) => {
    const notifications = get().notifications.map((n) => n.id === id ? { ...n, read: true } : n);
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
}));
