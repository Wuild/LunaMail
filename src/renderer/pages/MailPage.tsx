import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
	FileText,
	Forward,
	MailOpen,
	Paperclip,
	Reply,
	ReplyAll,
	SquareArrowOutUpRight,
	Star,
	Tag,
	Trash2,
} from 'lucide-react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import {formatSystemDateTime} from '../lib/dateTime';
import {
	buildForwardQuoteHtml,
	buildForwardQuoteText,
	buildReferences,
	buildReplyQuoteHtml,
	buildReplyQuoteText,
	ensurePrefixedSubject,
	formatFromDisplay,
	htmlToText,
	inferReplyAddress,
	normalizeMessageId,
} from '../features/mail/composeDraft';
import {isProtectedFolder} from '../features/mail/folders';
import {buildSpoofHints} from '../features/mail/spoof';
import ToolboxButton from '../features/mail/ToolboxButton';
import {
	buildSourceDocCsp,
	enrichAnchorTitles,
	extractEmailAddress,
	isSenderAllowed,
} from '../features/mail/remoteContent';
import MessageSourceModal from '../components/mail/MessageSourceModal';
import {isEditableTarget} from '../lib/dom';
import {clampToViewport, formatBytes} from '../lib/format';
import {
	statusSyncedMailboxAndDav,
	statusSyncedMessages,
	statusSyncFailed,
	statusSyncingMailbox,
	statusSyncStarted,
	toErrorMessage,
} from '../lib/statusText';
import {useThemePreference} from '../hooks/useAppTheme';
import type {Workspace} from '../lib/workspace';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {useMailSelection} from '../hooks/mail/useMailSelection';
import {useMessageBodyLoader} from '../hooks/mail/useMessageBodyLoader';
import {useMailSyncStatus} from '../hooks/mail/useMailSyncStatus';
import {useOptimisticReadState} from '../hooks/mail/useOptimisticReadState';
import {useMailActionMutations} from '../hooks/mail/useMailActionMutations';
import {formatMessageTagLabel, parseRouteNumber} from './mailPageHelpers';
import {ipcClient} from '../lib/ipcClient';
import {createDefaultAppSettings} from '../../shared/defaults';
import type {
	CalendarEventItem,
	ContactItem,
	FolderItem,
	MessageItem,
	OpenMessageTargetEvent,
	PublicAccount,
	SyncStatusEvent,
} from '../../preload/index';

const MESSAGE_PAGE_SIZE = 100;
const MIN_INLINE_MAIL_BODY_WIDTH = 520;
const MIN_INLINE_MAIL_BODY_HEIGHT = 260;

