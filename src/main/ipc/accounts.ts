import {BrowserWindow, ipcMain} from 'electron';
import {ImapFlow} from 'imapflow';
import {
    addAccount,
    type AddAccountPayload,
    deleteAccount,
    getAccounts,
    getAccountSyncCredentials,
    updateAccount,
    type UpdateAccountPayload
} from '../db/repositories/accountsRepo.js';
import {
    deleteFolderByPath,
    deleteMessageLocally,
    getMessageById,
    getTotalUnreadCount,
    listFoldersByAccount,
    listMessagesByFolder,
    searchMessages,
    updateFolderSettings
} from '../db/repositories/mailRepo.js';
import {autodiscover, autodiscoverBasic} from '../mail/autodiscover.js';
import {
    createServerFolder,
    deleteServerFolder,
    deleteServerMessage,
    moveServerMessage,
    setServerMessageFlagged,
    setServerMessageRead
} from '../mail/actions.js';
import {saveDraftEmail, type SaveDraftPayload, sendEmail, type SendEmailPayload} from '../mail/send.js';
import {syncAccountMailbox, syncMessageBody, type SyncSummary} from '../mail/sync.js';
import {verifyConnection, type VerifyPayload} from '../mail/verify.js';

const bodyRequests = new Map<string, { cancel: () => void }>();
const SYNC_DEBOUNCE_MS = 350;
let autoSyncIntervalMs = 2 * 60 * 1000;
let autoSyncTimer: NodeJS.Timeout | null = null;
let autoSyncRunning = false;
let unreadCountListener: ((count: number) => void) | null = null;
let newMailListener:
    | ((event: {
    accountId: number;
    newMessages: number;
    source: string;
    target: { accountId: number; folderPath: string; messageId: number } | null;
}) => void)
    | null = null;

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

type AccountSyncState = {
    inFlight: boolean;
    queued: boolean;
    latestSource: string;
    timer: NodeJS.Timeout | null;
    runner: Promise<void> | null;
    cancelCurrent: (() => void) | null;
    pending: Deferred<SyncSummary> | null;
};

const accountSyncState = new Map<number, AccountSyncState>();
const blockedSyncAccounts = new Map<number, string>();

type IdleWatcherState = {
    accountId: number;
    stopped: boolean;
    folders: Map<string, FolderIdleState>;
};

type FolderIdleState = {
    mailboxPath: string;
    connecting: boolean;
    reconnectTimer: NodeJS.Timeout | null;
    reconnectAttempt: number;
    client: ImapFlow | null;
};

const IDLE_RECONNECT_MAX_MS = 60000;

const idleWatchers = new Map<number, IdleWatcherState>();

