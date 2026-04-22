import { create } from 'zustand';
import type { User } from '../types';
import * as usersApi from '../api/users';

interface FriendsState {
  friends: User[];
  incomingRequests: User[];
  outgoingRequests: User[];
  searchResults: User[];
  searchQuery: string;
  searchLoading: boolean;
  loading: boolean;
  requestsLoading: boolean;
  error: string | null;
  clearError: () => void;
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  addFriend: (friendId: string) => Promise<void>;
  acceptFriendRequest: (friendId: string) => Promise<void>;
  declineFriendRequest: (friendId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  searchUsers: (q: string) => Promise<void>;
  clearSearch: () => void;
}

const patchSearchStatus = (
  list: User[],
  friendId: string,
  status: User['friendship_status'],
): User[] => list.map((u) => (u.id === friendId ? { ...u, friendship_status: status } : u));

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  loading: false,
  requestsLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchFriends: async () => {
    set({ loading: true, error: null });
    try {
      const friends = await usersApi.fetchFriends({ status: 'accepted' });
      set({ friends, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Ошибка загрузки друзей' });
    }
  },

  fetchRequests: async () => {
    set({ requestsLoading: true, error: null });
    try {
      const [incoming, outgoing] = await Promise.all([
        usersApi.fetchFriends({ status: 'pending', direction: 'incoming' }),
        usersApi.fetchFriends({ status: 'pending', direction: 'outgoing' }),
      ]);
      set({ incomingRequests: incoming, outgoingRequests: outgoing, requestsLoading: false });
    } catch (e: any) {
      set({ requestsLoading: false, error: e?.message || 'Ошибка загрузки заявок' });
    }
  },

  addFriend: async (friendId) => {
    try {
      const res = await usersApi.addFriend(friendId);
      const accepted = res.friendship.status === 'accepted';
      // Refresh the target user so friendship_status reflects reality (accepted or request_sent).
      const user = await usersApi.fetchUser(friendId);
      set((s) => ({
        friends: accepted
          ? (s.friends.some((f) => f.id === friendId) ? s.friends : [...s.friends, user])
          : s.friends,
        incomingRequests: accepted ? s.incomingRequests.filter((u) => u.id !== friendId) : s.incomingRequests,
        outgoingRequests: accepted
          ? s.outgoingRequests
          : (s.outgoingRequests.some((u) => u.id === friendId) ? s.outgoingRequests : [...s.outgoingRequests, user]),
        searchResults: patchSearchStatus(s.searchResults, friendId, accepted ? 'friend' : 'request_sent'),
      }));
    } catch (e: any) {
      set({ error: e?.message || 'Ошибка добавления друга' });
      throw e;
    }
  },

  acceptFriendRequest: async (friendId) => {
    try {
      await usersApi.respondToFriendRequest(friendId, 'accept');
      const user = await usersApi.fetchUser(friendId);
      set((s) => ({
        incomingRequests: s.incomingRequests.filter((u) => u.id !== friendId),
        friends: s.friends.some((f) => f.id === friendId) ? s.friends : [...s.friends, user],
        searchResults: patchSearchStatus(s.searchResults, friendId, 'friend'),
      }));
    } catch (e: any) {
      set({ error: e?.message || 'Ошибка принятия заявки' });
      throw e;
    }
  },

  declineFriendRequest: async (friendId) => {
    try {
      await usersApi.respondToFriendRequest(friendId, 'decline');
      set((s) => ({
        incomingRequests: s.incomingRequests.filter((u) => u.id !== friendId),
        searchResults: patchSearchStatus(s.searchResults, friendId, null),
      }));
    } catch (e: any) {
      set({ error: e?.message || 'Ошибка отклонения заявки' });
      throw e;
    }
  },

  removeFriend: async (friendId) => {
    try {
      await usersApi.removeFriend(friendId);
      set((s) => ({
        friends: s.friends.filter((f) => f.id !== friendId),
        incomingRequests: s.incomingRequests.filter((u) => u.id !== friendId),
        outgoingRequests: s.outgoingRequests.filter((u) => u.id !== friendId),
        searchResults: patchSearchStatus(s.searchResults, friendId, null),
      }));
    } catch (e: any) {
      set({ error: e?.message || 'Ошибка удаления друга' });
      throw e;
    }
  },

  searchUsers: async (q) => {
    const trimmed = q.trim();
    set({ searchQuery: q });
    if (trimmed.length === 0) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    set({ searchLoading: true, error: null });
    try {
      const users = await usersApi.searchUsers(trimmed);
      if (get().searchQuery === q) {
        set({ searchResults: users, searchLoading: false, error: null });
      }
    } catch (e: any) {
      if (get().searchQuery === q) {
        set({ searchLoading: false, error: e?.message || 'Ошибка поиска' });
      }
    }
  },

  clearSearch: () => set({ searchResults: [], searchQuery: '', searchLoading: false }),
}));
