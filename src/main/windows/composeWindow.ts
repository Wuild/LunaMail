import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {getAppSettingsSync, getSpellCheckerLanguages} from '../settings/store.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let composeWin: BrowserWindow | null = null;
let composeDraft: ComposeDraftPayload | null = null;

export interface ComposeDraftPayload {
    accountId?: number | null;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    body?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
}

export function openComposeWindow(parentWindow?: BrowserWindow, draft?: ComposeDraftPayload | null): void {
    composeDraft = draft ?? null;

    if (composeWin && !composeWin.isDestroyed()) {
        pushDraftToComposeWindow();
        composeWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

    composeWin = new BrowserWindow({
        parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
        modal: false,
        frame: false,
        titleBarStyle: 'hidden',
        width: 920,
        height: 760,
        minWidth: 760,
        minHeight: 620,
        autoHideMenuBar: true,
        title: 'Compose Email',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true,
        },
    });
    composeWin.setMenuBarVisibility(false);
    composeWin.removeMenu();
    composeWin.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(getAppSettingsSync().language));

    if (isDev) {
        composeWin.webContents.on('before-input-event', (_event, input) => {
            if (input.type === 'keyDown' && input.key === 'Escape') {
                if (composeWin && !composeWin.isDestroyed()) {
                    composeWin.close();
                }
                return;
            }
            const isF12 = input.type === 'keyDown' && input.key === 'F12';
            const isCtrlShiftI = input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i';
            const isCmdAltI = input.type === 'keyDown' && input.meta && input.alt && input.key.toLowerCase() === 'i';
            if (isF12 || isCtrlShiftI || isCmdAltI) {
                if (composeWin && !composeWin.isDestroyed()) {
                    composeWin.webContents.openDevTools({mode: 'detach'});
                }
            }
        });
    } else {
        composeWin.webContents.on('before-input-event', (_event, input) => {
            if (input.type === 'keyDown' && input.key === 'Escape') {
                if (composeWin && !composeWin.isDestroyed()) {
                    composeWin.close();
                }
            }
        });
    }

    composeWin.on('closed', () => {
        composeWin = null;
    });

    composeWin.webContents.on('did-finish-load', () => {
        pushDraftToComposeWindow();
    });

    void loadWindowContent(composeWin, {
        isDev,
        devUrls: ['http://127.0.0.1:5174/compose.html', 'http://127.0.0.1:5174/src/renderer/compose.html'],
        prodFiles: [
            path.join(__dirname, '..', '..', 'renderer/compose.html'),
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