export function registerAccountIpc(): void {
    // Get all accounts (without passwords)
    ipcMain.handle('get-accounts', async () => {
        return await getAccounts();
    });

    // Add account: persist metadata in DB, secret in keytar (via repo)
    ipcMain.handle('add-account', async (_event, account: AddAccountPayload) => {
        const created = await addAccount(account);
        blockedSyncAccounts.delete(created.id);
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('account-added', created);
        }
        void runSyncAndBroadcast(created.id, 'new-account');
        void ensureIdleWatcher(created.id);
        return created;
    });

    ipcMain.handle('update-account', async (_event, accountId: number, payload: UpdateAccountPayload) => {
        const updated = await updateAccount(accountId, payload);
        blockedSyncAccounts.delete(accountId);
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('account-updated', updated);
        }
        restartIdleWatcher(accountId);
        return updated;
    });

    ipcMain.handle('delete-account', async (_event, accountId: number) => {
        const deleted = await deleteAccount(accountId);
        blockedSyncAccounts.delete(accountId);
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('account-deleted', deleted);
        }
        stopIdleWatcher(accountId);
        notifyUnreadCountChanged();
        return deleted;
    });

    // Autodiscover settings for an email
    ipcMain.handle('discover-mail-settings', async (_event, email: string) => {
        try {
            return await autodiscover(email);
        } catch (error) {
            console.error('discover-mail-settings failed, using basic fallback:', error);
            return await autodiscoverBasic(email);
        }
    });

    // Verify connection/auth for imap/pop3/smtp
    ipcMain.handle('verify-credentials', async (_event, payload: VerifyPayload) => {
        return await verifyConnection(payload);
    });

    ipcMain.handle('send-email', async (_event, payload: SendEmailPayload) => {
        const result = await sendEmail(payload);
        void runSyncAndBroadcast(payload.accountId, 'send');
        return result;
    });

    ipcMain.handle('save-draft', async (_event, payload: SaveDraftPayload) => {
        return await saveDraftEmail(payload);
    });

    ipcMain.handle('sync-account', async (_event, accountId: number) => {
        return await runSyncAndBroadcast(accountId, 'manual');
    });

    ipcMain.handle('get-folders', async (_event, accountId: number) => {
        return listFoldersByAccount(accountId);
    });

    ipcMain.handle('create-folder', async (_event, accountId: number, folderPath: string) => {
        const created = await createServerFolder(accountId, folderPath);
        await runSyncAndBroadcast(accountId, 'create-folder');
        return created;
    });

    ipcMain.handle('delete-folder', async (_event, accountId: number, folderPath: string) => {
        const deleted = await deleteServerFolder(accountId, folderPath);
        const local = deleteFolderByPath(accountId, folderPath);
        await runSyncAndBroadcast(accountId, 'delete-folder');
        return {...deleted, removed: local.removed};
    });

    ipcMain.handle(
        'update-folder-settings',
        async (_event, accountId: number, folderPath: string, payload: {
            customName?: string | null;
            color?: string | null;
            type?: string | null
        }) => {
            return updateFolderSettings({
                accountId,
                folderPath,
                customName: payload?.customName ?? null,
                color: payload?.color ?? null,
                type: payload?.type ?? null,
            });
        },
    );

    ipcMain.handle('get-folder-messages', async (_event, accountId: number, folderPath: string, limit?: number) => {
        return listMessagesByFolder(accountId, folderPath, limit ?? 100);
    });

    ipcMain.handle('get-message', async (_event, messageId: number) => {
        return getMessageById(messageId);
    });

    ipcMain.handle(
        'search-messages',
        async (_event, accountId: number, query: string, folderPath?: string | null, limit?: number) => {
            return searchMessages(accountId, query, folderPath ?? null, limit ?? 200);
        },
    );

    ipcMain.handle('get-message-body', async (event, messageId: number, requestId?: string) => {
        const key = `${event.sender.id}:${requestId ?? `msg-${messageId}`}`;
        let cancelled = false;
        let clientRef: any = null;
        bodyRequests.set(key, {
            cancel: () => {
                cancelled = true;
                try {
                    clientRef?.close?.();
                } catch {
                    // ignore
                }
                try {
                    clientRef?.logout?.();
                } catch {
                    // ignore
                }
            },
        });

        try {
            return await syncMessageBody(messageId, {
                isCancelled: () => cancelled,
                onClient: (client) => {
                    clientRef = client;
                },
            });
        } finally {
            bodyRequests.delete(key);
        }
    });

    ipcMain.handle('cancel-message-body', async (event, requestId: string) => {
        const key = `${event.sender.id}:${requestId}`;
        const req = bodyRequests.get(key);
        if (req) {
            req.cancel();
            bodyRequests.delete(key);
        }
        return {ok: true as const};
    });

    ipcMain.handle('set-message-read', async (_event, messageId: number, isRead: number) => {
        const result = await setServerMessageRead(messageId, isRead);
        notifyUnreadCountChanged();
        return result;
    });

    ipcMain.handle('set-message-flagged', async (_event, messageId: number, isFlagged: number) => {
        const {accountId} = await setServerMessageFlagged(messageId, isFlagged);
        return await runSyncAndBroadcast(accountId, 'flag-change');
    });

    ipcMain.handle('move-message', async (_event, messageId: number, targetFolderPath: string) => {
        return await moveServerMessage(messageId, targetFolderPath);
    });

    ipcMain.handle('delete-message', async (_event, messageId: number) => {
        await deleteServerMessage(messageId);
        const {accountId} = deleteMessageLocally(messageId);
        notifyUnreadCountChanged();
        return await runSyncAndBroadcast(accountId, 'delete');
    });
}

export function startAccountAutoSync(): void {
    if (autoSyncTimer) return;
    void runAutoSyncCycle('startup');
    void ensureIdleWatchersForAllAccounts();
    autoSyncTimer = setInterval(() => {
        void runAutoSyncCycle('interval');
    }, autoSyncIntervalMs);
}

