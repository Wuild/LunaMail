import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent';
import {getAppSettingsSync, getSpellCheckerLanguages} from '@main/settings/store';
import {
	attachWindowShortcuts,
	buildSecureWebPreferences,
	createAppWindow,
	createFramelessAppWindow,
} from './windowFactory';
import {loadWindowState} from './windowState';
import {__} from '@llamamail/app/i18n/main';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let composeWin: BrowserWindow | null = null;
let composeDraft: ComposeDraftPayload | null = null;
const COMPOSE_WINDOW_MIN_WIDTH = 760;
const COMPOSE_WINDOW_MIN_HEIGHT = 620;

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
	const windowState = loadWindowState({
		defaultWidth: 920,
		defaultHeight: 760,
		file: 'compose-window-stateon',
	});

	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	composeWin = createWindow({
		modal: false,
		width: windowState.width,
		height: windowState.height,
		x: windowState.x,
		y: windowState.y,
		minWidth: COMPOSE_WINDOW_MIN_WIDTH,
		minHeight: COMPOSE_WINDOW_MIN_HEIGHT,
		minimizable: true,
		maximizable: true,
		title: __('app.title.compose_email'),
		webPreferences: buildSecureWebPreferences({
			preloadPath,
			spellcheck: true,
		}),
	});
	windowState.restoreDisplayState(composeWin);
	windowState.attach(composeWin);
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
				hash: '/windows/compose',
			},
			{
				target: 'http://127.0.0.1:5174/src/renderer/window.html',
				hash: '/windows/compose',
			},
		],
		prodFiles: [
			{
				target: path.join(__dirname, '..', '..', 'build', 'renderer', 'window.html'),
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
