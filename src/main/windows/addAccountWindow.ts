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
import {__} from '@llamamail/app/i18n/main';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let addAccountWin: BrowserWindow | null = null;

export function openAddAccountWindow(): void {
	if (addAccountWin && !addAccountWin.isDestroyed()) {
		if (addAccountWin.isMinimized()) {
			addAccountWin.restore();
		}
		if (!addAccountWin.isVisible()) {
			addAccountWin.show();
		}
		addAccountWin.focus();
		return;
	}

	const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	addAccountWin = createWindow({
		modal: false,
		width: 960,
		height: 700,
		minWidth: 960,
		minHeight: 700,
		maxWidth: 1400,
		maxHeight: 1000,
		minimizable: false,
		maximizable: false,
		resizable: true,
		title: __('app.title.add_account'),
		webPreferences: buildSecureWebPreferences({preloadPath}),
	});
	addAccountWin.setMaximizable(false);
	attachWindowShortcuts(addAccountWin, {closeOnEscape: true});

	addAccountWin.on('closed', () => {
		addAccountWin = null;
	});

	void loadWindowContent(addAccountWin, {
		isDev,
		devUrls: [
			{
				target: 'http://127.0.0.1:5174/window.html',
				hash: '/windows/add-account',
			},
			{
				target: 'http://127.0.0.1:5174/src/renderer/window.html',
				hash: '/windows/add-account',
			},
		],
		prodFiles: [
			{
				target: path.join(__dirname, '..', '..', 'build', 'renderer', 'window.html'),
				hash: '/windows/add-account',
			},
		],
		windowName: 'add-account',
	}).catch((error) => {
		console.error('Failed to load add-account window:', error);
	});
}

export function getAddAccountWindow(): BrowserWindow | null {
	return addAccountWin;
}