export function stopAccountAutoSync(): void {
    if (!autoSyncTimer) return;
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    stopAllIdleWatchers();
}

export function setAutoSyncIntervalMinutes(minutes: number): void {
    const normalized = Math.min(120, Math.max(1, Math.round(Number(minutes) || 2)));
    autoSyncIntervalMs = normalized * 60 * 1000;
    if (!autoSyncTimer) return;
    clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(() => {
        void runAutoSyncCycle('interval');
    }, autoSyncIntervalMs);
}

export function setUnreadCountListener(listener: ((count: number) => void) | null): void {
    unreadCountListener = listener;
}

export function setNewMailListener(
    listener:
        | ((event: {
        accountId: number;
        newMessages: number;
        source: string;
        target: { accountId: number; folderPath: string; messageId: number } | null;
    }) => void)
        | null,
): void {
    newMailListener = listener;
}

export function getCurrentUnreadCount(): number {
    return getTotalUnreadCount();
}

async function runAutoSyncCycle(source: 'startup' | 'interval'): Promise<void> {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
        const accounts = await getAccounts();
        void ensureIdleWatchersForAccounts(accounts.map((account) => account.id));
        for (const account of accounts) {
            if (blockedSyncAccounts.has(account.id)) continue;
            try {
                await runSyncAndBroadcast(account.id, source);
            } catch (error) {
                console.error(`Autosync failed for account ${account.email}:`, error);
            }
        }
    } finally {
        autoSyncRunning = false;
    }
}

async function runSyncAndBroadcast(accountId: number, source: string): Promise<SyncSummary> {
    const blockedReason = blockedSyncAccounts.get(accountId);
    if (blockedReason) {
        const error = `Sync paused for this account: ${blockedReason}. Update account settings or restart app.`;
        broadcastSync({accountId, status: 'error', error, source});
        throw new Error(error);
    }

    const state = getAccountSyncState(accountId);
    state.latestSource = source;
    if (!state.pending) {
        state.pending = createDeferred<SyncSummary>();
    }

    if (state.inFlight) {
        state.queued = true;
        state.cancelCurrent?.();
        return state.pending.promise;
    }

    if (state.timer) {
        clearTimeout(state.timer);
    }

    state.timer = setTimeout(() => {
        state.timer = null;
        if (state.runner) return;
        state.runner = runSyncLoop(accountId, state).finally(() => {
            state.runner = null;
        });
    }, SYNC_DEBOUNCE_MS);

    return state.pending.promise;
}

async function runSyncLoop(accountId: number, state: AccountSyncState): Promise<void> {
    for (; ;) {
        state.inFlight = true;
        state.queued = false;
        const source = state.latestSource;
        let cancelled = false;
        let clientRef: any = null;

        state.cancelCurrent = () => {
            cancelled = true;
            try {
                clientRef?.close?.();
            } catch {
                // ignore close errors
            }
            try {
                clientRef?.logout?.();
            } catch {
                // ignore logout errors
            }
        };

        broadcastSync({accountId, status: 'syncing', source});

        try {
            const summary = await syncAccountMailbox(accountId, {
                isCancelled: () => cancelled,
                onClient: (client) => {
                    clientRef = client;
                },
            });
            if (cancelled && state.queued) continue;

            notifyUnreadCountChanged();
            if (summary.newMessages > 0 && newMailListener) {
                newMailListener({
                    accountId,
                    newMessages: summary.newMessages,
                    source,
                    target: summary.newestMessageTarget,
                });
            }
            broadcastSync({accountId, status: 'done', summary, source});
            state.pending?.resolve(summary);
            state.pending = null;
            return;
        } catch (error: any) {
            const message = error?.message || String(error);
            const isCancelled = cancelled || /cancel/i.test(message);
            if (isCancelled && state.queued) {
                continue;
            }
            if (!isCancelled) {
                if (isCredentialFailure(message)) {
                    blockedSyncAccounts.set(accountId, message);
                    stopIdleWatcher(accountId);
                    broadcastSync({
                        accountId,
                        status: 'error',
                        error: `Sync paused: ${message}. Password or authentication may have changed. Update account settings or restart app.`,
                        source,
                    });
                } else {
                    broadcastSync({accountId, status: 'error', error: message, source});
                }
            }
            state.pending?.reject(error);
            state.pending = null;
            return;
        } finally {
            state.inFlight = false;
            state.cancelCurrent = null;
        }
    }
}

