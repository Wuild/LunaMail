import {
    app,
    BrowserWindow,
    clipboard,
    Menu,
    nativeImage,
    nativeTheme,
    Notification,
    screen,
    shell,
    Tray
} from 'electron';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {onDebugLog} from './debug/debugLog.js';
import {initDb} from './db/index.js';
import {getAccounts} from './db/repositories/accountsRepo.js';
import {
    getCurrentUnreadCount,
    registerAccountIpc,
    setAccountCountChangedListener,
    setAutoSyncIntervalMinutes,
    setNewMailListener,
    setUnreadCountListener,
    startAccountAutoSync,
    stopAccountAutoSync,
} from './ipc/accounts.js';
import {registerSettingsIpc} from './ipc/settings.js';
import {broadcastAutoUpdateState, registerUpdaterIpc} from './ipc/updater.js';
import {registerWindowIpc} from './ipc/windows.js';
import {getAppSettings, getAppSettingsSync, getSpellCheckerLanguages} from './settings/store.js';
import {initAutoUpdater, runStartupUpdateFlow, setAutoUpdateEnabled} from './updater/autoUpdate.js';
import type {ComposeDraftPayload} from './windows/composeWindow.js';
import {openComposeWindow} from './windows/composeWindow.js';
import {getAddAccountWindow, openAddAccountWindow} from './windows/addAccountWindow.js';
import {loadWindowContent} from './windows/loadWindowContent.js';
import {closeSplashWindow, openSplashWindow} from './windows/splashWindow.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentUnreadCount = 0;
const pendingMailtoUrls: string[] = [];
let stopDebugForwarding: (() => void) | null = null;
const appIconPath = resolveAppIconPath();
const trayIconPath = resolveTrayIconPath();
const appIconPngBase64 = appIconPath && fs.existsSync(appIconPath) ? fs.readFileSync(appIconPath).toString('base64') : null;
const mainWindowStatePath = path.join(app.getPath('userData'), 'main-window-state.json');

type MainWindowState = {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized?: boolean;
};

