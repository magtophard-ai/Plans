import { create } from 'zustand';
import type { User } from '../types';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import { setToken } from '../api/client';
import { startWs, stopWs } from '../api/ws';
import { initWsHandler } from '../api/wsHandler';
import { loadTokens, saveTokens, clearTokens } from '../utils/authStorage';

interface UpdateProfileInput {
  name?: string;
  username?: string;
  avatar_url?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  otpSent: boolean;
  phone: string;
  loading: boolean;
  error: string | null;
  restoring: boolean;
  clearError: () => void;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: UpdateProfileInput) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  otpSent: false,
  phone: '',
  loading: false,
  error: null,
  restoring: true,

  clearError: () => set({ error: null }),

  sendOtp: async (phone) => {
    set({ loading: true, error: null });
    try {
      await authApi.sendOtp(phone);
      set({ phone, otpSent: true, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Ошибка отправки кода' });
      throw e;
    }
  },

  verifyOtp: async (code) => {
    const phone = get().phone;
    set({ loading: true, error: null });
    try {
      const res = await authApi.verifyOtp(phone, code);
      await saveTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, isAuthenticated: true, otpSent: false, loading: false });
      initWsHandler();
      startWs();
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Неверный код' });
      throw e;
    }
  },

  logout: async () => {
    stopWs();
    setToken(null);
    await clearTokens();
    set({ user: null, isAuthenticated: false, otpSent: false, phone: '' });
  },

  updateProfile: async (patch) => {
    set({ error: null });
    try {
      const user = await usersApi.updateMe(patch);
      set({ user });
    } catch (e: any) {
      set({ error: e?.message || 'Не удалось сохранить профиль' });
      throw e;
    }
  },
}));

const tryRestore = async () => {
  try {
    const { access } = await loadTokens();
    if (!access) {
      useAuthStore.setState({ restoring: false });
      return;
    }
    setToken(access);
    try {
      const user = await authApi.fetchMe();
      useAuthStore.setState({ user, isAuthenticated: true, restoring: false });
      initWsHandler();
      startWs();
    } catch {
      await clearTokens();
      setToken(null);
      useAuthStore.setState({ restoring: false });
    }
  } catch {
    useAuthStore.setState({ restoring: false });
  }
};

void tryRestore();
