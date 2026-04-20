import { api, camelize } from './client';
import type { Event } from '../types';

interface SearchEventsResponse {
  events: Event[];
  total: number;
}

export const searchEvents = (params?: {
  q?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.category) qs.set('category', params.category);
  if (params?.date_from) qs.set('date_from', params.date_from);
  if (params?.date_to) qs.set('date_to', params.date_to);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return api<SearchEventsResponse>(`/search/events${q ? '?' + q : ''}`).then((r) =>
    camelize<SearchEventsResponse>(r)
  );
};
