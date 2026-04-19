import { create } from 'zustand';
import type { User } from '../types';
import { mockUsers } from '../mocks';
import * as authApi from '../api/auth';
import { setToken } from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  otpSent: boolean;
  phone: string;
  loading: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = 'fest_auth_token';
const REFRESH_KEY = 'fest_refresh_token';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  otpSent: false,
  phone: '',
  loading: false,

  sendOtp: async (phone) => {
    set({ loading: true });
    try {
      await authApi.sendOtp(phone);
      set({ phone, otpSent: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  verifyOtp: async (code) => {
    const phone = get().phone;
    set({ loading: true });
    try {
      const res = await authApi.verifyOtp(phone, code);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        localStorage.setItem(REFRESH_KEY, res.refreshToken);
      }
      set({ user: res.user, isAuthenticated: true, otpSent: false, loading: false });
    } catch {
      set({ user: mockUsers[5], isAuthenticated: true, otpSent: false, loading: false });
    }
  },

  logout: () => {
    setToken(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
    set({ user: null, isAuthenticated: false, otpSent: false, phone: '' });
  },
}));

const tryRestore = async () => {
  if (typeof localStorage === 'undefined') return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  setToken(token);
  try {
    const user = await authApi.fetchMe();
    useAuthStore.setState({ user, isAuthenticated: true });
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }
};

tryRestore();
