import {useCallback, useEffect} from 'react';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useAccountsRuntimeStore} from '@renderer/store/accountsRuntimeStore';
import {useMailFoldersStore} from '@renderer/store/mailFoldersStore';
import {useMailMessagesStore} from '@renderer/store/mailMessagesStore';
import {useRuntimeStore} from '@renderer/store/runtimeStore';
import {
	statusSyncPartial,
	statusSyncedMessages,
	statusSyncFailed,
	statusSyncStarted,
	statusSyncingMailbox,
} from '@renderer/lib/statusText';
import type {FolderItem, PublicAccount, SyncStatusEvent} from '@/preload';
import {readPersistedAccountOrder, sortAccountsByOrder} from '@renderer/app/main/email/mailAccountOrder';
import {isAccountEmailModuleEnabled} from '@/shared/accountModules';

function pickPreferredFolderPath(folderRows: FolderItem[], preferredFolderPath: string | null): string | null {
	return (
		(preferredFolderPath && folderRows.some((folder) => folder.path === preferredFolderPath) && preferredFolderPath) ||
		folderRows.find((folder) => folder.type === 'inbox')?.path ||
		folderRows.find((folder) => folder.path.toLowerCase() === 'inbox')?.path ||
		folderRows[0]?.path ||
		null
	);
}

