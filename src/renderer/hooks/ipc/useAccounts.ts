import React, {useCallback, useEffect, useMemo} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {
	AddCalendarEventPayload,
	AddressBookItem,
	AccountSyncSummary,
	CalendarEventItem,
	ContactItem,
	DavSyncOptions,
	DavSyncSummary,
	ExportContactsPayload,
	ExportContactsResult,
	FolderItem,
	MessageItem,
	PublicAccount,
	RecentRecipientItem,
	SendEmailBackgroundResult,
	SendEmailPayload,
	SendEmailResult,
	UpdateCalendarEventPayload,
} from '@/preload';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useIpcEvent} from './useIpcEvent';
import {selectTotalUnreadCount, useAccountsRuntimeStore} from '@renderer/store/accountsRuntimeStore';
import {useMailFoldersStore} from '@renderer/store/mailFoldersStore';
import {isAccountEmailModuleEnabled} from '@/shared/accountModules';

type AccountEmailHandle = {
	address: string | null;
	folders: FolderItem[];
	refresh: () => Promise<{account: PublicAccount | null; folders: FolderItem[]}>;
	refreshFolders: () => Promise<FolderItem[]>;
	sync: () => Promise<AccountSyncSummary>;
	messages: (folderPath: string, limit?: number) => Promise<MessageItem[]>;
	search: (query: string, folderPath?: string | null, limit?: number) => Promise<MessageItem[]>;
	send: (payload: Omit<SendEmailPayload, 'accountId'> & {accountId?: number | null}) => Promise<SendEmailResult>;
	sendBackground: (
		payload: Omit<SendEmailPayload, 'accountId'> & {accountId?: number | null},
	) => Promise<SendEmailBackgroundResult>;
	createFolder: (folderPath: string) => Promise<Awaited<ReturnType<typeof ipcClient.createFolder>>>;
	updateFolder: (
		folderPath: string,
		payload: {customName?: string | null; color?: string | null; type?: string | null},
	) => Promise<FolderItem>;
	reorderFolders: (orderedFolderPaths: string[]) => Promise<FolderItem[]>;
	deleteFolder: (folderPath: string) => Promise<Awaited<ReturnType<typeof ipcClient.deleteFolder>>>;
};

type AccountCalendarHandle = {
	items: CalendarEventItem[];
	refresh: (startIso?: string, endIso?: string, limit?: number) => Promise<CalendarEventItem[]>;
	sync: (options?: DavSyncOptions | null) => Promise<DavSyncSummary>;
	add: (payload: AddCalendarEventPayload) => Promise<CalendarEventItem>;
	update: (eventId: number, payload: UpdateCalendarEventPayload) => Promise<CalendarEventItem>;
	remove: (eventId: number) => Promise<{removed: boolean}>;
};

type AccountContactsHandle = {
	items: ContactItem[];
	addressBooks: AddressBookItem[];
	refresh: (query?: string | null, limit?: number, addressBookId?: number | null) => Promise<ContactItem[]>;
	refreshAddressBooks: () => Promise<AddressBookItem[]>;
	sync: () => Promise<DavSyncSummary>;
	add: (payload: Parameters<typeof ipcClient.addContact>[1]) => Promise<ContactItem>;
	update: (contactId: number, payload: Parameters<typeof ipcClient.updateContact>[1]) => Promise<ContactItem>;
	remove: (contactId: number) => Promise<{removed: boolean}>;
	addAddressBook: (name: string) => Promise<AddressBookItem>;
	deleteAddressBook: (addressBookId: number) => Promise<{removed: boolean}>;
	recentRecipients: (query?: string | null, limit?: number) => Promise<RecentRecipientItem[]>;
	export: (payload: ExportContactsPayload) => Promise<ExportContactsResult>;
};

type AccountHandle = {
	id: number | null;
	account: PublicAccount | null;
	mail: AccountEmailHandle;
	email: AccountEmailHandle;
	calendar: AccountCalendarHandle;
	contacts: AccountContactsHandle;
};

