import {app} from 'electron';
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

const messageWindowTargets = new Map<number, number | null>();

export function openMessageWindow(messageId?: number | null): void {
	const messageTargetId = typeof messageId === 'number' ? messageId : null;
	const preloadPath = path.join(app.getAppPath(), 'preload.cjs');

	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	const messageWin = createWindow({
		modal: false,
		width: 980,
		height: 760,
		minWidth: 760,
		minHeight: 560,
		maximizable: true,
		title: __('app.title.message'),
		webPreferences: buildSecureWebPreferences({preloadPath}),
	});
	attachWindowShortcuts(messageWin, {closeOnEscape: true});
	const messageWebContentsId = messageWin.webContents.id;
	messageWindowTargets.set(messageWebContentsId, messageTargetId);

	messageWin.on('closed', () => {
		messageWindowTargets.delete(messageWebContentsId);
	});

	messageWin.webContents.on('did-finish-load', () => {
		if (messageWin.isDestroyed()) return;
		messageWin.webContents.send('message-window-target', messageTargetId);
	});

	void loadWindowContent(messageWin, {
		isDev,
		devUrls: [
			{
				target: 'http://127.0.0.1:5174/window.html',
				hash: '/windows/message',
			},
			{
				target: 'http://127.0.0.1:5174/src/renderer/window.html',
				hash: '/windows/message',
			},
		],
		prodFiles: [
			{
				target: path.join(__dirname, '..', '..', 'renderer/window.html'),
				hash: '/windows/message',
			},
		],
		windowName: 'message',
	}).catch((error) => {
		console.error('Failed to load message window:', error);
	});
}

export function getMessageWindowTargetId(webContentsId?: number | null): number | null {
	if (typeof webContentsId !== 'number' || !Number.isFinite(webContentsId)) return null;
	return messageWindowTargets.get(webContentsId) ?? null;
}
