import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {getAppSettingsSync, getSpellCheckerLanguages} from '../settings/store.js';
import {attachWindowShortcuts, buildSecureWebPreferences, createFramelessAppWindow} from './windowFactory.js';

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

    composeWin = createFramelessAppWindow({
        parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
        modal: false,
        width: 920,
        height: 760,
        minWidth: 760,
        minHeight: 620,
        title: 'Compose Email',
        webPreferences: buildSecureWebPreferences({
            preloadPath,
            spellcheck: true,
        }),
    });
    composeWin.webContents.session.setSpellCheckerLanguages(getSpellCheckerLanguages(getAppSettingsSync().language));
    attachWindowShortcuts(composeWin, {closeOnEscape: true});

    composeWin.on('closed', () => {
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
                query: {window: 'compose'},
            },
            {
                target: 'http://127.0.0.1:5174/src/renderer/window.html',
                query: {window: 'compose'},
            },
        ],
        prodFiles: [
            {
                target: path.join(__dirname, '..', '..', 'renderer/window.html'),
                query: {window: 'compose'},
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