function createWindow() {
    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
    const restoredState = loadMainWindowState();
    const normalizedState = normalizeWindowState(restoredState);

    const win = new BrowserWindow({
        width: normalizedState?.width ?? 1200,
        height: normalizedState?.height ?? 800,
        ...(typeof normalizedState?.x === 'number' && typeof normalizedState?.y === 'number'
            ? {x: normalizedState.x, y: normalizedState.y}
            : {}),
        frame: false,
        titleBarStyle: 'hidden',
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
    if (normalizedState?.isMaximized) {
        win.maximize();
    }
    let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSaveState = () => {
        if (saveStateTimer) clearTimeout(saveStateTimer);
        saveStateTimer = setTimeout(() => {
            saveStateTimer = null;
            saveMainWindowState(win);
        }, 200);
    };
    win.on('move', scheduleSaveState);
    win.on('resize', scheduleSaveState);
    win.on('maximize', scheduleSaveState);
    win.on('unmaximize', scheduleSaveState);
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
    win.on('closed', () => {
        if (saveStateTimer) {
            clearTimeout(saveStateTimer);
            saveStateTimer = null;
        }
        saveMainWindowState(win);
        if (mainWindow === win) {
            mainWindow = null;
        }
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

function loadMainWindowState(): MainWindowState | null {
    try {
        if (!fs.existsSync(mainWindowStatePath)) return null;
        const raw = fs.readFileSync(mainWindowStatePath, 'utf8');
        if (!raw.trim()) return null;
        const parsed = JSON.parse(raw) as Partial<MainWindowState>;
        if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
        return {
            width: Math.max(900, Number(parsed.width)),
            height: Math.max(600, Number(parsed.height)),
            ...(Number.isFinite(parsed.x) ? {x: Number(parsed.x)} : {}),
            ...(Number.isFinite(parsed.y) ? {y: Number(parsed.y)} : {}),
            isMaximized: Boolean(parsed.isMaximized),
        };
    } catch {
        return null;
    }
}

function saveMainWindowState(win: BrowserWindow): void {
    try {
        if (win.isDestroyed()) return;
        const bounds = win.getBounds();
        const nextState: MainWindowState = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: win.isMaximized(),
        };
        fs.writeFileSync(mainWindowStatePath, JSON.stringify(nextState));
    } catch {
        // ignore state persistence failures
    }
}

function normalizeWindowState(state: MainWindowState | null): MainWindowState | null {
    if (!state) return null;
    const displays = screen.getAllDisplays();
    if (displays.length === 0) return state;

    const width = Math.max(900, state.width);
    const height = Math.max(600, state.height);
    const x = typeof state.x === 'number' ? state.x : undefined;
    const y = typeof state.y === 'number' ? state.y : undefined;
    if (typeof x !== 'number' || typeof y !== 'number') {
        return {width, height, isMaximized: state.isMaximized};
    }

    const windowRect = {x, y, width, height};
    const visible = displays.some((display) => rectsIntersect(windowRect, display.workArea));
    if (!visible) {
        return {width, height, isMaximized: state.isMaximized};
    }
    return {x, y, width, height, isMaximized: state.isMaximized};
}

function rectsIntersect(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean {
    return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
}

function buildTrayIcon(unreadCount: number) {
    if (process.platform === 'linux') {
        const trayPath = trayIconPath || appIconPath || path.join(app.getAppPath(), 'build/icons/64x64.png');
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
                showMainWindow();
            },
        },
        {
            label: 'Open Debug Console',
            click: () => {
                showMainWindow();
                if (!mainWindow || mainWindow.isDestroyed()) return;
                void mainWindow.webContents.executeJavaScript("window.location.hash = '/debug'");
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
        showMainWindow();
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
    showMainWindow();
}

function showMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
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

function resolveTrayIconPath(): string | null {
    const candidates = [
        path.join(app.getAppPath(), 'build/lunatray.png'),
        path.join(app.getAppPath(), 'src/resources/lunatray.png'),
        path.join(__dirname, '../resources/lunatray.png'),
        path.join(process.cwd(), 'build/lunatray.png'),
        path.join(process.cwd(), 'src/resources/lunatray.png'),
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
    setAutoUpdateEnabled(settings.autoUpdateEnabled);
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(settings.language));
    }
    ensureTray();
}

function registerProtocolHandlers(): void {
    app.on('open-url', (event, url) => {
        event.preventDefault();
        queueMailtoUrl(url);
    });

    app.on('second-instance', (_event, argv) => {
        const mailtoUrl = findMailtoArg(argv);
        if (mailtoUrl) {
            queueMailtoUrl(mailtoUrl);
        } else {
            showMainWindow();
        }
    });
}

function installExternalNavigationPolicy(): void {
    app.on('web-contents-created', (_event, contents) => {
        contents.on('context-menu', (_menuEvent, params) => {
            const template: Electron.MenuItemConstructorOptions[] = [];
            const hasSelection = Boolean((params.selectionText || '').trim());
            const linkUrl = String(params.linkURL || '').trim();
            const hasLink = /^(https?:|mailto:)/i.test(linkUrl);
            const canEdit = Boolean(params.isEditable);
            const editFlags = params.editFlags ?? {};

            if (hasLink) {
                template.push({
                    label: 'Open Link',
                    click: () => {
                        handleExternalUrl(linkUrl);
                    },
                });
                template.push({
                    label: 'Copy Link Address',
                    click: () => {
                        clipboard.writeText(linkUrl);
                    },
                });
                template.push({type: 'separator'});
            }

            if (canEdit) {
                template.push({label: 'Cut', role: 'cut', enabled: Boolean(editFlags.canCut)});
                template.push({label: 'Copy', role: 'copy', enabled: Boolean(editFlags.canCopy)});
                template.push({label: 'Paste', role: 'paste', enabled: Boolean(editFlags.canPaste)});
                template.push({type: 'separator'});
            } else if (hasSelection) {
                template.push({label: 'Copy', role: 'copy'});
                template.push({type: 'separator'});
            }

            template.push({label: 'Select All', role: 'selectAll'});
            if (template.length === 0) return;
            const menu = Menu.buildFromTemplate(template);
            const owner = BrowserWindow.fromWebContents(contents) ?? undefined;
            if (owner) {
                menu.popup({window: owner});
                return;
            }
            menu.popup();
        });

        contents.setWindowOpenHandler(({url}) => {
            handleExternalUrl(url);
            return {action: 'deny'};
        });

        contents.on('will-navigate', (event, url) => {
            if (isInternalAppUrl(url)) return;
            event.preventDefault();
            handleExternalUrl(url);
        });
    });
}

function isInternalAppUrl(url: string): boolean {
    if (url === 'about:blank' || url === 'about:srcdoc') return true;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'file:') return true;
        if (isDev && (parsed.origin === 'http://127.0.0.1:5174' || parsed.origin === 'http://localhost:5174')) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function handleExternalUrl(url: string): void {
    if (!url) return;
    if (/^mailto:/i.test(url)) {
        queueMailtoUrl(url);
        return;
    }
    if (/^https?:/i.test(url)) {
        void shell.openExternal(url);
    }
}

function registerMailtoProtocolClient(): void {
    try {
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('mailto', process.execPath, [path.resolve(process.argv[1])]);
            }
            return;
        }
        app.setAsDefaultProtocolClient('mailto');
    } catch (error) {
        console.warn('Failed to register mailto protocol:', error);
    }
}

function queueMailtoUrl(url: string): void {
    if (!/^mailto:/i.test(url)) return;
    pendingMailtoUrls.push(url);
    flushPendingMailtoUrls();
}

function flushPendingMailtoUrls(): void {
    if (!app.isReady()) return;
    while (pendingMailtoUrls.length > 0) {
        const next = pendingMailtoUrls.shift();
        if (!next) continue;
        openComposeFromMailto(next);
    }
}

function openComposeFromMailto(url: string): void {
    const draft = parseComposeDraftFromMailto(url);
    if (!draft) return;
    void getAccounts().then((accounts) => {
        if (accounts.length === 0) {
            openAddAccountWindow(undefined);
            attachAddAccountWindowCloseBehavior();
            return;
        }
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
        }
        const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        openComposeWindow(parent, draft);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function parseComposeDraftFromMailto(url: string): ComposeDraftPayload | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol.toLowerCase() !== 'mailto:') return null;
        const toFromPath = splitAddressList(parsed.pathname);
        const toFromQuery = parsed.searchParams.getAll('to').flatMap(splitAddressList);
        const to = joinAddressList([...toFromPath, ...toFromQuery]);
        const cc = joinAddressList(parsed.searchParams.getAll('cc').flatMap(splitAddressList));
        const bcc = joinAddressList(parsed.searchParams.getAll('bcc').flatMap(splitAddressList));
        const subject = parsed.searchParams.get('subject')?.trim() || null;
        const bodyRaw = parsed.searchParams.get('body');
        const body = bodyRaw === null ? null : bodyRaw.replace(/\r\n/g, '\n');
        return {
            to,
            cc,
            bcc,
            subject,
            body,
        };
    } catch {
        return null;
    }
}

function splitAddressList(value: string): string[] {
    if (!value) return [];
    let decoded = value;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        // keep original value if decoding fails
    }
    return decoded
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function joinAddressList(items: string[]): string | null {
    if (items.length === 0) return null;
    return Array.from(new Set(items)).join(', ');
}

function findMailtoArg(argv: string[]): string | null {
    for (const arg of argv) {
        if (/^mailto:/i.test(arg)) return arg;
    }
    return null;
}

function attachAddAccountWindowCloseBehavior(): void {
    const wizard = getAddAccountWindow();
    if (!wizard || wizard.isDestroyed()) return;
    wizard.once('closed', () => {
        void maybeOpenMainWindowAfterAccountCreated();
    });
}

async function maybeOpenMainWindowAfterAccountCreated(): Promise<void> {
    const accounts = await getAccounts();
    if (accounts.length === 0) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    createWindow();
}

function closeMainWindowForNoAccounts(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const win = mainWindow;
    mainWindow = null;
    try {
        win.destroy();
    } catch {
        // ignore close failures
    }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
} else {
    registerProtocolHandlers();
    installExternalNavigationPolicy();

    app.whenReady().then(async () => {
        // Initialize database and IPC handlers
        initDb();
        await getAppSettings();
        applyRuntimeSettings();
        setUnreadCountListener((count) => {
            updateUnreadIndicators(count);
        });
        setAccountCountChangedListener((count) => {
            if (count > 0) return;
            closeMainWindowForNoAccounts();
            openAddAccountWindow(undefined);
            attachAddAccountWindowCloseBehavior();
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
        registerUpdaterIpc();
        registerWindowIpc();
        registerMailtoProtocolClient();
        initAutoUpdater((state) => {
            broadcastAutoUpdateState(state);
        });
        stopDebugForwarding = onDebugLog((entry) => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send('debug-log', entry);
            }
        });

        openSplashWindow();
        const startupUpdateResult = await runStartupUpdateFlow();
        if (startupUpdateResult === 'installing') {
            return;
        }
        closeSplashWindow();

        const accounts = await getAccounts();
        if (accounts.length === 0) {
            openAddAccountWindow(undefined);
            attachAddAccountWindowCloseBehavior();
        } else {
            createWindow();
        }
        const initialMailtoUrl = findMailtoArg(process.argv);
        if (initialMailtoUrl) {
            queueMailtoUrl(initialMailtoUrl);
        }
        flushPendingMailtoUrls();
        updateUnreadIndicators(getCurrentUnreadCount());
        startAccountAutoSync();

        app.on('activate', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                showMainWindow();
                return;
            }
            void getAccounts().then((rows) => {
                if (rows.length === 0) {
                    openAddAccountWindow(undefined);
                    attachAddAccountWindowCloseBehavior();
                    return;
                }
                showMainWindow();
            });
        });
    });

    app.on('before-quit', () => {
        isQuitting = true;
        if (stopDebugForwarding) {
            stopDebugForwarding();
            stopDebugForwarding = null;
        }
        stopAccountAutoSync();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
