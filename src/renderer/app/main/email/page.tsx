import {Button} from '@renderer/components/ui/button';
import {ContextMenu, ContextMenuItem} from '@renderer/components/ui/ContextMenu';
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
import MainLayout from '@renderer/layouts/MainLayout';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
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
import {isEditableTarget} from '@renderer/lib/dom';
import {clampToViewport, formatBytes} from '@renderer/lib/format';
import {
    statusSyncedMailboxAndDav,
    statusSyncedMessages,
    statusSyncFailed,
    statusSyncingMailbox,
    statusSyncStarted,
    toErrorMessage,
} from '@renderer/lib/statusText';
import {useThemePreference} from '@renderer/hooks/useAppTheme';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useMailSelection} from '@renderer/hooks/mail/useMailSelection';
import {useMessageBodyLoader} from '@renderer/hooks/mail/useMessageBodyLoader';
import {useMailSyncStatus} from '@renderer/hooks/mail/useMailSyncStatus';
import {useOptimisticReadState} from '@renderer/hooks/mail/useOptimisticReadState';
import {useMailActionMutations} from '@renderer/hooks/mail/useMailActionMutations';
import {buildMessageIframeSrcDoc, formatMessageTagLabel, parseRouteNumber} from './mailPageHelpers';
import {
    hasAccountOrderChanged,
    normalizeAccountOrder,
    readPersistedAccountOrder,
    sortAccountsByOrder,
    writePersistedAccountOrder,
} from './mailAccountOrder';
import {ipcClient} from '@renderer/lib/ipcClient';
import {createDefaultAppSettings} from '@/shared/defaults';
import type {FolderItem, MessageItem, OpenMessageTargetEvent, PublicAccount, SyncStatusEvent,} from '@/preload';

const MESSAGE_PAGE_SIZE = 100;
const MIN_INLINE_MAIL_BODY_WIDTH = 520;
const MIN_INLINE_MAIL_BODY_HEIGHT = 260;
const SEARCH_FALLBACK_MESSAGES_PER_FOLDER = 1000;

