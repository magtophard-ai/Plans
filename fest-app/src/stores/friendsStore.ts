import { create } from 'zustand';
import type { User } from '../types';
import * as usersApi from '../api/users';

interface FriendsState {
  friends: User[];
  searchResults: User[];
  searchQuery: string;
  searchLoading: boolean;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  fetchFriends: () => Promise<void>;
  addFriend: (friendId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  searchUsers: (q: string) => Promise<void>;
  clearSearch: () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchFriends: async () => {
    set({ loading: true, error: null });
    try {
      const friends = await usersApi.fetchFriends('accepted');
      set({ friends, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Ошибка загрузки друзей' });
    }
  },

  addFriend: async (friendId) => {
    try {
      await usersApi.addFriend(friendId);
      const friend = await usersApi.fetchUser(friendId);
      set((s) => ({
        friends: s.friends.find((f) => f.id === friendId) ? s.friends : [...s.friends, friend],
        searchResults: s.searchResults.map((u) =>
          u.id === friendId ? { ...u, friendship_status: 'friend' as const } : u
        ),
      }));
    } catch (e: any) {
      set({ error: e?.message || 'Ошибка добавления друга' });
      throw e;
    }
  },

  removeFriend: async (friendId) => {
    try {
      await usersApi.removeFriend(friendId);
      set((s) => ({
        friends: s.friends.filter((f) => f.id !== friendId),
        searchResults: s.searchResults.map((u) =>
          u.id === friendId ? { ...u, friendship_status: null } : u
        ),
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
        set({ searchResults: users, searchLoading: false });
      }
    } catch (e: any) {
      set({ searchLoading: false, error: e?.message || 'Ошибка поиска' });
    }
  },

  clearSearch: () => set({ searchResults: [], searchQuery: '', searchLoading: false }),
}));
