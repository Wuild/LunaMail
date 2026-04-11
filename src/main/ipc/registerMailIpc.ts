import {BrowserWindow, dialog, ipcMain, shell} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {confirmFileOpen, isRiskyFileOpenTarget} from '@main/security/fileOpenRisk.js';
import {resolveSenderNotificationIconPath} from '@main/notifications/senderIcon.js';

type MailIpcDeps = {
    appLogger: { debug: (...args: any[]) => void; info: (...args: any[]) => void; warn: (...args: any[]) => void };
    runSyncAndBroadcast: (accountId: number, source: string) => Promise<any>;
    listFoldersByAccount: (accountId: number) => any[];
    listMessagesByFolder: (accountId: number, folderPath: string, limit?: number) => any[];
    listThreadMessagesByFolder: (accountId: number, folderPath: string, limit?: number) => any[];
    createServerFolder: (accountId: number, folderPath: string) => Promise<any>;
    deleteServerFolder: (accountId: number, folderPath: string) => Promise<any>;
    deleteFolderByPath: (accountId: number, folderPath: string) => { removed: boolean };
    updateFolderSettings: (payload: {
        accountId: number;
        folderPath: string;
        customName?: string | null;
        color?: string | null;
        type?: string | null;
    }) => any;
    reorderCustomFolders: (accountId: number, orderedFolderPaths: string[]) => any;
    listMailFilters: (accountId: number) => any[];
    upsertMailFilter: (accountId: number, payload: any) => any;
    deleteMailFilter: (accountId: number, filterId: number) => any;
    runMailFiltersForMessages: (accountId: number, messageIds: number[], trigger: any, options?: any) => any;
    getMessageById: (messageId: number) => any;
    searchMessages: (accountId: number, query: string, folderPath?: string | null, limit?: number) => any[];
    syncMessageBody: (messageId: number, options?: any) => Promise<any>;
    syncMessageSource: (messageId: number) => Promise<any>;
    bodyRequests: Map<string, { cancel: () => void }>;
    downloadMessageAttachment: (
        messageId: number,
        attachmentIndex: number,
    ) => Promise<{ filename: string; content: Buffer }>;
    sanitizeAttachmentFilename: (filename: string) => string;
    setServerMessageRead: (messageId: number, isRead: number) => Promise<any>;
    notifyUnreadCountChanged: () => void;
    broadcastMessageReadUpdated: (payload: any) => void;
    setServerMessageFlagged: (messageId: number, isFlagged: number) => Promise<any>;
    setMessageTag: (messageId: number, tag: string | null) => any;
    moveServerMessage: (messageId: number, targetFolderPath: string) => Promise<any>;
    getMessageContext: (messageId: number) => {
        accountId: number;
        folderPath: string;
        uid: number;
    } | null;
    resolveArchiveFolderPath: (accountId: number, currentFolderPath: string | null) => string | null;
    deleteMessageLocally: (messageId: number) => { accountId: number };
    deleteServerMessageByContext: (payload: { accountId: number; folderPath: string; uid: number }) => Promise<any>;
};

const MAIL_FILTER_FIELDS = new Set(['subject', 'from', 'to', 'body']);
const MAIL_FILTER_OPERATORS = new Set(['contains', 'not_contains', 'equals', 'starts_with', 'ends_with']);
const MAIL_FILTER_ACTION_TYPES = new Set(['move_to_folder', 'mark_read', 'mark_unread', 'star', 'unstar']);
const MAIL_FILTER_MATCH_MODES = new Set(['all', 'any', 'all_messages']);
const EXPECTED_CANCEL_IMAP_CODES = new Set(['NoConnection', 'ClosedAfterConnectTLS', 'Closed']);
const EXPECTED_CANCEL_IMAP_MESSAGE_PATTERNS = [
    'connection not available',
    'unexpected close',
    'already closed',
    'not connected',
    'socket closed',
];

function parsePositiveInt(value: unknown, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
}

function parseBinaryFlag(value: unknown, fieldName: string): 0 | 1 {
    const parsed = Number(value);
    if (parsed !== 0 && parsed !== 1) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
}

