import {create} from 'zustand';
import type {MessageItem} from '@/preload';

const DEFAULT_MESSAGE_FETCH_LIMIT = 100;

type Updater<T> = T | ((current: T) => T);

function resolveValue<T>(current: T, value: Updater<T>): T {
	return typeof value === 'function' ? (value as (input: T) => T)(current) : value;
}

type MailMessagesStoreState = {
	searchQuery: string;
	messages: MessageItem[];
	searchResults: MessageItem[];
	searchLoading: boolean;
	messageFetchLimit: number;
	loadingMoreMessages: boolean;
	hasMoreMessages: boolean;
	setSearchQuery: (value: Updater<string>) => void;
	setMessages: (value: Updater<MessageItem[]>) => void;
	setSearchResults: (value: Updater<MessageItem[]>) => void;
	setSearchLoading: (value: Updater<boolean>) => void;
	setMessageFetchLimit: (value: Updater<number>) => void;
	setLoadingMoreMessages: (value: Updater<boolean>) => void;
	setHasMoreMessages: (value: Updater<boolean>) => void;
	resetMessageListState: () => void;
};

export const useMailMessagesStore = create<MailMessagesStoreState>((set) => ({
	searchQuery: '',
	messages: [],
	searchResults: [],
	searchLoading: false,
	messageFetchLimit: DEFAULT_MESSAGE_FETCH_LIMIT,
	loadingMoreMessages: false,
	hasMoreMessages: false,
	setSearchQuery: (value) =>
		set((state) => ({
			searchQuery: String(resolveValue(state.searchQuery, value) ?? ''),
		})),
	setMessages: (value) =>
		set((state) => ({
			messages: resolveValue(state.messages, value),
		})),
	setSearchResults: (value) =>
		set((state) => ({
			searchResults: resolveValue(state.searchResults, value),
		})),
	setSearchLoading: (value) =>
		set((state) => ({
			searchLoading: resolveValue(state.searchLoading, value),
		})),
	setMessageFetchLimit: (value) =>
		set((state) => ({
			messageFetchLimit: Math.max(1, Number(resolveValue(state.messageFetchLimit, value)) || DEFAULT_MESSAGE_FETCH_LIMIT),
		})),
	setLoadingMoreMessages: (value) =>
		set((state) => ({
			loadingMoreMessages: Boolean(resolveValue(state.loadingMoreMessages, value)),
		})),
	setHasMoreMessages: (value) =>
		set((state) => ({
			hasMoreMessages: Boolean(resolveValue(state.hasMoreMessages, value)),
		})),
	resetMessageListState: () =>
		set({
			searchQuery: '',
			messages: [],
			searchResults: [],
			searchLoading: false,
			messageFetchLimit: DEFAULT_MESSAGE_FETCH_LIMIT,
			loadingMoreMessages: false,
			hasMoreMessages: false,
		}),
}));
