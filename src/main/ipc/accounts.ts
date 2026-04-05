import {BrowserWindow, dialog, ipcMain, shell} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ImapFlow} from 'imapflow';
import {createMailDebugLogger} from '../debug/debugLog.js';
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
    getMessageContext,
    getTotalUnreadCount,
    listFoldersByAccount,
    listMessagesByFolder,
    listRecentRecipients,
    reorderCustomFolders,
    searchMessages,
    updateFolderSettings
} from '../db/repositories/mailRepo.js';
import {autodiscover, autodiscoverBasic} from '../mail/autodiscover.js';
import {deleteMailFilter, listMailFilters, runMailFiltersForMessages, upsertMailFilter} from '../mail/filterRules.js';
import {resolveImapSecurity} from '../mail/security.js';
import {
    createServerFolder,
    deleteServerFolder,
    deleteServerMessageByContext,
    moveServerMessage,
    setServerMessageFlagged,
    setServerMessageRead
} from '../mail/actions.js';
import {saveDraftEmail, type SaveDraftPayload, sendEmail, type SendEmailPayload} from '../mail/send.js';
import {downloadMessageAttachment, syncAccountMailbox, syncMessageBody, type SyncSummary} from '../mail/sync.js';
import {verifyConnection, type VerifyPayload} from '../mail/verify.js';
import {
    addAddressBook,
    addCalendarEvent,
    addContact,
    type DavSyncSummary,
    discoverDav,
    editContact,
    getAddressBooks,
    getCalendarEvents,
    getContacts,
    removeAddressBook,
    removeContact,
    syncDav
} from '../dav/sync.js';

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

const idleWatchers = new Map<number, IdleWatcherState>();

type ExportContactsPayload = {
    format: 'csv' | 'vcf';
    addressBookId?: number | null;
};

