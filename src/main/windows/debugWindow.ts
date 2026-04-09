import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent.js';
import {getAppSettingsSync} from '../settings/store.js';
import {attachWindowShortcuts, buildSecureWebPreferences, createAppWindow, createFramelessAppWindow} from './windowFactory.js';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let debugWin: BrowserWindow | null = null;

export function openDebugWindow(parentWindow?: BrowserWindow): void {
	if (debugWin && !debugWin.isDestroyed()) {
		debugWin.focus();
		return;
	}

	const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
	const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;
	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	debugWin = createWindow({
		parent,
		modal: false,
		width: 1020,
		height: 760,
		minWidth: 760,
		minHeight: 560,
		maximizable: true,
		title: 'Debug Console',
		webPreferences: buildSecureWebPreferences({preloadPath}),
	});
	attachWindowShortcuts(debugWin, {closeOnEscape: true});

	debugWin.on('closed', () => {
		debugWin = null;
	});

	void loadWindowContent(debugWin, {
		isDev,
		devUrls: [
			{
				target: 'http://127.0.0.1:5174/window.html',
				query: {window: 'debug'},
			},
			{
				target: 'http://127.0.0.1:5174/src/renderer/window.html',
				query: {window: 'debug'},
			},
		],
		prodFiles: [
			{
				target: path.join(__dirname, '..', '..', 'renderer/window.html'),
				query: {window: 'debug'},
			},
		],
		windowName: 'debug',
	}).catch((error) => {
		console.error('Failed to load debug window:', error);
	});
}
