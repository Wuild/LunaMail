import {
    app,
    BrowserWindow,
    clipboard,
    ipcMain,
    Menu,
    nativeImage,
    nativeTheme,
    Notification,
    screen,
    shell,
    Tray,
} from "electron";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {createAppLogger, onDebugLog, resetDebugLogsForNewSession} from "./debug/debugLog.js";
import {initDb} from "./db/index.js";
import {getAccounts} from "./db/repositories/accountsRepo.js";
import {
    getCurrentUnreadCount,
    registerAccountIpc,
    setAccountCountChangedListener,
    setAutoSyncIntervalMinutes,
    setNewMailListener,
    setUnreadCountListener,
    startAccountAutoSync,
    stopAccountAutoSync,
    warmupAccountCaches,
} from "./ipc/accounts.js";
import {queueCloudOAuthCallbackUrl, registerCloudIpc} from "./ipc/cloud.js";
import {registerSettingsIpc} from "./ipc/settings.js";
import {broadcastAutoUpdateState, registerUpdaterIpc} from "./ipc/updater.js";
import {registerWindowIpc} from "./ipc/windows.js";
import {type AppSettings, getAppSettings, getAppSettingsSync, getSpellCheckerLanguages} from "./settings/store.js";
import {checkForUpdates, initAutoUpdater, runStartupUpdateFlow, setAutoUpdateEnabled} from "./updater/autoUpdate.js";
import type {ComposeDraftPayload} from "./windows/composeWindow.js";
import {openComposeWindow} from "./windows/composeWindow.js";
import {loadWindowContent} from "./windows/loadWindowContent.js";

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentUnreadCount = 0;
const pendingMailtoUrls: string[] = [];
let stopDebugForwarding: (() => void) | null = null;
let backgroundUpdateCheckTimer: ReturnType<typeof setInterval> | null = null;
let initialBackgroundUpdateCheckTimer: ReturnType<typeof setTimeout> | null = null;
let appStartupState: { status: "loading" | "warming" | "ready"; message: string | null } = {
    status: "loading",
    message: "Preparing startup...",
};
const appIconPath = resolveAppIconPath();
const linuxTrayIconPath = resolveLinuxTrayIconPath();
const windowsTrayIconPath = resolveWindowsTrayIconPath();
const appIconPngBase64 =
    appIconPath && fs.existsSync(appIconPath) ? fs.readFileSync(appIconPath).toString("base64") : null;
const mainWindowStatePath = path.join(app.getPath("userData"), "main-window-state.json");
const logger = createAppLogger("main");

type MainWindowState = {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized?: boolean;
};

