import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';

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

    messageWin = new BrowserWindow({
        parent,
        modal: false,
        frame: false,
        titleBarStyle: 'hidden',
        width: 980,
        height: 760,
        minWidth: 760,
        minHeight: 560,
        maximizable: true,
        autoHideMenuBar: true,
        title: 'Message',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    messageWin.setMenuBarVisibility(false);
    messageWin.removeMenu();
    messageWin.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const key = String(input.key || '').toLowerCase();
        if (key === 'escape') {
            event.preventDefault();
            if (messageWin && !messageWin.isDestroyed()) {
                messageWin.close();
            }
            return;
        }
        const isF12 = key === 'f12';
        const isCtrlShiftI = input.control && input.shift && key === 'i';
        const isCmdAltI = input.meta && input.alt && key === 'i';
        if (!isF12 && !isCtrlShiftI && !isCmdAltI) return;
        event.preventDefault();
        if (messageWin && !messageWin.isDestroyed()) {
            messageWin.webContents.openDevTools({mode: 'detach'});
        }
    });

    messageWin.on('closed', () => {
        messageWin = null;
    });

    messageWin.webContents.on('did-finish-load', () => {
        if (!messageWin || messageWin.isDestroyed()) return;
        messageWin.webContents.send('message-window-target', messageTargetId);
    });

    void loadWindowContent(messageWin, {
        isDev,
        devUrls: ['http://127.0.0.1:5174/message.html', 'http://127.0.0.1:5174/src/renderer/message.html'],
        prodFiles: [
            path.join(__dirname, '..', '..', 'renderer/message.html'),
        ],
        windowName: 'message',
    }).catch((error) => {
        console.error('Failed to load message window:', error);
    });
}

export function getMessageWindowTargetId(): number | null {
    return messageTargetId;
}
