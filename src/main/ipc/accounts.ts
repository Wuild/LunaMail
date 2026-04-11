import {Worker} from 'node:worker_threads';
import {ImapFlow} from 'imapflow';
import {createAppLogger, createMailDebugLogger} from '@main/debug/debugLog.js';
import {
    addAccount,
    deleteAccount,
    getAccounts,
    getAccountSyncCredentials,
    updateAccount,
} from '@main/db/repositories/accountsRepo.js';
import {
    deleteFolderByPath,
    deleteMessageLocally,
    getMessageById,
    getMessageContext,
    listFoldersByAccount,
    listMessagesByFolder,
    listRecentRecipients,
    listThreadMessagesByFolder,
    reorderCustomFolders,
    searchMessages,
    setMessageTag,
    updateFolderSettings,
} from '@main/db/repositories/mailRepo.js';
import {autodiscover, autodiscoverBasic} from '@main/mail/autodiscover.js';
import {
    deleteMailFilter,
    listMailFilters,
    runMailFiltersForMessages,
    upsertMailFilter,
} from '@main/mail/filterRules.js';
import {resolveImapSecurity} from '@main/mail/security.js';
import {
    createServerFolder,
    deleteServerFolder,
    deleteServerMessageByContext,
    moveServerMessage,
    setServerMessageFlagged,
    setServerMessageRead,
} from '@main/mail/actions.js';
import {saveDraftEmail, sendEmail} from '@main/mail/send.js';
import {downloadMessageAttachment, syncMessageBody, syncMessageSource, type SyncSummary} from '@main/mail/sync.js';
import {getDb, getSqlitePath} from '@main/db/drizzle.js';
import {verifyConnection} from '@main/mail/verify.js';
import {
    addAddressBook,
    addCalendarEvent,
    addContact,
    type DavSyncSummary,
    discoverDav,
    discoverDavPreview,
    editCalendarEvent,
    editContact,
    getAddressBooks,
    getCalendarEvents,
    getContacts,
    removeAddressBook,
    removeCalendarEvent,
    removeContact,
    syncDav,
} from '@main/dav/sync.js';
import {registerAccountCoreIpc} from './registerAccountCoreIpc.js';
import {registerComposeIpc} from './registerComposeIpc.js';
import {registerDavIpc} from './registerDavIpc.js';
import {registerMailIpc} from './registerMailIpc.js';
import {normalizeSyncIntervalMinutes} from '@/shared/settingsRules.js';
import {getAppSettingsSync} from '@main/settings/store.js';
import {
    broadcastAccountSyncStatus,
    broadcastMessageReadUpdated as broadcastMessageReadUpdatedEvent,
    broadcastToAllWindows,
    broadcastUnreadCountUpdated,
} from './broadcast.js';
import {isDemoProvider} from '@main/demo/demoMode.js';

const bodyRequests = new Map<string, { cancel: () => void }>();
const SYNC_DEBOUNCE_MS = 350;
let autoSyncIntervalMs = 2 * 60 * 1000;
let autoSyncTimer: NodeJS.Timeout | null = null;
let autoSyncRunning = false;
let unreadCountListener: ((count: number) => void) | null = null;
let accountCountChangedListener: ((count: number) => void) | null = null;
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
    pending: Deferred<AccountSyncSummary> | null;
};