function getAccountSyncState(accountId: number): AccountSyncState {
    const existing = accountSyncState.get(accountId);
    if (existing) return existing;
    const created: AccountSyncState = {
        inFlight: false,
        queued: false,
        latestSource: 'manual',
        timer: null,
        runner: null,
        cancelCurrent: null,
        pending: null,
    };
    accountSyncState.set(accountId, created);
    return created;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function broadcastSync(payload: any) {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('account-sync-status', payload);
    }
}

function notifyUnreadCountChanged(): void {
    if (!unreadCountListener) return;
    unreadCountListener(getTotalUnreadCount());
}

function restartIdleWatcher(accountId: number): void {
    stopIdleWatcher(accountId);
    ensureIdleWatcher(accountId);
}

function stopAllIdleWatchers(): void {
    for (const accountId of Array.from(idleWatchers.keys())) {
        stopIdleWatcher(accountId);
    }
}

async function ensureIdleWatchersForAllAccounts(): Promise<void> {
    const accounts = await getAccounts();
    ensureIdleWatchersForAccounts(accounts.map((account) => account.id));
}

function ensureIdleWatchersForAccounts(accountIds: number[]): void {
    const keep = new Set(accountIds);
    for (const accountId of keep) {
        ensureIdleWatcher(accountId);
    }
    for (const [accountId] of idleWatchers) {
        if (!keep.has(accountId)) {
            stopIdleWatcher(accountId);
        }
    }
}

function ensureIdleWatcher(accountId: number): void {
    const existing = idleWatchers.get(accountId);
    if (existing && !existing.stopped) return;

    const state: IdleWatcherState = {
        accountId,
        stopped: false,
        folders: new Map<string, FolderIdleState>(),
    };
    idleWatchers.set(accountId, state);
    void connectIdleWatcher(state);
}

async function connectIdleWatcher(state: IdleWatcherState): Promise<void> {
    if (state.stopped) return;
    try {
        const account = await getAccountSyncCredentials(state.accountId);
        if (state.stopped) return;

        const probeClient = new ImapFlow({
            host: account.imap_host,
            port: account.imap_port,
            secure: !!account.imap_secure,
            auth: {user: account.user, pass: account.password},
            logger: false,
        });
        let mailboxes: any[] = [];
        try {
            await probeClient.connect();
            mailboxes = await probeClient.list();
        } finally {
            try {
                await probeClient.logout();
            } catch {
                // ignore close errors
            }
        }
        if (state.stopped) return;

        const inboxPath = resolveInboxPath(mailboxes);
        const mailboxPaths = inboxPath ? [inboxPath] : ['INBOX'];
        const keep = new Set(mailboxPaths);

        for (const mailboxPath of mailboxPaths) {
            let folder = state.folders.get(mailboxPath);
            if (!folder) {
                folder = {
                    mailboxPath,
                    connecting: false,
                    reconnectTimer: null,
                    reconnectAttempt: 0,
                    client: null,
                };
                state.folders.set(mailboxPath, folder);
            }
            void connectFolderIdleWatcher(state, folder);
        }

        for (const [mailboxPath] of state.folders) {
            if (!keep.has(mailboxPath)) {
                stopFolderIdleWatcher(state, mailboxPath);
            }
        }
    } catch (error: any) {
        if (!state.stopped) {
            const message = error?.message || String(error);
            console.error(`IMAP IDLE connect failed for account ${state.accountId}:`, message);
            for (const folder of state.folders.values()) {
                scheduleFolderIdleReconnect(state, folder);
            }
            if (state.folders.size === 0) {
                const fallbackFolder: FolderIdleState = {
                    mailboxPath: 'INBOX',
                    connecting: false,
                    reconnectTimer: null,
                    reconnectAttempt: 0,
                    client: null,
                };
                state.folders.set(fallbackFolder.mailboxPath, fallbackFolder);
                scheduleFolderIdleReconnect(state, fallbackFolder);
            }
        }
    }
}

