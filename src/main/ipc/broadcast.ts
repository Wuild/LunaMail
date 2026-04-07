import {BrowserWindow} from 'electron';
import type {GlobalErrorEvent} from '../../shared/ipcTypes.js';

export type MessageReadUpdatedPayload = {
    messageId: number;
    accountId: number;
    folderId: number;
    folderPath: string;
    unreadCount: number;
    totalCount: number;
    isRead: number;
};

export function broadcastToAllWindows(channel: string, payload?: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, payload);
    }
}

export function broadcastAccountSyncStatus(payload: unknown): void {
    broadcastToAllWindows('account-sync-status', payload);
}

export function broadcastUnreadCountUpdated(count: number): void {
    broadcastToAllWindows('unread-count-updated', count);
}

export function broadcastMessageReadUpdated(payload: MessageReadUpdatedPayload): void {
    broadcastToAllWindows('message-read-updated', payload);
}

export function broadcastGlobalError(payload: GlobalErrorEvent): void {
    broadcastToAllWindows('global-error', payload);
}
