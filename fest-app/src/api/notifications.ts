import { api, camelize } from './client';
import type { Notification } from '../types';

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

export const fetchNotifications = (limit?: number) => {
  const qs = limit ? `?limit=${limit}` : '';
  return api<NotificationsResponse>(`/notifications${qs}`).then((r) => ({
    notifications: camelize<Notification[]>(r.notifications),
    unreadCount: r.unread_count,
  }));
};

export const markNotificationRead = (id: string) =>
  api(`/notifications/${id}/read`, { method: 'PATCH' });

export const markAllNotificationsRead = () =>
  api('/notifications/read-all', { method: 'PATCH' });
