import { api, camelize } from './client';
import type { User, Friendship } from '../types';

type FriendsQuery = {
  status?: 'accepted' | 'pending';
  direction?: 'incoming' | 'outgoing';
};

const buildQs = (params: Record<string, string | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => !!v) as [string, string][];
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
};

export const fetchFriends = (q: FriendsQuery = {}) => {
  const qs = buildQs({ status: q.status, direction: q.direction });
  return api<{ friends: User[] }>(`/users/friends${qs}`).then((r) => camelize<User[]>(r.friends));
};

export const fetchUser = (id: string) =>
  api<{ user: User }>(`/users/${id}`).then((r) => camelize<User>(r.user));

export const searchUsers = (q: string, limit = 20) => {
  const qs = `?q=${encodeURIComponent(q)}&limit=${limit}`;
  return api<{ users: User[] }>(`/users/search${qs}`).then((r) => camelize<User[]>(r.users));
};

export const addFriend = (friendId: string) =>
  api<{ friendship: Friendship }>(`/users/friends/${friendId}`, { method: 'POST' });

export const respondToFriendRequest = (friendId: string, action: 'accept' | 'decline') =>
  api<{ friendship: Friendship } | null>(`/users/friends/${friendId}`, { method: 'PATCH', body: { action } });

export const removeFriend = (friendId: string) =>
  api(`/users/friends/${friendId}`, { method: 'DELETE' });