export type AccountSyncSummary = SyncSummary & {
    dav?: DavSyncSummary;
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
const appLogger = createAppLogger('ipc:accounts');

const idleWatchers = new Map<number, IdleWatcherState>();

function isDemoModeEnabled(): boolean {
    return Boolean(getAppSettingsSync().developerDemoMode);
}

function filterAccountsForCurrentMode<T extends { provider: string | null | undefined }>(accounts: T[]): T[] {
    if (!isDemoModeEnabled()) return accounts;
    return accounts.filter((account) => isDemoProvider(account.provider));
}

function getVisibleUnreadCount(accounts: Array<{ id: number; provider: string | null | undefined }>): number {
    const visibleAccounts = filterAccountsForCurrentMode(accounts);
    return visibleAccounts.reduce((sum, account) => {
        const folders = listFoldersByAccount(account.id);
        const accountUnread = folders.reduce((acc, folder) => acc + Math.max(0, Number(folder.unread_count) || 0), 0);
        return sum + accountUnread;
    }, 0);
}

function escapeCsvValue(value: string): string {
    if (!/[",\n\r]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(
    contacts: Array<{
        full_name: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
    }>,
): string {
    const lines = ['full_name,email,phone,organization,title,note'];
    for (const contact of contacts) {
        lines.push(
            [
                escapeCsvValue(contact.full_name ?? ''),
                escapeCsvValue(contact.email ?? ''),
                escapeCsvValue(contact.phone ?? ''),
                escapeCsvValue(contact.organization ?? ''),
                escapeCsvValue(contact.title ?? ''),
                escapeCsvValue(contact.note ?? ''),
            ].join(','),
        );
    }
    return `${lines.join('\n')}\n`;
}

function escapeVCardValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function toVcf(
    contacts: Array<{
        full_name: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
    }>,
): string {
    return (
        contacts
            .map((contact) => {
                const fullName = (contact.full_name || contact.email || '').trim();
                const safeName = escapeVCardValue(fullName);
                const safeEmail = escapeVCardValue((contact.email || '').trim());
                const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${safeName}`, `EMAIL;TYPE=INTERNET:${safeEmail}`];
                if (contact.phone?.trim()) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(contact.phone.trim())}`);
                if (contact.organization?.trim()) lines.push(`ORG:${escapeVCardValue(contact.organization.trim())}`);
                if (contact.title?.trim()) lines.push(`TITLE:${escapeVCardValue(contact.title.trim())}`);
                if (contact.note?.trim()) lines.push(`NOTE:${escapeVCardValue(contact.note.trim())}`);
                lines.push('END:VCARD');
                return lines.join('\n');
            })
            .join('\n') + '\n'
    );
}

export function registerAccountIpc(): void {
    registerAccountCoreIpc({
        appLogger,
        getAccounts: async () => filterAccountsForCurrentMode(await getAccounts()),
        getTotalUnreadCount: () => getVisibleUnreadCount(getAccountsSyncSnapshot()),
        addAccount,
        updateAccount,
        deleteAccount,
        blockedSyncAccounts,
        broadcastAccountAdded: (payload) => broadcastToAllWindows('account-added', payload),
        broadcastAccountUpdated: (payload) => broadcastToAllWindows('account-updated', payload),
        broadcastAccountDeleted: (payload) => broadcastToAllWindows('account-deleted', payload),
        notifyAccountCountChanged,
        notifyUnreadCountChanged,
        runSyncAndBroadcast,
        ensureIdleWatcher,
        restartIdleWatcher,
        stopIdleWatcher,
        autodiscover,
        autodiscoverBasic,
        verifyConnection,
    });

    registerComposeIpc({
        appLogger,
        sendEmail,
        saveDraftEmail,
        runSyncAndBroadcast,
        broadcastAccountSyncStatus,
        broadcastSendEmailBackgroundStatus: (payload) => broadcastToAllWindows('send-email-background-status', payload),
    });

    registerMailIpc({
        appLogger,
        runSyncAndBroadcast,
        listFoldersByAccount,
        listMessagesByFolder,
        listThreadMessagesByFolder,
        createServerFolder,
        deleteServerFolder,
        deleteFolderByPath,
        updateFolderSettings,
        reorderCustomFolders,
        listMailFilters,
        upsertMailFilter,
        deleteMailFilter,
        runMailFiltersForMessages,
        getMessageById,
        searchMessages,
        syncMessageBody,
        syncMessageSource,
        bodyRequests,
        downloadMessageAttachment,
        sanitizeAttachmentFilename,
        setServerMessageRead,
        notifyUnreadCountChanged,
        broadcastMessageReadUpdated,
        setServerMessageFlagged,
        setMessageTag,
        moveServerMessage,
        getMessageContext,
        resolveArchiveFolderPath,
        deleteMessageLocally,
        deleteServerMessageByContext,
    });

    registerDavIpc({
        discoverDav,
        discoverDavPreview,
        syncDav,
        getContacts,
        listRecentRecipients,
        getAddressBooks,
        addAddressBook,
        addContact,
        editContact,
        removeAddressBook,
        removeContact,
        toVcf,
        toCsv,
        getCalendarEvents,
        addCalendarEvent,
        editCalendarEvent,
        removeCalendarEvent,
    });
}

function getAccountsSyncSnapshot(): Array<{ id: number; provider: string | null | undefined }> {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT id, provider FROM accounts ORDER BY created_at ASC').all() as Array<{
            id: number;
            provider: string | null | undefined;
        }>;
        return rows;
    } catch {
        return [];
    }
}

