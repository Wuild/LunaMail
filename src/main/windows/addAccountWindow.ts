import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {attachWindowShortcuts, buildSecureWebPreferences, createFramelessAppWindow} from './windowFactory.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let addAccountWin: BrowserWindow | null = null;

export function openAddAccountWindow(parentWindow?: BrowserWindow): void {
    if (addAccountWin && !addAccountWin.isDestroyed()) {
        addAccountWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;
    const parentBounds = parent?.getBounds();

    addAccountWin = createFramelessAppWindow({
        parent,
        modal: true,
        width: Math.max(960, parentBounds?.width ?? 960),
        height: Math.max(700, parentBounds?.height ?? 700),
        minWidth: 960,
        minHeight: 700,
        maxWidth: 1400,
        maxHeight: 1000,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: 'Add Account',
        webPreferences: buildSecureWebPreferences({preloadPath}),
    });
    addAccountWin.setMaximizable(false);
    attachWindowShortcuts(addAccountWin, {closeOnEscape: true});

    addAccountWin.on('closed', () => {
        addAccountWin = null;
    });

    void loadWindowContent(addAccountWin, {
        isDev,
        devUrls: [
            {
                target: 'http://127.0.0.1:5174/window.html',
                query: {window: 'add-account'},
            },
            {
                target: 'http://127.0.0.1:5174/src/renderer/window.html',
                query: {window: 'add-account'},
            },
        ],
        prodFiles: [
            {
                target: path.join(__dirname, '..', '..', 'renderer/window.html'),
                query: {window: 'add-account'},
            },
        ],
        windowName: 'add-account',
    }).catch((error) => {
        console.error('Failed to load add-account window:', error);
    });
}

export function getAddAccountWindow(): BrowserWindow | null {
    return addAccountWin;
}