function parseFolderPath(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${fieldName}`);
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return normalized;
}

function parseOptionalTag(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
        throw new Error('Invalid tag');
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function buildCancelledMessageBodyResult(messageId: number) {
    return {
        messageId,
        text: null,
        html: null,
        attachments: [],
        cached: true,
    };
}

function isExpectedCancelledImapError(error: unknown): boolean {
    const message = String((error as any)?.message || '')
        .trim()
        .toLowerCase();
    const code = String((error as any)?.code || '').trim();
    if (EXPECTED_CANCEL_IMAP_CODES.has(code)) return true;
    if (!message) return false;
    if (message === 'message body request cancelled') return true;
    return EXPECTED_CANCEL_IMAP_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

function sanitizeMailFilterPayload(payload: any): any {
    const input = payload && typeof payload === 'object' ? payload : {};
    const name = typeof input.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : 'New filter';
    const matchMode =
        typeof input.match_mode === 'string' && MAIL_FILTER_MATCH_MODES.has(input.match_mode)
            ? input.match_mode
            : 'all';
    const conditions = Array.isArray(input.conditions)
        ? input.conditions
            .filter((item: any) => item && typeof item === 'object')
            .map((item: any) => ({
                field: MAIL_FILTER_FIELDS.has(String(item.field)) ? String(item.field) : 'subject',
                operator: MAIL_FILTER_OPERATORS.has(String(item.operator)) ? String(item.operator) : 'contains',
                value: typeof item.value === 'string' ? item.value : String(item.value ?? ''),
            }))
        : [];
    const actions = Array.isArray(input.actions)
        ? input.actions
            .filter((item: any) => item && typeof item === 'object')
            .map((item: any) => ({
                type: MAIL_FILTER_ACTION_TYPES.has(String(item.type)) ? String(item.type) : 'mark_read',
                value: typeof item.value === 'string' ? item.value : String(item.value ?? ''),
            }))
        : [];
    const id = Number.isInteger(Number(input.id)) && Number(input.id) > 0 ? Number(input.id) : undefined;
    return {
        id,
        name,
        enabled: Number(input.enabled) ? 1 : 0,
        run_on_incoming: Number(input.run_on_incoming) ? 1 : 0,
        match_mode: matchMode,
        stop_processing: Number(input.stop_processing) ? 1 : 0,
        conditions,
        actions,
    };
}

export function registerMailIpc(deps: MailIpcDeps): void {
    ipcMain.handle('get-folders', async (_event, accountId: number) => {
        deps.appLogger.debug('IPC get-folders accountId=%d', accountId);
        return deps.listFoldersByAccount(accountId);
    });

    ipcMain.handle('create-folder', async (_event, accountId: number, folderPath: string) => {
        deps.appLogger.info('IPC create-folder accountId=%d folderPath=%s', accountId, folderPath);
        const created = await deps.createServerFolder(accountId, folderPath);
        await deps.runSyncAndBroadcast(accountId, 'create-folder');
        return created;
    });

    ipcMain.handle('delete-folder', async (_event, accountId: number, folderPath: string) => {
        deps.appLogger.warn('IPC delete-folder accountId=%d folderPath=%s', accountId, folderPath);
        const deleted = await deps.deleteServerFolder(accountId, folderPath);
        const local = deps.deleteFolderByPath(accountId, folderPath);
        await deps.runSyncAndBroadcast(accountId, 'delete-folder');
        return {...deleted, removed: local.removed};
    });

    ipcMain.handle(
        'update-folder-settings',
        async (
            _event,
            accountId: number,
            folderPath: string,
            payload: {
                customName?: string | null;
                color?: string | null;
                type?: string | null;
            },
        ) => {
            deps.appLogger.info('IPC update-folder-settings accountId=%d folderPath=%s', accountId, folderPath);
            return deps.updateFolderSettings({
                accountId,
                folderPath,
                customName: payload?.customName ?? null,
                color: payload?.color ?? null,
                type: payload?.type ?? null,
            });
        },
    );

    ipcMain.handle('reorder-custom-folders', async (_event, accountId: number, orderedFolderPaths: string[]) => {
        deps.appLogger.info(
            'IPC reorder-custom-folders accountId=%d count=%d',
            accountId,
            orderedFolderPaths?.length ?? 0,
        );
        return deps.reorderCustomFolders(accountId, Array.isArray(orderedFolderPaths) ? orderedFolderPaths : []);
    });

    ipcMain.handle('get-folder-messages', async (_event, accountId: number, folderPath: string, limit?: number) => {
        deps.appLogger.debug(
            'IPC get-folder-messages accountId=%d folderPath=%s limit=%s',
            accountId,
            folderPath,
            limit ?? '',
        );
        return deps.listMessagesByFolder(accountId, folderPath, limit ?? 100);
    });

    ipcMain.handle('get-folder-threads', async (_event, accountId: number, folderPath: string, limit?: number) => {
        deps.appLogger.debug(
            'IPC get-folder-threads accountId=%d folderPath=%s limit=%s',
            accountId,
            folderPath,
            limit ?? '',
        );
        return deps.listThreadMessagesByFolder(accountId, folderPath, limit ?? 100);
    });

    ipcMain.handle('get-mail-filters', async (_event, accountId: number) => {
        deps.appLogger.debug('IPC get-mail-filters accountId=%d', accountId);
        return deps.listMailFilters(accountId);
    });

    ipcMain.handle('save-mail-filter', async (_event, accountId: number, payload: any) => {
        const safeAccountId = parsePositiveInt(accountId, 'accountId');
        const safePayload = sanitizeMailFilterPayload(payload);
        return deps.upsertMailFilter(safeAccountId, safePayload);
    });

    ipcMain.handle('delete-mail-filter', async (_event, accountId: number, filterId: number) => {
        return deps.deleteMailFilter(accountId, filterId);
    });

    ipcMain.handle(
        'run-mail-filters',
        async (
            _event,
            accountId: number,
            payload?: {
                filterId?: number;
                folderPath?: string | null;
                limit?: number;
            },
        ) => {
            const folders = deps.listFoldersByAccount(accountId);
            const requestedFolder = String(payload?.folderPath || '').trim();
            const fallbackInbox =
                folders.find((folder) => (folder.type || '').toLowerCase() === 'inbox') ||
                folders.find((folder) => folder.path.toLowerCase() === 'inbox') ||
                folders[0];
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
            const messageIds = deps
                .listMessagesByFolder(accountId, selectedFolderPath, limit)
                .map((message) => message.id);
            const filterIds = Number.isFinite(Number(payload?.filterId)) ? [Number(payload?.filterId)] : undefined;
            return deps.runMailFiltersForMessages(accountId, messageIds, 'manual', {filterIds});
        },
    );

    ipcMain.handle('get-message', async (_event, messageId: number) => {
        deps.appLogger.debug('IPC get-message messageId=%d', messageId);
        return deps.getMessageById(messageId);
    });

    ipcMain.handle('get-sender-avatar', async (_event, fromAddress: string | null) => {
        const normalizedFromAddress = typeof fromAddress === 'string' ? fromAddress.trim() : '';
        if (!normalizedFromAddress) {
            return null;
        }
        const iconPath = await resolveSenderNotificationIconPath(normalizedFromAddress);
        if (!iconPath) {
            return null;
        }
        try {
            const ext = path.extname(iconPath).toLowerCase();
            const mimeType =
                ext === '.png'
                    ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg'
                        ? 'image/jpeg'
                        : ext === '.webp'
                            ? 'image/webp'
                            : null;
            if (!mimeType) {
                return null;
            }
            const iconBytes = await fs.readFile(iconPath);
            return `data:${mimeType};base64,${iconBytes.toString('base64')}`;
        } catch {
            return null;
        }
    });

    ipcMain.handle(
        'search-messages',
        async (_event, accountId: number, query: string, folderPath?: string | null, limit?: number) => {
            deps.appLogger.debug(
                'IPC search-messages accountId=%d folderPath=%s queryLen=%d limit=%s',
                accountId,
                folderPath ?? '',
                (query || '').length,
                limit ?? '',
            );
            return deps.searchMessages(accountId, query, folderPath ?? null, limit ?? 200);
        },
    );

    ipcMain.handle('get-message-body', async (event, messageId: number, requestId?: string) => {
        deps.appLogger.debug('IPC get-message-body messageId=%d requestId=%s', messageId, requestId ?? '');
        const key = `${event.sender.id}:${requestId ?? `msg-${messageId}`}`;
        let cancelled = false;
        let clientRef: any = null;
        const swallowClientCall = (call: (() => unknown) | null | undefined): void => {
            if (!call) return;
            try {
                const result = call();
                if (result && typeof (result as any).then === 'function') {
                    void (result as Promise<unknown>).catch(() => undefined);
                }
            } catch {
                // ignore
            }
        };
        deps.bodyRequests.set(key, {
            cancel: () => {
                cancelled = true;
                swallowClientCall(clientRef?.close ? () => clientRef.close() : null);
                swallowClientCall(clientRef?.logout ? () => clientRef.logout() : null);
            },
        });

        try {
            try {
                return await deps.syncMessageBody(messageId, {
                    isCancelled: () => cancelled,
                    onClient: (client: any) => {
                        clientRef = client;
                    },
                });
            } catch (error: any) {
                const message = String(error?.message || '');
                if (cancelled && isExpectedCancelledImapError(error)) {
                    deps.appLogger.debug(
                        'IPC get-message-body cancelled requestId=%s messageId=%d code=%s message=%s',
                        requestId ?? '',
                        messageId,
                        String(error?.code || ''),
                        message,
                    );
                    return buildCancelledMessageBodyResult(messageId);
                }
                if (/^message\s+\d+\s+not\s+found$/i.test(message.trim())) {
                    return buildCancelledMessageBodyResult(messageId);
                }
                throw error;
            }
        } finally {
            deps.bodyRequests.delete(key);
        }
    });

    ipcMain.handle('get-message-source', async (_event, messageId: number) => {
        deps.appLogger.debug('IPC get-message-source messageId=%d', messageId);
        return deps.syncMessageSource(messageId);
    });

    ipcMain.handle('cancel-message-body', async (event, requestId: string) => {
        deps.appLogger.debug('IPC cancel-message-body requestId=%s', requestId);
        const key = `${event.sender.id}:${requestId}`;
        const req = deps.bodyRequests.get(key);
        if (req) {
            req.cancel();
            deps.bodyRequests.delete(key);
        }
        return {ok: true as const};
    });

    ipcMain.handle(
        'open-message-attachment',
        async (event, messageId: number, attachmentIndex: number, action?: 'open' | 'save' | 'prompt') => {
            const safeMessageId = parsePositiveInt(messageId, 'messageId');
            const safeAttachmentIndex = Number(attachmentIndex);
            if (!Number.isInteger(safeAttachmentIndex) || safeAttachmentIndex < 0) {
                throw new Error('Invalid attachmentIndex');
            }
            if (action && action !== 'open' && action !== 'save' && action !== 'prompt') {
                throw new Error('Invalid attachment action');
            }
            deps.appLogger.info(
                'IPC open-message-attachment messageId=%d attachmentIndex=%d action=%s',
                safeMessageId,
                safeAttachmentIndex,
                action ?? 'prompt',
            );
            const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
            const attachment = await deps.downloadMessageAttachment(safeMessageId, safeAttachmentIndex);
            const safeName = deps.sanitizeAttachmentFilename(attachment.filename);
            const requestedAction = action ?? 'prompt';
            if (requestedAction === 'open') {
                const isRisky = isRiskyFileOpenTarget(safeName, null, attachment.content);
                const approved = await confirmFileOpen(parentWindow, safeName, 'attachment', isRisky);
                if (!approved) {
                    return {ok: false as const, action: 'cancelled' as const};
                }
                const targetPath = path.join(os.tmpdir(), `llamamail-${Date.now()}-${safeName}`);
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
                const isRisky = isRiskyFileOpenTarget(safeName, null, attachment.content);
                const approved = await confirmFileOpen(parentWindow, safeName, 'attachment', isRisky);
                if (!approved) {
                    return {ok: false as const, action: 'cancelled' as const};
                }
                const targetPath = path.join(os.tmpdir(), `llamamail-${Date.now()}-${safeName}`);
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
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        const safeIsRead = parseBinaryFlag(isRead, 'isRead');
        deps.appLogger.debug('IPC set-message-read messageId=%d isRead=%d', safeMessageId, safeIsRead);
        const result = await deps.setServerMessageRead(safeMessageId, safeIsRead);
        deps.notifyUnreadCountChanged();
        deps.broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('mark-message-read', async (_event, messageId: number) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        deps.appLogger.debug('IPC mark-message-read messageId=%d', safeMessageId);
        const result = await deps.setServerMessageRead(safeMessageId, 1);
        deps.notifyUnreadCountChanged();
        deps.broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('mark-message-unread', async (_event, messageId: number) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        deps.appLogger.debug('IPC mark-message-unread messageId=%d', safeMessageId);
        const result = await deps.setServerMessageRead(safeMessageId, 0);
        deps.notifyUnreadCountChanged();
        deps.broadcastMessageReadUpdated(result);
        return result;
    });

    ipcMain.handle('set-message-flagged', async (_event, messageId: number, isFlagged: number) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        const safeIsFlagged = parseBinaryFlag(isFlagged, 'isFlagged');
        deps.appLogger.debug('IPC set-message-flagged messageId=%d isFlagged=%d', safeMessageId, safeIsFlagged);
        const result = await deps.setServerMessageFlagged(safeMessageId, safeIsFlagged);
        void deps.runSyncAndBroadcast(result.accountId, 'flag-change').catch((error) => {
            console.warn('Post-flag sync failed:', (error as any)?.message || String(error));
        });
        return result;
    });

    ipcMain.handle('set-message-tag', async (_event, messageId: number, tag: string | null) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        const safeTag = parseOptionalTag(tag);
        deps.appLogger.debug('IPC set-message-tag messageId=%d tag=%s', safeMessageId, String(safeTag ?? ''));
        return deps.setMessageTag(safeMessageId, safeTag);
    });

    ipcMain.handle('move-message', async (_event, messageId: number, targetFolderPath: string) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        const safeTargetFolderPath = parseFolderPath(targetFolderPath, 'targetFolderPath');
        deps.appLogger.info('IPC move-message messageId=%d targetFolderPath=%s', safeMessageId, safeTargetFolderPath);
        const result = await deps.moveServerMessage(safeMessageId, safeTargetFolderPath);
        deps.notifyUnreadCountChanged();
        return result;
    });

    ipcMain.handle('archive-message', async (_event, messageId: number) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        deps.appLogger.info('IPC archive-message messageId=%d', safeMessageId);
        const ctx = deps.getMessageContext(safeMessageId);
        if (!ctx) throw new Error(`Message ${safeMessageId} not found`);
        const archivePath = deps.resolveArchiveFolderPath(ctx.accountId, ctx.folderPath);
        if (!archivePath) throw new Error('No archive folder available for this account.');
        const result = await deps.moveServerMessage(safeMessageId, archivePath);
        deps.notifyUnreadCountChanged();
        return result;
    });

    ipcMain.handle('delete-message', async (_event, messageId: number) => {
        const safeMessageId = parsePositiveInt(messageId, 'messageId');
        deps.appLogger.warn('IPC delete-message messageId=%d', safeMessageId);
        const ctx = deps.getMessageContext(safeMessageId);
        if (!ctx) throw new Error(`Message ${safeMessageId} not found`);
        const {accountId} = deps.deleteMessageLocally(safeMessageId);
        deps.notifyUnreadCountChanged();
        void (async () => {
            try {
                await deps.deleteServerMessageByContext({
                    accountId: ctx.accountId,
                    folderPath: ctx.folderPath,
                    uid: ctx.uid,
                });
            } catch (error) {
                console.error('Server delete failed, syncing mailbox for reconciliation:', error);
            } finally {
                try {
                    await deps.runSyncAndBroadcast(accountId, 'delete');
                } catch {
                    // ignore async sync failures for queued deletes
                }
            }
        })();
        return {accountId, queued: true as const};
    });
}
