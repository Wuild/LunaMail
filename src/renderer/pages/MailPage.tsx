import React, {useEffect, useMemo, useRef, useState} from 'react';
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
    Trash2
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
    isSenderAllowed
} from '../features/mail/remoteContent';
import {isEditableTarget} from '../lib/dom';
import {clampToViewport, formatBytes} from '../lib/format';
import type {
    AppSettings,
    CalendarEventItem,
    ContactItem,
    FolderItem,
    MessageBodyResult,
    MessageItem,
    MessageThreadItem,
    OpenMessageTargetEvent,
    PublicAccount,
    SyncStatusEvent
} from '../../preload/index';

const MESSAGE_PAGE_SIZE = 100;
const MIN_INLINE_MAIL_BODY_WIDTH = 520;
const MIN_INLINE_MAIL_BODY_HEIGHT = 260;
type Workspace = 'mail' | 'calendar' | 'contacts';

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
    const [messages, setMessages] = useState<MessageThreadItem[]>([]);
    const [messageFetchLimit, setMessageFetchLimit] = useState<number>(MESSAGE_PAGE_SIZE);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
    const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
    const [pendingAutoReadMessageId, setPendingAutoReadMessageId] = useState<number | null>(null);
    const [selectedMessageBody, setSelectedMessageBody] = useState<MessageBodyResult | null>(null);
    const [showMessageDetails, setShowMessageDetails] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [messageSource, setMessageSource] = useState('');
    const [sourceLoading, setSourceLoading] = useState(false);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [bodyLoading, setBodyLoading] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
    const [syncingAccountIds, setSyncingAccountIds] = useState<Set<number>>(new Set());
    const [attachmentMenu, setAttachmentMenu] = useState<{ x: number; y: number; index: number } | null>(null);
    const [sessionRemoteAllowedMessageIds, setSessionRemoteAllowedMessageIds] = useState<number[]>([]);
    const [hoveredLinkUrl, setHoveredLinkUrl] = useState('');
    const [isPointerOverMessageFrame, setIsPointerOverMessageFrame] = useState(false);
    const [appSettings, setAppSettings] = useState<AppSettings>({
        language: 'system',
        theme: 'system',
        mailView: 'side-list',
        blockRemoteContent: true,
        remoteContentAllowlist: [],
        minimizeToTray: true,
        syncIntervalMinutes: 2,
        autoUpdateEnabled: true,
        developerMode: false,
    });
    const bodyRequestSeqRef = useRef(0);
    const activeBodyRequestIdRef = useRef<string | null>(null);
    const selectedFolderPathRef = useRef<string | null>(null);
    const selectedMessageIdRef = useRef<number | null>(null);
    const pendingDeleteMessageIdsRef = useRef<Set<number>>(new Set());
    const pendingReadStateRef = useRef<Map<number, { desiredRead: number; accountId: number }>>(new Map());
    const pendingReadTimeoutsRef = useRef<Map<number, number>>(new Map());
    const lastLocalReadMutationAtByAccountRef = useRef<Map<number, number>>(new Map());
    const pendingOpenMessageTargetRef = useRef<OpenMessageTargetEvent | null>(null);
    const selectionAnchorIndexRef = useRef<number | null>(null);
    const sourceRequestSeqRef = useRef(0);
    const mailBodyViewportRef = useRef<HTMLDivElement | null>(null);
    const autoOpenedForSmallPreviewMessageIdRef = useRef<number | null>(null);
    const [systemLocale, setSystemLocale] = useState<string>('en-US');
    const [mailBodyViewport, setMailBodyViewport] = useState<{ width: number; height: number }>({width: 0, height: 0});
    const [workspace, setWorkspace] = useState<Workspace>('mail');
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [contactsQuery, setContactsQuery] = useState('');
    const [contactsLoading, setContactsLoading] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const routeAccountId = parseRouteNumber(params.accountId);
    const routeFolderId = parseRouteNumber(params.folderId);
    const routeEmailId = parseRouteNumber(params.emailId);
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
    const isMailBodyViewportTooSmall = mailBodyViewport.width > 0
        && mailBodyViewport.height > 0
        && (mailBodyViewport.width < MIN_INLINE_MAIL_BODY_WIDTH || mailBodyViewport.height < MIN_INLINE_MAIL_BODY_HEIGHT);

    function hasPendingReadForAccount(accountId: number): boolean {
        for (const pending of pendingReadStateRef.current.values()) {
            if (pending.accountId === accountId) return true;
        }
        return false;
    }

    function hasRecentLocalReadMutation(accountId: number, withinMs = 10000): boolean {
        const lastAt = lastLocalReadMutationAtByAccountRef.current.get(accountId);
        if (!lastAt) return false;
        return Date.now() - lastAt < withinMs;
    }

    function applyPendingReadOverrides<T extends MessageItem>(rows: T[]): T[] {
        if (pendingReadStateRef.current.size === 0) return rows;
        return rows.map((row) => {
            const pending = pendingReadStateRef.current.get(row.id);
            if (!pending) return row;
            return {...row, is_read: pending.desiredRead};
        }) as T[];
    }

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

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = () => {
            const useDark = appSettings.theme === 'dark' || (appSettings.theme === 'system' && media.matches);
            document.documentElement.classList.toggle('dark', useDark);
            document.body.classList.toggle('dark', useDark);
        };
        applyTheme();
        const onChange = () => {
            if (appSettings.theme === 'system') applyTheme();
        };
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [appSettings.theme]);

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
            const tooSmall = width > 0
                && height > 0
                && (width < MIN_INLINE_MAIL_BODY_WIDTH || height < MIN_INLINE_MAIL_BODY_HEIGHT);
            if (!tooSmall) {
                if (autoOpenedForSmallPreviewMessageIdRef.current === selectedMessageId) {
                    autoOpenedForSmallPreviewMessageIdRef.current = null;
                }
                return;
            }
            if (autoOpenedForSmallPreviewMessageIdRef.current === selectedMessageId) return;
            autoOpenedForSmallPreviewMessageIdRef.current = selectedMessageId;
            setSyncStatusText('Preview area is too small. Opened message in a separate window.');
            void window.electronAPI.openMessageWindow(selectedMessageId);
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

    useEffect(() => {
        let mounted = true;

        const loadAccounts = async () => {
            const list = await window.electronAPI.getAccounts();
            if (!mounted) return;
            setAccounts(list);
            void Promise.all(list.map((account) => window.electronAPI.getFolders(account.id)))
                .then((folderLists) => {
                    if (!mounted) return;
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
        };
        const loadAppSettings = async () => {
            const settings = await window.electronAPI.getAppSettings();
            if (!mounted) return;
            setAppSettings(settings);
        };
        const loadSystemLocale = async () => {
            const locale = await window.electronAPI.getSystemLocale();
            if (!mounted) return;
            setSystemLocale(locale || 'en-US');
        };

        void loadAccounts();
        void loadAppSettings();
        void loadSystemLocale();

        const offAdded = window.electronAPI.onAccountAdded?.((created: { id: number; email: string }) => {
            void loadAccounts();
            setSelectedAccountId(created.id);
            setSyncStatusText(`Sync started for ${created.email}...`);
        });
        const offUpdated = window.electronAPI.onAccountUpdated?.((updated: PublicAccount) => {
            setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        });
        const offDeleted = window.electronAPI.onAccountDeleted?.((deleted) => {
            setAccounts((prev) => prev.filter((a) => a.id !== deleted.id));
            setAccountFoldersById((prev) => {
                const next = {...prev};
                delete next[deleted.id];
                return next;
            });
            setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
        });

        const offSync = window.electronAPI.onAccountSyncStatus?.((evt: SyncStatusEvent) => {
            if (evt.status === 'syncing') {
                setSyncingAccountIds((prev) => {
                    if (prev.has(evt.accountId)) return prev;
                    const next = new Set(prev);
                    next.add(evt.accountId);
                    return next;
                });
                if (evt.accountId === selectedAccountId || selectedAccountId === null) {
                    setSyncStatusText('Syncing mailbox...');
                }
            } else if (evt.status === 'done') {
                setSyncingAccountIds((prev) => {
                    if (!prev.has(evt.accountId)) return prev;
                    const next = new Set(prev);
                    next.delete(evt.accountId);
                    return next;
                });
                if (evt.accountId === selectedAccountId || selectedAccountId === null) {
                    setSyncStatusText(`Synced ${evt.summary?.messages ?? 0} messages`);
                }
                if (evt.accountId === selectedAccountId) {
                    if (hasPendingReadForAccount(evt.accountId) || hasRecentLocalReadMutation(evt.accountId)) return;
                    void loadFoldersAndMessages(evt.accountId);
                }
            } else if (evt.status === 'error') {
                setSyncingAccountIds((prev) => {
                    if (!prev.has(evt.accountId)) return prev;
                    const next = new Set(prev);
                    next.delete(evt.accountId);
                    return next;
                });
                if (evt.accountId === selectedAccountId || selectedAccountId === null) {
                    setSyncStatusText(`Sync failed: ${evt.error ?? 'unknown error'}`);
                }
            }
        });
        const offReadUpdated = window.electronAPI.onMessageReadUpdated?.((evt) => {
            const pending = pendingReadStateRef.current.get(evt.messageId);
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
        const offSettings = window.electronAPI.onAppSettingsUpdated?.((settings) => {
            setAppSettings(settings);
        });
        const offOpenMessageTarget = window.electronAPI.onOpenMessageTarget?.((target) => {
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
            } else {
                const fallbackPath = `/email/${target.accountId}`;
                if (location.pathname !== fallbackPath) {
                    navigate(fallbackPath);
                }
            }
        });

        return () => {
            mounted = false;
            if (typeof offAdded === 'function') offAdded();
            if (typeof offUpdated === 'function') offUpdated();
            if (typeof offDeleted === 'function') offDeleted();
            if (typeof offSync === 'function') offSync();
            if (typeof offReadUpdated === 'function') offReadUpdated();
            if (typeof offSettings === 'function') offSettings();
            if (typeof offOpenMessageTarget === 'function') offOpenMessageTarget();
        };
    }, [accountFoldersById, location.pathname, navigate, selectedAccountId]);

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
                const rowsRaw = await window.electronAPI.getFolderThreads(selectedAccountId, selectedFolderPath, messageFetchLimit);
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
                    accounts.map((account) => window.electronAPI.searchMessages(account.id, query, null, perAccountLimit)),
                );
                if (!active) return;
                const merged = rowsByAccount
                    .flat()
                    .sort((a, b) => {
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
                const rows = await window.electronAPI.getContacts(selectedAccountId, contactsQuery.trim() || null, 500);
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
                const rows = await window.electronAPI.getCalendarEvents(
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
        if (!selectedMessageId) {
            if (activeBodyRequestIdRef.current) {
                void window.electronAPI.cancelMessageBody(activeBodyRequestIdRef.current);
                activeBodyRequestIdRef.current = null;
            }
            setSelectedMessageBody(null);
            setBodyLoading(false);
            return;
        }

        let active = true;
        if (activeBodyRequestIdRef.current) {
            void window.electronAPI.cancelMessageBody(activeBodyRequestIdRef.current);
        }
        const requestId = `body-${selectedMessageId}-${++bodyRequestSeqRef.current}`;
        activeBodyRequestIdRef.current = requestId;

        setBodyLoading(true);
        setSelectedMessageBody(null);
        window.electronAPI
            .getMessageBody(selectedMessageId, requestId)
            .then((body) => {
                if (!active) return;
                if (activeBodyRequestIdRef.current !== requestId) return;
                setSelectedMessageBody(body);
            })
            .catch((e: any) => {
                if (!active) return;
                if (activeBodyRequestIdRef.current !== requestId) return;
                if (String(e?.message || '').toLowerCase().includes('cancel')) return;
                setSelectedMessageBody({
                    messageId: selectedMessageId,
                    text: `Failed to load body: ${e?.message || String(e)}`,
                    html: null,
                    attachments: [],
                    cached: true,
                });
            })
            .finally(() => {
                if (!active) return;
                if (activeBodyRequestIdRef.current === requestId) {
                    setBodyLoading(false);
                }
            });

        return () => {
            active = false;
            void window.electronAPI.cancelMessageBody(requestId);
            if (activeBodyRequestIdRef.current === requestId) {
                activeBodyRequestIdRef.current = null;
            }
        };
    }, [selectedMessageId]);

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
    }, [
        folders,
        routeAccountId,
        routeEmailId,
        routeFolderId,
        selectedAccountId,
        selectedFolderPath,
    ]);

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
        const target = firstFolder
            ? `/email/${firstAccount.id}/${firstFolder.id}`
            : `/email/${firstAccount.id}`;
        if (location.pathname !== target) {
            navigate(target, {replace: true});
        }
    }, [accountFoldersById, accounts, location.pathname, navigate, routeAccountId]);

    useEffect(() => {
        const pendingTarget = pendingOpenMessageTargetRef.current;
        if (!pendingTarget) return;
        const accountFolders = accountFoldersById[pendingTarget.accountId] ?? [];
        if (accountFolders.length === 0) return;
        const matchedFolder = accountFolders.find((folder) => folder.path === pendingTarget.folderPath) ?? accountFolders[0];
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

    useEffect(() => {
        const off = window.electronAPI.onLinkHoverUrl?.((url) => {
            setHoveredLinkUrl(url || '');
        });
        return () => {
            if (typeof off === 'function') off();
        };
    }, []);

    useEffect(() => {
        const existing = new Set(accounts.map((a) => a.id));
        setSyncingAccountIds((prev) => {
            let changed = false;
            const next = new Set<number>();
            prev.forEach((id) => {
                if (existing.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : prev;
        });
    }, [accounts]);

    function filterOutPendingDeletes<T extends MessageItem>(rows: T[]): T[] {
        const pending = pendingDeleteMessageIdsRef.current;
        if (pending.size === 0) return rows;
        return rows.filter((m) => !pending.has(m.id));
    }

    function clearPendingReadState(messageId: number): void {
        pendingReadStateRef.current.delete(messageId);
        const timeoutId = pendingReadTimeoutsRef.current.get(messageId);
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
            pendingReadTimeoutsRef.current.delete(messageId);
        }
    }

    async function loadFoldersAndMessages(accountId: number, preferredFolderId?: number | null, preferredMessageId?: number | null) {
        await reloadAccountData(accountId, null, preferredMessageId ?? null, preferredFolderId ?? null);
    }

    async function onRefresh() {
        if (!selectedAccountId) return;
        setSyncStatusText('Syncing mailbox...');
        try {
            const summary = await window.electronAPI.syncAccount(selectedAccountId);
            if (summary.dav) {
                const contacts = summary.dav.contacts.upserted;
                const events = summary.dav.events.upserted;
                if (contacts > 0 || events > 0) {
                    setSyncStatusText(`Synced mailbox + DAV (${contacts} contacts, ${events} events)`);
                    return;
                }
            }
            setSyncStatusText(`Synced ${summary.messages ?? 0} messages`);
        } catch (e: any) {
            setSyncStatusText(`Sync failed: ${e?.message || String(e)}`);
        }
    }

    async function reloadAccountData(
        accountId: number,
        preferredFolderPath: string | null,
        preferredMessageId: number | null,
        preferredFolderId?: number | null,
    ) {
        const folderRows = await window.electronAPI.getFolders(accountId);
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

        const msgRowsRaw = await window.electronAPI.getFolderThreads(accountId, chosenFolder, messageFetchLimit);
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

    async function syncReadState(message: MessageItem, nextRead: number, folderPath: string | null) {
        lastLocalReadMutationAtByAccountRef.current.set(message.account_id, Date.now());
        pendingReadStateRef.current.set(message.id, {
            desiredRead: nextRead,
            accountId: message.account_id,
        });
        const existingTimeoutId = pendingReadTimeoutsRef.current.get(message.id);
        if (existingTimeoutId !== undefined) {
            window.clearTimeout(existingTimeoutId);
        }
        const timeoutId = window.setTimeout(() => {
            clearPendingReadState(message.id);
        }, 15000);
        pendingReadTimeoutsRef.current.set(message.id, timeoutId);
        try {
            const res = await window.electronAPI.setMessageRead(message.id, nextRead);
            setMessages((prev) =>
                prev.map((m) => (m.id === message.id ? {...m, is_read: res.isRead} : m)),
            );
            if (Number(res.isRead) !== nextRead) {
                clearPendingReadState(message.id);
            }
        } catch (e: any) {
            clearPendingReadState(message.id);
            applyReadOptimistic({...message, is_read: nextRead}, nextRead ? 0 : 1, folderPath);
            setSyncStatusText(`Read sync failed: ${e?.message || String(e)}`);
        }
    }

    function applyReadOptimistic(message: MessageItem, nextRead: number, folderPath: string | null) {
        if (message.is_read === nextRead) return;

        setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? {...m, is_read: nextRead} : m)),
        );

        if (!folderPath) return;
        const delta = nextRead ? -1 : 1;
        setFolders((prev) =>
            prev.map((f) => {
                if (f.path !== folderPath) return f;
                return {...f, unread_count: Math.max(0, f.unread_count + delta)};
            }),
        );
        setAccountFoldersById((prev) => {
            const accountId = message.account_id;
            const accountFolders = prev[accountId] ?? [];
            return {
                ...prev,
                [accountId]: accountFolders.map((f) => {
                    if (f.path !== folderPath) return f;
                    return {...f, unread_count: Math.max(0, f.unread_count + delta)};
                }),
            };
        });
    }

    function applyFlagOptimistic(messageId: number, nextFlag: number) {
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? {...m, is_flagged: nextFlag} : m)),
        );
    }

    function applyTagOptimistic(messageId: number, nextTag: string | null) {
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? {...m, tag: nextTag} : m)),
        );
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
        void window.electronAPI.openComposeWindow({
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
            void window.electronAPI.deleteMessage(message.id)
                .catch((error: any) => {
                    setSyncStatusText(`Delete sync failed: ${error?.message || String(error)}`);
                })
                .finally(() => {
                    pendingDeleteMessageIdsRef.current.delete(message.id);
                });
        }
    }

    function handleSelectMessage(
        id: number,
        index: number,
        modifiers?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
    ): void {
        const shiftKey = Boolean(modifiers?.shiftKey);
        const toggleKey = Boolean(modifiers?.ctrlKey || modifiers?.metaKey);

        if (shiftKey && messages.length > 0) {
            const anchor = selectionAnchorIndexRef.current ?? index;
            const start = Math.min(anchor, index);
            const end = Math.max(anchor, index);
            const rangeIds = messages.slice(start, end + 1).map((m) => m.id);
            setSelectedMessageIds(rangeIds);
            setSelectedMessageId(id);
            setPendingAutoReadMessageId(id);
            setWorkspace('mail');
            return;
        }

        if (toggleKey) {
            const exists = selectedMessageIds.includes(id);
            const nextIds = exists
                ? selectedMessageIds.filter((x) => x !== id)
                : [...selectedMessageIds, id];
            setSelectedMessageIds(nextIds);

            if (exists) {
                if (selectedMessageId === id) {
                    const fallbackId = nextIds[nextIds.length - 1] ?? null;
                    setSelectedMessageId(fallbackId);
                    setPendingAutoReadMessageId(fallbackId);
                } else {
                    setPendingAutoReadMessageId(null);
                }
            } else {
                setSelectedMessageId(id);
                setPendingAutoReadMessageId(id);
            }
            setWorkspace('mail');
            selectionAnchorIndexRef.current = index;
            return;
        }

        setSelectedMessageIds([id]);
        setSelectedMessageId(id);
        setPendingAutoReadMessageId(id);
        selectionAnchorIndexRef.current = index;
        setWorkspace('mail');
    }

    function openMessageInCurrentRoute(message: MessageItem): void {
        const targetPath = `/email/${message.account_id}/${message.folder_id}/${message.id}`;
        if (location.pathname !== targetPath) {
            navigate(targetPath);
        }
    }

    function navigateMessageSelection(direction: 1 | -1, extendSelection = false): void {
        if (messages.length === 0) return;
        const currentIndex = selectedMessageId
            ? messages.findIndex((message) => message.id === selectedMessageId)
            : -1;
        const fallbackIndex = direction > 0 ? 0 : messages.length - 1;
        const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
        const nextIndex = Math.min(messages.length - 1, Math.max(0, baseIndex + (currentIndex >= 0 ? direction : 0)));
        const nextMessage = messages[nextIndex];
        if (!nextMessage) return;

        if (extendSelection) {
            const anchor = selectionAnchorIndexRef.current ?? (currentIndex >= 0 ? currentIndex : nextIndex);
            const start = Math.min(anchor, nextIndex);
            const end = Math.max(anchor, nextIndex);
            const rangeIds = messages.slice(start, end + 1).map((message) => message.id);
            setSelectedMessageIds(rangeIds);
        } else {
            setSelectedMessageIds([nextMessage.id]);
            selectionAnchorIndexRef.current = nextIndex;
        }

        setSelectedMessageId(nextMessage.id);
        setPendingAutoReadMessageId(nextMessage.id);
        setWorkspace('mail');
        openMessageInCurrentRoute(nextMessage);
    }

    function onOpenInNewWindow(): void {
        if (!selectedMessageId) return;
        void window.electronAPI.openMessageWindow(selectedMessageId);
    }

    function onViewSource(): void {
        if (!selectedMessageId) return;
        const requestSeq = ++sourceRequestSeqRef.current;
        setShowSourceModal(true);
        setSourceLoading(true);
        setSourceError(null);
        setMessageSource('');
        void window.electronAPI.getMessageSource(selectedMessageId)
            .then((result) => {
                if (sourceRequestSeqRef.current !== requestSeq) return;
                setMessageSource(result.source);
            })
            .catch((error: any) => {
                if (sourceRequestSeqRef.current !== requestSeq) return;
                setSourceError(error?.message || String(error));
            })
            .finally(() => {
                if (sourceRequestSeqRef.current !== requestSeq) return;
                setSourceLoading(false);
            });
    }

    function runAttachmentAction(index: number, action: 'open' | 'save') {
        if (!selectedMessage) return;
        void window.electronAPI
            .openMessageAttachment(selectedMessage.id, index, action)
            .catch((error: any) => {
                setSyncStatusText(`Attachment failed: ${error?.message || String(error)}`);
            });
    }

    function requestCloseMainOverlays(): void {
        window.dispatchEvent(new Event('lunamail-close-overlays'));
    }

    function allowRemoteContentOnceForSelected(): void {
        if (!selectedMessageId) return;
        setSessionRemoteAllowedMessageIds((prev) => (prev.includes(selectedMessageId) ? prev : [...prev, selectedMessageId]));
    }

    function allowRemoteContentForSender(): void {
        const sender = extractEmailAddress(selectedMessage?.from_address);
        if (!sender) {
            setSyncStatusText('Could not determine sender address for allowlist.');
            return;
        }
        const nextAllowlist = [...new Set([...(appSettings.remoteContentAllowlist || []), sender])];
        setAppSettings((prev) => ({...prev, remoteContentAllowlist: nextAllowlist}));
        void window.electronAPI.updateAppSettings({remoteContentAllowlist: nextAllowlist}).catch((error: any) => {
            setSyncStatusText(`Failed to update allowlist: ${error?.message || String(error)}`);
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
                const allIds = messages.map((message) => message.id);
                setSelectedMessageIds(allIds);
                if (messages.length > 0) {
                    const selectedIndex = selectedMessageId
                        ? messages.findIndex((message) => message.id === selectedMessageId)
                        : -1;
                    if (selectedIndex >= 0) {
                        selectionAnchorIndexRef.current = selectedIndex;
                    } else {
                        setSelectedMessageId(messages[0].id);
                        selectionAnchorIndexRef.current = 0;
                    }
                } else {
                    setSelectedMessageId(null);
                    selectionAnchorIndexRef.current = null;
                }
                setPendingAutoReadMessageId(null);
                setWorkspace('mail');
                return;
            }

            if (key === 'n' && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                void window.electronAPI.openComposeWindow({accountId: selectedAccountId});
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
        systemLocale
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
                    typeof accountId === 'number' && Number.isFinite(accountId)
                        ? accountId
                        : selectedAccountId;
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
                void window.electronAPI.updateAppSettings({mailView: view}).catch(() => undefined);
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
                    await window.electronAPI.createFolder(targetAccountId, normalizedPath);
                    if ((type && type.trim()) || (color && color.trim())) {
                        await window.electronAPI.updateFolderSettings(targetAccountId, normalizedPath, {
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
                    const updated = await window.electronAPI.reorderCustomFolders(accountId, mergedPaths);
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
                        await window.electronAPI.deleteFolder(selectedAccountId, folder.path);
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
                    const targets = messages.filter((message) => selectedSet.has(message.id) && message.is_read !== nextRead);
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
                setSelectedMessageIds([]);
                selectionAnchorIndexRef.current = null;
            }}
            onMessageFlagToggle={(message) =>
                void (() => {
                    const nextFlag = message.is_flagged ? 0 : 1;
                    applyFlagOptimistic(message.id, nextFlag);
                    const keepSelected = selectedMessageId === message.id ? message.id : null;
                    return runServerAction(
                        () => window.electronAPI.setMessageFlagged(message.id, nextFlag),
                        selectedAccountId,
                        selectedFolderPath,
                        keepSelected,
                    );
                })()
            }
            onMessageTagChange={(message, tag) =>
                void (() => {
                    const previousTag = String((message as MessageItem & {
                        tag?: string | null
                    }).tag || '').trim().toLowerCase() || null;
                    const nextTag = String(tag || '').trim().toLowerCase() || null;
                    if (previousTag === nextTag) return;
                    applyTagOptimistic(message.id, nextTag);
                    void window.electronAPI.setMessageTag(message.id, nextTag).catch((error: any) => {
                        applyTagOptimistic(message.id, previousTag);
                        setSyncStatusText(`Tag update failed: ${error?.message || String(error)}`);
                    });
                })()
            }
            onMessageArchive={(message) =>
                void (async () => {
                    if (!selectedAccountId) return;
                    setSyncStatusText('Archiving message...');
                    try {
                        const res = await window.electronAPI.archiveMessage(message.id);
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
                            const res = await window.electronAPI.moveMessage(message.id, targetFolderPath);
                            setFolders((prev) =>
                                prev.map((f) => {
                                    if (f.id === res.sourceFolderId) {
                                        return {
                                            ...f,
                                            unread_count: res.sourceUnreadCount,
                                            total_count: res.sourceTotalCount
                                        };
                                    }
                                    if (f.id === res.targetFolderId) {
                                        return {
                                            ...f,
                                            unread_count: res.targetUnreadCount,
                                            total_count: res.targetTotalCount
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
                        void window.electronAPI.moveMessage(message.id, targetFolderPath)
                            .then((res) => {
                                setFolders((prev) =>
                                    prev.map((folder) => {
                                        if (folder.id === res.sourceFolderId) {
                                            return {
                                                ...folder,
                                                unread_count: res.sourceUnreadCount,
                                                total_count: res.sourceTotalCount
                                            };
                                        }
                                        if (folder.id === res.targetFolderId) {
                                            return {
                                                ...folder,
                                                unread_count: res.targetUnreadCount,
                                                total_count: res.targetTotalCount
                                            };
                                        }
                                        return folder;
                                    }),
                                );
                            })
                            .catch((error: any) => {
                                setSyncStatusText(`Move sync failed: ${error?.message || String(error)}`);
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
                const normalizedName = payload.customName && payload.customName.trim().length ? payload.customName.trim() : null;
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
                    const updated = await window.electronAPI.updateFolderSettings(selectedAccountId, folder.path, {
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
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Select an account to load
                                    calendar events.</p>
                            )}
                            {selectedAccountId && (
                                <>
                                    {calendarLoading && (
                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading
                                            events...</p>
                                    )}
                                    {!calendarLoading && calendarEvents.length === 0 && (
                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No events
                                            found.</p>
                                    )}
                                    {!calendarLoading && calendarEvents.length > 0 && (
                                        <div
                                            className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                            <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                                {calendarEvents.map((event) => (
                                                    <li key={event.id} className="px-4 py-3">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.summary || '(No title)'}</p>
                                                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                                            {formatSystemDateTime(event.starts_at, systemLocale)} - {formatSystemDateTime(event.ends_at, systemLocale)}
                                                        </p>
                                                        {event.location && (
                                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.location}</p>
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
                                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Select an account to load
                                    contacts.</p>
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
                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading
                                            contacts...</p>
                                    )}
                                    {!contactsLoading && contacts.length === 0 && (
                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No contacts
                                            found.</p>
                                    )}
                                    {!contactsLoading && contacts.length > 0 && (
                                        <div
                                            className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                            <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                                {contacts.map((contact) => (
                                                    <li key={contact.id} className="px-4 py-3">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{contact.full_name || '(No name)'}</p>
                                                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{contact.email}</p>
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
                            <ToolboxButton
                                label="Reply"
                                icon={<Reply size={14}/>}
                                onClick={onReply}
                                primary
                            />
                            <ToolboxButton
                                label="Reply all"
                                icon={<ReplyAll size={14}/>}
                                onClick={onReplyAll}
                            />
                            <ToolboxButton
                                label="Forward"
                                icon={<Forward size={14}/>}
                                onClick={onForward}
                            />
                            <span className="mx-1 h-6 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
                            <ToolboxButton
                                label="Open"
                                icon={<SquareArrowOutUpRight size={14}/>}
                                onClick={onOpenInNewWindow}
                            />
                            <ToolboxButton
                                label="View source"
                                icon={<FileText size={14}/>}
                                onClick={onViewSource}
                            />
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
                                                {formatMessageTagLabel((selectedMessage as MessageItem & {
                                                    tag?: string | null
                                                }).tag ?? null)}
                                            </span>
                                        )}
                                        {messageAttachments.length > 0 && (
                                            <span
                                                className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-200">
                                                <Paperclip size={11}/>
                                                {messageAttachments.length} attachment{messageAttachments.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {buildSpoofHints(selectedMessage).length > 0 && (
                                            <span
                                                className="inline-flex h-5 items-center rounded-md bg-amber-100 px-2 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        Verify sender
                      </span>
                                        )}
                                    </div>
                                    <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{selectedMessage.subject || '(No subject)'}</h2>
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
                                <div><span
                                    className="font-medium text-slate-500 dark:text-slate-400">Date:</span> {formatSystemDateTime(selectedMessage.date, systemLocale)}
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
                                    <div><span
                                        className="font-medium">From name:</span> {selectedMessage.from_name || '-'}
                                    </div>
                                    <div><span
                                        className="font-medium">From address:</span> {selectedMessage.from_address || '-'}
                                    </div>
                                    <div><span className="font-medium">To:</span> {selectedMessage.to_address || '-'}
                                    </div>
                                    <div><span
                                        className="font-medium">Date:</span> {formatSystemDateTime(selectedMessage.date, systemLocale)}
                                    </div>
                                    <div><span
                                        className="font-medium">Message-ID:</span> {selectedMessage.message_id || '-'}
                                    </div>
                                    <div><span
                                        className="font-medium">In-Reply-To:</span> {selectedMessage.in_reply_to || '-'}
                                    </div>
                                    <div><span
                                        className="font-medium">References:</span> {selectedMessage.references_text || '-'}
                                    </div>
                                    <div><span
                                        className="font-medium">Size:</span> {selectedMessage.size ? `${selectedMessage.size.toLocaleString()} bytes` : '-'}
                                    </div>
                                    {buildSpoofHints(selectedMessage).map((hint) => (
                                        <div key={hint}
                                             className="mt-1 rounded border border-amber-300/70 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300">
                                            {hint}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="min-h-0 flex flex-1 flex-col bg-white">
                            {Boolean(renderedBodyHtml && selectedMessage && appSettings.blockRemoteContent && !allowRemoteForSelectedMessage) && (
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
                                                Preview is too small ({mailBodyViewport.width}x{mailBodyViewport.height}).
                                                Message opened in a separate window.
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
                                        className={isMailBodyViewportTooSmall ? 'hidden' : 'flex h-full items-center justify-center text-slate-500 dark:text-slate-400'}>Loading
                                        message body...</div>
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
                  <pre className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
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
                                                        {typeof attachment.size === 'number' ? ` • ${formatBytes(attachment.size)}` : ''}
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
            {showSourceModal && (
                <div
                    className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/45 px-4 py-6"
                    onClick={() => setShowSourceModal(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Message source"
                        className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[#3a3d44]">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Message source</h2>
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                onClick={() => setShowSourceModal(false)}
                            >
                                Close
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3 dark:bg-[#181a1f]">
                            {sourceLoading && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">Loading message source...</p>
                            )}
                            {!sourceLoading && sourceError && (
                                <p className="text-sm text-red-700 dark:text-red-300">Failed to load
                                    source: {sourceError}</p>
                            )}
                            {!sourceLoading && !sourceError && (
                                <pre
                                    className="select-text whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-900 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100">{messageSource || '(No source available)'}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {attachmentMenu && (
                <div
                    className="fixed z-[1100] min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{
                        left: clampToViewport(attachmentMenu.x, 184, window.innerWidth),
                        top: clampToViewport(attachmentMenu.y, 108, window.innerHeight)
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

function parseRouteNumber(value?: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function formatMessageTagLabel(tag: string | null): string {
    const normalized = String(tag || '').trim().toLowerCase();
    if (!normalized) return '';
    switch (normalized) {
        case 'important':
            return 'Important';
        case 'work':
            return 'Work';
        case 'personal':
            return 'Personal';
        case 'todo':
            return 'To Do';
        case 'later':
            return 'Later';
        default:
            return normalized;
    }
}
