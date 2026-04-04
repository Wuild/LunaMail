import type {OpenDialogOptions} from 'electron';
import {BrowserWindow, dialog, ipcMain} from 'electron';
import path from 'node:path';
import {clearDebugLogs, getDebugLogs} from '../debug/debugLog.js';
import {openAddAccountWindow} from '../windows/addAccountWindow.js';
import {type ComposeDraftPayload, getComposeDraft, openComposeWindow} from '../windows/composeWindow.js';
import {getMessageWindowTargetId, openMessageWindow} from '../windows/messageWindow.js';

export function registerWindowIpc(): void {
    ipcMain.handle('open-add-account-window', async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openAddAccountWindow(parentWindow);
        return {ok: true} as const;
    });

    ipcMain.handle('open-compose-window', async (event, draft?: ComposeDraftPayload | null) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openComposeWindow(parentWindow, draft ?? null);
        return {ok: true} as const;
    });

    ipcMain.handle('get-compose-draft', async () => {
        return getComposeDraft();
    });

    ipcMain.handle('get-debug-logs', async (_event, limit?: number) => {
        return getDebugLogs(limit);
    });

    ipcMain.handle('clear-debug-logs', async () => {
        clearDebugLogs();
        return {ok: true} as const;
    });

    ipcMain.handle('open-message-window', async (event, messageId?: number | null) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openMessageWindow(parentWindow, messageId ?? null);
        return {ok: true} as const;
    });

    ipcMain.handle('get-message-window-target', async () => {
        return getMessageWindowTargetId();
    });

    ipcMain.handle('pick-compose-attachments', async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions: OpenDialogOptions = {
            title: 'Select attachments',
            properties: ['openFile', 'multiSelections'],
        };
        const result = parentWindow
            ? await dialog.showOpenDialog(parentWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || !result.filePaths.length) return [];

        return result.filePaths.map((filePath) => ({
            path: filePath,
            filename: path.basename(filePath),
            contentType: null,
        }));
    });

    ipcMain.handle('window-minimize', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.minimize();
        }
        return {ok: true} as const;
    });

    ipcMain.handle('window-toggle-maximize', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
            return {ok: true as const, isMaximized: win.isMaximized()};
        }
        return {ok: true as const, isMaximized: false};
    });

    ipcMain.handle('window-close', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.close();
        }
        return {ok: true} as const;
    });

    ipcMain.handle('window-is-maximized', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return false;
        return win.isMaximized();
    });
}
