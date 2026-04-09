import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {attachWindowShortcuts, buildSecureWebPreferences, createAppWindow} from './windowFactory.js';
import {APP_NAME} from '../config.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let splashWin: BrowserWindow | null = null;

type OpenSplashWindowOptions = {
    forceTitleBar?: boolean;
};

export function openSplashWindow(options: OpenSplashWindowOptions = {}): BrowserWindow {
    if (splashWin && !splashWin.isDestroyed()) {
        splashWin.focus();
        return splashWin;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
    const showTitleBar = isDev || Boolean(options.forceTitleBar);

    splashWin = createAppWindow({
        width: 420,
        height: 500,
        frame: showTitleBar,
        ...(showTitleBar ? {} : {titleBarStyle: 'hidden' as const}),
        resizable: false,
        minimizable: showTitleBar,
        maximizable: false,
        fullscreenable: false,
        show: true,
        title: `${APP_NAME} Updater`,
        webPreferences: buildSecureWebPreferences({preloadPath}),
    });
    attachWindowShortcuts(splashWin);
    splashWin.on('closed', () => {
        splashWin = null;
    });

    void loadWindowContent(splashWin, {
        isDev,
        devUrls: [
            {
                target: 'http://127.0.0.1:5174/window.html',
                query: {window: 'splash'},
            },
            {
                target: 'http://127.0.0.1:5174/src/renderer/window.html',
                query: {window: 'splash'},
            },
        ],
        prodFiles: [
            {
                target: path.join(__dirname, '..', '..', 'renderer/window.html'),
                query: {window: 'splash'},
            },
        ],
        windowName: 'splash',
    }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (/object has been destroyed/i.test(message)) return;
        console.error('Failed to load splash window:', error);
    });

    return splashWin;
}

export function closeSplashWindow(): void {
    if (!splashWin || splashWin.isDestroyed()) return;
    splashWin.close();
}
