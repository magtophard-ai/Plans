import { api, camelize } from './client';
import type { Event } from '../types';

interface EventsResponse {
  events: Event[];
  total: number;
}

export const fetchEvents = (params?: { category?: string; limit?: number; page?: number }) => {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.page) qs.set('page', String(params.page));
  const q = qs.toString();
  return api<EventsResponse>(`/events${q ? '?' + q : ''}`).then((r) => camelize<EventsResponse>(r));
};

export const fetchEvent = (id: string) =>
  api<{ event: Event }>(`/events/${id}`).then((r) => camelize<Event>(r.event));

export const markInterest = (eventId: string) =>
  api(`/events/${eventId}/interest`, { method: 'POST' });

export const removeInterest = (eventId: string) =>
  api(`/events/${eventId}/interest`, { method: 'DELETE' });

export const saveEvent = (eventId: string) =>
  api(`/events/${eventId}/save`, { method: 'POST' });

export const unsaveEvent = (eventId: string) =>
  api(`/events/${eventId}/save`, { method: 'DELETE' });
