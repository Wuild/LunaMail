import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let accountSettingsWin: BrowserWindow | null = null;
let accountSettingsTargetId: number | null = null;

export function openAccountSettingsWindow(parentWindow?: BrowserWindow, accountId?: number | null): void {
    accountSettingsTargetId = typeof accountId === 'number' ? accountId : null;

    if (accountSettingsWin && !accountSettingsWin.isDestroyed()) {
        accountSettingsWin.webContents.send('account-settings-target', accountSettingsTargetId);
        accountSettingsWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;

    accountSettingsWin = new BrowserWindow({
        parent,
        modal: false,
        width: 900,
        height: 760,
        minWidth: 760,
        minHeight: 640,
        autoHideMenuBar: true,
        title: 'Account Settings',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    accountSettingsWin.setMenuBarVisibility(false);
    accountSettingsWin.removeMenu();
    accountSettingsWin.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            if (accountSettingsWin && !accountSettingsWin.isDestroyed()) {
                accountSettingsWin.close();
            }
        }
    });

    accountSettingsWin.on('closed', () => {
        accountSettingsWin = null;
    });

    accountSettingsWin.webContents.on('did-finish-load', () => {
        if (!accountSettingsWin || accountSettingsWin.isDestroyed()) return;
        accountSettingsWin.webContents.send('account-settings-target', accountSettingsTargetId);
    });

    void loadWindowContent(accountSettingsWin, {
        isDev,
        devUrls: [
            'http://127.0.0.1:5174/account-settings.html',
            'http://127.0.0.1:5174/src/renderer/account-settings.html',
        ],
        prodFiles: [
            path.join(__dirname, '..', '..', 'renderer/account-settings.html'),
        ],
        windowName: 'account-settings',
    }).catch((error) => {
        console.error('Failed to load account-settings window:', error);
    });
}

export function getAccountSettingsTargetId(): number | null {
    return accountSettingsTargetId;
}
