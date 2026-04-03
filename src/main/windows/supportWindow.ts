import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supportWin: BrowserWindow | null = null;

export function openSupportWindow(parentWindow?: BrowserWindow): void {
    if (supportWin && !supportWin.isDestroyed()) {
        supportWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;

    supportWin = new BrowserWindow({
        parent,
        modal: false,
        width: 760,
        height: 640,
        minWidth: 640,
        minHeight: 520,
        autoHideMenuBar: true,
        title: 'Support',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    supportWin.setMenuBarVisibility(false);
    supportWin.removeMenu();
    supportWin.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            if (supportWin && !supportWin.isDestroyed()) {
                supportWin.close();
            }
        }
    });

    supportWin.on('closed', () => {
        supportWin = null;
    });

    if (isDev) {
        void loadWindowContent(supportWin, {
            isDev,
            devUrls: ['http://127.0.0.1:5174/support.html'],
            prodFiles: [],
            windowName: 'support',
        }).catch((error) => {
            console.error('Failed to load main window (dev):', error);
        });
        // win.webContents.openDevTools();
    } else {
        void loadWindowContent(supportWin, {
            isDev,
            devUrls: [],
            prodFiles: [
                path.join(__dirname, '..', '..', 'renderer/support.html'),
            ],
            windowName: 'main',
        }).catch((error) => {
            console.error('Failed to load main window (prod):', error);
        });
    }
}
