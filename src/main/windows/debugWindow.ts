import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {loadWindowContent} from './loadWindowContent';
import {getAppSettingsSync} from '@main/settings/store';
import {
	attachWindowShortcuts,
	buildSecureWebPreferences,
	createAppWindow,
	createFramelessAppWindow,
} from './windowFactory';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let debugWin: BrowserWindow | null = null;

export function openDebugWindow(): void {
	if (debugWin && !debugWin.isDestroyed()) {
		if (debugWin.isMinimized()) {
			debugWin.restore();
		}
		if (!debugWin.isVisible()) {
			debugWin.show();
		}
		debugWin.focus();
		return;
	}

	const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	debugWin = createWindow({
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
				hash: '/windows/debug',
			},
			{
				target: 'http://127.0.0.1:5174/src/renderer/window.html',
				hash: '/windows/debug',
			},
		],
		prodFiles: [
			{
				target: path.join(__dirname, '..', '..', 'build', 'renderer', 'window.html'),
				hash: '/windows/debug',
			},
		],
		windowName: 'debug',
	}).catch((error) => {
		console.error('Failed to load debug window:', error);
	});
}