export function startAccountAutoSync(): void {
    if (autoSyncTimer) return;
    appLogger.info('Starting account auto sync intervalMs=%d', autoSyncIntervalMs);
    void runAutoSyncCycle('startup');
    void ensureIdleWatchersForAllAccounts();
    autoSyncTimer = setInterval(() => {
        void runAutoSyncCycle('interval');
    }, autoSyncIntervalMs);
}

function resolveArchiveFolderPath(accountId: number, currentFolderPath: string | null): string | null {
    const folders = listFoldersByAccount(accountId);
    if (folders.length === 0) return null;
    const current = String(currentFolderPath || '').toLowerCase();
    const byType = folders.find((folder) => (folder.type || '').toLowerCase() === 'archive');
    if (byType?.path && byType.path.toLowerCase() !== current) return byType.path;

    const byPath = folders.find((folder) => /archive|all mail/.test(folder.path.toLowerCase()));
    if (byPath?.path && byPath.path.toLowerCase() !== current) return byPath.path;

    return null;
}

export function stopAccountAutoSync(): void {
    if (!autoSyncTimer) return;
    appLogger.info('Stopping account auto sync');
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    stopAllIdleWatchers();
}

export function setAutoSyncIntervalMinutes(minutes: number): void {
    const normalized = normalizeSyncIntervalMinutes(minutes);
    autoSyncIntervalMs = normalized * 60 * 1000;
    appLogger.info('Set auto sync interval minutes=%d', normalized);
    if (!autoSyncTimer) return;
    clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(() => {
        void runAutoSyncCycle('interval');
    }, autoSyncIntervalMs);
}

export function setUnreadCountListener(listener: ((count: number) => void) | null): void {
    unreadCountListener = listener;
}

export function setAccountCountChangedListener(listener: ((count: number) => void) | null): void {
    accountCountChangedListener = listener;
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
    return getVisibleUnreadCount(getAccountsSyncSnapshot());
}

