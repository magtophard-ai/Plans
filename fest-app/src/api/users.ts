import { api, camelize } from './client';
import type { User, Friendship } from '../types';

export const fetchFriends = (status?: string) => {
  const qs = status ? `?status=${status}` : '';
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

export const removeFriend = (friendId: string) =>
  api(`/users/friends/${friendId}`, { method: 'DELETE' });
