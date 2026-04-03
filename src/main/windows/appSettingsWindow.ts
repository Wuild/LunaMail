import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let appSettingsWin: BrowserWindow | null = null;

export function openAppSettingsWindow(parentWindow?: BrowserWindow): void {
    if (appSettingsWin && !appSettingsWin.isDestroyed()) {
        appSettingsWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;

    appSettingsWin = new BrowserWindow({
        parent,
        modal: false,
        width: 620,
        height: 560,
        minWidth: 540,
        minHeight: 500,
        autoHideMenuBar: true,
        title: 'App Settings',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    appSettingsWin.setMenuBarVisibility(false);
    appSettingsWin.removeMenu();
    appSettingsWin.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            if (appSettingsWin && !appSettingsWin.isDestroyed()) {
                appSettingsWin.close();
            }
        }
    });

    appSettingsWin.on('closed', () => {
        appSettingsWin = null;
    });

    if (isDev) {
        void loadWindowContent(appSettingsWin, {
            isDev,
            devUrls: ['http://127.0.0.1:5174/app-settings.html', 'http://127.0.0.1:5174/src/renderer/app-settings.html'],
            prodFiles: [],
            windowName: 'app-settings',
        }).catch((error) => {
            console.error('Failed to load main window (dev):', error);
        });
        // win.webContents.openDevTools();
    } else {
        void loadWindowContent(appSettingsWin, {
            isDev,
            devUrls: [],
            prodFiles: [
                path.join(__dirname, '..', '..', 'renderer/app-settings.html'),
            ],
            windowName: 'main',
        }).catch((error) => {
            console.error('Failed to load main window (prod):', error);
        });
    }
}