async function runAutoSyncCycle(source: 'startup' | 'interval'): Promise<void> {
    if (autoSyncRunning) return;
    appLogger.debug('runAutoSyncCycle source=%s', source);
    autoSyncRunning = true;
    try {
        const accounts = await getAccounts();
        const syncableAccounts = accounts.filter(
            (account) => !isDemoProvider(account.provider) && !isDemoModeEnabled(),
        );
        void ensureIdleWatchersForAccounts(syncableAccounts.map((account) => account.id));
        for (const account of accounts) {
            if (isDemoModeEnabled()) continue;
            if (isDemoProvider(account.provider)) continue;
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

async function runSyncAndBroadcast(accountId: number, source: string): Promise<AccountSyncSummary> {
    appLogger.debug('runSyncAndBroadcast accountId=%d source=%s', accountId, source);
    const account = (await getAccounts()).find((item) => item.id === accountId) ?? null;
    if (account && isDemoModeEnabled() && !isDemoProvider(account.provider)) {
        const summary: AccountSyncSummary = {
            accountId,
            folders: 0,
            messages: 0,
            newMessages: 0,
            newMessageIds: [],
            newestMessageTarget: null,
        };
        broadcastSync({accountId, status: 'done', summary, source: 'demo-mode'});
        return summary;
    }
    if (account && isDemoProvider(account.provider)) {
        const summary: AccountSyncSummary = {
            accountId,
            folders: 0,
            messages: 0,
            newMessages: 0,
            newMessageIds: [],
            newestMessageTarget: null,
        };
        broadcastSync({accountId, status: 'done', summary, source});
        return summary;
    }
    const blockedReason = blockedSyncAccounts.get(accountId);
    if (blockedReason) {
        const error = `Sync paused for this account: ${blockedReason}. Update account settings or restart app.`;
        broadcastSync({accountId, status: 'error', error, source});
        throw new Error(error);
    }

    const state = getAccountSyncState(accountId);
    state.latestSource = source;
    if (!state.pending) {
        state.pending = createDeferred<AccountSyncSummary>();
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
        let activeWorker: Worker | null = null;

        state.cancelCurrent = () => {
            cancelled = true;
            try {
                activeWorker?.postMessage({type: 'cancel'});
            } catch {
                // ignore post errors
            }
            try {
                activeWorker?.terminate();
            } catch {
                // ignore termination errors
            }
        };

        broadcastSync({accountId, status: 'syncing', source});
        appLogger.info('Sync started accountId=%d source=%s', accountId, source);

        try {
            const mailSummary = await syncAccountMailboxInWorker(accountId, (worker) => {
                activeWorker = worker;
            });
            if (cancelled && state.queued) continue;

            if (source !== 'manual' && mailSummary.newMessageIds.length > 0) {
                try {
                    await runMailFiltersForMessages(accountId, mailSummary.newMessageIds, 'incoming');
                } catch (filterError) {
                    console.warn(
                        `Mail filter run failed for account ${accountId}:`,
                        (filterError as any)?.message || String(filterError),
                    );
                }
            }

            let davSummary: DavSyncSummary | undefined;
            try {
                davSummary = await syncDav(accountId);
            } catch (davError: any) {
                createMailDebugLogger('carddav', `sync:${accountId}`).error(
                    'DAV sync skipped: %s',
                    davError?.message || String(davError),
                );
                createMailDebugLogger('caldav', `sync:${accountId}`).error(
                    'DAV sync skipped: %s',
                    davError?.message || String(davError),
                );
                console.warn(`DAV sync skipped for account ${accountId}:`, davError?.message || String(davError));
            }
            const summary: AccountSyncSummary = {
                ...mailSummary,
                ...(davSummary ? {dav: davSummary} : {}),
            };

            notifyUnreadCountChanged();
            if (mailSummary.newMessages > 0 && newMailListener) {
                newMailListener({
                    accountId,
                    newMessages: mailSummary.newMessages,
                    source,
                    target: mailSummary.newestMessageTarget,
                });
            }
            broadcastSync({accountId, status: 'done', summary, source});
            appLogger.info(
                'Sync done accountId=%d source=%s messages=%d newMessages=%d',
                accountId,
                source,
                summary.messages ?? 0,
                summary.newMessages ?? 0,
            );
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
                    appLogger.warn('Sync paused accountId=%d source=%s error=%s', accountId, source, message);
                } else {
                    broadcastSync({accountId, status: 'error', error: message, source});
                    appLogger.warn('Sync error accountId=%d source=%s error=%s', accountId, source, message);
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

async function syncAccountMailboxInWorker(
    accountId: number,
    onWorkerReady?: (worker: Worker) => void,
): Promise<SyncSummary> {
    const credentials = await getAccountSyncCredentials(accountId);
    const worker = new Worker(new URL('../workers/mailSyncWorker.mjs', import.meta.url), {
        workerData: {
            dbPath: getSqlitePath(),
            credentials,
        },
    });
    onWorkerReady?.(worker);

    return await new Promise<SyncSummary>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            worker.removeAllListeners();
            fn();
        };

        worker.on('message', (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as { type?: string; summary?: SyncSummary; error?: string };
            if (data.type === 'result' && data.summary) {
                finish(() => resolve(data.summary as SyncSummary));
                return;
            }
            if (data.type === 'error') {
                finish(() => reject(new Error(data.error || 'Mailbox sync worker failed')));
            }
        });

        worker.on('error', (error) => {
            finish(() => reject(error));
        });

        worker.on('exit', (code) => {
            if (settled) return;
            if (code === 0) {
                finish(() => reject(new Error('Mailbox sync worker exited without result')));
                return;
            }
            finish(() => reject(new Error(`Mailbox sync worker exited with code ${code}`)));
        });
    });
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
    broadcastAccountSyncStatus(payload);
}

function notifyUnreadCountChanged(): void {
    const count = getVisibleUnreadCount(getAccountsSyncSnapshot());
    appLogger.debug('Broadcast unread-count-updated count=%d', count);
    broadcastUnreadCountUpdated(count);
    if (!unreadCountListener) return;
    unreadCountListener(count);
}

function broadcastMessageReadUpdated(payload: {
    messageId: number;
    accountId: number;
    folderId: number;
    folderPath: string;
    unreadCount: number;
    totalCount: number;
    isRead: number;
}): void {
    broadcastMessageReadUpdatedEvent(payload);
}

function notifyAccountCountChanged(): void {
    if (!accountCountChangedListener) return;
    void getAccounts()
        .then((accounts) => {
            accountCountChangedListener?.(accounts.length);
        })
        .catch(() => {
            // ignore listener failures
        });
}

function sanitizeAttachmentFilename(filename: string): string {
    const trimmed = String(filename || '').trim();
    const normalized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ');
    if (!normalized || normalized === '.' || normalized === '..') return 'attachment.bin';
    return normalized.slice(0, 255);
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
    ensureIdleWatchersForAccounts(
        accounts
            .filter((account) => !isDemoProvider(account.provider) && !isDemoModeEnabled())
            .map((account) => account.id),
    );
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
            ...resolveImapSecurity(account.imap_secure),
            auth: {user: account.user, pass: account.password},
            logger: createMailDebugLogger('imap', `idle-probe:${state.accountId}`),
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
            ...resolveImapSecurity(account.imap_secure),
            auth: {user: account.user, pass: account.password},
            logger: createMailDebugLogger('imap', `idle:${state.accountId}:${folder.mailboxPath}`),
        });

        client.on('exists', () => {
            if (state.stopped) return;
            void runSyncAndBroadcast(state.accountId, 'push').catch((error) => {
                if (state.stopped) return;
                console.warn(
                    `Push-triggered sync failed for account ${state.accountId}:`,
                    (error as any)?.message || String(error),
                );
            });
        });

        client.on('close', () => {
            if (state.stopped) return;
            scheduleFolderIdleReconnect(state, folder);
        });

        client.on('error', (error: any) => {
            if (state.stopped) return;
            const message = error?.message || String(error);
            console.error(
                `IMAP IDLE watcher error for account ${state.accountId} folder ${folder.mailboxPath}:`,
                message,
            );
            scheduleFolderIdleReconnect(state, folder);
        });

        await client.connect();
        await client.mailboxOpen(folder.mailboxPath, {readOnly: true});
        folder.client = client;
        folder.reconnectAttempt = 0;
    } catch (error: any) {
        if (!state.stopped) {
            const message = error?.message || String(error);
            console.error(
                `IMAP IDLE connect failed for account ${state.accountId} folder ${folder.mailboxPath}:`,
                message,
            );
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
            const closeResult = (folder.client as any).close?.();
            if (closeResult && typeof closeResult.then === 'function') {
                void closeResult.catch(() => {
                    // ignore
                });
            }
        } catch {
            // ignore
        }
        try {
            const logoutResult = folder.client.logout();
            if (logoutResult && typeof (logoutResult as any).then === 'function') {
                void (logoutResult as Promise<void>).catch(() => {
                    // ignore
                });
            }
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
            const closeResult = (folder.client as any).close?.();
            if (closeResult && typeof closeResult.then === 'function') {
                void closeResult.catch(() => {
                    // ignore
                });
            }
        } catch {
            // ignore
        }
        try {
            const logoutResult = folder.client.logout();
            if (logoutResult && typeof (logoutResult as any).then === 'function') {
                void (logoutResult as Promise<void>).catch(() => {
                    // ignore
                });
            }
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
