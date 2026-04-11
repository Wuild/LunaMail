import {app, BrowserWindow, screen} from 'electron';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {getAppSettingsSync, getSpellCheckerLanguages} from '@main/settings/store.js';
import {
    attachWindowShortcuts,
    buildSecureWebPreferences,
    createAppWindow,
    createFramelessAppWindow,
} from './windowFactory.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let composeWin: BrowserWindow | null = null;
let composeDraft: ComposeDraftPayload | null = null;
const COMPOSE_WINDOW_MIN_WIDTH = 760;
const COMPOSE_WINDOW_MIN_HEIGHT = 620;
const composeWindowStatePath = path.join(app.getPath('userData'), 'compose-window-state.json');

type ComposeWindowState = {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized?: boolean;
};

export interface ComposeDraftPayload {
    accountId?: number | null;
    draftMessageId?: number | null;
    draftSessionId?: string | null;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    body?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    quotedBodyHtml?: string | null;
    quotedBodyText?: string | null;
    quotedAllowRemote?: boolean;
    inReplyTo?: string | null;
    references?: string[] | string | null;
}

export function openComposeWindow(parentWindow?: BrowserWindow, draft?: ComposeDraftPayload | null): void {
    composeDraft = draft ?? null;

    if (composeWin && !composeWin.isDestroyed()) {
        pushDraftToComposeWindow();
        if (composeWin.isMinimized()) {
            composeWin.restore();
        }
        if (!composeWin.isVisible()) {
            composeWin.show();
        }
        composeWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
    const restoredState = loadComposeWindowState();
    const normalizedState = normalizeComposeWindowState(restoredState);

    const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
    const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
    composeWin = createWindow({
        modal: false,
        width: normalizedState?.width ?? 920,
        height: normalizedState?.height ?? 760,
        ...(typeof normalizedState?.x === 'number' && typeof normalizedState?.y === 'number'
            ? {x: normalizedState.x, y: normalizedState.y}
            : {}),
        minWidth: COMPOSE_WINDOW_MIN_WIDTH,
        minHeight: COMPOSE_WINDOW_MIN_HEIGHT,
        minimizable: true,
        maximizable: true,
        title: 'Compose Email',
        webPreferences: buildSecureWebPreferences({
            preloadPath,
            spellcheck: true,
        }),
    });
    if (normalizedState?.isMaximized) {
        composeWin.maximize();
    }
    composeWin.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(getAppSettingsSync().language));
    attachWindowShortcuts(composeWin, {closeOnEscape: true});

    let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSaveState = () => {
        if (saveStateTimer) clearTimeout(saveStateTimer);
        saveStateTimer = setTimeout(() => {
            saveStateTimer = null;
            if (!composeWin) return;
            saveComposeWindowState(composeWin);
        }, 200);
    };
    composeWin.on('move', scheduleSaveState);
    composeWin.on('resize', scheduleSaveState);
    composeWin.on('maximize', scheduleSaveState);
    composeWin.on('unmaximize', scheduleSaveState);

    composeWin.on('closed', () => {
        if (saveStateTimer) {
            clearTimeout(saveStateTimer);
            saveStateTimer = null;
        }
        if (composeWin && !composeWin.isDestroyed()) {
            saveComposeWindowState(composeWin);
        }
        composeWin = null;
    });

    composeWin.webContents.on('did-finish-load', () => {
        pushDraftToComposeWindow();
    });

    void loadWindowContent(composeWin, {
        isDev,
        devUrls: [
            {
                target: 'http://127.0.0.1:5174/window.html',
                hash: '/windows/compose',
            },
            {
                target: 'http://127.0.0.1:5174/src/renderer/window.html',
                hash: '/windows/compose',
            },
        ],
        prodFiles: [
            {
                target: path.join(__dirname, '..', '..', 'renderer/window.html'),
                hash: '/windows/compose',
            },
        ],
        windowName: 'compose',
    }).catch((error) => {
        console.error('Failed to load compose window:', error);
    });
}

export function getComposeDraft(): ComposeDraftPayload | null {
    return composeDraft;
}

function pushDraftToComposeWindow(): void {
    if (!composeWin || composeWin.isDestroyed()) return;
    composeWin.webContents.send('compose-draft', composeDraft);
}

function loadComposeWindowState(): ComposeWindowState | null {
    try {
        if (!fs.existsSync(composeWindowStatePath)) return null;
        const raw = fs.readFileSync(composeWindowStatePath, 'utf8');
        if (!raw.trim()) return null;
        const parsed = JSON.parse(raw) as Partial<ComposeWindowState>;
        if (!Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
        return {
            width: Math.max(COMPOSE_WINDOW_MIN_WIDTH, Number(parsed.width)),
            height: Math.max(COMPOSE_WINDOW_MIN_HEIGHT, Number(parsed.height)),
            ...(Number.isFinite(parsed.x) ? {x: Number(parsed.x)} : {}),
            ...(Number.isFinite(parsed.y) ? {y: Number(parsed.y)} : {}),
            isMaximized: Boolean(parsed.isMaximized),
        };
    } catch {
        return null;
    }
}

function saveComposeWindowState(win: BrowserWindow): void {
    try {
        if (win.isDestroyed()) return;
        const bounds = win.getBounds();
        const nextState: ComposeWindowState = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: win.isMaximized(),
        };
        fs.writeFileSync(composeWindowStatePath, JSON.stringify(nextState));
    } catch {
        // ignore window state persistence failures
    }
}

function normalizeComposeWindowState(state: ComposeWindowState | null): ComposeWindowState | null {
    if (!state) return null;
    const displays = screen.getAllDisplays();
    if (displays.length === 0) return state;

    const width = Math.max(COMPOSE_WINDOW_MIN_WIDTH, state.width);
    const height = Math.max(COMPOSE_WINDOW_MIN_HEIGHT, state.height);
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
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