export function useAccounts() {
	const queryClient = useQueryClient();
	const accounts = useAccountsRuntimeStore((state) => state.accounts);
	const setAccountsStore = useAccountsRuntimeStore((state) => state.setAccounts);
	const selectedAccountId = useAccountsRuntimeStore((state) => state.selectedAccountId);
	const setSelectedAccountId = useAccountsRuntimeStore((state) => state.setSelectedAccountId);
	const syncSelectedAccountToAccounts = useAccountsRuntimeStore((state) => state.syncSelectedAccountToAccounts);
	const setUnreadCount = useAccountsRuntimeStore((state) => state.setUnreadCount);
	const setFoldersUnreadFallback = useAccountsRuntimeStore((state) => state.setFoldersUnreadFallback);
	const totalUnreadCount = useAccountsRuntimeStore(selectTotalUnreadCount);
	const {getAccount} = useAccountDirectory();

	const accountsQuery = useQuery({
		queryKey: ['accounts'],
		queryFn: () => ipcClient.getAccounts(),
		initialData: accounts,
		refetchOnMount: 'always',
	});
	const unreadCountQuery = useQuery({
		queryKey: ['unread-count'],
		queryFn: async () => Math.max(0, Number(await ipcClient.getUnreadCount()) || 0),
		initialData: useAccountsRuntimeStore.getState().unreadCount,
	});
	const setAccounts = useCallback(
		(value: React.SetStateAction<PublicAccount[]>) => {
			setAccountsStore((prev) =>
				typeof value === 'function' ? (value as (current: PublicAccount[]) => PublicAccount[])(prev) : value,
			);
			queryClient.setQueryData<PublicAccount[]>(['accounts'], (prev) =>
				typeof value === 'function'
					? (value as (current: PublicAccount[]) => PublicAccount[])(prev ?? [])
					: value,
			);
		},
		[queryClient, setAccountsStore],
	);

	const refreshFoldersUnreadFallback = useCallback(async (rows: PublicAccount[]) => {
		const emailAccounts = rows.filter((account) => isAccountEmailModuleEnabled(account));
		if (!emailAccounts.length) {
			setFoldersUnreadFallback(0);
			return;
		}
		const results = await Promise.allSettled(emailAccounts.map((account) => ipcClient.getFolders(account.id)));
		const total = results.reduce((sum, result) => {
			if (result.status !== 'fulfilled') return sum;
			const next = result.value.reduce((acc, folder) => acc + Math.max(0, Number(folder.unread_count) || 0), 0);
			return sum + next;
		}, 0);
		setFoldersUnreadFallback(Math.max(0, total));
	}, [setFoldersUnreadFallback]);

	useEffect(() => {
		setAccountsStore(accountsQuery.data ?? []);
	}, [accountsQuery.data, setAccountsStore]);

	useEffect(() => {
		setUnreadCount(Math.max(0, Number(unreadCountQuery.data) || 0));
	}, [setUnreadCount, unreadCountQuery.data]);

	useEffect(() => {
		syncSelectedAccountToAccounts();
	}, [accounts, syncSelectedAccountToAccounts]);

	useEffect(() => {
		void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
	}, [accounts, refreshFoldersUnreadFallback]);

	useIpcEvent(ipcClient.onAccountAdded, () => {
		void ipcClient
			.getAccounts()
			.then((rows) => {
				queryClient.setQueryData(['accounts'], rows);
			})
			.catch(() => undefined);
	});

	useIpcEvent(ipcClient.onAccountUpdated, (updated) => {
		setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
	});

	useIpcEvent(ipcClient.onAccountDeleted, (deleted) => {
		setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
		if (useAccountsRuntimeStore.getState().selectedAccountId === deleted.id) {
			setSelectedAccountId(null);
		}
	});

	useIpcEvent(ipcClient.onUnreadCountUpdated, (count) => {
		const normalized = Math.max(0, Number(count) || 0);
		queryClient.setQueryData(['unread-count'], normalized);
		setUnreadCount(normalized);
		void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
	});

	useIpcEvent(ipcClient.onMessageReadUpdated, () => {
		void ipcClient
			.getUnreadCount()
			.then((count) => {
				const normalized = Math.max(0, Number(count) || 0);
				queryClient.setQueryData(['unread-count'], normalized);
				setUnreadCount(normalized);
				void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
			})
			.catch(() => undefined);
	});

	return {
		accounts,
		setAccounts,
		selectedAccountId,
		setSelectedAccountId,
		totalUnreadCount,
		getAccount,
	};
}

function buildMissingAccountError(id: number | null): Error {
	return new Error(`No account selected${id ? ` (accountId=${id})` : ''}`);
}