function createWindow(): BrowserWindow {
    logger.info("Creating main window");
    const preloadPath = path.join(app.getAppPath(), "preload.cjs");
    const restoredState = loadMainWindowState();
    const normalizedState = normalizeWindowState(restoredState);
    const currentSettings = getAppSettingsSync();
    const useNativeTitleBar = Boolean(currentSettings.useNativeTitleBar);
    logger.debug("Window state restored=%s normalized=%s", Boolean(restoredState), Boolean(normalizedState));

    const win = new BrowserWindow({
        width: normalizedState?.width ?? 1200,
        height: normalizedState?.height ?? 800,
        ...(typeof normalizedState?.x === "number" && typeof normalizedState?.y === "number"
            ? {x: normalizedState.x, y: normalizedState.y}
            : {}),
        frame: useNativeTitleBar,
        ...(useNativeTitleBar ? {} : {titleBarStyle: "hidden" as const}),
        autoHideMenuBar: true,
        icon: appIconPath || undefined,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true,
        },
    });
    (win as BrowserWindow & { __usesNativeTitleBar?: boolean }).__usesNativeTitleBar = useNativeTitleBar;
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
    win.on("move", scheduleSaveState);
    win.on("resize", scheduleSaveState);
    win.on("maximize", scheduleSaveState);
    win.on("unmaximize", scheduleSaveState);
    win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(currentSettings.language));
    win.on("close", (event) => {
        const settings = getAppSettingsSync();
        if (isQuitting || !settings.minimizeToTray) return;
        event.preventDefault();
        win.hide();
        ensureTray();
    });
    win.on("closed", () => {
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
    logger.info("Main window created id=%d", win.id);
    ensureBackgroundUpdateChecks();
    win.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        const key = String(input.key || "").toLowerCase();
        const isF12 = key === "f12";
        const isCtrlShiftI = input.control && input.shift && key === "i";
        const isCmdAltI = input.meta && input.alt && key === "i";
        if (!isF12 && !isCtrlShiftI && !isCmdAltI) return;
        event.preventDefault();
        win.webContents.openDevTools({mode: "detach"});
    });

    if (isDev) {
        void loadWindowContent(win, {
            isDev,
            devUrls: ["http://127.0.0.1:5174/index.html", "http://127.0.0.1:5174/src/renderer/index.html"],
            prodFiles: [],
            windowName: "main",
        }).catch((error) => {
            console.error("Failed to load main window (dev):", error);
        });
        // win.webContents.openDevTools();
    } else {
        void loadWindowContent(win, {
            isDev,
            devUrls: [],
            prodFiles: [
                path.join(__dirname, "../renderer/index.html"),
                path.join(__dirname, "../renderer/src/renderer/index.html"),
            ],
            windowName: "main",
        }).catch((error) => {
            console.error("Failed to load main window (prod):", error);
        });
    }
    return win;
}

function triggerBackgroundUpdateCheck(reason: string): void {
    logger.info("Triggering background update check reason=%s", reason);
    void checkForUpdates().catch((error) => {
        logger.warn("Background update check failed reason=%s error=%s", reason, (error as any)?.message || String(error));
        console.warn(`Background update check failed (${reason}):`, error);
    });
}

function ensureBackgroundUpdateChecks(): void {
    if (initialBackgroundUpdateCheckTimer || backgroundUpdateCheckTimer) return;
    logger.info("Scheduling background update checks");
    initialBackgroundUpdateCheckTimer = setTimeout(() => {
        initialBackgroundUpdateCheckTimer = null;
        triggerBackgroundUpdateCheck("initial-main-window");
    }, 15000);
    backgroundUpdateCheckTimer = setInterval(
        () => {
            triggerBackgroundUpdateCheck("interval-main-window");
        },
        6 * 60 * 60 * 1000
    );
}

function loadMainWindowState(): MainWindowState | null {
    try {
        if (!fs.existsSync(mainWindowStatePath)) return null;
        const raw = fs.readFileSync(mainWindowStatePath, "utf8");
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
    const x = typeof state.x === "number" ? state.x : undefined;
    const y = typeof state.y === "number" ? state.y : undefined;
    if (typeof x !== "number" || typeof y !== "number") {
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
    b: { x: number; y: number; width: number; height: number }
): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function setAppStartupStatus(status: "loading" | "warming" | "ready", message: string | null = null): void {
    if (appStartupState.status === status && appStartupState.message === message) return;
    appStartupState = {status, message};
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("app-startup-status", appStartupState);
    }
}

function windowUsesNativeTitleBar(win: BrowserWindow | null): boolean {
    if (!win || win.isDestroyed()) return false;
    return Boolean((win as BrowserWindow & { __usesNativeTitleBar?: boolean }).__usesNativeTitleBar);
}

async function rebuildMainWindowForTitleBarMode(): Promise<void> {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const previousWindow = mainWindow;
    const wasVisible = previousWindow.isVisible();
    const wasMinimized = previousWindow.isMinimized();
    const routeHash = await previousWindow.webContents
        .executeJavaScript('window.location.hash || "#/email"')
        .catch(() => "#/email");

    mainWindow = null;
    try {
        previousWindow.destroy();
    } catch {
        // ignore close failures
    }

    const nextWindow = createWindow();

    const normalizedHash = String(routeHash || "#/email");
    const nextHashValue = normalizedHash.startsWith("#") ? normalizedHash.slice(1) : normalizedHash;
    nextWindow.webContents.once("did-finish-load", () => {
        if (nextWindow.isDestroyed()) return;
        void nextWindow.webContents
            .executeJavaScript(`window.location.hash = ${JSON.stringify(nextHashValue || "/email")};`)
            .catch(() => undefined);
    });

    if (wasVisible) {
        if (wasMinimized) {
            nextWindow.minimize();
        } else {
            showMainWindow();
        }
    } else {
        nextWindow.hide();
    }
}

function applyTitleBarSettingIfNeeded(settings: AppSettings): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const shouldUseNativeTitleBar = Boolean(settings.useNativeTitleBar);
    const currentUsesNativeTitleBar = windowUsesNativeTitleBar(mainWindow);
    if (shouldUseNativeTitleBar === currentUsesNativeTitleBar) return;
    void rebuildMainWindowForTitleBarMode().catch(() => undefined);
}

