import {create} from 'zustand';
import type {SyncStatusEvent} from '@/preload';
import type {AccountSyncModuleStatusMap, ProviderErrorCategory, ProviderSyncError} from '@/shared/ipcTypes';

export type SyncNotice = {
	id: string;
	title: string;
	message: string;
	key: string;
	timestampMs: number;
	accountId?: number;
};

export type OptimisticReadMutation = {
	messageId: number;
	accountId: number;
	desiredRead: number;
	status: 'pending' | 'failed';
	error?: string;
	updatedAt: number;
};

export type AccountSyncRuntimeState = {
	accountId: number;
	status: SyncStatusEvent['status'];
	source?: string;
	lastError?: string;
	lastErrorCategory?: ProviderErrorCategory;
	lastSyncError?: ProviderSyncError;
	moduleStatus?: AccountSyncModuleStatusMap;
	partialSuccess?: boolean;
	failedModules?: Array<keyof AccountSyncModuleStatusMap>;
	updatedAt: number;
};

type RuntimeStoreState = {
	syncByAccount: Record<number, AccountSyncRuntimeState>;
	syncNotices: SyncNotice[];
	optimisticReadByMessageId: Record<number, OptimisticReadMutation>;
	lastReadMutationAtByAccount: Record<number, number>;
	mailSyncStatusText: string | null;
	syncingAccountIds: number[];
	applySyncEvent: (payload: SyncStatusEvent) => void;
	pushSyncNotice: (notice: Omit<SyncNotice, 'id' | 'timestampMs'> & {id?: string; timestampMs?: number}) => void;
	dismissSyncNotice: (id: string) => void;
	clearSyncNotices: () => void;
	setMailSyncStatusText: (text: string | null) => void;
	markAccountSyncing: (accountId: number) => void;
	clearAccountSyncing: (accountId: number) => void;
	pruneSyncingAccounts: (validAccountIds: number[]) => void;
	markOptimisticReadPending: (input: {messageId: number; accountId: number; desiredRead: number}) => void;
	markReadMutationAttempt: (accountId: number) => void;
	markOptimisticReadFailed: (input: {messageId: number; error: string}) => void;
	clearOptimisticRead: (messageId: number) => void;
};

function buildNoticeId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useRuntimeStore = create<RuntimeStoreState>((set) => ({
	syncByAccount: {},
	syncNotices: [],
	optimisticReadByMessageId: {},
	lastReadMutationAtByAccount: {},
	mailSyncStatusText: null,
	syncingAccountIds: [],
	applySyncEvent: (payload) =>
		set((state) => {
			const prev = state.syncByAccount[payload.accountId];
			const next: AccountSyncRuntimeState = {
				accountId: payload.accountId,
				status: payload.status,
				source: payload.source,
				lastError: payload.status === 'error' ? String(payload.error || payload.syncError?.message || '').trim() : undefined,
				lastErrorCategory: payload.syncError?.category,
				lastSyncError: payload.syncError,
				moduleStatus: payload.summary?.moduleStatus,
				partialSuccess: Boolean(payload.summary?.partialSuccess),
				failedModules: payload.summary?.failedModules,
				updatedAt: Date.now(),
			};
			return {
				syncByAccount: {
					...state.syncByAccount,
					[payload.accountId]: {
						...prev,
						...next,
					},
				},
			};
		}),
	pushSyncNotice: (notice) =>
		set((state) => {
			const timestampMs = notice.timestampMs ?? Date.now();
			const key = notice.key.trim();
			const duplicate = state.syncNotices.some((item) => item.key === key && timestampMs - item.timestampMs < 5000);
			if (duplicate) return state;
			const next: SyncNotice = {
				id: notice.id ?? buildNoticeId(),
				title: notice.title,
				message: notice.message,
				key,
				timestampMs,
				accountId: notice.accountId,
			};
			return {
				syncNotices: [next, ...state.syncNotices].slice(0, 6),
			};
		}),
	dismissSyncNotice: (id) =>
		set((state) => ({
			syncNotices: state.syncNotices.filter((item) => item.id !== id),
		})),
	clearSyncNotices: () => set({syncNotices: []}),
	setMailSyncStatusText: (text) => set({mailSyncStatusText: text}),
	markAccountSyncing: (accountId) =>
		set((state) => {
			if (state.syncingAccountIds.includes(accountId)) return state;
			return {
				syncingAccountIds: [...state.syncingAccountIds, accountId],
			};
		}),
	clearAccountSyncing: (accountId) =>
		set((state) => {
			if (!state.syncingAccountIds.includes(accountId)) return state;
			return {
				syncingAccountIds: state.syncingAccountIds.filter((id) => id !== accountId),
			};
		}),
	pruneSyncingAccounts: (validAccountIds) =>
		set((state) => {
			const valid = new Set(validAccountIds);
			const next = state.syncingAccountIds.filter((id) => valid.has(id));
			if (next.length === state.syncingAccountIds.length) return state;
			return {syncingAccountIds: next};
		}),
	markOptimisticReadPending: ({messageId, accountId, desiredRead}) =>
		set((state) => ({
			optimisticReadByMessageId: {
				...state.optimisticReadByMessageId,
				[messageId]: {
					messageId,
					accountId,
					desiredRead,
					status: 'pending',
					updatedAt: Date.now(),
				},
			},
		})),
	markReadMutationAttempt: (accountId) =>
		set((state) => ({
			lastReadMutationAtByAccount: {
				...state.lastReadMutationAtByAccount,
				[accountId]: Date.now(),
			},
		})),
	markOptimisticReadFailed: ({messageId, error}) =>
		set((state) => {
			const existing = state.optimisticReadByMessageId[messageId];
			const nextBase: OptimisticReadMutation = existing ?? {
				messageId,
				accountId: 0,
				desiredRead: 0,
				status: 'failed',
				updatedAt: Date.now(),
			};
			return {
				optimisticReadByMessageId: {
					...state.optimisticReadByMessageId,
					[messageId]: {
						...nextBase,
						status: 'failed',
						error: String(error || '').trim() || 'Optimistic read mutation failed',
						updatedAt: Date.now(),
					},
				},
			};
		}),
	clearOptimisticRead: (messageId) =>
		set((state) => {
			if (!(messageId in state.optimisticReadByMessageId)) return state;
			const next = {...state.optimisticReadByMessageId};
			delete next[messageId];
			return {optimisticReadByMessageId: next};
		}),
}));
