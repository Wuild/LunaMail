import type {OpenDialogOptions} from 'electron';
import {BrowserWindow, dialog, ipcMain} from 'electron';
import path from 'node:path';
import {openAddAccountWindow} from '../windows/addAccountWindow.js';
import {getAccountSettingsTargetId, openAccountSettingsWindow} from '../windows/accountSettingsWindow.js';
import {openAppSettingsWindow} from '../windows/appSettingsWindow.js';
import {type ComposeDraftPayload, getComposeDraft, openComposeWindow} from '../windows/composeWindow.js';
import {getMessageWindowTargetId, openMessageWindow} from '../windows/messageWindow.js';
import {openSupportWindow} from '../windows/supportWindow.js';

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

    ipcMain.handle('open-account-settings-window', async (event, accountId?: number | null) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openAccountSettingsWindow(parentWindow, accountId ?? null);
        return {ok: true} as const;
    });

    ipcMain.handle('get-account-settings-target', async () => {
        return getAccountSettingsTargetId();
    });

    ipcMain.handle('open-app-settings-window', async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openAppSettingsWindow(parentWindow);
        return {ok: true} as const;
    });

    ipcMain.handle('open-support-window', async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openSupportWindow(parentWindow);
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
}