function openAddAccountModalInMainWindow(): void {
    showMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const send = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("open-add-account-modal");
    };
    if (mainWindow.webContents.isLoadingMainFrame()) {
        mainWindow.webContents.once("did-finish-load", send);
        return;
    }
    send();
}

function buildTrayIcon(unreadCount: number) {
    if (process.platform === "win32") {
        const trayPath = windowsTrayIconPath || appIconPath;
        if (trayPath) {
            const image = nativeImage.createFromPath(trayPath);
            if (!image.isEmpty()) {
                return image.resize({width: 16, height: 16});
            }
        }
    }

    if (process.platform === "linux") {
        const trayPath = linuxTrayIconPath || appIconPath || path.join(app.getAppPath(), "build/icons/64x64.png");
        const image = nativeImage.createFromPath(trayPath);
        if (!image.isEmpty()) {
            return image.resize({width: 22, height: 22});
        }
    }

    const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
    const showBadge = unreadCount > 0;
    const fontSize = badgeText.length > 2 ? 8 : 10;
    const badge = showBadge
        ? `<circle cx="24" cy="8" r="7" fill="#ef4444"/><text x="24" y="11" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${badgeText}</text>`
        : "";
    const baseIcon = appIconPngBase64
        ? `<image href="data:image/png;base64,${appIconPngBase64}" x="0" y="0" width="32" height="32"/>`
        : `<rect x="3" y="3" width="26" height="26" rx="7" fill="#5865f2"/><path d="M8 11h16v10H8z" fill="#fff" opacity="0.96"/><path d="M8 11l8 6 8-6" fill="none" stroke="#5865f2" stroke-width="2"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${baseIcon}${badge}</svg>`;
    const encoded = Buffer.from(svg).toString("base64");
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${encoded}`);
}

function ensureTray(): void {
    if (tray) return;
    tray = new Tray(buildTrayIcon(currentUnreadCount));
    tray.setToolTip(buildTrayTooltip(currentUnreadCount));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Show LunaMail",
            click: () => {
                showMainWindow();
            },
        },
        {
            label: "Open Debug Console",
            click: () => {
                showMainWindow();
                if (!mainWindow || mainWindow.isDestroyed()) return;
                void mainWindow.webContents.executeJavaScript("window.location.hash = '/debug'");
            },
        },
        {
            label: "Quit",
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
        showMainWindow();
    });
}

function buildTrayTooltip(unreadCount: number): string {
    if (unreadCount <= 0) return "LunaMail";
    return `LunaMail (${unreadCount} unread)`;
}

function buildTaskbarOverlayIcon(unreadCount: number) {
    if (unreadCount <= 0) return null;
    const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
    const fontSize = badgeText.length > 2 ? 8 : 10;
    const badge = `<circle cx="24" cy="8" r="7" fill="#ef4444"/><text x="24" y="11" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${badgeText}</text>`;
    const baseIcon = appIconPngBase64
        ? `<image href="data:image/png;base64,${appIconPngBase64}" x="0" y="0" width="32" height="32"/>`
        : `<rect x="3" y="3" width="26" height="26" rx="7" fill="#5865f2"/><path d="M8 11h16v10H8z" fill="#fff" opacity="0.96"/><path d="M8 11l8 6 8-6" fill="none" stroke="#5865f2" stroke-width="2"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${baseIcon}${badge}</svg>`;
    const encoded = Buffer.from(svg).toString("base64");
    const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${encoded}`);
    if (image.isEmpty()) return null;
    return image.resize({width: 16, height: 16});
}

