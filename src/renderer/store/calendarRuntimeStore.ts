import {create} from 'zustand';
import type {CalendarEventItem} from '@/preload';

type CalendarRuntimeStoreState = {
	eventsByAccountId: Record<number, CalendarEventItem[]>;
	setEventsForAccount: (accountId: number, events: CalendarEventItem[]) => void;
	upsertEventForAccount: (accountId: number, event: CalendarEventItem) => void;
	removeEventForAccount: (accountId: number, eventId: number) => void;
};

export const useCalendarRuntimeStore = create<CalendarRuntimeStoreState>((set) => ({
	eventsByAccountId: {},
	setEventsForAccount: (accountId, events) =>
		set((state) => ({
			eventsByAccountId: {
				...state.eventsByAccountId,
				[accountId]: events,
			},
		})),
	upsertEventForAccount: (accountId, event) =>
		set((state) => {
			const current = state.eventsByAccountId[accountId] ?? [];
			const exists = current.some((item) => item.id === event.id);
			const next = exists ? current.map((item) => (item.id === event.id ? event : item)) : [...current, event];
			return {
				eventsByAccountId: {
					...state.eventsByAccountId,
					[accountId]: next,
				},
			};
		}),
	removeEventForAccount: (accountId, eventId) =>
		set((state) => ({
			eventsByAccountId: {
				...state.eventsByAccountId,
				[accountId]: (state.eventsByAccountId[accountId] ?? []).filter((event) => event.id !== eventId),
			},
		})),
}));
