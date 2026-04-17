import {create} from 'zustand';

type Updater<T> = T | ((current: T) => T);

function resolveValue<T>(current: T, value: Updater<T>): T {
	return typeof value === 'function' ? (value as (input: T) => T)(current) : value;
}

type MailSelectionStoreState = {
	selectedMessageId: number | null;
	selectedMessageIds: number[];
	pendingAutoReadMessageId: number | null;
	setSelectedMessageId: (value: Updater<number | null>) => void;
	setSelectedMessageIds: (value: Updater<number[]>) => void;
	setPendingAutoReadMessageId: (value: Updater<number | null>) => void;
	resetSelectionState: () => void;
};

export const useMailSelectionStore = create<MailSelectionStoreState>((set) => ({
	selectedMessageId: null,
	selectedMessageIds: [],
	pendingAutoReadMessageId: null,
	setSelectedMessageId: (value) =>
		set((state) => ({
			selectedMessageId: resolveValue(state.selectedMessageId, value),
		})),
	setSelectedMessageIds: (value) =>
		set((state) => ({
			selectedMessageIds: resolveValue(state.selectedMessageIds, value),
		})),
	setPendingAutoReadMessageId: (value) =>
		set((state) => ({
			pendingAutoReadMessageId: resolveValue(state.pendingAutoReadMessageId, value),
		})),
	resetSelectionState: () =>
		set({
			selectedMessageId: null,
			selectedMessageIds: [],
			pendingAutoReadMessageId: null,
		}),
}));
