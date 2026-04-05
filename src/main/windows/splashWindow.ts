import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let splashWin: BrowserWindow | null = null;

export function openSplashWindow(): BrowserWindow {
    if (splashWin && !splashWin.isDestroyed()) {
        splashWin.focus();
        return splashWin;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    splashWin = new BrowserWindow({
        width: 520,
        height: 320,
        frame: false,
        titleBarStyle: 'hidden',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        autoHideMenuBar: true,
        show: true,
        title: 'LunaMail Updater',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    splashWin.setMenuBarVisibility(false);
    splashWin.removeMenu();
    splashWin.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const key = String(input.key || '').toLowerCase();
        const isF12 = key === 'f12';
        const isCtrlShiftI = input.control && input.shift && key === 'i';
        const isCmdAltI = input.meta && input.alt && key === 'i';
        if (!isF12 && !isCtrlShiftI && !isCmdAltI) return;
        event.preventDefault();
        if (splashWin && !splashWin.isDestroyed()) {
            splashWin.webContents.openDevTools({mode: 'detach'});
        }
    });
    splashWin.on('closed', () => {
        splashWin = null;
    });

    void loadWindowContent(splashWin, {
        isDev,
        devUrls: ['http://127.0.0.1:5174/splash.html', 'http://127.0.0.1:5174/src/renderer/splash.html'],
        prodFiles: [
            path.join(__dirname, '..', '..', 'renderer/splash.html'),
        ],
        windowName: 'splash',
    }).catch((error) => {
        console.error('Failed to load splash window:', error);
    });

    return splashWin;
}

export function closeSplashWindow(): void {
    if (!splashWin || splashWin.isDestroyed()) return;
    splashWin.close();
}
