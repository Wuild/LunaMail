import {create} from 'zustand';
import type {PublicAccount} from '@/preload';

type Updater<T> = T | ((current: T) => T);

function resolveValue<T>(current: T, value: Updater<T>): T {
	return typeof value === 'function' ? (value as (input: T) => T)(current) : value;
}

type AccountsRuntimeStoreState = {
	accounts: PublicAccount[];
	selectedAccountId: number | null;
	unreadCount: number;
	foldersUnreadFallback: number;
	setAccounts: (value: Updater<PublicAccount[]>) => void;
	setSelectedAccountId: (accountId: Updater<number | null>) => void;
	syncSelectedAccountToAccounts: () => void;
	setUnreadCount: (count: number) => void;
	setFoldersUnreadFallback: (count: number) => void;
};

export const useAccountsRuntimeStore = create<AccountsRuntimeStoreState>((set, get) => ({
	accounts: [],
	selectedAccountId: null,
	unreadCount: 0,
	foldersUnreadFallback: 0,
	setAccounts: (value) =>
		set((state) => ({
			accounts: resolveValue(state.accounts, value),
		})),
	setSelectedAccountId: (accountId) =>
		set((state) => ({
			selectedAccountId: resolveValue(state.selectedAccountId, accountId),
		})),
	syncSelectedAccountToAccounts: () =>
		set((state) => {
			if (state.selectedAccountId && state.accounts.some((account) => account.id === state.selectedAccountId)) {
				return state;
			}
			return {selectedAccountId: state.accounts[0]?.id ?? null};
		}),
	setUnreadCount: (count) => set({unreadCount: Math.max(0, Number(count) || 0)}),
	setFoldersUnreadFallback: (count) => set({foldersUnreadFallback: Math.max(0, Number(count) || 0)}),
}));

export function selectTotalUnreadCount(state: AccountsRuntimeStoreState): number {
	return Math.max(0, Math.max(Number(state.unreadCount) || 0, Number(state.foldersUnreadFallback) || 0));
}
