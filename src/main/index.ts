import {app, BrowserWindow, Menu, nativeImage, nativeTheme, Notification, shell, Tray} from 'electron';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {initDb} from './db/index.js';
import {getAccounts} from './db/repositories/accountsRepo.js';
import {
    getCurrentUnreadCount,
    registerAccountIpc,
    setAutoSyncIntervalMinutes,
    setNewMailListener,
    setUnreadCountListener,
    startAccountAutoSync,
    stopAccountAutoSync,
} from './ipc/accounts.js';
import {registerSettingsIpc} from './ipc/settings.js';
import {registerWindowIpc} from './ipc/windows.js';
import {getAppSettings, getAppSettingsSync, getSpellCheckerLanguages} from './settings/store.js';
import {openAddAccountWindow} from './windows/addAccountWindow.js';
import {loadWindowContent} from './windows/loadWindowContent.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentUnreadCount = 0;
const appIconPath = resolveAppIconPath();
const appIconPngBase64 = appIconPath && fs.existsSync(appIconPath) ? fs.readFileSync(appIconPath).toString('base64') : null;

function createWindow() {
    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        icon: appIconPath || undefined,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true,
        },
    });
    win.setMenuBarVisibility(false);
    win.removeMenu();
    const currentSettings = getAppSettingsSync();
    win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(currentSettings.language));
    win.on('minimize', () => {
        const settings = getAppSettingsSync();
        if (!settings.minimizeToTray) return;
        setTimeout(() => {
            if (!win.isDestroyed()) {
                win.hide();
            }
        }, 0);
        ensureTray();
    });
    win.on('close', (event) => {
        const settings = getAppSettingsSync();
        if (isQuitting || !settings.minimizeToTray) return;
        event.preventDefault();
        win.hide();
        ensureTray();
    });
    mainWindow = win;

    if (isDev) {
        void loadWindowContent(win, {
            isDev,
            devUrls: ['http://127.0.0.1:5174/index.html', 'http://127.0.0.1:5174/src/renderer/index.html'],
            prodFiles: [],
            windowName: 'main',
        }).catch((error) => {
            console.error('Failed to load main window (dev):', error);
        });
        // win.webContents.openDevTools();
    } else {
        void loadWindowContent(win, {
            isDev,
            devUrls: [],
            prodFiles: [
                path.join(__dirname, '../renderer/index.html'),
                path.join(__dirname, '../renderer/src/renderer/index.html'),
            ],
            windowName: 'main',
        }).catch((error) => {
            console.error('Failed to load main window (prod):', error);
        });
    }
}

function buildTrayIcon(unreadCount: number) {
    if (process.platform === 'linux') {
        const trayPath = appIconPath || path.join(app.getAppPath(), 'build/icons/64x64.png');
        const image = nativeImage.createFromPath(trayPath);
        if (!image.isEmpty()) {
            return image.resize({width: 22, height: 22});
        }
    }

    const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
    const showBadge = unreadCount > 0;
    const fontSize = badgeText.length > 2 ? 8 : 10;
    const badge = showBadge
        ? `<circle cx="24" cy="8" r="7" fill="#ef4444"/><text x="24" y="11" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${badgeText}</text>`
        : '';
    const baseIcon = appIconPngBase64
        ? `<image href="data:image/png;base64,${appIconPngBase64}" x="0" y="0" width="32" height="32"/>`
        : `<rect x="3" y="3" width="26" height="26" rx="7" fill="#5865f2"/><path d="M8 11h16v10H8z" fill="#fff" opacity="0.96"/><path d="M8 11l8 6 8-6" fill="none" stroke="#5865f2" stroke-width="2"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${baseIcon}${badge}</svg>`;
    const encoded = Buffer.from(svg).toString('base64');
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${encoded}`);
}

function ensureTray(): void {
    if (tray) return;
    tray = new Tray(buildTrayIcon(currentUnreadCount));
    tray.setToolTip(buildTrayTooltip(currentUnreadCount));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show LunaMail',
            click: () => {
                if (!mainWindow || mainWindow.isDestroyed()) {
                    createWindow();
                    return;
                }
                mainWindow.show();
                mainWindow.focus();
            },
        },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
            return;
        }
        mainWindow.show();
        mainWindow.focus();
    });
}

function buildTrayTooltip(unreadCount: number): string {
    if (unreadCount <= 0) return 'LunaMail';
    return `LunaMail (${unreadCount} unread)`;
}

function updateUnreadIndicators(unreadCount: number): void {
    currentUnreadCount = Math.max(0, Number(unreadCount) || 0);
    ensureTray();

    if (tray) {
        tray.setImage(buildTrayIcon(currentUnreadCount));
        tray.setToolTip(buildTrayTooltip(currentUnreadCount));
    }

    const label = currentUnreadCount > 0 ? String(currentUnreadCount) : '';
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setBadge(label);
    }
    for (const win of BrowserWindow.getAllWindows()) {
        win.setTitle(currentUnreadCount > 0 ? `LunaMail (${currentUnreadCount})` : 'LunaMail');
    }
}

function focusMainWindowAndOpenMessage(target: {
    accountId: number;
    folderPath: string;
    messageId: number
} | null): void {
    if (!target) return;
    const sendTarget = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('open-message-target', target);
    };

    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.once('did-finish-load', sendTarget);
    } else {
        sendTarget();
    }
    mainWindow.show();
    mainWindow.focus();
}

function resolveAppIconPath(): string | null {
    const candidates = [
        path.join(app.getAppPath(), 'build/icons/512x512.png'),
        path.join(app.getAppPath(), 'build/icon.png'),
        path.join(app.getAppPath(), 'src/resources/luna.png'),
        path.join(__dirname, '../resources/luna.png'),
        path.join(process.cwd(), 'build/icons/512x512.png'),
        path.join(process.cwd(), 'build/icon.png'),
        path.join(process.cwd(), 'src/resources/luna.png'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function playNotificationSound(): void {
    try {
        shell.beep();
    } catch {
        // ignore sound failures
    }
}

function applyRuntimeSettings(): void {
    const settings = getAppSettingsSync();
    nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;
    setAutoSyncIntervalMinutes(settings.syncIntervalMinutes);
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(settings.language));
    }
    ensureTray();
}

app.whenReady().then(async () => {
    // Initialize database and IPC handlers
    initDb();
    await getAppSettings();
    applyRuntimeSettings();
    setUnreadCountListener((count) => {
        updateUnreadIndicators(count);
    });
    setNewMailListener(({newMessages, source, target}) => {
        if (newMessages <= 0) return;
        if (source === 'send') return;
        if (!Notification.isSupported()) return;
        const title = newMessages === 1 ? 'New email received' : `${newMessages} new emails`;
        const body = source === 'startup'
            ? 'Mailbox synced with new unread messages.'
            : 'You have new unread messages.';
        try {
            const notification = new Notification({title, body, silent: false});
            notification.on('click', () => {
                focusMainWindowAndOpenMessage(target);
            });
            notification.show();
            playNotificationSound();
        } catch {
            // ignore notification failures
        }
    });
    registerAccountIpc();
    registerSettingsIpc(() => {
        applyRuntimeSettings();
    });
    registerWindowIpc();

    createWindow();
    const accounts = await getAccounts();
    if (accounts.length === 0) {
        openAddAccountWindow(mainWindow ?? undefined);
    }
    updateUnreadIndicators(getCurrentUnreadCount());
    startAccountAutoSync();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    isQuitting = true;
    stopAccountAutoSync();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