export function MainWindowIpcBridge() {
	const selectedAccountId = useAccountsRuntimeStore((state) => state.selectedAccountId);
	const setAccounts = useAccountsRuntimeStore((state) => state.setAccounts);
	const setSelectedAccountId = useAccountsRuntimeStore((state) => state.setSelectedAccountId);
	const setAccountFoldersById = useMailFoldersStore((state) => state.setAccountFoldersById);
	const selectedFolderPath = useMailFoldersStore((state) => state.selectedFolderPath);
	const setSelectedFolderPath = useMailFoldersStore((state) => state.setSelectedFolderPath);
	const setMessages = useMailMessagesStore((state) => state.setMessages);
	const setHasMoreMessages = useMailMessagesStore((state) => state.setHasMoreMessages);
	const messageFetchLimit = useMailMessagesStore((state) => state.messageFetchLimit);
	const markAccountSyncing = useRuntimeStore((state) => state.markAccountSyncing);
	const clearAccountSyncing = useRuntimeStore((state) => state.clearAccountSyncing);
	const setMailSyncStatusText = useRuntimeStore((state) => state.setMailSyncStatusText);
	const optimisticReadByMessageId = useRuntimeStore((state) => state.optimisticReadByMessageId);
	const lastReadMutationAtByAccount = useRuntimeStore((state) => state.lastReadMutationAtByAccount);

	const hasPendingOptimisticReadForAccount = useCallback(
		(accountId: number): boolean => {
			for (const optimistic of Object.values(optimisticReadByMessageId)) {
				if (optimistic.accountId !== accountId) continue;
				if (optimistic.status === 'pending') return true;
			}
			return false;
		},
		[optimisticReadByMessageId],
	);

	const hasRecentReadMutationForAccount = useCallback(
		(accountId: number, withinMs = 10000): boolean => {
			const lastAt = Number(lastReadMutationAtByAccount[accountId] || 0);
			if (!lastAt) return false;
			return Date.now() - lastAt < withinMs;
		},
		[lastReadMutationAtByAccount],
	);

	const refreshAccountsAndFolders = useCallback(async (): Promise<void> => {
		const list = await ipcClient.getAccounts();
		const sortedAccounts = sortAccountsByOrder(list, readPersistedAccountOrder());
		setAccounts(sortedAccounts);
		const emailAccounts = sortedAccounts.filter((account) => isAccountEmailModuleEnabled(account));
		const folderLists = await Promise.allSettled(emailAccounts.map((account) => ipcClient.getFolders(account.id)));
		const next: Record<number, FolderItem[]> = {};
		emailAccounts.forEach((account, idx) => {
			const entry = folderLists[idx];
			next[account.id] = entry.status === 'fulfilled' ? entry.value : [];
		});
		setAccountFoldersById(next);
		setSelectedAccountId((prev) => {
			if (prev && sortedAccounts.some((account) => account.id === prev)) return prev;
			return emailAccounts[0]?.id ?? sortedAccounts[0]?.id ?? null;
		});
	}, [setAccountFoldersById, setAccounts, setSelectedAccountId]);

	const refreshSelectedAccountMessages = useCallback(
		async (accountId: number): Promise<void> => {
			const folderRows = await ipcClient.getFolders(accountId);
			setAccountFoldersById((prev) => ({
				...prev,
				[accountId]: folderRows,
			}));
			const chosenFolderPath = pickPreferredFolderPath(folderRows, selectedFolderPath);
			setSelectedFolderPath(chosenFolderPath);
			if (!chosenFolderPath) {
				setMessages([]);
				setHasMoreMessages(false);
				return;
			}
			const rows = await ipcClient.getFolderMessages(accountId, chosenFolderPath, messageFetchLimit);
			setHasMoreMessages(rows.length >= messageFetchLimit);
			setMessages(rows);
		},
		[
			messageFetchLimit,
			selectedFolderPath,
			setAccountFoldersById,
			setHasMoreMessages,
			setMessages,
			setSelectedFolderPath,
		],
	);

	const refreshAccountFolders = useCallback(
		async (accountId: number): Promise<void> => {
			const selected = useAccountsRuntimeStore
				.getState()
				.accounts.find((account) => account.id === accountId);
			if (selected && !isAccountEmailModuleEnabled(selected)) return;
			const folderRows = await ipcClient.getFolders(accountId);
			setAccountFoldersById((prev) => ({
				...prev,
				[accountId]: folderRows,
			}));
		},
		[setAccountFoldersById],
	);

	useEffect(() => {
		void refreshAccountsAndFolders().catch(() => undefined);
	}, [refreshAccountsAndFolders]);

	useIpcEvent(ipcClient.onAccountAdded, (created: {id: number; email: string}) => {
		void refreshAccountsAndFolders().catch(() => undefined);
		setSelectedAccountId(created.id);
		setMailSyncStatusText(statusSyncStarted(created.email));
	});

	useIpcEvent(ipcClient.onAccountUpdated, (updated: PublicAccount) => {
		setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
	});

	useIpcEvent(ipcClient.onAccountDeleted, (deleted) => {
		setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
		setAccountFoldersById((prev) => {
			const next = {...prev};
			delete next[deleted.id];
			return next;
		});
		setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
	});

	useIpcEvent(ipcClient.onAccountSyncStatus, (evt: SyncStatusEvent) => {
		if (evt.status === 'syncing') {
			markAccountSyncing(evt.accountId);
			if (evt.accountId === selectedAccountId || selectedAccountId === null) {
				setMailSyncStatusText(statusSyncingMailbox());
			}
			return;
		}

		clearAccountSyncing(evt.accountId);
		if (evt.status === 'done') {
			void refreshAccountFolders(evt.accountId).catch(() => undefined);
			if (evt.accountId === selectedAccountId || selectedAccountId === null) {
				if (evt.summary?.partialSuccess) {
					setMailSyncStatusText(statusSyncPartial(evt.summary?.messages ?? 0, evt.summary?.failedModules));
				} else {
					setMailSyncStatusText(statusSyncedMessages(evt.summary?.messages ?? 0));
				}
			}
			if (evt.accountId === selectedAccountId) {
				const selected = useAccountsRuntimeStore
					.getState()
					.accounts.find((account) => account.id === evt.accountId);
				if (selected && !isAccountEmailModuleEnabled(selected)) {
					return;
				}
				if (
					hasPendingOptimisticReadForAccount(evt.accountId) ||
					hasRecentReadMutationForAccount(evt.accountId)
				) {
					return;
				}
				void refreshSelectedAccountMessages(evt.accountId).catch(() => undefined);
			}
			return;
		}

		if (evt.accountId === selectedAccountId || selectedAccountId === null) {
			setMailSyncStatusText(statusSyncFailed(evt.syncError?.message ?? evt.error));
		}
	});

	return null;
}