function MailPage() {
    const params = useParams<{ accountId?: string; folderId?: string; emailId?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [accountOrder, setAccountOrder] = useState<number[]>(() => readPersistedAccountOrder());
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
    const accountOrderRef = useRef<number[]>(accountOrder);
    const mailBodyViewportRef = useRef<HTMLDivElement | null>(null);
    const autoOpenedForSmallPreviewMessageIdRef = useRef<number | null>(null);
    const lastOpenedDraftInMailViewRef = useRef<number | null>(null);
    const [systemLocale, setSystemLocale] = useState<string>('en-US');
    const [mailBodyViewport, setMailBodyViewport] = useState<{ width: number; height: number }>({width: 0, height: 0});
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
        onSelectMail: () => undefined,
    });
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
    const selectedFolder = useMemo(
        () => (selectedFolderPath ? folders.find((folder) => folder.path === selectedFolderPath) ?? null : null),
        [folders, selectedFolderPath],
    );
    const isDraftMessageSelected = useMemo(() => {
        if (!selectedMessage) return false;
        const folderType = String(selectedFolder?.type || '').toLowerCase();
        const folderPath = String(selectedFolder?.path || selectedFolderPath || '').toLowerCase();
        if (folderType === 'drafts' || folderPath.includes('draft')) return true;
        return /^<draft\./i.test(String(selectedMessage.message_id || ''));
    }, [selectedFolder, selectedFolderPath, selectedMessage]);
    const messageAttachments = selectedMessageBody?.attachments ?? [];
    const senderWhitelisted = isSenderAllowed(selectedMessage?.from_address, appSettings.remoteContentAllowlist || []);
    const sessionAllowed = selectedMessageId ? sessionRemoteAllowedMessageIds.includes(selectedMessageId) : false;
    const allowRemoteForSelectedMessage = !appSettings.blockRemoteContent || senderWhitelisted || sessionAllowed;
    const warnOnExternalLinksForSelectedMessage = Boolean(selectedMessage) && !senderWhitelisted;
    const isMailBodyViewportTooSmall =
        mailBodyViewport.width > 0 &&
        mailBodyViewport.height > 0 &&
        (mailBodyViewport.width < MIN_INLINE_MAIL_BODY_WIDTH || mailBodyViewport.height < MIN_INLINE_MAIL_BODY_HEIGHT);

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
    }, [selectedMessageId, setSyncStatusText]);

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
    }, [applyReadOptimistic, pendingAutoReadMessageId, selectedAccountId, selectedFolderPath, selectedMessage, setPendingAutoReadMessageId, syncReadState]);

    const refreshAccountsAndFolders = useCallback(async (isActive: () => boolean = () => true): Promise<void> => {
        const list = await ipcClient.getAccounts();
        if (!isActive()) return;
        const sortedAccounts = sortAccountsByOrder(list, accountOrderRef.current);
        const normalizedOrder = normalizeAccountOrder(accountOrderRef.current, sortedAccounts);
        if (hasAccountOrderChanged(accountOrderRef.current, normalizedOrder)) {
            accountOrderRef.current = normalizedOrder;
            setAccountOrder(normalizedOrder);
        }
        setAccounts(sortedAccounts);
        void Promise.all(sortedAccounts.map((account) => ipcClient.getFolders(account.id)))
            .then((folderLists) => {
                if (!isActive()) return;
                const next: Record<number, FolderItem[]> = {};
                sortedAccounts.forEach((account, idx) => {
                    next[account.id] = folderLists[idx] ?? [];
                });
                setAccountFoldersById(next);
            })
            .catch(() => {
                // ignore background preload errors
            });
        setSelectedAccountId((prev) => {
            if (prev && sortedAccounts.some((a) => a.id === prev)) return prev;
            return sortedAccounts.length > 0 ? sortedAccounts[0].id : null;
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
        setAccountOrder((prev) => prev.filter((id) => id !== deleted.id));
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

    const reorderAccounts = useCallback((orderedAccountIds: number[]) => {
        setAccounts((prev) => {
            const normalizedOrder = normalizeAccountOrder(orderedAccountIds, prev);
            accountOrderRef.current = normalizedOrder;
            setAccountOrder(normalizedOrder);
            const accountById = new Map<number, PublicAccount>(prev.map((account) => [account.id, account]));
            return normalizedOrder
                .map((id) => accountById.get(id))
                .filter((account): account is PublicAccount => Boolean(account));
        });
    }, []);

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
    }, [selectedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }, [selectedAccountId, selectedFolderPath, messageFetchLimit]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    candidateAccountIds.map((accountId) => ipcClient.searchMessages(accountId, query, null, perAccountLimit)),
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
                        const folders = await ipcClient.getFolders(accountId);
                        return {accountId, folders};
                    }),
                );
                if (!active) return;
                const folderPairs = foldersByAccount.flatMap((result) =>
                    result.status === 'fulfilled'
                        ? result.value.folders.map((folder) => ({
                            accountId: result.value.accountId,
                            folderPath: folder.path
                        }))
                        : [],
                );
                const scannedRows = await Promise.allSettled(
                    folderPairs.map(({accountId, folderPath}) =>
                        ipcClient.getFolderMessages(accountId, folderPath, SEARCH_FALLBACK_MESSAGES_PER_FOLDER),
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
    }, [searchQuery, accounts, accountFoldersById, selectedAccountId]);

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

    const isDraftMessageInMailView = useCallback((message: MessageItem | null | undefined): boolean => {
        if (!message) return false;
        const folder = folders.find((item) => item.id === message.folder_id) ?? null;
        const folderType = String(folder?.type || '').toLowerCase();
        const folderPath = String(folder?.path || '').toLowerCase();
        if (folderType === 'drafts' || folderPath.includes('draft')) return true;
        return /^<draft\./i.test(String(message.message_id || ''));
    }, [folders]);

    const openDraftInComposerFromMailView = useCallback((message: MessageItem): void => {
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
    }, [location.pathname, navigate, selectionAnchorIndexRef, setPendingAutoReadMessageId, setSelectedMessageId, setSelectedMessageIds]);

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
            const routedMessage = messages.find((message) => message.id === routeEmailId) ?? null;
            if (routedMessage && isDraftMessageInMailView(routedMessage)) {
                openDraftInComposerFromMailView(routedMessage);
                return;
            }
            if (selectedMessageId !== routeEmailId) {
                setSelectedMessageId(routeEmailId);
                setSelectedMessageIds((prev) => (prev.includes(routeEmailId) ? prev : [routeEmailId]));
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
            quotedBodyHtml: buildForwardQuoteHtml(selectedMessage, selectedMessageBody?.html, originalText, systemLocale),
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
                const isSelectedFolder =
                    selectedAccountId === folder.account_id && selectedFolderPath === folder.path;
                if (!isSelectedFolder) {
                    const accountFolders = accountFoldersById[folder.account_id] ?? [];
                    const folderId = accountFolders.find((item) => item.path === folder.path)?.id ?? null;
                    const target = folderId
                        ? `/email/${folder.account_id}/${folderId}`
                        : `/email/${folder.account_id}`;
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
                if (loadingMoreMessages || !hasMoreMessages) return;
                setMessageFetchLimit((prev) => prev + MESSAGE_PAGE_SIZE);
            }}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            onRefresh={onRefresh}
            onOpenCalendar={() => navigate('/calendar')}
            onOpenContacts={() => navigate('/contacts')}
            mailView={appSettings.mailView}
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
            <div className={`h-full overflow-hidden ${selectedMessage ? '' : 'ui-surface-content'}`}>

                {selectedMessage && (
                    <article className="flex h-full flex-col">
                        <div
                            role="toolbar"
                            aria-label="Message actions"
                            className="mail-menubar shrink-0 flex w-full flex-wrap items-center gap-1.5 px-3 py-2"
                        >
                            {!isDraftMessageSelected && (
                                <>
                                    <ToolboxButton label="Reply" icon={<Reply size={14}/>} onClick={onReply} primary/>
                                    <ToolboxButton label="Reply all" icon={<ReplyAll size={14}/>} onClick={onReplyAll}/>
                                    <ToolboxButton label="Forward" icon={<Forward size={14}/>} onClick={onForward}/>
                                    <span className="divider-default mx-1 h-6 w-px"/>
                                </>
                            )}
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
                        <div className="mail-message-header shrink-0 px-4 py-3">
                            <div className="flex items-start justify-between gap-5">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
										<span
                                            className="badge-muted inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
											{selectedFolderPath || 'Message'}
										</span>
                                        {Boolean(selectedMessage.is_flagged) && (
                                            <span
                                                className="chip-warning inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
												<Star size={11} className="fill-current"/>
												Starred
											</span>
                                        )}
                                        <span
                                            className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
											<MailOpen size={11}/>
                                            {selectedMessage.is_read ? 'Read' : 'Unread'}
										</span>
                                        {Boolean((selectedMessage as MessageItem & { tag?: string | null }).tag) && (
                                            <span
                                                className="chip-info inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-medium">
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
                                                className="inline-flex h-5 items-center gap-1 rounded-md border ui-border-default ui-surface-card px-2 text-[11px] font-medium ui-text-secondary">
												<Paperclip size={11}/>
                                                {messageAttachments.length} attachment
                                                {messageAttachments.length > 1 ? 's' : ''}
											</span>
                                        )}
                                        {buildSpoofHints(selectedMessage).length > 0 && (
                                            <span
                                                className="chip-warning inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium">
												Verify sender
											</span>
                                        )}
                                    </div>
                                    <h2 className="ui-text-primary truncate text-xl font-semibold tracking-tight">
                                        {selectedMessage.subject || '(No subject)'}
                                    </h2>
                                </div>
                            </div>
                            <div className="ui-text-secondary mt-2 grid gap-1 text-xs">
                                <div className="select-text">
                                    <span className="ui-text-muted font-medium">From:</span>{' '}
                                    <span className="select-text">{formatFromDisplay(selectedMessage)}</span>
                                </div>
                                <div className="select-text">
                                    <span className="ui-text-muted font-medium">To:</span>{' '}
                                    <span className="select-text">{selectedMessage.to_address || '-'}</span>
                                </div>
                                <div>
                                    <span className="ui-text-muted font-medium">Date:</span>{' '}
                                    {formatSystemDateTime(selectedMessage.date, systemLocale)}
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="mt-2 inline-flex h-7 items-center rounded-md px-2 text-[11px]"
                                onClick={() => setShowMessageDetails((prev) => !prev)}
                            >
                                {showMessageDetails ? 'Hide message details' : 'Show message details'}
                            </Button>
                            {showMessageDetails && (
                                <div
                                    className="panel-muted mt-3 rounded-md border ui-border-default p-3 text-xs ui-text-secondary">
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
                                            className="notice-warning mt-1 rounded border px-2 py-1"
                                        >
                                            {hint}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="ui-surface-card min-h-0 flex flex-1 flex-col">
                            {Boolean(
                                renderedBodyHtml &&
                                selectedMessage &&
                                appSettings.blockRemoteContent &&
                                !allowRemoteForSelectedMessage,
                            ) && (
                                <div
                                    className="notice-warning w-full shrink-0 border-b px-4 py-2 text-xs">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span>Remote content blocked for privacy.</span>
                                        <Button
                                            type="button"
                                            className="notice-button-warning rounded px-2 py-1 text-[11px] font-medium"
                                            onClick={allowRemoteContentOnceForSelected}
                                        >
                                            Load once
                                        </Button>
                                        <Button
                                            type="button"
                                            className="notice-button-warning rounded px-2 py-1 text-[11px] font-medium"
                                            onClick={allowRemoteContentForSender}
                                        >
                                            Always allow sender
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <div ref={mailBodyViewportRef} className="min-h-0 flex-1">
                                {isMailBodyViewportTooSmall && (
                                    <div
                                        className="ui-surface-card flex h-full items-center justify-center px-4 text-center">
                                        <div className="max-w-md text-sm ui-text-secondary">
                                            <p>
                                                Preview is too small ({mailBodyViewport.width}x{mailBodyViewport.height}
                                                ). Message opened in a separate window.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="mt-3 inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs"
                                                onClick={onOpenInNewWindow}
                                            >
                                                <SquareArrowOutUpRight size={13}/>
                                                Open message window
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                {bodyLoading && (
                                    <div
                                        className={
                                            isMailBodyViewportTooSmall
                                                ? 'hidden'
                                                : 'ui-text-muted flex h-full items-center justify-center'
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
                                        className="iframe-surface h-full w-full border-0"
                                        onMouseDown={requestCloseMainOverlays}
                                        onContextMenu={(event) => {
                                            event.stopPropagation();
                                            requestCloseMainOverlays();
                                        }}
                                        onFocus={requestCloseMainOverlays}
                                        onMouseEnter={() => setIsPointerOverMessageFrame(true)}
                                        onMouseLeave={() => {
                                            setIsPointerOverMessageFrame(false);
                                            setHoveredLinkUrl('');
                                        }}
                                    />
                                )}
                                {!isMailBodyViewportTooSmall && !bodyLoading && !iframeSrcDoc && (
                                    <div className="ui-surface-card h-full overflow-auto p-4 ui-text-primary">
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
                                className="shrink-0 border-t ui-border-default bg-[color-mix(in_srgb,var(--surface-content)_80%,transparent)] px-4 py-3">
                                <div className="overflow-x-auto overflow-y-hidden">
                                    <div className="flex min-w-full w-max gap-2 pb-1">
                                        {messageAttachments.map((attachment, index) => (
                                            <Button
                                                key={`${attachment.filename || 'attachment'}-${index}`}
                                                type="button"
                                                variant="outline"
                                                className="group flex w-[17rem] shrink-0 items-center gap-2 rounded-lg p-2 text-left text-xs"
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
                                                    className="attachment-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ui-border-default ui-text-muted">
													<Paperclip size={15}/>
												</span>
                                                <span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{attachment.filename || 'Attachment'}
													</span>
													<span
                                                        className="ui-text-muted block truncate text-[11px]">
														{attachment.contentType || 'FILE'}
                                                        {typeof attachment.size === 'number'
                                                            ? ` • ${formatBytes(attachment.size)}`
                                                            : ''}
													</span>
												</span>
                                            </Button>
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
                <ContextMenu
                    size="sm"
                    layer="1100"
                    position={{
                        left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
                        top: clampToViewport(attachmentMenu.y, 108, window.innerHeight),
                    }}
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