function MailPage() {
	const params = useParams<{ accountId?: string; folderId?: string; emailId?: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [accounts, setAccounts] = useState<PublicAccount[]>([]);
	const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
	const [folders, setFolders] = useState<FolderItem[]>([]);
	const [accountFoldersById, setAccountFoldersById] = useState<Record<number, FolderItem[]>>({});
	const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<MessageItem[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [messages, setMessages] = useState<MessageItem[]>([]);
	const [messageFetchLimit, setMessageFetchLimit] = useState<number>(MESSAGE_PAGE_SIZE);
	const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
	const [hasMoreMessages, setHasMoreMessages] = useState(false);
	const [showMessageDetails, setShowMessageDetails] = useState(false);
	const [showSourceModal, setShowSourceModal] = useState(false);
	const [messageSource, setMessageSource] = useState('');
	const [sourceLoading, setSourceLoading] = useState(false);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const [attachmentMenu, setAttachmentMenu] = useState<{ x: number; y: number; index: number } | null>(null);
	const [sessionRemoteAllowedMessageIds, setSessionRemoteAllowedMessageIds] = useState<number[]>([]);
	const [hoveredLinkUrl, setHoveredLinkUrl] = useState('');
	const [isPointerOverMessageFrame, setIsPointerOverMessageFrame] = useState(false);
	const [appSettings, setAppSettings] = useState(() => createDefaultAppSettings());
	const selectedFolderPathRef = useRef<string | null>(null);
	const selectedMessageIdRef = useRef<number | null>(null);
	const pendingDeleteMessageIdsRef = useRef<Set<number>>(new Set());
	const pendingOpenMessageTargetRef = useRef<OpenMessageTargetEvent | null>(null);
	const sourceRequestSeqRef = useRef(0);
	const mailBodyViewportRef = useRef<HTMLDivElement | null>(null);
	const autoOpenedForSmallPreviewMessageIdRef = useRef<number | null>(null);
	const [systemLocale, setSystemLocale] = useState<string>('en-US');
	const [mailBodyViewport, setMailBodyViewport] = useState<{ width: number; height: number }>({width: 0, height: 0});
	const [workspace, setWorkspace] = useState<Workspace>('mail');
	const {
		syncStatusText,
		setSyncStatusText,
		syncingAccountIds,
		markAccountSyncing,
		clearAccountSyncing,
		pruneSyncingAccounts,
	} = useMailSyncStatus();
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
		onSelectMail: () => setWorkspace('mail'),
	});
	const [contacts, setContacts] = useState<ContactItem[]>([]);
	const [contactsQuery, setContactsQuery] = useState('');
	const [contactsLoading, setContactsLoading] = useState(false);
	const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
	const [calendarLoading, setCalendarLoading] = useState(false);
	const routeAccountId = parseRouteNumber(params.accountId);
	const routeFolderId = parseRouteNumber(params.folderId);
	const routeEmailId = parseRouteNumber(params.emailId);
	const {bodyLoading, selectedMessageBody} = useMessageBodyLoader(selectedMessageId);
	const {
		clearPendingReadState,
		hasPendingReadForAccount,
		hasRecentLocalReadMutation,
		getPendingRead,
		applyPendingReadOverrides,
		applyReadOptimistic,
		syncReadState,
	} = useOptimisticReadState({
		setMessages,
		setFolders,
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

	const selectedMessage = useMemo(
		() => messages.find((m) => m.id === selectedMessageId) ?? null,
		[messages, selectedMessageId],
	);
	const messageAttachments = selectedMessageBody?.attachments ?? [];
	const senderWhitelisted = isSenderAllowed(selectedMessage?.from_address, appSettings.remoteContentAllowlist || []);
	const sessionAllowed = selectedMessageId ? sessionRemoteAllowedMessageIds.includes(selectedMessageId) : false;
	const allowRemoteForSelectedMessage = !appSettings.blockRemoteContent || senderWhitelisted || sessionAllowed;
	const isMailBodyViewportTooSmall =
		mailBodyViewport.width > 0 &&
		mailBodyViewport.height > 0 &&
		(mailBodyViewport.width < MIN_INLINE_MAIL_BODY_WIDTH || mailBodyViewport.height < MIN_INLINE_MAIL_BODY_HEIGHT);

	const renderedBodyHtml = useMemo(() => {
		if (!selectedMessageBody) return null;
		if (selectedMessageBody.html) return selectedMessageBody.html;
		return null;
	}, [selectedMessageBody]);

	const iframeSrcDoc = useMemo(() => {
		if (!selectedMessageBody) return null;
		if (!renderedBodyHtml) return null;
		const rawHtml = enrichAnchorTitles(renderedBodyHtml);
		const hasExplicitStyles = /<style[\s>]|font-family\s*:/i.test(rawHtml);
		const csp = buildSourceDocCsp(allowRemoteForSelectedMessage);
		const defaultReadableCss = hasExplicitStyles
			? ''
			: `
      body {
        padding: 16px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #111827;
      }
      `;

		return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base target="_blank" />
    <style>
      html, body { width: 100%; margin: 0; }
      body { box-sizing: border-box; }
      #lunamail-frame-content { box-sizing: border-box; padding: 16px; }
      ${defaultReadableCss}
    </style>
  </head>
  <body><div id="lunamail-frame-content">${rawHtml}</div></body>
</html>`;
	}, [allowRemoteForSelectedMessage, selectedMessageBody, renderedBodyHtml]);

	useThemePreference(appSettings.theme);

	useEffect(() => {
		if (!selectedMessageId) {
			setMailBodyViewport({width: 0, height: 0});
			return;
		}
		const rafId = window.requestAnimationFrame(() => {
			const node = mailBodyViewportRef.current;
			if (!node) return;
			const rect = node.getBoundingClientRect();
			const width = Math.round(rect.width);
			const height = Math.round(rect.height);
			setMailBodyViewport({width, height});
			const tooSmall =
				width > 0 && height > 0 && (width < MIN_INLINE_MAIL_BODY_WIDTH || height < MIN_INLINE_MAIL_BODY_HEIGHT);
			if (!tooSmall) {
				if (autoOpenedForSmallPreviewMessageIdRef.current === selectedMessageId) {
					autoOpenedForSmallPreviewMessageIdRef.current = null;
				}
				return;
			}
			if (autoOpenedForSmallPreviewMessageIdRef.current === selectedMessageId) return;
			autoOpenedForSmallPreviewMessageIdRef.current = selectedMessageId;
			setSyncStatusText('Preview area is too small. Opened message in a separate window.');
			void ipcClient.openMessageWindow(selectedMessageId);
		});
		return () => window.cancelAnimationFrame(rafId);
	}, [selectedMessageId]);

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
	}, [selectedMessage, pendingAutoReadMessageId, selectedAccountId, selectedFolderPath]);

	const refreshAccountsAndFolders = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
		const list = await ipcClient.getAccounts();
		if (!isActive()) return;
		setAccounts(list);
		void Promise.all(list.map((account) => ipcClient.getFolders(account.id)))
			.then((folderLists) => {
				if (!isActive()) return;
				const next: Record<number, FolderItem[]> = {};
				list.forEach((account, idx) => {
					next[account.id] = folderLists[idx] ?? [];
				});
				setAccountFoldersById(next);
			})
			.catch(() => {
				// ignore background preload errors
			});
		setSelectedAccountId((prev) => {
			if (prev && list.some((a) => a.id === prev)) return prev;
			return list.length > 0 ? list[0].id : null;
		});
	}, []);

	useEffect(() => {
		let mounted = true;

		const loadAppSettings = async () => {
			const settings = await ipcClient.getAppSettings();
			if (!mounted) return;
			setAppSettings(settings);
		};
		const loadSystemLocale = async () => {
			const locale = await ipcClient.getSystemLocale();
			if (!mounted) return;
			setSystemLocale(locale || 'en-US');
		};

		void refreshAccountsAndFolders(() => mounted);
		void loadAppSettings();
		void loadSystemLocale();

		return () => {
			mounted = false;
		};
	}, [refreshAccountsAndFolders]);

	useIpcEvent(ipcClient.onAccountAdded, (created: { id: number; email: string }) => {
		void refreshAccountsAndFolders();
		setSelectedAccountId(created.id);
		setSyncStatusText(statusSyncStarted(created.email));
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
				setSyncStatusText(statusSyncingMailbox());
			}
			return;
		}
		if (evt.status === 'done') {
			clearAccountSyncing(evt.accountId);
			if (evt.accountId === selectedAccountId || selectedAccountId === null) {
				setSyncStatusText(statusSyncedMessages(evt.summary?.messages ?? 0));
			}
			if (evt.accountId === selectedAccountId) {
				if (hasPendingReadForAccount(evt.accountId) || hasRecentLocalReadMutation(evt.accountId)) return;
				void loadFoldersAndMessages(evt.accountId);
			}
			return;
		}
		clearAccountSyncing(evt.accountId);
		if (evt.accountId === selectedAccountId || selectedAccountId === null) {
			setSyncStatusText(statusSyncFailed(evt.error));
		}
	});

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
		setFolders((prev) =>
			prev.map((folder) =>
				folder.id === evt.folderId
					? {...folder, unread_count: evt.unreadCount, total_count: evt.totalCount}
					: folder,
			),
		);
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

	useIpcEvent(ipcClient.onAppSettingsUpdated, (settings) => {
		setAppSettings(settings);
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
			setFolders([]);
			setMessages([]);
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
	}, [selectedAccountId]);

	useEffect(() => {
		if (!selectedAccountId || !selectedFolderPath) {
			setMessages([]);
			setHasMoreMessages(false);
			setLoadingMoreMessages(false);
			setSelectedMessageIds([]);
			selectionAnchorIndexRef.current = null;
			setPendingAutoReadMessageId(null);
			return;
		}

		const loadMessages = async () => {
			setLoadingMoreMessages(true);
			try {
				const rowsRaw = await ipcClient.getFolderMessages(
					selectedAccountId,
					selectedFolderPath,
					messageFetchLimit,
				);
				setHasMoreMessages(rowsRaw.length >= messageFetchLimit);
				setMessages(applyPendingReadOverrides(filterOutPendingDeletes(rowsRaw)));
			} finally {
				setLoadingMoreMessages(false);
			}
		};
		void loadMessages();
	}, [selectedAccountId, selectedFolderPath, messageFetchLimit]);

	useEffect(() => {
		const query = searchQuery.trim();
		if (query.length === 0) {
			setSearchResults([]);
			setSearchLoading(false);
			return;
		}
		if (accounts.length === 0) {
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
				const rowsByAccount = await Promise.all(
					accounts.map((account) => ipcClient.searchMessages(account.id, query, null, perAccountLimit)),
				);
				if (!active) return;
				const merged = rowsByAccount.flat().sort((a, b) => {
					const aTime = a.date ? Date.parse(a.date) : 0;
					const bTime = b.date ? Date.parse(b.date) : 0;
					return bTime - aTime;
				});
				setSearchResults(merged);
			} finally {
				window.clearTimeout(loadingTimer);
				if (active) setSearchLoading(false);
			}
		};
		void run();
		return () => {
			active = false;
		};
	}, [searchQuery, accounts]);

	useEffect(() => {
		if (workspace !== 'contacts' || !selectedAccountId) {
			setContacts([]);
			setContactsLoading(false);
			return;
		}
		let active = true;
		const run = async () => {
			setContactsLoading(true);
			try {
				const rows = await ipcClient.getContacts(selectedAccountId, contactsQuery.trim() || null, 500);
				if (!active) return;
				setContacts(rows);
			} finally {
				if (active) setContactsLoading(false);
			}
		};
		void run();
		return () => {
			active = false;
		};
	}, [workspace, selectedAccountId, contactsQuery]);

	useEffect(() => {
		if (workspace !== 'calendar' || !selectedAccountId) {
			setCalendarEvents([]);
			setCalendarLoading(false);
			return;
		}
		let active = true;
		const run = async () => {
			setCalendarLoading(true);
			try {
				const now = new Date();
				const start = new Date(now);
				start.setDate(start.getDate() - 30);
				const end = new Date(now);
				end.setDate(end.getDate() + 365);
				const rows = await ipcClient.getCalendarEvents(
					selectedAccountId,
					start.toISOString(),
					end.toISOString(),
					1000,
				);
				if (!active) return;
				setCalendarEvents(rows);
			} finally {
				if (active) setCalendarLoading(false);
			}
		};
		void run();
		return () => {
			active = false;
		};
	}, [workspace, selectedAccountId]);

	useEffect(() => {
		setMessageFetchLimit(MESSAGE_PAGE_SIZE);
		setHasMoreMessages(false);
	}, [selectedAccountId, selectedFolderPath]);

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
		selectedFolderPathRef.current = selectedFolderPath;
	}, [selectedFolderPath]);

	useEffect(() => {
		selectedMessageIdRef.current = selectedMessageId;
	}, [selectedMessageId]);

	useEffect(() => {
		if (!routeAccountId) return;
		if (!accounts.some((account) => account.id === routeAccountId)) return;
		if (selectedAccountId === routeAccountId) return;
		setSelectedAccountId(routeAccountId);
	}, [accounts, routeAccountId, selectedAccountId]);

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
			if (selectedMessageId !== routeEmailId) {
				setSelectedMessageId(routeEmailId);
				setSelectedMessageIds((prev) => (prev.includes(routeEmailId) ? prev : [routeEmailId]));
			}
		} else if (selectedMessageId !== null) {
			setSelectedMessageId(null);
			setSelectedMessageIds([]);
			selectionAnchorIndexRef.current = null;
		}
	}, [folders, routeAccountId, routeEmailId, routeFolderId, selectedAccountId, selectedFolderPath]);

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
	}, [messages]);

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

	useIpcEvent(ipcClient.onLinkHoverUrl, (url) => {
		setHoveredLinkUrl(url || '');
	});

	useEffect(() => {
		pruneSyncingAccounts(accounts.map((account) => account.id));
	}, [accounts, pruneSyncingAccounts]);

	function filterOutPendingDeletes<T extends MessageItem>(rows: T[]): T[] {
		const pending = pendingDeleteMessageIdsRef.current;
		if (pending.size === 0) return rows;
		return rows.filter((m) => !pending.has(m.id));
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
			const summary = await ipcClient.syncAccount(selectedAccountId);
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
		const folderRows = await ipcClient.getFolders(accountId);
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

		const msgRowsRaw = await ipcClient.getFolderMessages(accountId, chosenFolder, messageFetchLimit);
		const msgRows = applyPendingReadOverrides(filterOutPendingDeletes(msgRowsRaw));
		setHasMoreMessages(msgRowsRaw.length >= messageFetchLimit);
		setMessages(msgRows);
		if (preferredMessageId) {
			setSelectedMessageId(preferredMessageId);
			return;
		}
		const currentMessageId = selectedMessageIdRef.current;
		if (currentMessageId && msgRows.some((m) => m.id === currentMessageId)) {
			setSelectedMessageId(currentMessageId);
		}
	}

	async function runServerAction(
		fn: () => Promise<any>,
		accountId: number | null,
		preferredFolder: string | null,
		preferredMessage: number | null,
	) {
		if (!accountId) return;
		setSyncStatusText('Syncing changes to server...');
		try {
			await fn();
			await reloadAccountData(accountId, preferredFolder, preferredMessage);
			setSyncStatusText('Changes synced');
		} catch (e: any) {
			setSyncStatusText(`Action failed: ${e?.message || String(e)}`);
			await reloadAccountData(accountId, preferredFolder, preferredMessage);
		}
	}

	function applyFlagOptimistic(messageId: number, nextFlag: number) {
		setMessages((prev) => prev.map((m) => (m.id === messageId ? {...m, is_flagged: nextFlag} : m)));
	}

	function applyTagOptimistic(messageId: number, nextTag: string | null) {
		setMessages((prev) => prev.map((m) => (m.id === messageId ? {...m, tag: nextTag} : m)));
	}

	function applyRemoveOptimistic(message: MessageItem, folderPath: string | null) {
		setMessages((prev) => prev.filter((m) => m.id !== message.id));
		setSelectedMessageIds((prev) => prev.filter((id) => id !== message.id));
		setSelectedMessageId((prev) => (prev === message.id ? null : prev));

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
		setMessages((prev) => prev.filter((m) => m.id !== message.id));
		setSelectedMessageIds((prev) => prev.filter((id) => id !== message.id));
		setSelectedMessageId((prev) => (prev === message.id ? null : prev));

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

	function composeWithDraft(draft: {
		to?: string | null;
		cc?: string | null;
		subject?: string | null;
		body?: string | null;
		bodyHtml?: string | null;
		bodyText?: string | null;
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
			bodyHtml: quoteHtml,
			bodyText: `\n\n${buildReplyQuoteText(selectedMessage, quoteText, systemLocale)}`,
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
			bodyHtml: quoteHtml,
			bodyText: `\n\n${buildReplyQuoteText(selectedMessage, quoteText, systemLocale)}`,
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
			bodyHtml: buildForwardQuoteHtml(selectedMessage, selectedMessageBody?.html, originalText, systemLocale),
			bodyText: forwarded,
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
				})
				.finally(() => {
					pendingDeleteMessageIdsRef.current.delete(message.id);
				});
		}
	}

	function onOpenInNewWindow(): void {
		if (!selectedMessageId) return;
		void ipcClient.openMessageWindow(selectedMessageId);
	}

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
		window.dispatchEvent(new Event('lunamail-close-overlays'));
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
				onReply();
				return;
			}
			if (key === 'r' && event.shiftKey && !event.altKey) {
				event.preventDefault();
				onReplyAll();
				return;
			}
			if (key === 'f' && event.shiftKey && !event.altKey) {
				event.preventDefault();
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
	}, [
		messages,
		navigate,
		selectedAccountId,
		selectedMessageId,
		selectedFolderPath,
		selectedMessage,
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
				setWorkspace('mail');
			}}
			messages={messages}
			selectedMessageId={selectedMessageId}
			selectedMessageIds={selectedMessageIds}
			onSelectMessage={handleSelectMessage}
			searchQuery={searchQuery}
			onSearchQueryChange={setSearchQuery}
			searchResults={searchResults}
			searchLoading={searchLoading}
			onLoadMoreMessages={() => {
				if (loadingMoreMessages || !hasMoreMessages) return;
				setMessageFetchLimit((prev) => prev + MESSAGE_PAGE_SIZE);
			}}
			hasMoreMessages={hasMoreMessages}
			loadingMoreMessages={loadingMoreMessages}
			onRefresh={onRefresh}
			onOpenCalendar={() => {
				setWorkspace((prev) => {
					if (prev === 'calendar') return 'mail';
					setSelectedFolderPath(null);
					setSelectedMessageId(null);
					setSelectedMessageIds([]);
					return 'calendar';
				});
			}}
			onOpenContacts={() => {
				setWorkspace((prev) => {
					if (prev === 'contacts') return 'mail';
					setSelectedFolderPath(null);
					setSelectedMessageId(null);
					setSelectedMessageIds([]);
					return 'contacts';
				});
			}}
			mailView={appSettings.mailView}
			onMailViewChange={(view) => {
				setAppSettings((prev) => ({...prev, mailView: view}));
				void ipcClient.updateAppSettings({mailView: view}).catch(() => undefined);
			}}
			activeWorkspace={workspace}
			hideFolderSidebar={workspace === 'calendar' || workspace === 'contacts'}
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
					await ipcClient.createFolder(targetAccountId, normalizedPath);
					if ((type && type.trim()) || (color && color.trim())) {
						await ipcClient.updateFolderSettings(targetAccountId, normalizedPath, {
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
					const updated = await ipcClient.reorderCustomFolders(accountId, mergedPaths);
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
						await ipcClient.deleteFolder(selectedAccountId, folder.path);
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
					const nextFlag = message.is_flagged ? 0 : 1;
					applyFlagOptimistic(message.id, nextFlag);
					const keepSelected = selectedMessageId === message.id ? message.id : null;
					return runServerAction(
						() => setMessageFlagMutation.mutateAsync({messageId: message.id, isFlagged: nextFlag}),
						selectedAccountId,
						selectedFolderPath,
						keepSelected,
					);
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
				void (async () => {
					if (!selectedAccountId) return;
					setSyncStatusText('Archiving message...');
					try {
						const res = await archiveMessageMutation.mutateAsync({messageId: message.id});
						setMessages((prev) => prev.filter((row) => row.id !== message.id));
						setSelectedMessageIds((prev) => prev.filter((id) => id !== message.id));
						setSelectedMessageId((prev) => (prev === message.id ? null : prev));
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
						setSyncStatusText('Message archived');
					} catch (e: any) {
						setSyncStatusText(`Archive failed: ${e?.message || String(e)}`);
						await reloadAccountData(selectedAccountId, selectedFolderPath, null);
					}
				})()
			}
			onMessageMove={(message, targetFolderPath) =>
				void (() => {
					applyMoveOptimistic(message, selectedFolderPath, targetFolderPath);
					return (async () => {
						if (!selectedAccountId) return;
						setSyncStatusText('Syncing move to server...');
						try {
							const res = await moveMessageMutation.mutateAsync({
								messageId: message.id,
								targetFolderPath,
							});
							setFolders((prev) =>
								prev.map((f) => {
									if (f.id === res.sourceFolderId) {
										return {
											...f,
											unread_count: res.sourceUnreadCount,
											total_count: res.sourceTotalCount,
										};
									}
									if (f.id === res.targetFolderId) {
										return {
											...f,
											unread_count: res.targetUnreadCount,
											total_count: res.targetTotalCount,
										};
									}
									return f;
								}),
							);
							setSyncStatusText('Move synced');
						} catch (e: any) {
							setSyncStatusText(`Move failed: ${e?.message || String(e)}`);
							await reloadAccountData(selectedAccountId, selectedFolderPath, message.id);
						}
					})();
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
					const updated = await ipcClient.updateFolderSettings(selectedAccountId, folder.path, {
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
			<div className={`h-full overflow-hidden ${selectedMessage ? '' : 'bg-slate-50 dark:bg-[#26292f]'}`}>
				{workspace === 'calendar' && (
					<section className="h-full overflow-auto bg-slate-50 p-5 dark:bg-[#26292f]">
						<div className="mx-auto max-w-5xl">
							<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Calendar</h2>
							{!selectedAccountId && (
								<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
									Select an account to load calendar events.
								</p>
							)}
							{selectedAccountId && (
								<>
									{calendarLoading && (
										<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
											Loading events...
										</p>
									)}
									{!calendarLoading && calendarEvents.length === 0 && (
										<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
											No events found.
										</p>
									)}
									{!calendarLoading && calendarEvents.length > 0 && (
										<div
											className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
											<ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
												{calendarEvents.map((event) => (
													<li key={event.id} className="px-4 py-3">
														<p className="text-sm font-medium text-slate-900 dark:text-slate-100">
															{event.summary || '(No title)'}
														</p>
														<p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
															{formatSystemDateTime(event.starts_at, systemLocale)} -{' '}
															{formatSystemDateTime(event.ends_at, systemLocale)}
														</p>
														{event.location && (
															<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
																{event.location}
															</p>
														)}
													</li>
												))}
											</ul>
										</div>
									)}
								</>
							)}
						</div>
					</section>
				)}

				{workspace === 'contacts' && (
					<section className="h-full overflow-auto bg-slate-50 p-5 dark:bg-[#26292f]">
						<div className="mx-auto max-w-5xl">
							<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Contacts</h2>
							{!selectedAccountId && (
								<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
									Select an account to load contacts.
								</p>
							)}
							{selectedAccountId && (
								<>
									<div className="mt-4">
										<input
											type="text"
											value={contactsQuery}
											onChange={(event) => setContactsQuery(event.target.value)}
											placeholder="Search contacts..."
											className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
										/>
									</div>
									{contactsLoading && (
										<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
											Loading contacts...
										</p>
									)}
									{!contactsLoading && contacts.length === 0 && (
										<p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
											No contacts found.
										</p>
									)}
									{!contactsLoading && contacts.length > 0 && (
										<div
											className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
											<ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
												{contacts.map((contact) => (
													<li key={contact.id} className="px-4 py-3">
														<p className="text-sm font-medium text-slate-900 dark:text-slate-100">
															{contact.full_name || '(No name)'}
														</p>
														<p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
															{contact.email}
														</p>
													</li>
												))}
											</ul>
										</div>
									)}
								</>
							)}
						</div>
					</section>
				)}

				{workspace === 'mail' && selectedMessage && (
					<article className="flex h-full flex-col">
						<div
							role="toolbar"
							aria-label="Message actions"
							className="shrink-0 flex w-full flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 dark:border-[#3a3d44] dark:bg-[#2b2d31]"
						>
							<ToolboxButton label="Reply" icon={<Reply size={14}/>} onClick={onReply} primary/>
							<ToolboxButton label="Reply all" icon={<ReplyAll size={14}/>} onClick={onReplyAll}/>
							<ToolboxButton label="Forward" icon={<Forward size={14}/>} onClick={onForward}/>
							<span className="mx-1 h-6 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
							<ToolboxButton
								label="Open"
								icon={<SquareArrowOutUpRight size={14}/>}
								onClick={onOpenInNewWindow}
							/>
							<ToolboxButton label="View source" icon={<FileText size={14}/>} onClick={onViewSource}/>
							<ToolboxButton
								label="Delete"
								icon={<Trash2 size={14}/>}
								onClick={onDeleteSelected}
								danger
							/>
						</div>
						<div
							className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/40 px-4 py-3 dark:border-[#393c41] dark:from-[#34373d] dark:via-[#34373d] dark:to-[#3a3550]">
							<div className="flex items-start justify-between gap-5">
								<div className="min-w-0 flex-1">
									<div className="mb-2 flex flex-wrap items-center gap-1.5">
										<span
											className="inline-flex h-5 items-center rounded-md bg-slate-200/90 px-2 text-[11px] font-medium text-slate-700 dark:bg-[#2a2d31] dark:text-slate-200">
											{selectedFolderPath || 'Message'}
										</span>
										{Boolean(selectedMessage.is_flagged) && (
											<span
												className="inline-flex h-5 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-medium text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300">
												<Star size={11} className="fill-current"/>
												Starred
											</span>
										)}
										<span
											className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
											<MailOpen size={11}/>
											{selectedMessage.is_read ? 'Read' : 'Unread'}
										</span>
										{Boolean((selectedMessage as MessageItem & { tag?: string | null }).tag) && (
											<span
												className="inline-flex h-5 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 text-[11px] font-medium text-sky-800 dark:border-sky-700/70 dark:bg-sky-900/20 dark:text-sky-300">
												<Tag size={11}/>
												{formatMessageTagLabel(
													(
														selectedMessage as MessageItem & {
															tag?: string | null;
														}
													).tag ?? null,
												)}
											</span>
										)}
										{messageAttachments.length > 0 && (
											<span
												className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
												<Paperclip size={11}/>
												{messageAttachments.length} attachment
												{messageAttachments.length > 1 ? 's' : ''}
											</span>
										)}
										{buildSpoofHints(selectedMessage).length > 0 && (
											<span
												className="inline-flex h-5 items-center rounded-md bg-amber-100 px-2 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
												Verify sender
											</span>
										)}
									</div>
									<h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
										{selectedMessage.subject || '(No subject)'}
									</h2>
								</div>
							</div>
							<div className="mt-2 grid gap-1 text-xs text-slate-700 dark:text-slate-200">
								<div className="select-text">
									<span className="font-medium text-slate-500 dark:text-slate-400">From:</span>{' '}
									<span className="select-text">{formatFromDisplay(selectedMessage)}</span>
								</div>
								<div className="select-text">
									<span className="font-medium text-slate-500 dark:text-slate-400">To:</span>{' '}
									<span className="select-text">{selectedMessage.to_address || '-'}</span>
								</div>
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">Date:</span>{' '}
									{formatSystemDateTime(selectedMessage.date, systemLocale)}
								</div>
							</div>
							<button
								className="mt-2 inline-flex h-7 items-center rounded-md border border-slate-300 px-2 text-[11px] text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
								onClick={() => setShowMessageDetails((prev) => !prev)}
							>
								{showMessageDetails ? 'Hide message details' : 'Show message details'}
							</button>
							{showMessageDetails && (
								<div
									className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
									<div>
										<span className="font-medium">From name:</span>{' '}
										{selectedMessage.from_name || '-'}
									</div>
									<div>
										<span className="font-medium">From address:</span>{' '}
										{selectedMessage.from_address || '-'}
									</div>
									<div>
										<span className="font-medium">To:</span> {selectedMessage.to_address || '-'}
									</div>
									<div>
										<span className="font-medium">Date:</span>{' '}
										{formatSystemDateTime(selectedMessage.date, systemLocale)}
									</div>
									<div>
										<span className="font-medium">Message-ID:</span>{' '}
										{selectedMessage.message_id || '-'}
									</div>
									<div>
										<span className="font-medium">In-Reply-To:</span>{' '}
										{selectedMessage.in_reply_to || '-'}
									</div>
									<div>
										<span className="font-medium">References:</span>{' '}
										{selectedMessage.references_text || '-'}
									</div>
									<div>
										<span className="font-medium">Size:</span>{' '}
										{selectedMessage.size ? `${selectedMessage.size.toLocaleString()} bytes` : '-'}
									</div>
									{buildSpoofHints(selectedMessage).map((hint) => (
										<div
											key={hint}
											className="mt-1 rounded border border-amber-300/70 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300"
										>
											{hint}
										</div>
									))}
								</div>
							)}
						</div>
						<div className="min-h-0 flex flex-1 flex-col bg-white">
							{Boolean(
								renderedBodyHtml &&
								selectedMessage &&
								appSettings.blockRemoteContent &&
								!allowRemoteForSelectedMessage,
							) && (
								<div
									className="w-full shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300">
									<div className="flex flex-wrap items-center gap-2">
										<span>Remote content blocked for privacy.</span>
										<button
											type="button"
											className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200 dark:border-amber-600/70 dark:bg-amber-900/30 dark:hover:bg-amber-900/45"
											onClick={allowRemoteContentOnceForSelected}
										>
											Load once
										</button>
										<button
											type="button"
											className="rounded border border-amber-500/60 bg-amber-100 px-2 py-1 text-[11px] font-medium hover:bg-amber-200 dark:border-amber-600/70 dark:bg-amber-900/30 dark:hover:bg-amber-900/45"
											onClick={allowRemoteContentForSender}
										>
											Always allow sender
										</button>
									</div>
								</div>
							)}
							<div ref={mailBodyViewportRef} className="min-h-0 flex-1">
								{isMailBodyViewportTooSmall && (
									<div
										className="flex h-full items-center justify-center bg-white px-4 text-center dark:bg-[#34373d]">
										<div className="max-w-md text-sm text-slate-600 dark:text-slate-300">
											<p>
												Preview is too small ({mailBodyViewport.width}x{mailBodyViewport.height}
												). Message opened in a separate window.
											</p>
											<button
												type="button"
												className="mt-3 inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
												onClick={onOpenInNewWindow}
											>
												<SquareArrowOutUpRight size={13}/>
												Open message window
											</button>
										</div>
									</div>
								)}
								{bodyLoading && (
									<div
										className={
											isMailBodyViewportTooSmall
												? 'hidden'
												: 'flex h-full items-center justify-center text-slate-500 dark:text-slate-400'
										}
									>
										Loading message body...
									</div>
								)}
								{!isMailBodyViewportTooSmall && !bodyLoading && iframeSrcDoc && (
									<iframe
										title={`message-body-${selectedMessage.id}`}
										srcDoc={iframeSrcDoc}
										sandbox="allow-popups allow-popups-to-escape-sandbox"
										className="h-full w-full border-0 bg-white"
										onMouseDown={requestCloseMainOverlays}
										onContextMenu={() => requestCloseMainOverlays()}
										onFocus={requestCloseMainOverlays}
										onMouseEnter={() => setIsPointerOverMessageFrame(true)}
										onMouseLeave={() => {
											setIsPointerOverMessageFrame(false);
											setHoveredLinkUrl('');
										}}
									/>
								)}
								{!isMailBodyViewportTooSmall && !bodyLoading && !iframeSrcDoc && (
									<div className="h-full overflow-auto bg-white p-4 text-slate-900">
										<pre
											className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
											{selectedMessageBody?.text || 'No body content available for this message.'}
										</pre>
									</div>
								)}
							</div>
						</div>
						{messageAttachments.length > 0 && (
							<div
								className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
								<div className="overflow-x-auto overflow-y-hidden">
									<div className="flex min-w-full w-max gap-2 pb-1">
										{messageAttachments.map((attachment, index) => (
											<button
												key={`${attachment.filename || 'attachment'}-${index}`}
												type="button"
												className="group flex w-[17rem] shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 text-left text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-200"
												title={attachment.filename || 'Attachment'}
												onClick={(event) => {
													event.stopPropagation();
													setAttachmentMenu({
														x: event.clientX,
														y: event.clientY,
														index,
													});
												}}
												onContextMenu={(event) => {
													event.preventDefault();
													event.stopPropagation();
													setAttachmentMenu({
														x: event.clientX,
														y: event.clientY,
														index,
													});
												}}
											>
												<span
													className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-slate-100 text-slate-500 dark:border-[#3a3d44] dark:bg-[#2a2d31] dark:text-slate-300">
													<Paperclip size={15}/>
												</span>
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{attachment.filename || 'Attachment'}
													</span>
													<span
														className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
														{attachment.contentType || 'FILE'}
														{typeof attachment.size === 'number'
															? ` • ${formatBytes(attachment.size)}`
															: ''}
													</span>
												</span>
											</button>
										))}
									</div>
								</div>
							</div>
						)}
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
				<div
					className="fixed z-[1100] min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
					style={{
						left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
						top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
					}}
					onClick={(event) => event.stopPropagation()}
				>
					<button
						className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
						onClick={() => {
							runAttachmentAction(attachmentMenu.index, 'open');
							setAttachmentMenu(null);
						}}
					>
						Open
					</button>
					<button
						className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
						onClick={() => {
							runAttachmentAction(attachmentMenu.index, 'save');
							setAttachmentMenu(null);
						}}
					>
						Save As...
					</button>
				</div>
			)}
		</MainLayout>
	);
}

export default MailPage;
