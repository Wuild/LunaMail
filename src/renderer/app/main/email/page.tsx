import {ContextMenu, ContextMenuItem} from '@renderer/components/ui/ContextMenu';
import React, {useCallback, useEffect, useMemo, useRef, useState, type SetStateAction} from 'react';
import {ArrowLeft, FileText, Forward, Reply, ReplyAll, ShieldAlert, ShieldCheck, Trash2} from 'lucide-react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import MainLayout from '@renderer/layouts/MainLayout';
import {
	buildForwardQuoteHtml,
	buildForwardQuoteText,
	buildReferences,
	buildReplyQuoteHtml,
	buildReplyQuoteText,
	countRecipients,
	ensurePrefixedSubject,
	htmlToText,
	inferReplyAddress,
	normalizeMessageId,
} from '@renderer/features/mail/composeDraft';
import {isProtectedFolder} from '@renderer/features/mail/folders';
import {buildSpoofHints} from '@renderer/features/mail/spoof';
import ToolboxButton from '@renderer/features/mail/ToolboxButton';
import {
	buildSourceDocCsp,
	enrichAnchorTitles,
	extractEmailAddress,
	isSenderAllowed,
} from '@renderer/features/mail/remoteContent';
import MessageSourceModal from '@renderer/components/mail/MessageSourceModal';
import {MessageHeaderCard} from '@renderer/components/mail/MessageHeaderCard';
import {MessageBodyPane} from '@renderer/components/mail/MessageBodyPane';
import {isEditableTarget} from '@renderer/lib/dom';
import {clampToViewport} from '@renderer/lib/format';
import {
	statusSyncedMailboxAndDav,
	statusSyncedMessages,
	statusSyncFailed,
	statusSyncingMailbox,
	toErrorMessage,
} from '@renderer/lib/statusText';
import {useThemePreference} from '@renderer/hooks/useAppTheme';
import {useAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useAccount, useAccountDirectory} from '@renderer/hooks/ipc/useAccounts';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useSystemLocale} from '@renderer/hooks/ipc/useSystemLocale';
import {useMailSelection} from '@renderer/hooks/mail/useMailSelection';
import {useMessageBodyLoader} from '@renderer/hooks/mail/useMessageBodyLoader';
import {useMailSyncStatus} from '@renderer/hooks/mail/useMailSyncStatus';
import {useOptimisticReadState} from '@renderer/hooks/mail/useOptimisticReadState';
import {useMailActionMutations} from '@renderer/hooks/mail/useMailActionMutations';
import {useAccountsRuntimeStore} from '@renderer/store/accountsRuntimeStore';
import {useMailFoldersStore} from '@renderer/store/mailFoldersStore';
import {useMailMessagesStore} from '@renderer/store/mailMessagesStore';
import {buildMessageIframeSrcDoc, formatMessageTagLabel, parseRouteNumber} from './mailPageHelpers';
import {normalizeAccountOrder, readPersistedAccountOrder, writePersistedAccountOrder} from './mailAccountOrder';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@/shared/defaults';
import type {FolderItem, MessageItem, OpenMessageTargetEvent, PublicAccount} from '@/preload';
import {isAccountEmailModuleEnabled} from '@/shared/accountModules';

const MESSAGE_PAGE_SIZE = 100;
const SEARCH_FALLBACK_MESSAGES_PER_FOLDER = 1000;
const SIDE_LIST_SPLIT_BREAKPOINT_PX = 1320;
const TOP_TABLE_COMPACT_BREAKPOINT_PX = 860;
const LEGACY_JUNK_SENDER_RULE_PREFIX = '[LunaMail] sender-rule:';

function hasMoreFolderMessages(loadedCount: number, requestedLimit: number, folderTotalCount: number): boolean {
	if (loadedCount >= requestedLimit) return true;
	return folderTotalCount > loadedCount;
}

function isJunkFolder(folder: FolderItem | null | undefined): boolean {
	if (!folder) return false;
	const type = String(folder.type || '').toLowerCase();
	const path = String(folder.path || '').toLowerCase();
	return type === 'junk' || path.includes('spam') || path.includes('junk');
}

function isInboxFolder(folder: FolderItem | null | undefined): boolean {
	if (!folder) return false;
	const type = String(folder.type || '').toLowerCase();
	const path = String(folder.path || '').toLowerCase();
	return type === 'inbox' || path === 'inbox' || path.endsWith('/inbox');
}

