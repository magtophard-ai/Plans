import { create } from 'zustand';
import type { Event, EventCategory } from '../types';
import { mockEvents } from '../mocks';
import * as eventsApi from '../api/events';

interface EventsState {
  events: Event[];
  interestedIds: Set<string>;
  savedIds: Set<string>;
  categoryFilter: EventCategory | null;
  loading: boolean;
  toggleInterest: (eventId: string) => void;
  toggleSave: (eventId: string) => void;
  setCategoryFilter: (cat: EventCategory | null) => void;
  fetchEvents: () => Promise<void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: mockEvents,
  interestedIds: new Set<string>(),
  savedIds: new Set<string>(),
  categoryFilter: null,
  loading: false,

  fetchEvents: async () => {
    set({ loading: true });
    try {
      const cat = get().categoryFilter;
      const res = await eventsApi.fetchEvents({ category: cat ?? undefined, limit: 50 });
      const events = res.events;
      const interestedIds = new Set<string>();
      const savedIds = new Set<string>();
      set({ events, interestedIds, savedIds, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  toggleInterest: (eventId) => {
    const { interestedIds } = get();
    const next = new Set(interestedIds);
    if (next.has(eventId)) {
      next.delete(eventId);
      eventsApi.removeInterest(eventId).catch(() => next.add(eventId));
    } else {
      next.add(eventId);
      eventsApi.markInterest(eventId).catch(() => next.delete(eventId));
    }
    set({ interestedIds: next });
  },

  toggleSave: (eventId) => {
    const { savedIds } = get();
    const next = new Set(savedIds);
    if (next.has(eventId)) {
      next.delete(eventId);
      eventsApi.unsaveEvent(eventId).catch(() => next.add(eventId));
    } else {
      next.add(eventId);
      eventsApi.saveEvent(eventId).catch(() => next.delete(eventId));
    }
    set({ savedIds: next });
  },

  setCategoryFilter: (cat) => {
    set({ categoryFilter: cat });
    get().fetchEvents();
  },
}));
