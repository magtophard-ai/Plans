import { api, camelize, setToken } from './client';
import type { User } from '../types';

interface ApiAuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const sendOtp = (phone: string) =>
  api<{}>('/auth/otp/send', { method: 'POST', body: { phone }, noAuth: true });

export const verifyOtp = async (phone: string, code: string) => {
  const res = await api<ApiAuthResponse>('/auth/otp/verify', { method: 'POST', body: { phone, code }, noAuth: true });
  setToken(res.access_token);
  return camelize<AuthResponse>(res);
};

export const refreshAuth = async (refreshToken: string) => {
  const res = await api<ApiAuthResponse>('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } });
  setToken(res.access_token);
  return camelize<AuthResponse>(res);
};

export const fetchMe = () => api<{ user: User }>('/auth/me').then((r) => camelize<User>(r.user));