async function connectFolderIdleWatcher(state: IdleWatcherState, folder: FolderIdleState): Promise<void> {
    if (state.stopped || folder.connecting || folder.client) return;
    folder.connecting = true;
    try {
        const account = await getAccountSyncCredentials(state.accountId);
        if (state.stopped) return;
        const client = new ImapFlow({
            host: account.imap_host,
            port: account.imap_port,
            secure: !!account.imap_secure,
            auth: {user: account.user, pass: account.password},
            logger: false,
        });

        client.on('exists', () => {
            if (state.stopped) return;
            void runSyncAndBroadcast(state.accountId, 'push');
        });

        client.on('close', () => {
            if (state.stopped) return;
            scheduleFolderIdleReconnect(state, folder);
        });

        client.on('error', (error: any) => {
            if (state.stopped) return;
            const message = error?.message || String(error);
            console.error(`IMAP IDLE watcher error for account ${state.accountId} folder ${folder.mailboxPath}:`, message);
            scheduleFolderIdleReconnect(state, folder);
        });

        await client.connect();
        await client.mailboxOpen(folder.mailboxPath, {readOnly: true});
        folder.client = client;
        folder.reconnectAttempt = 0;
    } catch (error: any) {
        if (!state.stopped) {
            const message = error?.message || String(error);
            console.error(`IMAP IDLE connect failed for account ${state.accountId} folder ${folder.mailboxPath}:`, message);
            scheduleFolderIdleReconnect(state, folder);
        }
    } finally {
        folder.connecting = false;
    }
}

function scheduleFolderIdleReconnect(state: IdleWatcherState, folder: FolderIdleState): void {
    if (state.stopped) return;
    if (folder.reconnectTimer) return;
    if (folder.client) {
        try {
            folder.client.close();
        } catch {
            // ignore
        }
        try {
            void folder.client.logout();
        } catch {
            // ignore
        }
        folder.client = null;
    }
    const delayMs = Math.min(IDLE_RECONNECT_MAX_MS, 2000 * Math.max(1, 2 ** folder.reconnectAttempt));
    folder.reconnectTimer = setTimeout(() => {
        folder.reconnectTimer = null;
        folder.reconnectAttempt += 1;
        void connectFolderIdleWatcher(state, folder);
    }, delayMs);
}

function stopFolderIdleWatcher(state: IdleWatcherState, mailboxPath: string): void {
    const folder = state.folders.get(mailboxPath);
    if (!folder) return;
    if (folder.reconnectTimer) {
        clearTimeout(folder.reconnectTimer);
        folder.reconnectTimer = null;
    }
    if (folder.client) {
        try {
            folder.client.close();
        } catch {
            // ignore
        }
        try {
            void folder.client.logout();
        } catch {
            // ignore
        }
        folder.client = null;
    }
    state.folders.delete(mailboxPath);
}

function stopIdleWatcher(accountId: number): void {
    const state = idleWatchers.get(accountId);
    if (!state) return;
    state.stopped = true;
    for (const mailboxPath of Array.from(state.folders.keys())) {
        stopFolderIdleWatcher(state, mailboxPath);
    }
    idleWatchers.delete(accountId);
}

function resolveInboxPath(mailboxes: any[]): string | null {
    if (!Array.isArray(mailboxes) || mailboxes.length === 0) return null;
    const selectable = mailboxes.filter((box) => {
        const flags = box?.flags;
        if (flags && typeof flags?.has === 'function' && flags.has('\\Noselect')) return false;
        return Boolean(box?.path);
    });
    const bySpecialUse = selectable.find((box) => String(box?.specialUse || '').toLowerCase() === '\\inbox');
    if (bySpecialUse?.path) return String(bySpecialUse.path);
    const byPath = selectable.find((box) => String(box?.path || '').toLowerCase() === 'inbox');
    if (byPath?.path) return String(byPath.path);
    const byName = selectable.find((box) => String(box?.name || '').toLowerCase() === 'inbox');
    if (byName?.path) return String(byName.path);
    return null;
}

function isCredentialFailure(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('authentication failed') ||
        text.includes('auth failed') ||
        text.includes('invalid credentials') ||
        text.includes('login failed') ||
        text.includes('password') ||
        text.includes('oauth') ||
        text.includes('not authenticated') ||
        text.includes('invalid user') ||
        text.includes('application-specific password') ||
        /\bauth\b/.test(text)
    );
}
