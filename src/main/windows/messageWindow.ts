import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {attachWindowShortcuts, buildSecureWebPreferences, createFramelessAppWindow} from './windowFactory.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let messageWin: BrowserWindow | null = null;
let messageTargetId: number | null = null;

export function openMessageWindow(parentWindow?: BrowserWindow, messageId?: number | null): void {
    messageTargetId = typeof messageId === 'number' ? messageId : null;

    if (messageWin && !messageWin.isDestroyed()) {
        messageWin.webContents.send('message-window-target', messageTargetId);
        messageWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;

    messageWin = createFramelessAppWindow({
        parent,
        modal: false,
        width: 980,
        height: 760,
        minWidth: 760,
        minHeight: 560,
        maximizable: true,
        title: 'Message',
        webPreferences: buildSecureWebPreferences({preloadPath}),
    });
    attachWindowShortcuts(messageWin, {closeOnEscape: true});

    messageWin.on('closed', () => {
        messageWin = null;
    });

    messageWin.webContents.on('did-finish-load', () => {
        if (!messageWin || messageWin.isDestroyed()) return;
        messageWin.webContents.send('message-window-target', messageTargetId);
    });

    void loadWindowContent(messageWin, {
        isDev,
        devUrls: [
            {
                target: 'http://127.0.0.1:5174/window.html',
                query: {window: 'message'},
            },
            {
                target: 'http://127.0.0.1:5174/src/renderer/window.html',
                query: {window: 'message'},
            },
        ],
        prodFiles: [
            {
                target: path.join(__dirname, '..', '..', 'renderer/window.html'),
                query: {window: 'message'},
            },
        ],
        windowName: 'message',
    }).catch((error) => {
        console.error('Failed to load message window:', error);
    });
}

export function getMessageWindowTargetId(): number | null {
    return messageTargetId;
}