function escapeCsvValue(value: string): string {
    if (!/[",\n\r]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(contacts: Array<{
    full_name: string | null;
    email: string;
    phone?: string | null;
    organization?: string | null;
    title?: string | null;
    note?: string | null;
}>): string {
    const lines = ['full_name,email,phone,organization,title,note'];
    for (const contact of contacts) {
        lines.push([
            escapeCsvValue(contact.full_name ?? ''),
            escapeCsvValue(contact.email ?? ''),
            escapeCsvValue(contact.phone ?? ''),
            escapeCsvValue(contact.organization ?? ''),
            escapeCsvValue(contact.title ?? ''),
            escapeCsvValue(contact.note ?? ''),
        ].join(','));
    }
    return `${lines.join('\n')}\n`;
}

function escapeVCardValue(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

function toVcf(contacts: Array<{
    full_name: string | null;
    email: string;
    phone?: string | null;
    organization?: string | null;
    title?: string | null;
    note?: string | null;
}>): string {
    return contacts.map((contact) => {
        const fullName = (contact.full_name || contact.email || '').trim();
        const safeName = escapeVCardValue(fullName);
        const safeEmail = escapeVCardValue((contact.email || '').trim());
        const lines = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${safeName}`,
            `EMAIL;TYPE=INTERNET:${safeEmail}`,
        ];
        if (contact.phone?.trim()) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(contact.phone.trim())}`);
        if (contact.organization?.trim()) lines.push(`ORG:${escapeVCardValue(contact.organization.trim())}`);
        if (contact.title?.trim()) lines.push(`TITLE:${escapeVCardValue(contact.title.trim())}`);
        if (contact.note?.trim()) lines.push(`NOTE:${escapeVCardValue(contact.note.trim())}`);
        lines.push('END:VCARD');
        return lines.join('\n');
    }).join('\n') + '\n';
}

export function registerAccountIpc(): void {
    // Get all accounts (without passwords)
    ipcMain.handle('get-accounts', async () => {
        return await getAccounts();
    });

    ipcMain.handle('get-unread-count', async () => {
        return getTotalUnreadCount();
    });

    // Add account: persist metadata in DB, secret in keytar (via repo)
    ipcMain.handle('add-account', async (_event, account: AddAccountPayload) => {
        const created = await addAccount(account);
        blockedSyncAccounts.delete(created.id);
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('account-added', created);
        }
        notifyAccountCountChanged();
        void runSyncAndBroadcast(created.id, 'new-account').catch((error) => {
            console.warn('Initial sync after account add failed:', (error as any)?.message || String(error));
        });
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
        notifyAccountCountChanged();
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
        void runSyncAndBroadcast(payload.accountId, 'send').catch((error) => {
            console.warn('Post-send sync failed:', (error as any)?.message || String(error));
        });
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

    ipcMain.handle('reorder-custom-folders', async (_event, accountId: number, orderedFolderPaths: string[]) => {
        return reorderCustomFolders(accountId, Array.isArray(orderedFolderPaths) ? orderedFolderPaths : []);
    });

    ipcMain.handle('get-folder-messages', async (_event, accountId: number, folderPath: string, limit?: number) => {
        return listMessagesByFolder(accountId, folderPath, limit ?? 100);
    });

    ipcMain.handle('get-mail-filters', async (_event, accountId: number) => {
        return listMailFilters(accountId);
    });

    ipcMain.handle(
        'save-mail-filter',
        async (_event, accountId: number, payload: {
            id?: number;
            name: string;
            enabled?: number;
            run_on_incoming?: number;
            match_mode?: 'all' | 'any' | 'all_messages';
            stop_processing?: number;
            conditions?: Array<{
                field?: 'subject' | 'from' | 'to' | 'body';
                operator?: 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with';
                value?: string | null;
            }>;
            actions?: Array<{
                type?: 'move_to_folder' | 'mark_read' | 'mark_unread' | 'star' | 'unstar';
                value?: string | null;
            }>;
        }) => {
            return upsertMailFilter(accountId, payload ?? {name: 'New filter'});
        },
    );

    ipcMain.handle('delete-mail-filter', async (_event, accountId: number, filterId: number) => {
        return deleteMailFilter(accountId, filterId);
    });

    ipcMain.handle(
        'run-mail-filters',
        async (_event, accountId: number, payload?: {
            filterId?: number;
            folderPath?: string | null;
            limit?: number
        }) => {
            const folders = listFoldersByAccount(accountId);
            const requestedFolder = String(payload?.folderPath || '').trim();
            const fallbackInbox = folders.find((folder) => (folder.type || '').toLowerCase() === 'inbox')
                || folders.find((folder) => folder.path.toLowerCase() === 'inbox')
                || folders[0];
            if (!fallbackInbox) {
                return {
                    accountId,
                    trigger: 'manual' as const,
                    processed: 0,
                    matched: 0,
                    actionsApplied: 0,
                    errors: 0,
                };
            }
            const selectedFolderPath = requestedFolder || fallbackInbox.path;
            const limit = Math.max(1, Math.min(1000, Number(payload?.limit || 300)));
            const messageIds = listMessagesByFolder(accountId, selectedFolderPath, limit).map((message) => message.id);
            const filterIds = Number.isFinite(Number(payload?.filterId)) ? [Number(payload?.filterId)] : undefined;
            return runMailFiltersForMessages(accountId, messageIds, 'manual', {filterIds});
        },
    );

    ipcMain.handle('get-message', async (_event, messageId: number) => {
        return getMessageById(messageId);
    });

    ipcMain.handle(
        'search-messages',
        async (_event, accountId: number, query: string, folderPath?: string | null, limit?: number) => {
            return searchMessages(accountId, query, folderPath ?? null, limit ?? 200);
        },
    );

    ipcMain.handle('discover-dav', async (_event, accountId: number) => {
        return discoverDav(accountId);
    });

    ipcMain.handle('sync-dav', async (_event, accountId: number) => {
        return syncDav(accountId);
    });

    ipcMain.handle('get-contacts', async (_event, accountId: number, query?: string | null, limit?: number, addressBookId?: number | null) => {
        return getContacts(accountId, query ?? null, limit ?? 200, addressBookId ?? null);
    });

    ipcMain.handle('get-recent-recipients', async (_event, accountId: number, query?: string | null, limit?: number) => {
        return listRecentRecipients(accountId, query ?? null, limit ?? 20);
    });

    ipcMain.handle('get-address-books', async (_event, accountId: number) => {
        return getAddressBooks(accountId);
    });

    ipcMain.handle('add-address-book', async (_event, accountId: number, name: string) => {
        return addAddressBook(accountId, name);
    });

    ipcMain.handle(
        'add-contact',
        async (_event, accountId: number, payload: {
            addressBookId?: number | null;
            fullName?: string | null;
            email: string;
            phone?: string | null;
            organization?: string | null;
            title?: string | null;
            note?: string | null;
        }) => {
            return addContact(accountId, payload);
        },
    );

    ipcMain.handle(
        'update-contact',
        async (_event, contactId: number, payload: {
            addressBookId?: number | null;
            fullName?: string | null;
            email?: string;
            phone?: string | null;
            organization?: string | null;
            title?: string | null;
            note?: string | null;
        }) => {
            return editContact(contactId, payload);
        },
    );

    ipcMain.handle('delete-address-book', async (_event, accountId: number, addressBookId: number) => {
        return removeAddressBook(accountId, addressBookId);
    });

    ipcMain.handle('delete-contact', async (_event, contactId: number) => {
        return removeContact(contactId);
    });

    ipcMain.handle(
        'export-contacts',
        async (event, accountId: number, payload: ExportContactsPayload) => {
            const format = payload?.format === 'vcf' ? 'vcf' : 'csv';
            const addressBookId = payload?.addressBookId ?? null;
            const contacts = getContacts(accountId, null, 100000, addressBookId);
            const content = format === 'vcf' ? toVcf(contacts) : toCsv(contacts);
            const defaultName = `contacts-${new Date().toISOString().slice(0, 10)}.${format}`;
            const parentWindow = BrowserWindow.fromWebContents(event.sender);
            const dialogOptions = {
                title: 'Export Contacts',
                defaultPath: path.join(os.homedir(), defaultName),
                filters: format === 'vcf'
                    ? [{name: 'vCard', extensions: ['vcf']}]
                    : [{name: 'CSV', extensions: ['csv']}],
            };
            const save = parentWindow
                ? await dialog.showSaveDialog(parentWindow, dialogOptions)
                : await dialog.showSaveDialog(dialogOptions);
            if (save.canceled || !save.filePath) {
                return {
                    canceled: true,
                    count: contacts.length,
                    path: null,
                    format,
                };
            }
            await fs.writeFile(save.filePath, content, 'utf8');
            return {
                canceled: false,
                count: contacts.length,
                path: save.filePath,
                format,
            };
        },
    );

    ipcMain.handle(
        'get-calendar-events',
        async (_event, accountId: number, startIso?: string | null, endIso?: string | null, limit?: number) => {
            return getCalendarEvents(accountId, startIso ?? null, endIso ?? null, limit ?? 500);
        },
    );

    ipcMain.handle(
        'add-calendar-event',
        async (
            _event,
            accountId: number,
            payload: {
                summary?: string | null;
                description?: string | null;
                location?: string | null;
                startsAt: string;
                endsAt: string;
            },
        ) => {
            return addCalendarEvent(accountId, payload);
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

    ipcMain.handle(
        'open-message-attachment',
        async (event, messageId: number, attachmentIndex: number, action?: 'open' | 'save' | 'prompt') => {
            const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
            const attachment = await downloadMessageAttachment(messageId, attachmentIndex);
            const safeName = sanitizeAttachmentFilename(attachment.filename);
            const requestedAction = action ?? 'prompt';
            if (requestedAction === 'open') {
                const targetPath = path.join(os.tmpdir(), `lunamail-${Date.now()}-${safeName}`);
                await fs.writeFile(targetPath, attachment.content);
                const openError = await shell.openPath(targetPath);
                if (openError) throw new Error(openError);
                return {ok: true as const, action: 'opened' as const, path: targetPath};
            }
            if (requestedAction === 'save') {
                const saveDialogOptions = {
                    title: 'Save attachment',
                    defaultPath: safeName,
                    showsTagField: false,
                };
                const saveResult = parentWindow
                    ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
                    : await dialog.showSaveDialog(saveDialogOptions);
                if (saveResult.canceled || !saveResult.filePath) {
                    return {ok: false as const, action: 'cancelled' as const};
                }
                await fs.writeFile(saveResult.filePath, attachment.content);
                return {ok: true as const, action: 'saved' as const, path: saveResult.filePath};
            }
            const dialogOptions = {
                type: 'question' as const,
                title: 'Attachment',
                message: safeName,
                detail: 'Choose how to continue with this attachment.',
                buttons: ['Open', 'Save As...', 'Cancel'],
                defaultId: 0,
                cancelId: 2,
            };
            const openOrSave = parentWindow
                ? await dialog.showMessageBox(parentWindow, dialogOptions)
                : await dialog.showMessageBox(dialogOptions);

            if (openOrSave.response === 2) {
                return {ok: false as const, action: 'cancelled' as const};
            }

            if (openOrSave.response === 0) {
                const targetPath = path.join(os.tmpdir(), `lunamail-${Date.now()}-${safeName}`);
                await fs.writeFile(targetPath, attachment.content);
                const openError = await shell.openPath(targetPath);
                if (openError) throw new Error(openError);
                return {ok: true as const, action: 'opened' as const, path: targetPath};
            }

            const saveDialogOptions = {
                title: 'Save attachment',
                defaultPath: safeName,
                showsTagField: false,
            };
            const saveResult = parentWindow
                ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
                : await dialog.showSaveDialog(saveDialogOptions);
            if (saveResult.canceled || !saveResult.filePath) {
                return {ok: false as const, action: 'cancelled' as const};
            }
            await fs.writeFile(saveResult.filePath, attachment.content);
            return {ok: true as const, action: 'saved' as const, path: saveResult.filePath};
        },
    );

    ipcMain.handle('set-message-read', async (_event, messageId: number, isRead: number) => {
        const result = await setServerMessageRead(messageId, isRead);
        notifyUnreadCountChanged();
        broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('mark-message-read', async (_event, messageId: number) => {
        const result = await setServerMessageRead(messageId, 1);
        notifyUnreadCountChanged();
        broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('mark-message-unread', async (_event, messageId: number) => {
        const result = await setServerMessageRead(messageId, 0);
        notifyUnreadCountChanged();
        broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('set-message-flagged', async (_event, messageId: number, isFlagged: number) => {
        const result = await setServerMessageFlagged(messageId, isFlagged);
        void runSyncAndBroadcast(result.accountId, 'flag-change').catch((error) => {
            console.warn('Post-flag sync failed:', (error as any)?.message || String(error));
        });
        return result;
    });

    ipcMain.handle('move-message', async (_event, messageId: number, targetFolderPath: string) => {
        return await moveServerMessage(messageId, targetFolderPath);
    });

    ipcMain.handle('archive-message', async (_event, messageId: number) => {
        const ctx = getMessageContext(messageId);
        if (!ctx) throw new Error(`Message ${messageId} not found`);
        const archivePath = resolveArchiveFolderPath(ctx.accountId, ctx.folderPath);
        if (!archivePath) throw new Error('No archive folder available for this account.');
        return await moveServerMessage(messageId, archivePath);
    });

    ipcMain.handle('delete-message', async (_event, messageId: number) => {
        const ctx = getMessageContext(messageId);
        if (!ctx) throw new Error(`Message ${messageId} not found`);
        const {accountId} = deleteMessageLocally(messageId);
        notifyUnreadCountChanged();
        void (async () => {
            try {
                await deleteServerMessageByContext({
                    accountId: ctx.accountId,
                    folderPath: ctx.folderPath,
                    uid: ctx.uid,
                });
            } catch (error) {
                console.error('Server delete failed, syncing mailbox for reconciliation:', error);
            } finally {
                try {
                    await runSyncAndBroadcast(accountId, 'delete');
                } catch {
                    // ignore async sync failures for queued deletes
                }
            }
        })();
        return {accountId, queued: true as const};
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

async function runSyncAndBroadcast(accountId: number, source: string): Promise<AccountSyncSummary> {
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
            const mailSummary = await syncAccountMailbox(accountId, {
                isCancelled: () => cancelled,
                onClient: (client) => {
                    clientRef = client;
                },
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
                console.warn(
                    `DAV sync skipped for account ${accountId}:`,
                    davError?.message || String(davError),
                );
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
    const count = getTotalUnreadCount();
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('unread-count-updated', count);
    }
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
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('message-read-updated', payload);
    }
}

function notifyAccountCountChanged(): void {
    if (!accountCountChangedListener) return;
    void getAccounts().then((accounts) => {
        accountCountChangedListener?.(accounts.length);
    }).catch(() => {
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