function updateUnreadIndicators(unreadCount: number): void {
    currentUnreadCount = Math.max(0, Number(unreadCount) || 0);
    ensureTray();

    if (tray) {
        tray.setImage(buildTrayIcon(currentUnreadCount));
        tray.setToolTip(buildTrayTooltip(currentUnreadCount));
    }

    const label = currentUnreadCount > 0 ? String(currentUnreadCount) : "";
    try {
        app.setBadgeCount(currentUnreadCount);
    } catch {
        // ignore unsupported badge count APIs
    }
    if (process.platform === "darwin" && app.dock) {
        app.dock.setBadge(label);
    }
    const overlayIcon = process.platform === "win32" ? buildTaskbarOverlayIcon(currentUnreadCount) : null;
    for (const win of BrowserWindow.getAllWindows()) {
        if (process.platform === "win32") {
            win.setOverlayIcon(overlayIcon, label ? `${label} unread` : "");
        }
        win.setTitle(currentUnreadCount > 0 ? `LunaMail (${currentUnreadCount})` : "LunaMail");
    }
}

function focusMainWindowAndOpenMessage(
    target: {
    accountId: number;
    folderPath: string;
        messageId: number;
    } | null
): void {
    showMainWindow();
    if (!target) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const sendTarget = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            mainWindow.webContents.send("open-message-target", target);
        } catch {
            // ignore renderer messaging failures from notification click handlers
        }
    };

    const navigateToMailThenSendTarget = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const wc = mainWindow.webContents;
        void wc
            .executeJavaScript(
                `
            try {
                if (!window.location.hash.startsWith('#/email')) {
                    window.location.hash = '/email';
                }
            } catch {
                // ignore route adjustment failures
            }
        `
            )
            .catch(() => undefined)
            .finally(() => {
                setTimeout(sendTarget, 120);
            });
    };

    if (mainWindow.webContents.isLoadingMainFrame()) {
        mainWindow.webContents.once("did-finish-load", () => {
            navigateToMailThenSendTarget();
        });
        return;
    }
    navigateToMailThenSendTarget();
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
        path.join(app.getAppPath(), "build/icon.ico"),
        path.join(app.getAppPath(), "build/icons/512x512.png"),
        path.join(app.getAppPath(), "build/icon.png"),
        path.join(app.getAppPath(), "src/resources/luna.ico"),
        path.join(app.getAppPath(), "src/resources/luna.png"),
        path.join(__dirname, "../resources/luna.ico"),
        path.join(__dirname, "../resources/luna.png"),
        path.join(process.cwd(), "build/icon.ico"),
        path.join(process.cwd(), "build/icons/512x512.png"),
        path.join(process.cwd(), "build/icon.png"),
        path.join(process.cwd(), "src/resources/luna.ico"),
        path.join(process.cwd(), "src/resources/luna.png"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function resolveLinuxTrayIconPath(): string | null {
    const candidates = [
        path.join(app.getAppPath(), "build/lunatray.png"),
        path.join(app.getAppPath(), "src/resources/lunatray.png"),
        path.join(__dirname, "../resources/lunatray.png"),
        path.join(process.cwd(), "build/lunatray.png"),
        path.join(process.cwd(), "src/resources/lunatray.png"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function resolveWindowsTrayIconPath(): string | null {
    const candidates = [
        path.join(app.getAppPath(), "build/lunatray.ico"),
        path.join(app.getAppPath(), "build/icon.ico"),
        path.join(app.getAppPath(), "src/resources/lunatray.ico"),
        path.join(app.getAppPath(), "src/resources/luna.ico"),
        path.join(__dirname, "../resources/lunatray.ico"),
        path.join(__dirname, "../resources/luna.ico"),
        path.join(process.cwd(), "build/lunatray.ico"),
        path.join(process.cwd(), "build/icon.ico"),
        path.join(process.cwd(), "src/resources/lunatray.ico"),
        path.join(process.cwd(), "src/resources/luna.ico"),
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
    logger.info(
        "Applying runtime settings theme=%s syncInterval=%d autoUpdate=%s",
        settings.theme,
        settings.syncIntervalMinutes,
        settings.autoUpdateEnabled
    );
    nativeTheme.themeSource = settings.theme === "system" ? "system" : settings.theme;
    setAutoSyncIntervalMinutes(settings.syncIntervalMinutes);
    setAutoUpdateEnabled(settings.autoUpdateEnabled);
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(settings.language));
    }
    ensureTray();
}

function registerProtocolHandlers(): void {
    app.on("open-url", (event, url) => {
        event.preventDefault();
        logger.info("Received open-url event url=%s", url);
        if (queueCloudOAuthCallbackUrl(url)) return;
        queueMailtoUrl(url);
    });

    app.on("second-instance", (_event, argv) => {
        logger.info("Received second-instance event args=%d", argv.length);
        const oauthUrl = findCloudOAuthArg(argv);
        if (oauthUrl) {
            queueCloudOAuthCallbackUrl(oauthUrl);
            showMainWindow();
            return;
        }
        const mailtoUrl = findMailtoArg(argv);
        if (mailtoUrl) {
            queueMailtoUrl(mailtoUrl);
        } else {
            showMainWindow();
        }
    });
}

function installExternalNavigationPolicy(): void {
    app.on("web-contents-created", (_event, contents) => {
        logger.debug("web-contents-created id=%d", contents.id);
        contents.on("context-menu", (_menuEvent, params) => {
            const frameUrl = String((params as any)?.frameURL || "");
            const pageUrl = String((params as any)?.pageURL || contents.getURL() || "");
            const isIframeContext = Boolean(frameUrl) && frameUrl !== pageUrl;
            const isMailContentFrame = isIframeContext && /^about:srcdoc/i.test(frameUrl);
            const isDebugPage = /#\/debug(?:[/?]|$)/i.test(pageUrl);
            if (!isMailContentFrame && !isDebugPage) {
                // Renderer-level custom menus handle non-iframe contexts.
                return;
            }

            const template: Electron.MenuItemConstructorOptions[] = [];
            const hasSelection = Boolean((params.selectionText || "").trim());
            const linkUrl = String(params.linkURL || "").trim();
            const hasLink = /^(https?:|mailto:)/i.test(linkUrl);
            const canEdit = Boolean(params.isEditable);
            const editFlags = params.editFlags ?? {};

            if (hasLink) {
                template.push({
                    label: "Open Link",
                    click: () => {
                        handleExternalUrl(linkUrl);
                    },
                });
                template.push({
                    label: "Copy Link Address",
                    click: () => {
                        clipboard.writeText(linkUrl);
                    },
                });
                template.push({type: "separator"});
            }

            if (canEdit) {
                template.push({label: "Cut", role: "cut", enabled: Boolean(editFlags.canCut)});
                template.push({label: "Copy", role: "copy", enabled: Boolean(editFlags.canCopy)});
                template.push({label: "Paste", role: "paste", enabled: Boolean(editFlags.canPaste)});
                template.push({type: "separator"});
            } else if (hasSelection) {
                template.push({label: "Copy", role: "copy"});
                template.push({type: "separator"});
            }

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
            if (isInternalAppUrl(url)) {
                return {action: "deny"};
            }
            logger.info("Blocked external window open and delegated to external handler url=%s", url);
            handleExternalUrl(url);
            return {action: "deny"};
        });

        contents.on("will-navigate", (event, url) => {
            if (isInternalAppUrl(url)) return;
            event.preventDefault();
            logger.info("Blocked navigation and delegated to external handler url=%s", url);
            handleExternalUrl(url);
        });

        contents.on("update-target-url", (_event, url) => {
            contents.send("link-hover-url", url || "");
        });
    });
}

function isInternalAppUrl(url: string): boolean {
    if (url === "about:blank" || url === "about:srcdoc") return true;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "file:") return true;
        if (isDev && (parsed.origin === "http://127.0.0.1:5174" || parsed.origin === "http://localhost:5174")) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function handleExternalUrl(url: string): void {
    if (!url) return;
    logger.debug("Handling external url=%s", url);
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
        logger.info("Registering protocol clients: mailto + lunamail");
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient("mailto", process.execPath, [path.resolve(process.argv[1])]);
                app.setAsDefaultProtocolClient("lunamail", process.execPath, [path.resolve(process.argv[1])]);
            }
            return;
        }
        app.setAsDefaultProtocolClient("mailto");
        app.setAsDefaultProtocolClient("lunamail");
    } catch (error) {
        logger.warn("Failed to register protocol clients: %s", (error as any)?.message || String(error));
        console.warn("Failed to register protocol clients:", error);
    }
}

