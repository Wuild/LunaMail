import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Forward, Paperclip, Reply, ReplyAll} from 'lucide-react';
import MainLayout from './layouts/MainLayout';
import {formatSystemDateTime} from './lib/dateTime';
import type {
    AppSettings,
    FolderItem,
    MessageBodyResult,
    MessageItem,
    PublicAccount,
    SyncStatusEvent
} from '../preload/index';

const MESSAGE_PAGE_SIZE = 100;

function App() {
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [accountFoldersById, setAccountFoldersById] = useState<Record<number, FolderItem[]>>({});
    const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [messageFetchLimit, setMessageFetchLimit] = useState<number>(MESSAGE_PAGE_SIZE);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
    const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
    const [pendingAutoReadMessageId, setPendingAutoReadMessageId] = useState<number | null>(null);
    const [selectedMessageBody, setSelectedMessageBody] = useState<MessageBodyResult | null>(null);
    const [showMessageDetails, setShowMessageDetails] = useState(false);
    const [bodyLoading, setBodyLoading] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
    const [syncingAccountIds, setSyncingAccountIds] = useState<Set<number>>(new Set());
    const [appSettings, setAppSettings] = useState<AppSettings>({
        language: 'system',
        theme: 'system',
        minimizeToTray: true,
        syncIntervalMinutes: 2,
    });
    const bodyRequestSeqRef = useRef(0);
    const activeBodyRequestIdRef = useRef<string | null>(null);
    const selectedFolderPathRef = useRef<string | null>(null);
    const selectedMessageIdRef = useRef<number | null>(null);
    const pendingDeleteMessageIdsRef = useRef<Set<number>>(new Set());
    const selectionAnchorIndexRef = useRef<number | null>(null);
    const searchQueryRef = useRef('');
    const [systemLocale, setSystemLocale] = useState<string>('en-US');

    const selectedMessage = useMemo(
        () => messages.find((m) => m.id === selectedMessageId) ?? null,
        [messages, selectedMessageId],
    );

    const renderedBodyHtml = useMemo(() => {
        if (!selectedMessageBody) return null;
        if (selectedMessageBody.html) return selectedMessageBody.html;
        return null;
    }, [selectedMessageBody]);

    const iframeSrcDoc = useMemo(() => {
        if (!selectedMessageBody) return null;
        if (!renderedBodyHtml) return null;
        const rawHtml = renderedBodyHtml;
        const hasExplicitStyles = /<style[\s>]|font-family\s*:/i.test(rawHtml);
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
    <style>
      html, body { width: 100%; margin: 0; }
      body { box-sizing: border-box; }
      ${defaultReadableCss}
    </style>
  </head>
  <body>${rawHtml}</body>
</html>`;
    }, [selectedMessageBody, renderedBodyHtml]);

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
        if (!selectedMessage) return;
        if (selectedMessage.is_read) {
            if (pendingAutoReadMessageId === selectedMessage.id) {
                setPendingAutoReadMessageId(null);
            }
            return;
        }
        if (pendingAutoReadMessageId !== selectedMessage.id) return;
        if (!selectedAccountId || !selectedFolderPath) return;
        applyReadOptimistic(selectedMessage.id, 1, selectedFolderPath);
        setPendingAutoReadMessageId(null);
        void syncReadState(selectedMessage.id, 1, selectedFolderPath);
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
        const offSettings = window.electronAPI.onAppSettingsUpdated?.((settings) => {
            setAppSettings(settings);
        });
        const offOpenMessageTarget = window.electronAPI.onOpenMessageTarget?.((target) => {
            setSelectedAccountId(target.accountId);
            setPendingAutoReadMessageId(target.messageId);
            void reloadAccountData(target.accountId, target.folderPath, target.messageId);
        });

        return () => {
            mounted = false;
            if (typeof offAdded === 'function') offAdded();
            if (typeof offUpdated === 'function') offUpdated();
            if (typeof offDeleted === 'function') offDeleted();
            if (typeof offSync === 'function') offSync();
            if (typeof offSettings === 'function') offSettings();
            if (typeof offOpenMessageTarget === 'function') offOpenMessageTarget();
        };
    }, [selectedAccountId]);

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

        void loadFoldersAndMessages(selectedAccountId);
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
            const query = searchQuery.trim();
            setLoadingMoreMessages(true);
            try {
                const rowsRaw = query
                    ? await window.electronAPI.searchMessages(selectedAccountId, query, selectedFolderPath, messageFetchLimit)
                    : await window.electronAPI.getFolderMessages(selectedAccountId, selectedFolderPath, messageFetchLimit);
                setHasMoreMessages(rowsRaw.length >= messageFetchLimit);
                setMessages(filterOutPendingDeletes(rowsRaw));
            } finally {
                setLoadingMoreMessages(false);
            }
        };
        void loadMessages();
    }, [selectedAccountId, selectedFolderPath, searchQuery, messageFetchLimit]);

    useEffect(() => {
        setMessageFetchLimit(MESSAGE_PAGE_SIZE);
        setHasMoreMessages(false);
    }, [selectedAccountId, selectedFolderPath, searchQuery]);

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
    }, [selectedMessageId]);

    useEffect(() => {
        selectedFolderPathRef.current = selectedFolderPath;
    }, [selectedFolderPath]);

    useEffect(() => {
        selectedMessageIdRef.current = selectedMessageId;
    }, [selectedMessageId]);

    useEffect(() => {
        const validIds = new Set(messages.map((m) => m.id));
        setSelectedMessageIds((prev) => prev.filter((id) => validIds.has(id)));
    }, [messages]);

    useEffect(() => {
        searchQueryRef.current = searchQuery;
    }, [searchQuery]);

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

    function filterOutPendingDeletes(rows: MessageItem[]): MessageItem[] {
        const pending = pendingDeleteMessageIdsRef.current;
        if (pending.size === 0) return rows;
        return rows.filter((m) => !pending.has(m.id));
    }

    async function loadFoldersAndMessages(accountId: number) {
        await reloadAccountData(accountId, null, null);
    }

    async function onRefresh() {
        if (!selectedAccountId) return;
        setSyncStatusText('Syncing mailbox...');
        try {
            await window.electronAPI.syncAccount(selectedAccountId);
        } catch (e: any) {
            setSyncStatusText(`Sync failed: ${e?.message || String(e)}`);
        }
    }

    async function reloadAccountData(accountId: number, preferredFolderPath: string | null, preferredMessageId: number | null) {
        const folderRows = await window.electronAPI.getFolders(accountId);
        setFolders(folderRows);
        setAccountFoldersById((prev) => ({
            ...prev,
            [accountId]: folderRows,
        }));
        const currentFolderPath = selectedFolderPathRef.current;

        const chosenFolder =
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

        const activeQuery = searchQueryRef.current.trim();
        const msgRowsRaw = activeQuery
            ? await window.electronAPI.searchMessages(accountId, activeQuery, chosenFolder, messageFetchLimit)
            : await window.electronAPI.getFolderMessages(accountId, chosenFolder, messageFetchLimit);
        const msgRows = filterOutPendingDeletes(msgRowsRaw);
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

    async function syncReadState(messageId: number, nextRead: number, folderPath: string | null) {
        setSyncStatusText('Syncing read state...');
        try {
            const res = await window.electronAPI.setMessageRead(messageId, nextRead);
            setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? {...m, is_read: res.isRead} : m)),
            );
            setFolders((prev) =>
                prev.map((f) =>
                    f.id === res.folderId
                        ? {...f, unread_count: res.unreadCount, total_count: res.totalCount}
                        : f,
                ),
            );
            setSyncStatusText('Read state synced');
        } catch (e: any) {
            applyReadOptimistic(messageId, nextRead ? 0 : 1, folderPath);
            setSyncStatusText(`Read sync failed: ${e?.message || String(e)}`);
        }
    }

    function applyReadOptimistic(messageId: number, nextRead: number, folderPath: string | null) {
        const msg = messages.find((m) => m.id === messageId);
        if (!msg || msg.is_read === nextRead) return;

        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? {...m, is_read: nextRead} : m)),
        );

        if (!folderPath) return;
        setFolders((prev) =>
            prev.map((f) => {
                if (f.path !== folderPath) return f;
                const delta = nextRead ? -1 : 1;
                return {...f, unread_count: Math.max(0, f.unread_count + delta)};
            }),
        );
    }

    function applyFlagOptimistic(messageId: number, nextFlag: number) {
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? {...m, is_flagged: nextFlag} : m)),
        );
    }

    function applyRemoveOptimistic(messageId: number, folderPath: string | null) {
        const msg = messages.find((m) => m.id === messageId);
        if (!msg) return;

        const nextMessages = messages.filter((m) => m.id !== messageId);
        setMessages(nextMessages);
        setSelectedMessageIds((prev) => prev.filter((id) => id !== messageId));
        setSelectedMessageId((prev) => (prev === messageId ? null : prev));

        if (!folderPath) return;
        setFolders((prev) =>
            prev.map((f) => {
                if (f.path !== folderPath) return f;
                return {
                    ...f,
                    total_count: Math.max(0, f.total_count - 1),
                    unread_count: msg.is_read ? f.unread_count : Math.max(0, f.unread_count - 1),
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
        const quote = buildReplyQuote(
            selectedMessage,
            selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html),
            systemLocale,
        );
        const replyTo = inferReplyAddress(selectedMessage);
        const inReplyTo = normalizeMessageId(selectedMessage.message_id);
        const references = buildReferences(selectedMessage.references_text, selectedMessage.message_id);
        composeWithDraft({
            to: replyTo,
            subject,
            body: `\n\n${quote}`,
            inReplyTo,
            references,
        });
    }

    function onReplyAll(): void {
        if (!selectedMessage) return;
        const subject = ensurePrefixedSubject(selectedMessage.subject, 'Re:');
        const quote = buildReplyQuote(
            selectedMessage,
            selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html),
            systemLocale,
        );
        const replyTo = inferReplyAddress(selectedMessage);
        const inReplyTo = normalizeMessageId(selectedMessage.message_id);
        const references = buildReferences(selectedMessage.references_text, selectedMessage.message_id);
        composeWithDraft({
            to: replyTo,
            cc: selectedMessage.to_address || '',
            subject,
            body: `\n\n${quote}`,
            inReplyTo,
            references,
        });
    }

    function onForward(): void {
        if (!selectedMessage) return;
        const subject = ensurePrefixedSubject(selectedMessage.subject, 'Fwd:');
        const originalBody = selectedMessageBody?.text ?? htmlToText(selectedMessageBody?.html);
        const metaDate = formatSystemDateTime(selectedMessage.date, systemLocale);
        const from = selectedMessage.from_name || selectedMessage.from_address || 'Unknown';
        const to = selectedMessage.to_address || '-';
        const forwarded =
            `---------- Forwarded message ----------\n` +
            `From: ${from}\n` +
            `Date: ${metaDate}\n` +
            `Subject: ${selectedMessage.subject || '(No subject)'}\n` +
            `To: ${to}\n\n` +
            `${originalBody || ''}`;

        composeWithDraft({
            to: '',
            cc: '',
            subject,
            body: forwarded,
        });
    }

    function onDeleteSelected(): void {
        if (!selectedMessage) return;
        confirmAndDeleteMessage(selectedMessage);
    }

    function confirmAndDeleteMessage(message: MessageItem): void {
        const confirmed = window.confirm(`Delete email "${message.subject || '(No subject)'}"?`);
        if (!confirmed) return;
        void deleteMessagesBatch([message]);
    }

    async function deleteMessagesBatch(targets: MessageItem[]): Promise<void> {
        if (!selectedAccountId || targets.length === 0) return;
        const ids = Array.from(new Set(targets.map((m) => m.id)));
        const deleting = targets.filter((m) => ids.includes(m.id));
        deleting.forEach((message) => {
            pendingDeleteMessageIdsRef.current.add(message.id);
            applyRemoveOptimistic(message.id, selectedFolderPath);
        });

        setSyncStatusText('Syncing changes to server...');
        let failed = 0;
        for (const message of deleting) {
            try {
                await window.electronAPI.deleteMessage(message.id);
            } catch {
                failed += 1;
            } finally {
                pendingDeleteMessageIdsRef.current.delete(message.id);
            }
        }

        await reloadAccountData(selectedAccountId, selectedFolderPath, null);
        if (failed === 0) {
            setSyncStatusText('Changes synced');
        } else {
            setSyncStatusText(`Deleted ${deleting.length - failed}/${deleting.length}. ${failed} failed.`);
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
            return;
        }

        if (toggleKey) {
            setSelectedMessageIds((prev) => {
                const exists = prev.includes(id);
                const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
                setSelectedMessageId(id);
                setPendingAutoReadMessageId(id);
                return next;
            });
            selectionAnchorIndexRef.current = index;
            return;
        }

        setSelectedMessageIds([id]);
        setSelectedMessageId(id);
        setPendingAutoReadMessageId(id);
        selectionAnchorIndexRef.current = index;
    }

    function onOpenInNewWindow(): void {
        if (!selectedMessageId) return;
        void window.electronAPI.openMessageWindow(selectedMessageId);
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (isEditableTarget(target)) return;

            const key = event.key.toLowerCase();
            if (key === 'delete' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                if (!selectedMessage) return;
                event.preventDefault();
                confirmAndDeleteMessage(selectedMessage);
                return;
            }

            const mod = event.ctrlKey || event.metaKey;
            if (!mod) return;

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
    }, [selectedAccountId, selectedMessageId, selectedFolderPath, selectedMessage, selectedMessageBody, systemLocale]);

    return (
        <MainLayout
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            accountFoldersById={accountFoldersById}
            onSelectAccount={setSelectedAccountId}
            dateLocale={systemLocale}
            folders={folders}
            selectedFolderPath={selectedFolderPath}
            onSelectFolder={(path, accountId) => {
                if (typeof accountId === 'number' && accountId !== selectedAccountId) {
                    setSelectedAccountId(accountId);
                }
                setSelectedFolderPath(path);
            }}
            messages={messages}
            selectedMessageId={selectedMessageId}
            selectedMessageIds={selectedMessageIds}
            onSelectMessage={handleSelectMessage}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onLoadMoreMessages={() => {
                if (loadingMoreMessages || !hasMoreMessages) return;
                setMessageFetchLimit((prev) => prev + MESSAGE_PAGE_SIZE);
            }}
            hasMoreMessages={hasMoreMessages}
            loadingMoreMessages={loadingMoreMessages}
            onRefresh={onRefresh}
            syncStatusText={syncStatusText}
            syncInProgress={Boolean(syncStatusText && syncStatusText.toLowerCase().startsWith('syncing'))}
            syncingAccountIds={syncingAccountIds}
            onCreateFolder={() =>
                void (async () => {
                    if (!selectedAccountId) {
                        setSyncStatusText('Select an account first');
                        return;
                    }
                    const folderPath = window.prompt('New folder name or path');
                    if (!folderPath || !folderPath.trim()) return;
                    setSyncStatusText('Creating folder...');
                    try {
                        await window.electronAPI.createFolder(selectedAccountId, folderPath.trim());
                        await reloadAccountData(selectedAccountId, folderPath.trim(), null);
                        setSelectedFolderPath(folderPath.trim());
                        setSyncStatusText(`Folder created: ${folderPath.trim()}`);
                    } catch (e: any) {
                        setSyncStatusText(`Create folder failed: ${e?.message || String(e)}`);
                    }
                })()
            }
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
                    applyReadOptimistic(message.id, nextRead, selectedFolderPath);
                    return syncReadState(message.id, nextRead, selectedFolderPath);
                })()
            }
            onBulkMarkRead={(messageIds, nextRead) =>
                void (async () => {
                    const selectedSet = new Set(messageIds);
                    const targets = messages.filter((message) => selectedSet.has(message.id) && message.is_read !== nextRead);
                    for (const message of targets) {
                        applyReadOptimistic(message.id, nextRead, selectedFolderPath);
                    }
                    for (const message of targets) {
                        await syncReadState(message.id, nextRead, selectedFolderPath);
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
                    await deleteMessagesBatch(targets);
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
            onMessageDelete={(message) => confirmAndDeleteMessage(message)}
            onFolderSync={() => void onRefresh()}
            onUpdateFolderSettings={async (folder, payload) => {
                if (!selectedAccountId) return;
                const previous = folders;
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

                try {
                    const updated = await window.electronAPI.updateFolderSettings(selectedAccountId, folder.path, {
                        customName: normalizedName,
                        color: normalizedColor,
                        type: normalizedType,
                    });
                    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
                    setSyncStatusText('Folder settings saved');
                } catch (e: any) {
                    setFolders(previous);
                    setSyncStatusText(`Folder settings failed: ${e?.message || String(e)}`);
                    throw e;
                }
            }}
        >
            <div className="h-full overflow-hidden">
                {!selectedMessage && (
                    <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
                        Select a message to preview
                    </div>
                )}
                {selectedMessage && (
                    <article className="flex h-full flex-col">
                        <div
                            className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 px-8 py-6 dark:border-[#393c41] dark:from-[#34373d] dark:via-[#34373d] dark:to-[#3a3550]">
                            <div className="flex items-start justify-between gap-5">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-3 flex items-center gap-2">
                    <span
                        className="inline-flex h-6 items-center rounded-full bg-slate-200/90 px-2.5 text-xs font-medium text-slate-700 dark:bg-[#2a2d31] dark:text-slate-200">
                      {selectedFolderPath || 'Message'}
                    </span>
                                        {buildSpoofHints(selectedMessage).length > 0 && (
                                            <span
                                                className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        Verify sender
                      </span>
                                        )}
                                    </div>
                                    <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{selectedMessage.subject || '(No subject)'}</h2>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm text-white transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                            onClick={onReply}
                                        >
                                            <Reply size={14} className="mr-2"/>
                                            Reply
                                        </button>
                                        <button
                                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:bg-[#313338] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                            onClick={onReplyAll}
                                        >
                                            <ReplyAll size={14} className="mr-2"/>
                                            Reply all
                                        </button>
                                        <button
                                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:bg-[#313338] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                            onClick={onForward}
                                        >
                                            <Forward size={14} className="mr-2"/>
                                            Forward
                                        </button>
                                        <button
                                            className="inline-flex h-9 items-center rounded-md border border-red-300 bg-white px-3 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-[#313338] dark:text-red-300 dark:hover:bg-red-900/25"
                                            onClick={onDeleteSelected}
                                        >
                                            Delete
                                        </button>
                                        <button
                                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:bg-[#313338] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                            onClick={onOpenInNewWindow}
                                        >
                                            Open in window
                                        </button>
                                    </div>
                                    {(selectedMessageBody?.attachments?.length ?? 0) > 0 && (
                                        <div className="flex max-h-24 flex-col flex-wrap gap-1 overflow-auto">
                                            {selectedMessageBody!.attachments.map((attachment, index) => (
                                                <button
                                                    key={`${attachment.filename || 'attachment'}-${index}`}
                                                    type="button"
                                                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-[#3a3d44] dark:bg-[#313338] dark:text-slate-200"
                                                    title={attachment.filename || 'Attachment'}
                                                >
                                                    <Paperclip size={12}/>
                                                    <span className="max-w-[16rem] truncate">
                            {attachment.filename || 'Attachment'}
                                                        {typeof attachment.size === 'number' ? ` (${formatBytes(attachment.size)})` : ''}
                          </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 grid gap-1.5 text-sm text-slate-700 dark:text-slate-200">
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
                                className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#3a3d44]"
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
                        <div className="min-h-0 flex-1 bg-white">
                            {bodyLoading && (
                                <div
                                    className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">Loading
                                    message body...</div>
                            )}
                            {!bodyLoading && iframeSrcDoc && (
                                <iframe
                                    title={`message-body-${selectedMessage.id}`}
                                    srcDoc={iframeSrcDoc}
                                    sandbox=""
                                    className="h-full w-full border-0 bg-white"
                                />
                            )}
                            {!bodyLoading && !iframeSrcDoc && (
                                <div className="h-full overflow-auto bg-white p-4 text-slate-900">
                  <pre className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                    {selectedMessageBody?.text || 'No body content available for this message.'}
                  </pre>
                                </div>
                            )}
                        </div>
                    </article>
                )}
            </div>
        </MainLayout>
    );
}

export default App;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensurePrefixedSubject(subject: string | null, prefix: string): string {
    const raw = (subject || '').trim();
    if (!raw) return prefix;
    const lower = raw.toLowerCase();
    if (lower.startsWith(prefix.toLowerCase())) return raw;
    return `${prefix} ${raw}`;
}

function buildReplyQuote(message: MessageItem, text: string | null, systemLocale?: string): string {
    const from = message.from_name || message.from_address || 'Unknown';
    const date = formatSystemDateTime(message.date, systemLocale);
    const body = (text || '')
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n');
    return `On ${date}, ${from} wrote:\n${body}`;
}

function htmlToText(html: string | null | undefined): string {
    if (!html) return '';
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\r\n/g, '\n');
}

function inferReplyAddress(message: MessageItem): string {
    if (message.from_address?.trim()) return message.from_address.trim();
    const raw = message.from_name || '';
    const match = raw.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
    return '';
}

function normalizeMessageId(value: string | null | undefined): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('<') && raw.endsWith('>')) return raw;
    return `<${raw.replace(/^<|>$/g, '')}>`;
}

function buildReferences(existing: string | null | undefined, messageId: string | null | undefined): string[] {
    const refs: string[] = [];
    if (existing) {
        const existingMatches = existing.match(/<[^>]+>/g);
        if (existingMatches?.length) {
            refs.push(...existingMatches);
        } else {
            existing
                .split(/\s+/g)
                .map((v) => normalizeMessageId(v))
                .filter((v): v is string => Boolean(v))
                .forEach((v) => refs.push(v));
        }
    }
    const current = normalizeMessageId(messageId);
    if (current) refs.push(current);
    return Array.from(new Set(refs));
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function isProtectedFolder(folder: FolderItem): boolean {
    const type = (folder.type || '').toLowerCase();
    const path = folder.path.toLowerCase();
    if (type === 'inbox' || path === 'inbox') return true;
    if (type === 'sent' || path.includes('sent')) return true;
    if (type === 'drafts' || path.includes('draft')) return true;
    if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return true;
    if (type === 'junk' || path.includes('spam') || path.includes('junk')) return true;
    if (type === 'archive' || path.includes('archive')) return true;
    return false;
}

function formatFromDisplay(message: MessageItem): string {
    const name = (message.from_name || '').trim();
    const address = (message.from_address || '').trim();
    if (name && address) return `${name} <${address}>`;
    if (address) return address;
    if (name) return name;
    return 'Unknown';
}

function buildSpoofHints(message: MessageItem): string[] {
    const hints: string[] = [];
    const fromAddress = (message.from_address || '').trim().toLowerCase();
    const embeddedFrom = extractEmailFromText(message.from_name || '');
    if (embeddedFrom && fromAddress && embeddedFrom.toLowerCase() !== fromAddress) {
        hints.push(`Display name contains a different email (${embeddedFrom}) than the actual sender (${fromAddress}).`);
    }

    const fromDomain = extractDomain(fromAddress);
    const messageIdDomain = extractDomainFromMessageId(message.message_id || '');
    if (
        fromDomain &&
        messageIdDomain &&
        toBaseDomain(fromDomain) !== toBaseDomain(messageIdDomain)
    ) {
        hints.push(`Message-ID domain (${messageIdDomain}) differs from sender domain (${fromDomain}).`);
    }
    return hints;
}

function extractEmailFromText(value: string): string | null {
    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? null;
}

function extractDomain(address: string): string | null {
    const email = (address || '').trim();
    const idx = email.lastIndexOf('@');
    if (idx <= 0 || idx >= email.length - 1) return null;
    return email.slice(idx + 1).toLowerCase();
}

function extractDomainFromMessageId(messageId: string): string | null {
    const normalized = normalizeMessageId(messageId);
    if (!normalized) return null;
    const inner = normalized.replace(/^<|>$/g, '');
    const idx = inner.lastIndexOf('@');
    if (idx <= 0 || idx >= inner.length - 1) return null;
    return inner.slice(idx + 1).toLowerCase();
}

function toBaseDomain(domain: string): string {
    const value = (domain || '').toLowerCase().trim().replace(/\.+$/, '');
    if (!value) return '';
    const parts = value.split('.').filter(Boolean);
    if (parts.length <= 2) return value;
    return parts.slice(-2).join('.');
}

function senderInitials(message: MessageItem): string {
    const raw = (message.from_name || message.from_address || '?').trim();
    if (!raw) return '?';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function isEditableTarget(target: HTMLElement | null): boolean {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.closest('[contenteditable="true"]')) return true;
    if (target.closest('input,textarea,select')) return true;
    return false;
}