function MailPage() {
	const params = useParams<{accountId?: string; folderId?: string; emailId?: string}>();
	const navigate = useNavigate();
	const location = useLocation();
	const allAccounts = useAccountsRuntimeStore((state) => state.accounts);
	const accounts = useMemo(
		() => allAccounts.filter((account) => isAccountEmailModuleEnabled(account)),
		[allAccounts],
	);
	const setAccountsStore = useAccountsRuntimeStore((state) => state.setAccounts);
	const selectedAccountId = useAccountsRuntimeStore((state) => state.selectedAccountId);
	const setSelectedAccountId = useAccountsRuntimeStore((state) => state.setSelectedAccountId);
	const [accountOrder, setAccountOrder] = useState<number[]>(() => readPersistedAccountOrder());
	const accountFoldersById = useMailFoldersStore((state) => state.accountFoldersById);
	const setAccountFoldersByIdStore = useMailFoldersStore((state) => state.setAccountFoldersById);
	const selectedFolderPath = useMailFoldersStore((state) => state.selectedFolderPath);
	const setSelectedFolderPath = useMailFoldersStore((state) => state.setSelectedFolderPath);
	const folders = useMemo(
		() => (selectedAccountId ? (accountFoldersById[selectedAccountId] ?? []) : []),
		[accountFoldersById, selectedAccountId],
	);
	const searchQuery = useMailMessagesStore((state) => state.searchQuery);
	const messages = useMailMessagesStore((state) => state.messages);
	const searchResults = useMailMessagesStore((state) => state.searchResults);
	const searchLoading = useMailMessagesStore((state) => state.searchLoading);
	const messageFetchLimit = useMailMessagesStore((state) => state.messageFetchLimit);
	const loadingMoreMessages = useMailMessagesStore((state) => state.loadingMoreMessages);
	const hasMoreMessages = useMailMessagesStore((state) => state.hasMoreMessages);
	const setMessagesStore = useMailMessagesStore((state) => state.setMessages);
	const setSearchQueryStore = useMailMessagesStore((state) => state.setSearchQuery);
	const setSearchResultsStore = useMailMessagesStore((state) => state.setSearchResults);
	const setSearchLoadingStore = useMailMessagesStore((state) => state.setSearchLoading);
	const setMessageFetchLimitStore = useMailMessagesStore((state) => state.setMessageFetchLimit);
	const setLoadingMoreMessagesStore = useMailMessagesStore((state) => state.setLoadingMoreMessages);
	const setHasMoreMessagesStore = useMailMessagesStore((state) => state.setHasMoreMessages);
	const resetMessageListState = useMailMessagesStore((state) => state.resetMessageListState);
	const setAccountFoldersById = useCallback(
		(value: SetStateAction<Record<number, FolderItem[]>>) => {
			setAccountFoldersByIdStore((prev) =>
				typeof value === 'function'
					? (value as (current: Record<number, FolderItem[]>) => Record<number, FolderItem[]>)(prev)
					: value,
			);
		},
		[setAccountFoldersByIdStore],
	);
	const setFolders = useCallback(
		(value: SetStateAction<FolderItem[]>) => {
			if (!selectedAccountId) return;
			setAccountFoldersByIdStore((prev) => {
				const current = prev[selectedAccountId] ?? [];
				const next =
					typeof value === 'function' ? (value as (current: FolderItem[]) => FolderItem[])(current) : value;
				return {
					...prev,
					[selectedAccountId]: next,
				};
			});
		},
		[selectedAccountId, setAccountFoldersByIdStore],
	);
	const setMessages = useCallback(
		(value: SetStateAction<MessageItem[]>) => {
			setMessagesStore((prev) =>
				typeof value === 'function' ? (value as (current: MessageItem[]) => MessageItem[])(prev) : value,
			);
		},
		[setMessagesStore],
	);
	const setSearchQuery = useCallback(
		(value: SetStateAction<string>) => {
			setSearchQueryStore((prev) =>
				typeof value === 'function' ? (value as (current: string) => string)(prev) : value,
			);
		},
		[setSearchQueryStore],
	);
	const setSearchResults = useCallback(
		(value: SetStateAction<MessageItem[]>) => {
			setSearchResultsStore((prev) =>
				typeof value === 'function' ? (value as (current: MessageItem[]) => MessageItem[])(prev) : value,
			);
		},
		[setSearchResultsStore],
	);
	const setSearchLoading = useCallback(
		(value: SetStateAction<boolean>) => {
			setSearchLoadingStore((prev) =>
				typeof value === 'function' ? (value as (current: boolean) => boolean)(prev) : value,
			);
		},
		[setSearchLoadingStore],
	);
	const setMessageFetchLimit = useCallback(
		(value: SetStateAction<number>) => {
			setMessageFetchLimitStore((prev) =>
				typeof value === 'function' ? (value as (current: number) => number)(prev) : value,
			);
		},
		[setMessageFetchLimitStore],
	);
	const setLoadingMoreMessages = useCallback(
		(value: SetStateAction<boolean>) => {
			setLoadingMoreMessagesStore((prev) =>
				typeof value === 'function' ? (value as (current: boolean) => boolean)(prev) : value,
			);
		},
		[setLoadingMoreMessagesStore],
	);
	const setHasMoreMessages = useCallback(
		(value: SetStateAction<boolean>) => {
			setHasMoreMessagesStore((prev) =>
				typeof value === 'function' ? (value as (current: boolean) => boolean)(prev) : value,
			);
		},
		[setHasMoreMessagesStore],
	);
	const setAccounts = useCallback(
		(value: SetStateAction<PublicAccount[]>) => {
			setAccountsStore((prev) =>
				typeof value === 'function' ? (value as (current: PublicAccount[]) => PublicAccount[])(prev) : value,
			);
		},
		[setAccountsStore],
	);
	const [showMessageDetails, setShowMessageDetails] = useState(false);
	const [senderAvatarSrc, setSenderAvatarSrc] = useState<string | null>(null);
	const [showSourceModal, setShowSourceModal] = useState(false);
	const [messageSource, setMessageSource] = useState('');
	const [sourceLoading, setSourceLoading] = useState(false);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const [attachmentMenu, setAttachmentMenu] = useState<{x: number; y: number; index: number} | null>(null);
	const [sessionRemoteAllowedMessageIds, setSessionRemoteAllowedMessageIds] = useState<number[]>([]);
	const [hoveredLinkUrl, setHoveredLinkUrl] = useState('');
	const [isPointerOverMessageFrame, setIsPointerOverMessageFrame] = useState(false);
	const {appSettings, setAppSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
	const selectedFolderPathRef = useRef<string | null>(null);
	const selectedMessageIdRef = useRef<number | null>(null);
	const pendingDeleteMessageIdsRef = useRef<Set<number>>(new Set());
	const pendingMoveMessageIdsRef = useRef<Set<number>>(new Set());
	const reconcileReloadTimerRef = useRef<number | null>(null);
	const pendingOpenMessageTargetRef = useRef<OpenMessageTargetEvent | null>(null);
	const messageListRequestSeqRef = useRef(0);
	const emptyFolderHydrationAttemptedRef = useRef<Set<number>>(new Set());
	const backgroundFolderSyncsRef = useRef<Set<string>>(new Set());
	const sourceRequestSeqRef = useRef(0);
	const senderAvatarRequestSeqRef = useRef(0);
	const accountOrderRef = useRef<number[]>(accountOrder);
	const lastOpenedDraftInMailViewRef = useRef<number | null>(null);
	const {systemLocale} = useSystemLocale();
	const [windowViewport, setWindowViewport] = useState<{width: number; height: number}>({
		width: window.innerWidth,
		height: window.innerHeight,
	});
	const {syncStatusText, setSyncStatusText, syncingAccountIds, pruneSyncingAccounts} = useMailSyncStatus();
	const {
		selectedMessageId,
		setSelectedMessageId,
		selectedMessageIds,
		setSelectedMessageIds,
		pendingAutoReadMessageId,
		setPendingAutoReadMessageId,
		selectionAnchorIndexRef,
		handleSelectMessage,
		navigateMessageSelection,
		selectAllMessages,
		clearSelection,
	} = useMailSelection({
		messages,
		navigate,
		locationPathname: location.pathname,
		onSelectMail: () => undefined,
	});
	const routeAccountId = parseRouteNumber(params.accountId);
	const routeFolderId = parseRouteNumber(params.folderId);
	const routeEmailId = parseRouteNumber(params.emailId);
	const {bodyLoading, selectedMessageBody} = useMessageBodyLoader(selectedMessageId);
	const {clearPendingReadState, getPendingRead, applyPendingReadOverrides, applyReadOptimistic, syncReadState} =
		useOptimisticReadState({
			setMessages,
			setAccountFoldersById,
			setSyncStatusText,
		});
	const {
		setMessageFlagMutation,
		setMessageTagMutation,
		moveMessageMutation,
		archiveMessageMutation,
		deleteMessageMutation,
	} = useMailActionMutations();
	const [historyIndex, setHistoryIndex] = useState<number>(() => {
		const idx = window.history.state?.idx;
		return typeof idx === 'number' ? idx : 0;
	});
	const [historyMaxIndex, setHistoryMaxIndex] = useState<number>(() => {
		const idx = window.history.state?.idx;
		return typeof idx === 'number' ? idx : 0;
	});
	const {getAccount} = useAccountDirectory();
	const selectedAccount = useAccount(selectedAccountId);

	const selectedMessage = useMemo(
		() => messages.find((m) => m.id === selectedMessageId) ?? null,
		[messages, selectedMessageId],
	);
	const selectedFolder = useMemo(
		() => (selectedFolderPath ? (folders.find((folder) => folder.path === selectedFolderPath) ?? null) : null),
		[folders, selectedFolderPath],
	);
	const isSelectedMessageInJunk = useMemo(() => {
		if (!selectedMessage) return false;
		const accountFolders = accountFoldersById[selectedMessage.account_id] ?? [];
		const messageFolder = accountFolders.find((folder) => folder.id === selectedMessage.folder_id) ?? null;
		return isJunkFolder(messageFolder);
	}, [accountFoldersById, selectedMessage]);
	const isDraftMessageSelected = useMemo(() => {
		if (!selectedMessage) return false;
		const folderType = String(selectedFolder?.type || '').toLowerCase();
		const folderPath = String(selectedFolder?.path || selectedFolderPath || '').toLowerCase();
		if (folderType === 'drafts' || folderPath.includes('draft')) return true;
		return /^<draft\./i.test(String(selectedMessage.message_id || ''));
	}, [selectedFolder, selectedFolderPath, selectedMessage]);
	const selectedFolderTotalCount = Math.max(0, Number(selectedFolder?.total_count) || 0);
	const canReplyAll = useMemo(
		() => countRecipients(selectedMessage?.to_address || '') > 1,
		[selectedMessage?.to_address],
	);
	const messageAttachments = selectedMessageBody?.attachments ?? [];
	const senderWhitelisted = isSenderAllowed(selectedMessage?.from_address, appSettings.remoteContentAllowlist || []);
	const sessionAllowed = selectedMessageId ? sessionRemoteAllowedMessageIds.includes(selectedMessageId) : false;
	const allowRemoteForSelectedMessage = !appSettings.blockRemoteContent || senderWhitelisted || sessionAllowed;
	const warnOnExternalLinksForSelectedMessage = Boolean(selectedMessage) && !senderWhitelisted;
	const isCompactSideList =
		appSettings.mailView === 'side-list' && windowViewport.width < SIDE_LIST_SPLIT_BREAKPOINT_PX;
	const isCompactTopTable =
		appSettings.mailView === 'top-table' && windowViewport.height < TOP_TABLE_COMPACT_BREAKPOINT_PX;
	const showMessageOnly = Boolean(selectedMessageId) && (isCompactSideList || isCompactTopTable);

	useEffect(() => {
		accountOrderRef.current = accountOrder;
	}, [accountOrder]);

	useEffect(() => {
		writePersistedAccountOrder(accountOrder);
	}, [accountOrder]);

	const renderedBodyHtml = useMemo(() => {
		if (!selectedMessageBody) return null;
		if (selectedMessageBody.html) return selectedMessageBody.html;
		return null;
	}, [selectedMessageBody]);

	const iframeSrcDoc = useMemo(() => {
		if (!selectedMessageBody) return null;
		if (!renderedBodyHtml) return null;
		return buildMessageIframeSrcDoc(
			renderedBodyHtml,
			allowRemoteForSelectedMessage,
			warnOnExternalLinksForSelectedMessage,
			enrichAnchorTitles,
			buildSourceDocCsp,
		);
	}, [allowRemoteForSelectedMessage, selectedMessageBody, renderedBodyHtml, warnOnExternalLinksForSelectedMessage]);

	useThemePreference(appSettings.theme);

	useEffect(() => {
		if (!selectedAccountId) return;
		let cancelled = false;
		void ipcClient
			.getMailFilters(selectedAccountId)
			.then(async (filters) => {
				if (cancelled) return;
				const legacyRuleIds = filters
					.filter((filter) =>
						String(filter.name || '')
							.trim()
							.startsWith(LEGACY_JUNK_SENDER_RULE_PREFIX),
					)
					.map((filter) => filter.id);
				for (const filterId of legacyRuleIds) {
					if (cancelled) return;
					await ipcClient.deleteMailFilter(selectedAccountId, filterId);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [selectedAccountId]);

	useEffect(() => {
		const onResize = () => {
			setWindowViewport({
				width: window.innerWidth,
				height: window.innerHeight,
			});
		};
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
		};
	}, []);

	useEffect(() => {
		if (!selectedMessage) return;
		if (selectedMessage.is_read) {
			if (pendingAutoReadMessageId === selectedMessage.id) {
				setPendingAutoReadMessageId(null);
			}
			return;
		}
		if (pendingAutoReadMessageId !== selectedMessage.id) return;
		if (!selectedAccountId || !selectedFolderPath) return;
		applyReadOptimistic(selectedMessage, 1, selectedFolderPath);
		setPendingAutoReadMessageId(null);
		void syncReadState(selectedMessage, 1, selectedFolderPath);
	}, [
		applyReadOptimistic,
		pendingAutoReadMessageId,
		selectedAccountId,
		selectedFolderPath,
		selectedMessage,
		setPendingAutoReadMessageId,
		syncReadState,
	]);

	useEffect(() => {
		setAccountOrder((prev) => {
			const normalized = normalizeAccountOrder(prev, accounts);
			accountOrderRef.current = normalized;
			return normalized;
		});
	}, [accounts]);

	const reorderAccounts = useCallback(
		(orderedAccountIds: number[]) => {
			setAccounts((prev) => {
				const normalizedOrder = normalizeAccountOrder(orderedAccountIds, prev);
				accountOrderRef.current = normalizedOrder;
				setAccountOrder(normalizedOrder);
				const accountById = new Map<number, PublicAccount>(prev.map((account) => [account.id, account]));
				return normalizedOrder
					.map((id) => accountById.get(id))
					.filter((account): account is PublicAccount => Boolean(account));
			});
		},
		[setAccountOrder, setAccounts],
	);

	useIpcEvent(ipcClient.onMessageReadUpdated, (evt) => {
		const pending = getPendingRead(evt.messageId);
		const wasPendingLocalRead = Boolean(pending);
		if (pending) {
			const desired = Boolean(pending.desiredRead);
			if (Boolean(evt.isRead) !== desired) {
				return;
			}
			clearPendingReadState(evt.messageId);
		}
		setMessages((prev) =>
			prev.map((message) => (message.id === evt.messageId ? {...message, is_read: evt.isRead} : message)),
		);
		if (wasPendingLocalRead) {
			// Keep optimistic folder counters stable; server totals can lag behind read mutation events.
			return;
		}
		setAccountFoldersById((prev) => {
			const accountFolders = prev[evt.accountId] ?? [];
			return {
				...prev,
				[evt.accountId]: accountFolders.map((folder) =>
					folder.id === evt.folderId
						? {...folder, unread_count: evt.unreadCount, total_count: evt.totalCount}
						: folder,
				),
			};
		});
	});

	useIpcEvent(ipcClient.onOpenMessageTarget, (target) => {
		pendingOpenMessageTargetRef.current = target;
		setSelectedAccountId(target.accountId);
		setPendingAutoReadMessageId(target.messageId);
		const accountFolders = accountFoldersById[target.accountId] ?? [];
		const matchedFolder = accountFolders.find((folder) => folder.path === target.folderPath) ?? null;
		if (matchedFolder) {
			const targetPath = `/email/${target.accountId}/${matchedFolder.id}/${target.messageId}`;
			if (location.pathname !== targetPath) {
				navigate(targetPath);
			}
			return;
		}
		const fallbackPath = `/email/${target.accountId}`;
		if (location.pathname !== fallbackPath) {
			navigate(fallbackPath);
		}
	});

	useEffect(() => {
		if (!selectedAccountId) {
			resetMessageListState();
			setSelectedFolderPath(null);
			setSelectedMessageId(null);
			setSelectedMessageIds([]);
			selectionAnchorIndexRef.current = null;
			setPendingAutoReadMessageId(null);
			return;
		}

		void loadFoldersAndMessages(
			selectedAccountId,
			routeAccountId === selectedAccountId ? routeFolderId : null,
			routeAccountId === selectedAccountId ? routeEmailId : null,
		);
	}, [selectedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

	const triggerBackgroundFolderSync = useCallback(
		(accountId: number, folderPath: string, reason: string): void => {
			const key = `${accountId}:${folderPath}`;
			if (backgroundFolderSyncsRef.current.has(key)) return;
			backgroundFolderSyncsRef.current.add(key);
			setSyncStatusText(reason);
			void getAccount(accountId)
				.email.sync()
				.catch(() => undefined)
				.finally(() => {
					backgroundFolderSyncsRef.current.delete(key);
				});
		},
		[getAccount, setSyncStatusText],
	);

	useEffect(() => {
		if (!selectedAccountId || !selectedFolderPath) {
			setMessages([]);
			setHasMoreMessages(false);
			setLoadingMoreMessages(false);
			setMessageFetchLimit(MESSAGE_PAGE_SIZE);
			setSelectedMessageIds([]);
			selectionAnchorIndexRef.current = null;
			setPendingAutoReadMessageId(null);
			return;
		}

		const loadMessages = async () => {
			const requestSeq = ++messageListRequestSeqRef.current;
			setMessageFetchLimit(MESSAGE_PAGE_SIZE);
			setLoadingMoreMessages(true);
			try {
				const rowsRaw = await selectedAccount.email.messages(selectedFolderPath, MESSAGE_PAGE_SIZE);
				if (requestSeq !== messageListRequestSeqRef.current) return;
				const hasMore = hasMoreFolderMessages(rowsRaw.length, MESSAGE_PAGE_SIZE, selectedFolderTotalCount);
				setHasMoreMessages(hasMore);
				if (hasMore && rowsRaw.length < MESSAGE_PAGE_SIZE) {
					triggerBackgroundFolderSync(
						selectedAccountId,
						selectedFolderPath,
						'Syncing older messages in background...',
					);
				}
				setMessages(applyPendingReadOverrides(filterOutPendingRemovals(rowsRaw)));
			} finally {
				if (requestSeq === messageListRequestSeqRef.current) {
					setLoadingMoreMessages(false);
				}
			}
		};
		void loadMessages();
	}, [selectedAccountId, selectedFolderPath, selectedFolderTotalCount]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const query = searchQuery.trim();
		if (query.length === 0) {
			setSearchResults([]);
			setSearchLoading(false);
			return;
		}
		const candidateAccountIds = Array.from(
			new Set(
				[
					...accounts.map((account) => account.id),
					...Object.keys(accountFoldersById)
						.map((value) => Number(value))
						.filter((value) => Number.isFinite(value) && value > 0),
					selectedAccountId,
				].filter((value): value is number => Number.isFinite(value) && Number(value) > 0),
			),
		);
		if (candidateAccountIds.length === 0) {
			setSearchResults([]);
			setSearchLoading(false);
			return;
		}

		let active = true;
		const loadingDelayMs = 120;
		const run = async () => {
			const loadingTimer = window.setTimeout(() => {
				if (active) setSearchLoading(true);
			}, loadingDelayMs);
			try {
				const perAccountLimit = 120;
				const rowsByAccount = await Promise.allSettled(
					candidateAccountIds.map((accountId) =>
						getAccount(accountId).email.search(query, null, perAccountLimit),
					),
				);
				if (!active) return;
				const fulfilled = rowsByAccount
					.filter((result): result is PromiseFulfilledResult<MessageItem[]> => result.status === 'fulfilled')
					.map((result) => result.value);
				const merged = fulfilled.flat().sort((a, b) => {
					const aTime = a.date ? Date.parse(a.date) : 0;
					const bTime = b.date ? Date.parse(b.date) : 0;
					return bTime - aTime;
				});
				if (merged.length > 0 || fulfilled.length > 0) {
					setSearchResults(merged);
					return;
				}
				// Fallback: if all IPC search calls fail, scan cached message headers across folders.
				const needle = query.toLowerCase();
				const foldersByAccount = await Promise.allSettled(
					candidateAccountIds.map(async (accountId) => {
						const cachedFolders = accountFoldersById[accountId] ?? [];
						if (cachedFolders.length > 0) return {accountId, folders: cachedFolders};
						const folders = await getAccount(accountId).email.refreshFolders();
						return {accountId, folders};
					}),
				);
				if (!active) return;
				const folderPairs = foldersByAccount.flatMap((result) =>
					result.status === 'fulfilled'
						? result.value.folders.map((folder) => ({
								accountId: result.value.accountId,
								folderPath: folder.path,
							}))
						: [],
				);
				const scannedRows = await Promise.allSettled(
					folderPairs.map(({accountId, folderPath}) =>
						getAccount(accountId).email.messages(folderPath, SEARCH_FALLBACK_MESSAGES_PER_FOLDER),
					),
				);
				if (!active) return;
				const deduped = new Map<number, MessageItem>();
				for (const result of scannedRows) {
					if (result.status !== 'fulfilled') continue;
					for (const row of result.value) {
						if (!matchesMailSearchNeedle(row, needle)) continue;
						if (!deduped.has(row.id)) deduped.set(row.id, row);
					}
				}
				const fallback = Array.from(deduped.values()).sort((a, b) => {
					const aTime = a.date ? Date.parse(a.date) : 0;
					const bTime = b.date ? Date.parse(b.date) : 0;
					return bTime - aTime;
				});
				setSearchResults(fallback);
			} finally {
				window.clearTimeout(loadingTimer);
				if (active) setSearchLoading(false);
			}
		};
		void run();
		return () => {
			active = false;
		};
	}, [searchQuery, accounts, accountFoldersById, selectedAccountId, getAccount, setSearchLoading, setSearchResults]);

	const loadMoreMessages = useCallback(async () => {
		if (!selectedAccountId || !selectedFolderPath || loadingMoreMessages || !hasMoreMessages) return;
		const requestSeq = ++messageListRequestSeqRef.current;
		const nextLimit = messageFetchLimit + MESSAGE_PAGE_SIZE;
		setLoadingMoreMessages(true);
		try {
			const rowsRaw = await selectedAccount.email.messages(selectedFolderPath, nextLimit);
			if (requestSeq !== messageListRequestSeqRef.current) return;
			setMessageFetchLimit(nextLimit);
			const hasMore = hasMoreFolderMessages(rowsRaw.length, nextLimit, selectedFolderTotalCount);
			setHasMoreMessages(hasMore);
			if (hasMore && rowsRaw.length < nextLimit) {
				triggerBackgroundFolderSync(selectedAccountId, selectedFolderPath, 'Syncing older messages...');
			}
			setMessages(applyPendingReadOverrides(filterOutPendingRemovals(rowsRaw)));
		} finally {
			if (requestSeq === messageListRequestSeqRef.current) {
				setLoadingMoreMessages(false);
			}
		}
	}, [
		hasMoreMessages,
		loadingMoreMessages,
		messageFetchLimit,
		selectedAccount,
		selectedAccountId,
		selectedFolderTotalCount,
		selectedFolderPath,
		setHasMoreMessages,
		setLoadingMoreMessages,
		setMessageFetchLimit,
		setMessages,
		applyPendingReadOverrides,
		triggerBackgroundFolderSync,
	]);

	useEffect(() => {
		if (!selectedAccountId) return;
		const selectedFolders = accountFoldersById[selectedAccountId] ?? [];
		if (selectedFolders.length > 0) {
			emptyFolderHydrationAttemptedRef.current.delete(selectedAccountId);
			return;
		}
		if (emptyFolderHydrationAttemptedRef.current.has(selectedAccountId)) return;
		emptyFolderHydrationAttemptedRef.current.add(selectedAccountId);
		let active = true;
		void (async () => {
			try {
				const target = getAccount(selectedAccountId);
				const folders = await target.email.refreshFolders();
				if (!active || folders.length > 0) return;
				void target.email.sync().catch(() => undefined);
			} catch {
				// no-op: standard sync/status events will continue reconciliation attempts
			}
		})();
		return () => {
			active = false;
		};
	}, [accountFoldersById, selectedAccountId, getAccount]);

	useEffect(() => {
		setShowMessageDetails(false);
		setShowSourceModal(false);
		setMessageSource('');
		setSourceLoading(false);
		setSourceError(null);
		setHoveredLinkUrl('');
		setIsPointerOverMessageFrame(false);
	}, [selectedMessageId]);

	useEffect(() => {
		const fromAddress = selectedMessage?.from_address ?? null;
		const normalizedAddress = typeof fromAddress === 'string' ? fromAddress.trim() : '';
		const requestSeq = ++senderAvatarRequestSeqRef.current;
		setSenderAvatarSrc(null);
		if (!normalizedAddress) {
			return;
		}
		let active = true;
		void ipcClient
			.getSenderAvatar(normalizedAddress)
			.then((avatarSrc) => {
				if (!active || senderAvatarRequestSeqRef.current !== requestSeq) return;
				setSenderAvatarSrc(avatarSrc || null);
			})
			.catch(() => {
				if (!active || senderAvatarRequestSeqRef.current !== requestSeq) return;
				setSenderAvatarSrc(null);
			});
		return () => {
			active = false;
		};
	}, [selectedMessage?.from_address, selectedMessageId]);

	useEffect(() => {
		selectedFolderPathRef.current = selectedFolderPath;
	}, [selectedFolderPath]);

	useEffect(() => {
		selectedMessageIdRef.current = selectedMessageId;
	}, [selectedMessageId]);

	const isDraftMessageInMailView = useCallback(
		(message: MessageItem | null | undefined): boolean => {
			if (!message) return false;
			const folder = folders.find((item) => item.id === message.folder_id) ?? null;
			const folderType = String(folder?.type || '').toLowerCase();
			const folderPath = String(folder?.path || '').toLowerCase();
			if (folderType === 'drafts' || folderPath.includes('draft')) return true;
			return /^<draft\./i.test(String(message.message_id || ''));
		},
		[folders],
	);

	const openDraftInComposerFromMailView = useCallback(
		(message: MessageItem): void => {
			if (lastOpenedDraftInMailViewRef.current === message.id) return;
			lastOpenedDraftInMailViewRef.current = message.id;
			setSelectedMessageId((prev) => (prev === message.id ? null : prev));
			setSelectedMessageIds((prev) => prev.filter((id) => id !== message.id));
			setPendingAutoReadMessageId((prev) => (prev === message.id ? null : prev));
			selectionAnchorIndexRef.current = null;
			void ipcClient.openMessageWindow(message.id);
			const fallbackPath = `/email/${message.account_id}/${message.folder_id}`;
			if (location.pathname !== fallbackPath) {
				navigate(fallbackPath, {replace: true});
			}
		},
		[
			location.pathname,
			navigate,
			selectionAnchorIndexRef,
			setPendingAutoReadMessageId,
			setSelectedMessageId,
			setSelectedMessageIds,
		],
	);

	useEffect(() => {
		if (accounts.length === 0) {
			if (selectedAccountId !== null) setSelectedAccountId(null);
			return;
		}
		if (selectedAccountId && accounts.some((account) => account.id === selectedAccountId)) return;
		setSelectedAccountId(accounts[0].id);
	}, [accounts, selectedAccountId, setSelectedAccountId]);

	useEffect(() => {
		if (!routeAccountId) return;
		if (!accounts.some((account) => account.id === routeAccountId)) return;
		if (selectedAccountId === routeAccountId) return;
		setSelectedAccountId(routeAccountId);
	}, [accounts, routeAccountId, selectedAccountId, setSelectedAccountId]);

	useEffect(() => {
		const idx = window.history.state?.idx;
		if (typeof idx !== 'number') return;
		setHistoryIndex(idx);
		setHistoryMaxIndex((prev) => Math.max(prev, idx));
	}, [params.accountId, params.folderId, params.emailId]);

	useEffect(() => {
		if (!routeAccountId || selectedAccountId !== routeAccountId) return;

		if (routeFolderId) {
			const routedFolder = folders.find((folder) => folder.id === routeFolderId) ?? null;
			if (routedFolder && selectedFolderPath !== routedFolder.path) {
				setSelectedFolderPath(routedFolder.path);
			}
		}

		if (routeEmailId) {
			const routedMessage = messages.find((message) => message.id === routeEmailId) ?? null;
			if (routedMessage && isDraftMessageInMailView(routedMessage)) {
				openDraftInComposerFromMailView(routedMessage);
				return;
			}
			if (routedMessage && selectedMessageId !== routeEmailId) {
				setSelectedMessageId(routeEmailId);
				setSelectedMessageIds((prev) => (prev.includes(routeEmailId) ? prev : [routeEmailId]));
			}
			if (!routedMessage && selectedMessageId === routeEmailId) {
				setSelectedMessageId(null);
				setSelectedMessageIds((prev) => prev.filter((id) => id !== routeEmailId));
				selectionAnchorIndexRef.current = null;
			}
		} else if (selectedMessageId !== null) {
			setSelectedMessageId(null);
			setSelectedMessageIds([]);
			selectionAnchorIndexRef.current = null;
		}
	}, [folders, messages, routeAccountId, routeEmailId, routeFolderId, selectedAccountId, selectedFolderPath]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (!routeAccountId || !selectedAccountId) return;
		if (routeAccountId !== selectedAccountId) return;
		const accountFolders = accountFoldersById[selectedAccountId] ?? folders;
		if (accountFolders.length === 0) return;
		if (routeFolderId && accountFolders.some((folder) => folder.id === routeFolderId)) return;
		const defaultFolder = accountFolders[0] ?? null;
		if (!defaultFolder) return;
		navigate(`/email/${selectedAccountId}/${defaultFolder.id}`, {replace: true});
	}, [accountFoldersById, folders, navigate, routeAccountId, routeFolderId, selectedAccountId]);

	useEffect(() => {
		if (routeAccountId) return;
		if (location.pathname !== '/email') return;
		if (accounts.length === 0) return;
		const firstAccount = accounts[0];
		const firstAccountFolders = accountFoldersById[firstAccount.id] ?? [];
		const firstFolder = firstAccountFolders[0] ?? null;
		const target = firstFolder ? `/email/${firstAccount.id}/${firstFolder.id}` : `/email/${firstAccount.id}`;
		if (location.pathname !== target) {
			navigate(target, {replace: true});
		}
	}, [accountFoldersById, accounts, location.pathname, navigate, routeAccountId]);

	useEffect(() => {
		const pendingTarget = pendingOpenMessageTargetRef.current;
		if (!pendingTarget) return;
		const accountFolders = accountFoldersById[pendingTarget.accountId] ?? [];
		if (accountFolders.length === 0) return;
		const matchedFolder =
			accountFolders.find((folder) => folder.path === pendingTarget.folderPath) ?? accountFolders[0];
		const targetPath = `/email/${pendingTarget.accountId}/${matchedFolder.id}/${pendingTarget.messageId}`;
		pendingOpenMessageTargetRef.current = null;
		if (location.pathname !== targetPath) {
			navigate(targetPath, {replace: true});
		}
	}, [accountFoldersById, location.pathname, navigate]);

	useEffect(() => {
		const validIds = new Set(messages.map((m) => m.id));
		setSelectedMessageIds((prev) => prev.filter((id) => validIds.has(id)));
	}, [messages, setSelectedMessageIds]);

	useEffect(() => {
		if (!attachmentMenu) return;
		const close = () => setAttachmentMenu(null);
		window.addEventListener('click', close);
		window.addEventListener('keydown', close);
		return () => {
			window.removeEventListener('click', close);
			window.removeEventListener('keydown', close);
		};
	}, [attachmentMenu]);

	useEffect(
		() => () => {
			if (reconcileReloadTimerRef.current !== null) {
				window.clearTimeout(reconcileReloadTimerRef.current);
				reconcileReloadTimerRef.current = null;
			}
		},
		[],
	);

	useIpcEvent(ipcClient.onLinkHoverUrl, (url) => {
		setHoveredLinkUrl(url || '');
	});

	useEffect(() => {
		pruneSyncingAccounts(accounts.map((account) => account.id));
	}, [accounts, pruneSyncingAccounts]);

	function filterOutPendingRemovals<T extends MessageItem>(rows: T[]): T[] {
		const pendingDeletes = pendingDeleteMessageIdsRef.current;
		const pendingMoves = pendingMoveMessageIdsRef.current;
		if (pendingDeletes.size === 0 && pendingMoves.size === 0) return rows;
		return rows.filter((m) => !pendingDeletes.has(m.id) && !pendingMoves.has(m.id));
	}

	async function loadFoldersAndMessages(
		accountId: number,
		preferredFolderId?: number | null,
		preferredMessageId?: number | null,
	) {
		await reloadAccountData(accountId, null, preferredMessageId ?? null, preferredFolderId ?? null);
	}

	async function onRefresh() {
		if (!selectedAccountId) return;
		setSyncStatusText(statusSyncingMailbox());
		try {
			const summary = await selectedAccount.email.sync();
			if (summary.dav) {
				const contacts = summary.dav.contacts.upserted;
				const events = summary.dav.events.upserted;
				if (contacts > 0 || events > 0) {
					setSyncStatusText(statusSyncedMailboxAndDav(contacts, events));
					return;
				}
			}
			setSyncStatusText(statusSyncedMessages(summary.messages ?? 0));
		} catch (e: unknown) {
			setSyncStatusText(statusSyncFailed(e));
		}
	}

	async function reloadAccountData(
		accountId: number,
		preferredFolderPath: string | null,
		preferredMessageId: number | null,
		preferredFolderId?: number | null,
	) {
		const targetAccount = getAccount(accountId);
		const folderRows = await targetAccount.email.refreshFolders();
		setFolders(folderRows);
		setAccountFoldersById((prev) => ({
			...prev,
			[accountId]: folderRows,
		}));
		const currentFolderPath = selectedFolderPathRef.current;

		const chosenFolder =
			(preferredFolderId && folderRows.find((f) => f.id === preferredFolderId)?.path) ||
			(preferredFolderPath && folderRows.some((f) => f.path === preferredFolderPath) && preferredFolderPath) ||
			(currentFolderPath && folderRows.some((f) => f.path === currentFolderPath) && currentFolderPath) ||
			folderRows.find((f) => f.type === 'inbox')?.path ||
			folderRows.find((f) => f.path.toLowerCase() === 'inbox')?.path ||
			folderRows[0]?.path ||
			null;

		setSelectedFolderPath(chosenFolder);

		if (!chosenFolder) {
			setMessages([]);
			setSelectedMessageId(null);
			return;
		}

		const msgRowsRaw = await targetAccount.email.messages(chosenFolder, messageFetchLimit);
		const msgRows = applyPendingReadOverrides(filterOutPendingRemovals(msgRowsRaw));
		const chosenFolderTotalCount =
			Math.max(0, Number(folderRows.find((folder) => folder.path === chosenFolder)?.total_count) || 0) ||
			msgRowsRaw.length;
		const hasMore = hasMoreFolderMessages(msgRowsRaw.length, messageFetchLimit, chosenFolderTotalCount);
		setHasMoreMessages(hasMore);
		if (hasMore && msgRowsRaw.length < messageFetchLimit) {
			triggerBackgroundFolderSync(accountId, chosenFolder, 'Syncing older messages in background...');
		}
		setMessages(msgRows);
		if (preferredMessageId) {
			const preferredMessage = msgRows.find((message) => message.id === preferredMessageId) ?? null;
			if (preferredMessage && isDraftMessageInMailView(preferredMessage)) {
				openDraftInComposerFromMailView(preferredMessage);
				return;
			}
			setSelectedMessageId(preferredMessageId);
			return;
		}
		const currentMessageId = selectedMessageIdRef.current;
		if (currentMessageId && msgRows.some((m) => m.id === currentMessageId)) {
			const currentMessage = msgRows.find((message) => message.id === currentMessageId) ?? null;
			if (currentMessage && isDraftMessageInMailView(currentMessage)) {
				openDraftInComposerFromMailView(currentMessage);
				return;
			}
			setSelectedMessageId(currentMessageId);
		}
	}

	function queueReconcileReload(
		accountId: number | null,
		preferredFolderPath: string | null,
		preferredMessageId: number | null,
	): void {
		if (!accountId) return;
		if (reconcileReloadTimerRef.current !== null) return;
		reconcileReloadTimerRef.current = window.setTimeout(() => {
			reconcileReloadTimerRef.current = null;
			void reloadAccountData(accountId, preferredFolderPath, preferredMessageId);
		}, 350);
	}

	function applyFlagOptimistic(messageId: number, nextFlag: number) {
		setMessages((prev) => prev.map((m) => (m.id === messageId ? {...m, is_flagged: nextFlag} : m)));
	}

	function applyTagOptimistic(messageId: number, nextTag: string | null) {
		setMessages((prev) => prev.map((m) => (m.id === messageId ? {...m, tag: nextTag} : m)));
	}

	function resolveNextMessageIdAfterRemoval(messageId: number): number | null {
		const idx = messages.findIndex((message) => message.id === messageId);
		if (idx < 0) return null;
		for (let next = idx + 1; next < messages.length; next += 1) {
			const candidate = messages[next];
			if (candidate?.id && candidate.id !== messageId) return candidate.id;
		}
		for (let prev = idx - 1; prev >= 0; prev -= 1) {
			const candidate = messages[prev];
			if (candidate?.id && candidate.id !== messageId) return candidate.id;
		}
		return null;
	}

	function updateRouteSelectionAfterOptimisticRemoval(nextSelectedId: number | null): void {
		if (!selectedAccountId) return;
		const folderId = selectedFolder?.id ?? routeFolderId ?? null;
		if (!folderId) return;
		if (nextSelectedId) {
			const target = `/email/${selectedAccountId}/${folderId}/${nextSelectedId}`;
			if (location.pathname !== target) {
				navigate(target, {replace: true});
			}
			return;
		}
		const target = `/email/${selectedAccountId}/${folderId}`;
		if (location.pathname !== target) {
			navigate(target, {replace: true});
		}
	}

	function applyRemoveOptimistic(message: MessageItem, folderPath: string | null) {
		const wasActiveSelection = selectedMessageId === message.id;
		const nextSelectedId = (wasActiveSelection ? resolveNextMessageIdAfterRemoval(message.id) : null) ?? null;
		setMessages((prev) => prev.filter((m) => m.id !== message.id));
		setSelectedMessageIds((prev) => {
			const filtered = prev.filter((id) => id !== message.id);
			if (wasActiveSelection) {
				return nextSelectedId ? [nextSelectedId] : filtered;
			}
			return filtered;
		});
		setSelectedMessageId((prev) => (prev === message.id ? nextSelectedId : prev));
		if (wasActiveSelection) {
			updateRouteSelectionAfterOptimisticRemoval(nextSelectedId);
		}

		if (!folderPath) return;
		setFolders((prev) =>
			prev.map((f) => {
				if (f.path !== folderPath) return f;
				return {
					...f,
					total_count: Math.max(0, f.total_count - 1),
					unread_count: message.is_read ? f.unread_count : Math.max(0, f.unread_count - 1),
				};
			}),
		);
	}

	function applyMoveOptimistic(message: MessageItem, sourceFolderPath: string | null, targetFolderPath: string) {
		const wasActiveSelection = selectedMessageId === message.id;
		const nextSelectedId = (wasActiveSelection ? resolveNextMessageIdAfterRemoval(message.id) : null) ?? null;
		setMessages((prev) => prev.filter((m) => m.id !== message.id));
		setSelectedMessageIds((prev) => {
			const filtered = prev.filter((id) => id !== message.id);
			if (wasActiveSelection) {
				return nextSelectedId ? [nextSelectedId] : filtered;
			}
			return filtered;
		});
		setSelectedMessageId((prev) => (prev === message.id ? nextSelectedId : prev));
		if (wasActiveSelection) {
			updateRouteSelectionAfterOptimisticRemoval(nextSelectedId);
		}

		if (!sourceFolderPath) return;
		setFolders((prev) =>
			prev.map((f) => {
				if (f.path === sourceFolderPath) {
					return {
						...f,
						total_count: Math.max(0, f.total_count - 1),
						unread_count: message.is_read ? f.unread_count : Math.max(0, f.unread_count - 1),
					};
				}
				if (f.path === targetFolderPath) {
					return {
						...f,
						total_count: f.total_count + 1,
						unread_count: message.is_read ? f.unread_count : f.unread_count + 1,
					};
				}
				return f;
			}),
		);
	}

	function syncMoveWithOptimistic(
		message: MessageItem,
		targetFolderPath: string,
		options?: {
			sourceFolderPath?: string | null;
			pendingStatus?: string;
			successStatus?: string;
			failurePrefix?: string;
		},
	): void {
		const sourceFolderPath = options?.sourceFolderPath ?? selectedFolderPathRef.current;
		pendingMoveMessageIdsRef.current.add(message.id);
		applyMoveOptimistic(message, sourceFolderPath, targetFolderPath);
		setSyncStatusText(options?.pendingStatus || 'Syncing move to server...');
		void moveMessageMutation
			.mutateAsync({
				messageId: message.id,
				targetFolderPath,
			})
			.then((moveResult) => {
				setFolders((prev) =>
					prev.map((folder) => {
						if (folder.id === moveResult.sourceFolderId) {
							return {
								...folder,
								unread_count: moveResult.sourceUnreadCount,
								total_count: moveResult.sourceTotalCount,
							};
						}
						if (folder.id === moveResult.targetFolderId) {
							return {
								...folder,
								unread_count: moveResult.targetUnreadCount,
								total_count: moveResult.targetTotalCount,
							};
						}
						return folder;
					}),
				);
				setSyncStatusText(options?.successStatus || 'Move synced');
			})
				.catch((error: unknown) => {
					setSyncStatusText(`${options?.failurePrefix || 'Move failed'}: ${toErrorMessage(error)}`);
					queueReconcileReload(message.account_id, selectedFolderPathRef.current, selectedMessageIdRef.current);
				})
				.finally(() => {
					pendingMoveMessageIdsRef.current.delete(message.id);
				});
	}

	function resolveMessageFolder(accountId: number, folderId: number): FolderItem | null {
		const accountFolders = accountFoldersById[accountId] ?? [];
		return accountFolders.find((folder) => folder.id === folderId) ?? null;
	}

	function resolveJunkFolderPath(accountId: number): string | null {
		const accountFolders = accountFoldersById[accountId] ?? [];
		return accountFolders.find((folder) => isJunkFolder(folder))?.path ?? null;
	}

	function resolveInboxFolderPath(accountId: number): string | null {
		const accountFolders = accountFoldersById[accountId] ?? [];
		return accountFolders.find((folder) => isInboxFolder(folder))?.path ?? null;
	}

	function setMessageJunkPreference(message: MessageItem, preference: 'junk' | 'not-junk'): void {
		const sourceFolder = resolveMessageFolder(message.account_id, message.folder_id);
		const sourceFolderPath = sourceFolder?.path ?? selectedFolderPath ?? selectedFolderPathRef.current;
		const sourceIsJunk = Boolean(
			isJunkFolder(sourceFolder) || (sourceFolderPath && /(spam|junk)/i.test(sourceFolderPath)),
		);
		const junkFolderPath = resolveJunkFolderPath(message.account_id);
		if (!junkFolderPath) {
			setSyncStatusText('No Junk folder found for this account.');
			return;
		}
		const inboxFolderPath = resolveInboxFolderPath(message.account_id);
		const targetFolderPath =
			preference === 'junk' ? junkFolderPath : sourceIsJunk ? inboxFolderPath : null;
		if (preference === 'not-junk' && sourceIsJunk && !targetFolderPath) {
			setSyncStatusText('No Inbox folder found for this account.');
			return;
		}
		if (!targetFolderPath) {
			setSyncStatusText(preference === 'junk' ? 'Message is already in Junk.' : 'Message is not in Junk.');
			return;
		}
		if (sourceFolderPath && sourceFolderPath === targetFolderPath) {
			setSyncStatusText(preference === 'junk' ? 'Message is already in Junk.' : 'Message is not in Junk.');
			return;
		}
		const actionLabel = preference === 'junk' ? 'Junk' : 'Not junk';
		syncMoveWithOptimistic(message, targetFolderPath, {
			sourceFolderPath,
			pendingStatus: `${actionLabel} updated locally. Syncing server in background...`,
			successStatus: `${actionLabel} synced`,
			failurePrefix: `${actionLabel} sync failed`,
		});
	}

	function composeWithDraft(draft: {
		to?: string | null;
		cc?: string | null;
		subject?: string | null;
		body?: string | null;
		bodyHtml?: string | null;
		bodyText?: string | null;
		quotedBodyHtml?: string | null;
		quotedBodyText?: string | null;
		quotedAllowRemote?: boolean;
		inReplyTo?: string | null;
		references?: string[] | string | null;
	}) {
		void ipcClient.openComposeWindow({
			accountId: selectedAccountId,
			...draft,
		});
	}

	function onReply(): void {
		if (!selectedMessage) return;
		const subject = ensurePrefixedSubject(selectedMessage.subject, 'Re:');
		const quoteText = selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html);
		const quoteHtml = buildReplyQuoteHtml(selectedMessage, selectedMessageBody?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(selectedMessage);
		const inReplyTo = normalizeMessageId(selectedMessage.message_id);
		const references = buildReferences(selectedMessage.references_text, selectedMessage.message_id);
		composeWithDraft({
			to: replyTo,
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: quoteHtml,
			quotedBodyText: `\n\n${buildReplyQuoteText(selectedMessage, quoteText, systemLocale)}`,
			quotedAllowRemote: allowRemoteForSelectedMessage,
			inReplyTo,
			references,
		});
	}

	function onReplyAll(): void {
		if (!selectedMessage) return;
		const subject = ensurePrefixedSubject(selectedMessage.subject, 'Re:');
		const quoteText = selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html);
		const quoteHtml = buildReplyQuoteHtml(selectedMessage, selectedMessageBody?.html, quoteText, systemLocale);
		const replyTo = inferReplyAddress(selectedMessage);
		const inReplyTo = normalizeMessageId(selectedMessage.message_id);
		const references = buildReferences(selectedMessage.references_text, selectedMessage.message_id);
		composeWithDraft({
			to: replyTo,
			cc: selectedMessage.to_address || '',
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: quoteHtml,
			quotedBodyText: `\n\n${buildReplyQuoteText(selectedMessage, quoteText, systemLocale)}`,
			quotedAllowRemote: allowRemoteForSelectedMessage,
			inReplyTo,
			references,
		});
	}

	function onForward(): void {
		if (!selectedMessage) return;
		const subject = ensurePrefixedSubject(selectedMessage.subject, 'Fwd:');
		const originalText = selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html);
		const forwarded = buildForwardQuoteText(selectedMessage, originalText, systemLocale);

		composeWithDraft({
			to: '',
			cc: '',
			subject,
			bodyHtml: '',
			bodyText: '',
			quotedBodyHtml: buildForwardQuoteHtml(
				selectedMessage,
				selectedMessageBody?.html,
				originalText,
				systemLocale,
			),
			quotedBodyText: forwarded,
			quotedAllowRemote: allowRemoteForSelectedMessage,
		});
	}

	function onDeleteSelected(): void {
		if (!selectedMessage) return;
		confirmAndDeleteMessage(selectedMessage);
	}

	function confirmAndDeleteMessage(message: MessageItem): void {
		const confirmed = window.confirm(`Delete email "${message.subject || '(No subject)'}"?`);
		if (!confirmed) return;
		deleteMessagesBatch([message]);
	}

	function deleteMessagesBatch(targets: MessageItem[]): void {
		if (!selectedAccountId || targets.length === 0) return;
		const ids = Array.from(new Set(targets.map((m) => m.id)));
		const deleting = targets.filter((m) => ids.includes(m.id));
		deleting.forEach((message) => {
			pendingDeleteMessageIdsRef.current.add(message.id);
			applyRemoveOptimistic(message, selectedFolderPath);
		});

		setSyncStatusText(`Deleted ${deleting.length} locally. Syncing server in background...`);
		for (const message of deleting) {
			void deleteMessageMutation
				.mutateAsync({messageId: message.id})
				.catch((error: unknown) => {
					setSyncStatusText(`Delete sync failed: ${toErrorMessage(error)}`);
					queueReconcileReload(selectedAccountId, selectedFolderPath, selectedMessageIdRef.current);
				})
				.finally(() => {
					pendingDeleteMessageIdsRef.current.delete(message.id);
				});
		}
	}

	function onBackToList(): void {
		if (selectedAccountId && selectedFolder) {
			const target = `/email/${selectedAccountId}/${selectedFolder.id}`;
			if (location.pathname !== target) {
				navigate(target);
			}
		} else if (selectedAccountId) {
			const target = `/email/${selectedAccountId}`;
			if (location.pathname !== target) {
				navigate(target);
			}
		} else if (location.pathname !== '/email') {
			navigate('/email');
		}
		setSelectedMessageId(null);
		setSelectedMessageIds([]);
		selectionAnchorIndexRef.current = null;
	}

	useEffect(() => {
		if (!selectedMessage) return;
		if (!isDraftMessageInMailView(selectedMessage)) return;
		openDraftInComposerFromMailView(selectedMessage);
	}, [isDraftMessageInMailView, openDraftInComposerFromMailView, selectedMessage]);

	function onViewSource(): void {
		if (!selectedMessageId) return;
		const requestSeq = ++sourceRequestSeqRef.current;
		setShowSourceModal(true);
		setSourceLoading(true);
		setSourceError(null);
		setMessageSource('');
		void ipcClient
			.getMessageSource(selectedMessageId)
			.then((result) => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setMessageSource(result.source);
			})
			.catch((error: unknown) => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setSourceError(toErrorMessage(error));
			})
			.finally(() => {
				if (sourceRequestSeqRef.current !== requestSeq) return;
				setSourceLoading(false);
			});
	}

	function runAttachmentAction(index: number, action: 'open' | 'save') {
		if (!selectedMessage) return;
		void ipcClient.openMessageAttachment(selectedMessage.id, index, action).catch((error: unknown) => {
			setSyncStatusText(`Attachment failed: ${toErrorMessage(error)}`);
		});
	}

	function requestCloseMainOverlays(): void {
		window.dispatchEvent(new Event('llamamail-close-overlays'));
	}

	function allowRemoteContentOnceForSelected(): void {
		if (!selectedMessageId) return;
		setSessionRemoteAllowedMessageIds((prev) =>
			prev.includes(selectedMessageId) ? prev : [...prev, selectedMessageId],
		);
	}

	function allowRemoteContentForSender(): void {
		const sender = extractEmailAddress(selectedMessage?.from_address);
		if (!sender) {
			setSyncStatusText('Could not determine sender address for allowlist.');
			return;
		}
		const nextAllowlist = [...new Set([...(appSettings.remoteContentAllowlist || []), sender])];
		setAppSettings((prev) => ({...prev, remoteContentAllowlist: nextAllowlist}));
		void ipcClient.updateAppSettings({remoteContentAllowlist: nextAllowlist}).catch((error: unknown) => {
			setSyncStatusText(`Failed to update allowlist: ${toErrorMessage(error)}`);
		});
	}

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (isEditableTarget(target)) return;

			const key = event.key.toLowerCase();
			if (key === 'escape' && showSourceModal) {
				event.preventDefault();
				setShowSourceModal(false);
				return;
			}
			if (showSourceModal) return;
			if (key === 'delete' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
				if (!selectedMessage) return;
				event.preventDefault();
				confirmAndDeleteMessage(selectedMessage);
				return;
			}

			const mod = event.ctrlKey || event.metaKey;
			if (!mod && !event.altKey && key === 'arrowdown') {
				event.preventDefault();
				navigateMessageSelection(1, event.shiftKey);
				return;
			}
			if (!mod && !event.altKey && key === 'arrowup') {
				event.preventDefault();
				navigateMessageSelection(-1, event.shiftKey);
				return;
			}
			if (!mod && event.altKey && key === 'arrowleft') {
				event.preventDefault();
				navigate(-1);
				return;
			}
			if (!mod && event.altKey && key === 'arrowright') {
				event.preventDefault();
				navigate(1);
				return;
			}
			if (!mod) return;
			if (key === 'a' && !event.shiftKey && !event.altKey) {
				event.preventDefault();
				selectAllMessages();
				return;
			}

			if (key === 'n' && !event.shiftKey && !event.altKey) {
				event.preventDefault();
				void ipcClient.openComposeWindow({accountId: selectedAccountId});
				return;
			}
			if (key === 'r' && !event.shiftKey && !event.altKey) {
				event.preventDefault();
				if (isDraftMessageSelected) return;
				onReply();
				return;
			}
			if (key === 'r' && event.shiftKey && !event.altKey) {
				event.preventDefault();
				if (isDraftMessageSelected) return;
				if (!canReplyAll) return;
				onReplyAll();
				return;
			}
			if (key === 'f' && event.shiftKey && !event.altKey) {
				event.preventDefault();
				if (isDraftMessageSelected) return;
				onForward();
				return;
			}
			if (key === 's' && event.shiftKey && !event.altKey) {
				event.preventDefault();
				void onRefresh();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		messages,
		navigate,
		selectedAccountId,
		selectedMessageId,
		selectedFolderPath,
		selectedMessage,
		canReplyAll,
		isDraftMessageSelected,
		selectedMessageBody,
		showSourceModal,
		systemLocale,
	]);

	return (
		<MainLayout
			hideHeader
			accounts={accounts}
			selectedAccountId={selectedAccountId}
			accountFoldersById={accountFoldersById}
			onSelectAccount={(accountId) => {
				const accountFolders = accountFoldersById[accountId] ?? [];
				const defaultFolder = accountFolders[0] ?? null;
				const target = defaultFolder ? `/email/${accountId}/${defaultFolder.id}` : `/email/${accountId}`;
				if (location.pathname !== target) {
					navigate(target);
				}
			}}
			onReorderAccounts={reorderAccounts}
			canNavigateBack={historyIndex > 0}
			canNavigateForward={historyIndex < historyMaxIndex}
			onNavigateBack={() => {
				navigate(-1);
			}}
			onNavigateForward={() => {
				navigate(1);
			}}
			dateLocale={systemLocale}
			folders={folders}
			selectedFolderPath={selectedFolderPath}
			onSelectFolder={(path, accountId) => {
				const nextAccountId =
					typeof accountId === 'number' && Number.isFinite(accountId) ? accountId : selectedAccountId;
				if (nextAccountId) {
					const targetFolders = accountFoldersById[nextAccountId] ?? folders;
					const folderId = targetFolders.find((folder) => folder.path === path)?.id ?? null;
					if (folderId) {
						const target = `/email/${nextAccountId}/${folderId}`;
						if (location.pathname !== target) {
							navigate(target);
						}
					} else {
						const target = `/email/${nextAccountId}`;
						if (location.pathname !== target) {
							navigate(target);
						}
					}
				} else {
					if (location.pathname !== '/email') {
						navigate('/email');
					}
				}
			}}
			onRefreshFolder={async (folder) => {
				const folderLabel = folder.custom_name || folder.name;
				const isSelectedFolder = selectedAccountId === folder.account_id && selectedFolderPath === folder.path;
				if (!isSelectedFolder) {
					const accountFolders = accountFoldersById[folder.account_id] ?? [];
					const folderId = accountFolders.find((item) => item.path === folder.path)?.id ?? null;
					const target = folderId ? `/email/${folder.account_id}/${folderId}` : `/email/${folder.account_id}`;
					if (location.pathname !== target) {
						navigate(target);
					}
					return;
				}
				setSyncStatusText(`Refreshing folder ${folderLabel}...`);
				try {
					await reloadAccountData(folder.account_id, folder.path, selectedMessageIdRef.current);
					setSyncStatusText(`Folder refreshed: ${folderLabel}`);
				} catch (error: unknown) {
					setSyncStatusText(`Folder refresh failed: ${toErrorMessage(error)}`);
					throw error;
				}
			}}
			messages={messages}
			selectedMessageId={selectedMessageId}
			selectedMessageIds={selectedMessageIds}
			onSelectMessage={(id, index, modifiers) => {
				const message = messages.find((entry) => entry.id === id) ?? null;
				if (message && isDraftMessageInMailView(message)) {
					openDraftInComposerFromMailView(message);
					return true;
				}
				handleSelectMessage(id, index, modifiers);
				return false;
			}}
			searchQuery={searchQuery}
			onSearchQueryChange={setSearchQuery}
			searchResults={searchResults}
			searchLoading={searchLoading}
			onLoadMoreMessages={() => {
				void loadMoreMessages();
			}}
			hasMoreMessages={hasMoreMessages}
			loadingMoreMessages={loadingMoreMessages}
			onRefresh={onRefresh}
			onOpenCalendar={() => navigate('/calendar')}
			onOpenContacts={() => navigate('/contacts')}
			mailView={appSettings.mailView}
			showMessageOnly={showMessageOnly}
			onMailViewChange={(view) => {
				setAppSettings((prev) => ({...prev, mailView: view}));
				void ipcClient.updateAppSettings({mailView: view}).catch(() => undefined);
			}}
			syncStatusText={syncStatusText}
			syncInProgress={Boolean(syncStatusText && syncStatusText.toLowerCase().startsWith('syncing'))}
			statusHintText={isPointerOverMessageFrame && hoveredLinkUrl ? hoveredLinkUrl : null}
			syncingAccountIds={syncingAccountIds}
			onCreateFolder={async ({accountId, folderPath, type, color}) => {
				const targetAccountId = accountId;
				const normalizedPath = (folderPath || '').trim();
				if (!targetAccountId) throw new Error('Select an account first');
				if (!normalizedPath) throw new Error('Folder path is required');
				setSyncStatusText('Creating folder...');
				try {
					const targetAccount = getAccount(targetAccountId);
					await targetAccount.email.createFolder(normalizedPath);
					if ((type && type.trim()) || (color && color.trim())) {
						await targetAccount.email.updateFolder(normalizedPath, {
							customName: null,
							type: type && type.trim().length ? type.trim() : null,
							color: color && color.trim().length ? color.trim() : null,
						});
					}
					await reloadAccountData(targetAccountId, normalizedPath, null);
					if (targetAccountId !== selectedAccountId) {
						setSelectedAccountId(targetAccountId);
					}
					setSelectedFolderPath(normalizedPath);
					setSyncStatusText(`Folder created: ${normalizedPath}`);
				} catch (e: any) {
					setSyncStatusText(`Create folder failed: ${e?.message || String(e)}`);
					throw e;
				}
			}}
			onReorderCustomFolders={async (accountId, orderedFolderPaths) => {
				const previousAccountFoldersById = accountFoldersById;
				const previousFolders = folders;

				const accountAll = accountFoldersById[accountId] ?? [];
				const accountCustom = accountAll.filter((f) => !isProtectedFolder(f));
				const customByPath = new Map(accountCustom.map((f) => [f.path, f] as const));
				const requested = orderedFolderPaths.filter((path) => customByPath.has(path));
				const requestedSet = new Set(requested);
				const remainder = accountCustom.map((f) => f.path).filter((path) => !requestedSet.has(path));
				const mergedPaths = [...requested, ...remainder];
				const customOrdered = mergedPaths.map((path) => customByPath.get(path)).filter(Boolean) as FolderItem[];
				const protectedOrdered = accountAll.filter((f) => isProtectedFolder(f));
				const optimisticAccountFolders = [...protectedOrdered, ...customOrdered];

				setAccountFoldersById((prev) => ({
					...prev,
					[accountId]: optimisticAccountFolders,
				}));
				if (selectedAccountId === accountId) {
					setFolders(optimisticAccountFolders);
				}

				try {
					const updated = await getAccount(accountId).email.reorderFolders(mergedPaths);
					setAccountFoldersById((prev) => ({
						...prev,
						[accountId]: updated,
					}));
					if (selectedAccountId === accountId) {
						setFolders(updated);
					}
				} catch (e: any) {
					setAccountFoldersById(previousAccountFoldersById);
					setFolders(previousFolders);
					setSyncStatusText(`Reorder failed: ${e?.message || String(e)}`);
					throw e;
				}
			}}
			onDeleteFolder={(folder) =>
				void (async () => {
					if (!selectedAccountId) {
						setSyncStatusText('Select an account first');
						return;
					}
					if (isProtectedFolder(folder)) {
						setSyncStatusText('System folders cannot be deleted');
						return;
					}
					const confirmed = window.confirm(`Delete folder "${folder.custom_name || folder.name}"?`);
					if (!confirmed) return;

					setSyncStatusText(`Deleting folder ${folder.custom_name || folder.name}...`);
					const previousFolders = folders;
					const previousMessages = messages;
					const previousSelectedFolder = selectedFolderPath;
					const previousSelectedMessage = selectedMessageId;
					const remaining = folders.filter((f) => f.id !== folder.id);
					setFolders(remaining);
					if (selectedFolderPath === folder.path) {
						const nextFolder =
							remaining.find((f) => f.type === 'inbox')?.path ??
							remaining.find((f) => f.path.toLowerCase() === 'inbox')?.path ??
							remaining[0]?.path ??
							null;
						setSelectedFolderPath(nextFolder);
						setMessages([]);
						setSelectedMessageId(null);
					}

					try {
						await selectedAccount.email.deleteFolder(folder.path);
						await reloadAccountData(selectedAccountId, null, null);
						setSyncStatusText(`Deleted folder: ${folder.custom_name || folder.name}`);
					} catch (e: any) {
						setFolders(previousFolders);
						setMessages(previousMessages);
						setSelectedFolderPath(previousSelectedFolder);
						setSelectedMessageId(previousSelectedMessage);
						setSyncStatusText(`Delete folder failed: ${e?.message || String(e)}`);
					}
				})()
			}
			onMessageMarkReadToggle={(message) =>
				void (() => {
					const nextRead = message.is_read ? 0 : 1;
					if (nextRead === 0 && selectedMessageId === message.id) {
						// Prevent selection auto-read from immediately undoing an explicit "mark unread".
						setPendingAutoReadMessageId(null);
					}
					applyReadOptimistic(message, nextRead, selectedFolderPath);
					void syncReadState(message, nextRead, selectedFolderPath);
				})()
			}
			onBulkMarkRead={(messageIds, nextRead) =>
				void (() => {
					if (nextRead === 0 && selectedMessageId && messageIds.includes(selectedMessageId)) {
						// Prevent explicit bulk "mark unread" on the active message from being auto-undone.
						setPendingAutoReadMessageId(null);
					}
					const selectedSet = new Set(messageIds);
					const targets = messages.filter(
						(message) => selectedSet.has(message.id) && message.is_read !== nextRead,
					);
					for (const message of targets) {
						applyReadOptimistic(message, nextRead, selectedFolderPath);
						void syncReadState(message, nextRead, selectedFolderPath);
					}
				})()
			}
			onBulkDelete={(messageIds) =>
				void (async () => {
					const selectedSet = new Set(messageIds);
					const targets = messages.filter((message) => selectedSet.has(message.id));
					if (targets.length === 0) return;
					const confirmed = window.confirm(`Delete ${targets.length} selected emails?`);
					if (!confirmed) return;
					deleteMessagesBatch(targets);
				})()
			}
			onClearMessageSelection={() => {
				clearSelection();
			}}
			onMessageFlagToggle={(message) =>
				void (() => {
					if (!selectedAccountId) return;
					const nextFlag = message.is_flagged ? 0 : 1;
					const previousFlag = message.is_flagged;
					applyFlagOptimistic(message.id, nextFlag);
					setSyncStatusText('Flag updated locally. Syncing server in background...');
					void setMessageFlagMutation
						.mutateAsync({messageId: message.id, isFlagged: nextFlag})
						.then(() => {
							setSyncStatusText('Flag synced');
						})
						.catch((error: unknown) => {
							applyFlagOptimistic(message.id, previousFlag);
							setSyncStatusText(`Flag sync failed: ${toErrorMessage(error)}`);
						});
				})()
			}
			onMessageTagChange={(message, tag) =>
				void (() => {
					const previousTag =
						String(
							(
								message as MessageItem & {
									tag?: string | null;
								}
							).tag || '',
						)
							.trim()
							.toLowerCase() || null;
					const nextTag =
						String(tag || '')
							.trim()
							.toLowerCase() || null;
					if (previousTag === nextTag) return;
					applyTagOptimistic(message.id, nextTag);
					void setMessageTagMutation
						.mutateAsync({messageId: message.id, tag: nextTag})
						.catch((error: unknown) => {
							applyTagOptimistic(message.id, previousTag);
							setSyncStatusText(`Tag update failed: ${toErrorMessage(error)}`);
						});
				})()
			}
			onMessageArchive={(message) =>
				void (() => {
					if (!selectedAccountId) return;
					applyRemoveOptimistic(message, selectedFolderPath);
					setSyncStatusText('Archived locally. Syncing server in background...');
					void archiveMessageMutation
						.mutateAsync({messageId: message.id})
						.then((res) => {
							setFolders((prev) =>
								prev.map((folder) => {
									if (folder.id === res.sourceFolderId) {
										return {
											...folder,
											unread_count: res.sourceUnreadCount,
											total_count: res.sourceTotalCount,
										};
									}
									if (folder.id === res.targetFolderId) {
										return {
											...folder,
											unread_count: res.targetUnreadCount,
											total_count: res.targetTotalCount,
										};
									}
									return folder;
								}),
							);
							setSyncStatusText('Archive synced');
						})
						.catch((error: unknown) => {
							setSyncStatusText(`Archive sync failed: ${toErrorMessage(error)}`);
							queueReconcileReload(selectedAccountId, selectedFolderPath, null);
					});
				})()
			}
			onMessageMarkJunk={(message) =>
				void (() => {
					void setMessageJunkPreference(message, 'junk');
				})()
			}
			onMessageMarkNotJunk={(message) =>
				void (() => {
					void setMessageJunkPreference(message, 'not-junk');
				})()
			}
			isMessageInJunkFolder={(message) => {
				const messageFolder =
					(accountFoldersById[message.account_id] ?? []).find((folder) => folder.id === message.folder_id) ??
					null;
				return isJunkFolder(messageFolder);
			}}
			onMessageMove={(message, targetFolderPath) =>
				void (() => {
					syncMoveWithOptimistic(message, targetFolderPath, {
						sourceFolderPath: selectedFolderPath,
						pendingStatus: 'Syncing move to server...',
						successStatus: 'Move synced',
						failurePrefix: 'Move failed',
					});
				})()
			}
			onBulkMove={(messageIds, targetFolderPath) =>
				void (() => {
					const selectedSet = new Set(messageIds);
					const targets = messages.filter((message) => selectedSet.has(message.id));
					if (targets.length === 0) return;
					targets.forEach((message) => {
						applyMoveOptimistic(message, selectedFolderPath, targetFolderPath);
					});
					setSyncStatusText(`Moved ${targets.length} locally. Syncing server in background...`);
					for (const message of targets) {
						void moveMessageMutation
							.mutateAsync({messageId: message.id, targetFolderPath})
							.then((res) => {
								setFolders((prev) =>
									prev.map((folder) => {
										if (folder.id === res.sourceFolderId) {
											return {
												...folder,
												unread_count: res.sourceUnreadCount,
												total_count: res.sourceTotalCount,
											};
										}
										if (folder.id === res.targetFolderId) {
											return {
												...folder,
												unread_count: res.targetUnreadCount,
												total_count: res.targetTotalCount,
											};
										}
										return folder;
									}),
								);
							})
							.catch((error: unknown) => {
								setSyncStatusText(`Move sync failed: ${toErrorMessage(error)}`);
								queueReconcileReload(
									selectedAccountId,
									selectedFolderPath,
									selectedMessageIdRef.current,
								);
							});
					}
				})()
			}
			onMessageDelete={(message) => confirmAndDeleteMessage(message)}
			onFolderSync={() => void onRefresh()}
			onUpdateFolderSettings={async (folder, payload) => {
				if (!selectedAccountId) return;
				const previous = folders;
				const previousAccountFoldersById = accountFoldersById;
				const normalizedName =
					payload.customName && payload.customName.trim().length ? payload.customName.trim() : null;
				const normalizedColor = payload.color && payload.color.trim().length ? payload.color.trim() : null;
				const normalizedType = payload.type && payload.type.trim().length ? payload.type.trim() : null;

				setFolders((prev) =>
					prev.map((f) =>
						f.id === folder.id
							? {
									...f,
									custom_name: normalizedName,
									color: normalizedColor,
									type: normalizedType,
								}
							: f,
					),
				);
				setAccountFoldersById((prev) => {
					const accountId = folder.account_id;
					const accountFolders = prev[accountId] ?? [];
					return {
						...prev,
						[accountId]: accountFolders.map((f) =>
							f.id === folder.id
								? {
										...f,
										custom_name: normalizedName,
										color: normalizedColor,
										type: normalizedType,
									}
								: f,
						),
					};
				});

				try {
					const updated = await selectedAccount.email.updateFolder(folder.path, {
						customName: normalizedName,
						color: normalizedColor,
						type: normalizedType,
					});
					setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
					setAccountFoldersById((prev) => {
						const accountId = updated.account_id;
						const accountFolders = prev[accountId] ?? [];
						return {
							...prev,
							[accountId]: accountFolders.map((f) => (f.id === updated.id ? updated : f)),
						};
					});
					setSyncStatusText('Folder settings saved');
				} catch (e: any) {
					setFolders(previous);
					setAccountFoldersById(previousAccountFoldersById);
					setSyncStatusText(`Folder settings failed: ${e?.message || String(e)}`);
					throw e;
				}
			}}
		>
			<div className={`h-full overflow-hidden ${selectedMessage ? '' : 'ui-surface-content'}`}>
				{selectedMessage && (
					<article className="flex h-full flex-col">
						<div
							role="toolbar"
							aria-label="Message actions"
							className="mail-menubar shrink-0 flex w-full flex-wrap items-center gap-1.5 px-3 py-2"
						>
							{showMessageOnly && (
								<>
									<ToolboxButton label="Back" icon={<ArrowLeft size={14} />} onClick={onBackToList} />
									<span className="divider-default mx-1 h-6 w-px" />
								</>
							)}
							{!isDraftMessageSelected && (
								<>
									<ToolboxButton label="Reply" icon={<Reply size={14} />} onClick={onReply} primary />
									{canReplyAll && (
										<ToolboxButton
											label="Reply all"
											icon={<ReplyAll size={14} />}
											onClick={onReplyAll}
										/>
									)}
									<ToolboxButton label="Forward" icon={<Forward size={14} />} onClick={onForward} />
									<span className="divider-default mx-1 h-6 w-px" />
								</>
							)}
							<ToolboxButton label="View source" icon={<FileText size={14} />} onClick={onViewSource} />
							<ToolboxButton
								label={isSelectedMessageInJunk ? 'Not junk' : 'Junk'}
								icon={isSelectedMessageInJunk ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
								onClick={() => {
									if (!selectedMessage) return;
									void setMessageJunkPreference(
										selectedMessage,
										isSelectedMessageInJunk ? 'not-junk' : 'junk',
									);
								}}
							/>
							<ToolboxButton
								label="Delete"
								icon={<Trash2 size={14} />}
								onClick={onDeleteSelected}
								danger
							/>
						</div>
						<MessageHeaderCard
							message={selectedMessage}
							folderLabel={selectedFolderPath || 'Message'}
							attachmentsCount={messageAttachments.length}
							showMessageDetails={showMessageDetails}
							onToggleMessageDetails={() => setShowMessageDetails((prev) => !prev)}
							spoofHints={buildSpoofHints(selectedMessage)}
							dateLocale={systemLocale}
							tagLabel={formatMessageTagLabel(
								(
									selectedMessage as MessageItem & {
										tag?: string | null;
									}
								).tag ?? null,
							)}
							avatarSrc={senderAvatarSrc}
							onQuickActionStatus={setSyncStatusText}
							onOpenCustomFilter={({accountId}) => {
								navigate(`/settings/account/${accountId}/filters`);
							}}
						/>
						<MessageBodyPane
							loading={bodyLoading}
							loadingLabel="Loading message body..."
							iframeSrcDoc={iframeSrcDoc}
							plainText={selectedMessageBody?.text}
							iframeTitle={`message-body-${selectedMessage.id}`}
							showRemoteContentWarning={Boolean(
								renderedBodyHtml && appSettings.blockRemoteContent && !allowRemoteForSelectedMessage,
							)}
							onLoadRemoteOnce={allowRemoteContentOnceForSelected}
							onAllowRemoteForSender={allowRemoteContentForSender}
							onRequestCloseOverlays={requestCloseMainOverlays}
							onMessageFramePointerEnter={() => setIsPointerOverMessageFrame(true)}
							onMessageFramePointerLeave={() => {
								setIsPointerOverMessageFrame(false);
								setHoveredLinkUrl('');
							}}
							attachments={messageAttachments}
							onOpenAttachmentMenu={(index, x, y) => {
								setAttachmentMenu({x, y, index});
							}}
						/>
					</article>
				)}
			</div>
			<MessageSourceModal
				open={showSourceModal}
				loading={sourceLoading}
				error={sourceError}
				source={messageSource}
				onClose={() => setShowSourceModal(false)}
			/>
			{attachmentMenu && (
				<ContextMenu
					size="sm"
					layer="1100"
					position={{
						left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
						top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
					}}
					onRequestClose={() => setAttachmentMenu(null)}
					onClick={(event) => event.stopPropagation()}
				>
					<ContextMenuItem
						onClick={() => {
							runAttachmentAction(attachmentMenu.index, 'open');
							setAttachmentMenu(null);
						}}
					>
						Open
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							runAttachmentAction(attachmentMenu.index, 'save');
							setAttachmentMenu(null);
						}}
					>
						Save As...
					</ContextMenuItem>
				</ContextMenu>
			)}
		</MainLayout>
	);
}

function matchesMailSearchNeedle(message: MessageItem, needle: string): boolean {
	if (!needle) return true;
	const haystack = [
		message.from_name || '',
		message.from_address || '',
		message.subject || '',
		message.to_address || '',
	]
		.join(' ')
		.toLowerCase();
	return haystack.includes(needle);
}

export default MailPage;