function queueMailtoUrl(url: string): void {
    if (!/^mailto:/i.test(url)) return;
    logger.info("Queueing mailto url=%s", url);
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
    logger.info("Opening compose from mailto");
    const draft = parseComposeDraftFromMailto(url);
    if (!draft) return;
    void getAccounts().then((accounts) => {
        if (accounts.length === 0) {
            openAddAccountModalInMainWindow();
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
        if (parsed.protocol.toLowerCase() !== "mailto:") return null;
        const toFromPath = splitAddressList(parsed.pathname);
        const toFromQuery = parsed.searchParams.getAll("to").flatMap(splitAddressList);
        const to = joinAddressList([...toFromPath, ...toFromQuery]);
        const cc = joinAddressList(parsed.searchParams.getAll("cc").flatMap(splitAddressList));
        const bcc = joinAddressList(parsed.searchParams.getAll("bcc").flatMap(splitAddressList));
        const subject = parsed.searchParams.get("subject")?.trim() || null;
        const bodyRaw = parsed.searchParams.get("body");
        const body = bodyRaw === null ? null : bodyRaw.replace(/\r\n/g, "\n");
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
    return Array.from(new Set(items)).join(", ");
}

function findMailtoArg(argv: string[]): string | null {
    for (const arg of argv) {
        if (/^mailto:/i.test(arg)) return arg;
    }
    return null;
}

function findCloudOAuthArg(argv: string[]): string | null {
    for (const arg of argv) {
        if (/^lunamail:\/\/azure\/auth\b/i.test(arg)) return arg;
    }
    return null;
}

function configureLinuxDesktopEntryName(): void {
    if (process.platform !== "linux") return;
    const runtimeDesktop = String(process.env.CHROME_DESKTOP || "").trim();
    const desktopNames = [runtimeDesktop, `${app.getName().toLowerCase()}.desktop`, `${app.getName()}.desktop`].filter(
        Boolean
    );
    for (const desktopName of desktopNames) {
        try {
            (app as any).setDesktopName?.(desktopName);
            logger.info("Linux desktop name set to %s", desktopName);
            break;
        } catch {
            // try next candidate
        }
    }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    logger.warn("Single instance lock unavailable, quitting");
    app.quit();
} else {
    configureLinuxDesktopEntryName();
    registerProtocolHandlers();
    installExternalNavigationPolicy();

    app.whenReady().then(async () => {
        resetDebugLogsForNewSession();
        logger.info("App ready start");
        ipcMain.handle("get-app-startup-status", async () => appStartupState);
        // Initialize database and IPC handlers
        initDb();
        logger.info("Database initialized");
        await getAppSettings();
        applyRuntimeSettings();
        setUnreadCountListener((count) => {
            updateUnreadIndicators(count);
        });
        setAccountCountChangedListener((count) => {
            if (count > 0) return;
            openAddAccountModalInMainWindow();
        });
        setNewMailListener(({newMessages, source, target}) => {
            if (newMessages <= 0) return;
            if (source === "send") return;
            if (!Notification.isSupported()) return;
            const title = newMessages === 1 ? "New email received" : `${newMessages} new emails`;
            const body = source === "startup" ? "Mailbox synced with new unread messages." : "You have new unread messages.";
            try {
                const notification = new Notification({title, body, silent: false});
                notification.on("click", () => {
                    focusMainWindowAndOpenMessage(target);
                });
                notification.show();
                playNotificationSound();
            } catch {
                // ignore notification failures
            }
        });
        registerAccountIpc();
        registerCloudIpc();
        registerSettingsIpc((settings) => {
            applyRuntimeSettings();
            applyTitleBarSettingIfNeeded(settings);
        });
        registerUpdaterIpc();
        registerWindowIpc();
        logger.info("IPC handlers registered");
        registerMailtoProtocolClient();
        initAutoUpdater((state) => {
            broadcastAutoUpdateState(state);
        });
        logger.info("Auto updater initialized");
        stopDebugForwarding = onDebugLog((entry) => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send("debug-log", entry);
            }
        });
        logger.info("Debug forwarding active");

        createWindow();
        setAppStartupStatus("loading", "Checking updates...");
        const startupUpdateResult = await runStartupUpdateFlow();
        logger.info("Startup update flow result=%s", startupUpdateResult);
        if (startupUpdateResult === "installing") {
            return;
        }

        const accounts = await getAccounts();
        logger.info("Loaded accounts count=%d", accounts.length);
        if (accounts.length === 0) {
            setAppStartupStatus("ready", null);
            openAddAccountModalInMainWindow();
        } else {
            setAppStartupStatus("warming", "Warming up mailbox cache...");
            const warmupResult = await warmupAccountCaches();
            logger.info(
                "Startup warmup complete accounts=%d synced=%d failed=%d",
                warmupResult.accounts,
                warmupResult.synced,
                warmupResult.failed
            );
            setAppStartupStatus("ready", null);
        }
        const initialMailtoUrl = findMailtoArg(process.argv);
        const initialOAuthUrl = findCloudOAuthArg(process.argv);
        if (initialOAuthUrl) {
            queueCloudOAuthCallbackUrl(initialOAuthUrl);
        }
        if (initialMailtoUrl) {
            queueMailtoUrl(initialMailtoUrl);
        }
        flushPendingMailtoUrls();
        updateUnreadIndicators(getCurrentUnreadCount());
        startAccountAutoSync();
        logger.info("Auto sync started");

        app.on("activate", () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                showMainWindow();
                return;
            }
            void getAccounts().then((rows) => {
                if (rows.length === 0) {
                    openAddAccountModalInMainWindow();
                    return;
                }
                showMainWindow();
            });
        });
    });

    app.on("before-quit", () => {
        logger.info("App before-quit");
        isQuitting = true;
        if (initialBackgroundUpdateCheckTimer) {
            clearTimeout(initialBackgroundUpdateCheckTimer);
            initialBackgroundUpdateCheckTimer = null;
        }
        if (backgroundUpdateCheckTimer) {
            clearInterval(backgroundUpdateCheckTimer);
            backgroundUpdateCheckTimer = null;
        }
        if (stopDebugForwarding) {
            stopDebugForwarding();
            stopDebugForwarding = null;
        }
        stopAccountAutoSync();
        logger.info("Auto sync stopped");
    });

    app.on("window-all-closed", () => {
        logger.info("window-all-closed platform=%s", process.platform);
        if (process.platform !== "darwin") app.quit();
    });
}