export function useAccountDirectory() {
	const accounts = useAccountsRuntimeStore((state) => state.accounts);
	const setAccounts = useAccountsRuntimeStore((state) => state.setAccounts);
	const accountFoldersById = useMailFoldersStore((state) => state.accountFoldersById);
	const setAccountFoldersById = useMailFoldersStore((state) => state.setAccountFoldersById);

	const getAccount = useCallback(
		(accountId: number | null | undefined): AccountHandle => {
			const normalizedAccountId = Number(accountId || 0) || null;
			const account = normalizedAccountId
				? (accounts.find((item) => item.id === normalizedAccountId) ?? null)
				: null;
			const requireAccountId = (): number => {
				if (!normalizedAccountId) throw buildMissingAccountError(normalizedAccountId);
				return normalizedAccountId;
			};
			const refreshFolders = async (): Promise<FolderItem[]> => {
				const id = requireAccountId();
				const rows = await ipcClient.getFolders(id);
				setAccountFoldersById((prev) => ({
					...prev,
					[id]: rows,
				}));
				return rows;
			};
			const refreshAccountAndFolders = async (): Promise<{account: PublicAccount | null; folders: FolderItem[]}> => {
				const id = requireAccountId();
				const [accountsRows, folderRows] = await Promise.all([ipcClient.getAccounts(), ipcClient.getFolders(id)]);
				setAccounts(accountsRows);
				setAccountFoldersById((prev) => ({
					...prev,
					[id]: folderRows,
				}));
				return {
					account: accountsRows.find((item) => item.id === id) ?? null,
					folders: folderRows,
				};
			};
			const refreshCalendarItems = async (startIso?: string, endIso?: string, limit = 5000): Promise<CalendarEventItem[]> => {
				const id = requireAccountId();
				return await ipcClient.getCalendarEvents(id, startIso, endIso, limit);
			};
			const refreshContactItems = async (
				query?: string | null,
				limit = 600,
				addressBookId?: number | null,
			): Promise<ContactItem[]> => {
				const id = requireAccountId();
				return await ipcClient.getContacts(id, query ?? null, limit, addressBookId ?? null);
			};
			const refreshAddressBooks = async (): Promise<AddressBookItem[]> => {
				const id = requireAccountId();
				return await ipcClient.getAddressBooks(id);
			};

			const mailHandle: AccountEmailHandle = {
				address: account?.email ?? null,
				folders: normalizedAccountId ? (accountFoldersById[normalizedAccountId] ?? []) : [],
				refresh: refreshAccountAndFolders,
				refreshFolders,
				sync: async () => await ipcClient.syncAccount(requireAccountId()),
				messages: async (folderPath, limit) =>
					await ipcClient.getFolderMessages(requireAccountId(), folderPath, limit),
				search: async (query, folderPath, limit) =>
					await ipcClient.searchMessages(requireAccountId(), query, folderPath ?? null, limit),
				send: async (payload) => {
					const id = payload.accountId ?? requireAccountId();
					return await ipcClient.sendEmail({...payload, accountId: id});
				},
				sendBackground: async (payload) => {
					const id = payload.accountId ?? requireAccountId();
					return await ipcClient.sendEmailBackground({...payload, accountId: id});
				},
				createFolder: async (folderPath) => await ipcClient.createFolder(requireAccountId(), folderPath),
				updateFolder: async (folderPath, payload) =>
					await ipcClient.updateFolderSettings(requireAccountId(), folderPath, payload),
				reorderFolders: async (orderedFolderPaths) =>
					await ipcClient.reorderCustomFolders(requireAccountId(), orderedFolderPaths),
				deleteFolder: async (folderPath) => await ipcClient.deleteFolder(requireAccountId(), folderPath),
			};

			return {
				id: normalizedAccountId,
				account,
				mail: mailHandle,
				email: mailHandle,
				calendar: {
					items: [],
					refresh: refreshCalendarItems,
					sync: async (options) => await ipcClient.syncDav(requireAccountId(), options),
					add: async (payload) => {
						const id = requireAccountId();
						return await ipcClient.addCalendarEvent(id, payload);
					},
					update: async (eventId, payload) => {
						requireAccountId();
						return await ipcClient.updateCalendarEvent(eventId, payload);
					},
					remove: async (eventId) => {
						requireAccountId();
						return await ipcClient.deleteCalendarEvent(eventId);
					},
				},
				contacts: {
					items: [],
					addressBooks: [],
					refresh: refreshContactItems,
					refreshAddressBooks,
					sync: async () => await ipcClient.syncDav(requireAccountId()),
					add: async (payload) => {
						const id = requireAccountId();
						return await ipcClient.addContact(id, payload);
					},
					update: async (contactId, payload) => {
						requireAccountId();
						return await ipcClient.updateContact(contactId, payload);
					},
					remove: async (contactId) => {
						requireAccountId();
						return await ipcClient.deleteContact(contactId);
					},
					addAddressBook: async (name) => {
						const id = requireAccountId();
						return await ipcClient.addAddressBook(id, name);
					},
					deleteAddressBook: async (addressBookId) => {
						const id = requireAccountId();
						return await ipcClient.deleteAddressBook(id, addressBookId);
					},
					recentRecipients: async (query, limit) =>
						await ipcClient.getRecentRecipients(requireAccountId(), query ?? null, limit),
					export: async (payload) => await ipcClient.exportContacts(requireAccountId(), payload),
				},
			};
		},
		[
			accountFoldersById,
			accounts,
			setAccountFoldersById,
			setAccounts,
		],
	);

	return useMemo(
		() => ({
			getAccount,
		}),
		[getAccount],
	);
}

export function useAccount(accountId: number | null | undefined): AccountHandle {
	const {getAccount} = useAccountDirectory();
	return useMemo(() => getAccount(accountId), [accountId, getAccount]);
}
