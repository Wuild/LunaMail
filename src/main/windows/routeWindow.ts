import {app, BrowserWindow} from 'electron';
import path from 'path';
import {fileURLToPath} from 'url';
import {getAppSettingsSync} from '@main/settings/store';
import {loadWindowContent} from './loadWindowContent';
import {
	attachWindowShortcuts,
	buildSecureWebPreferences,
	createAppWindow,
	createFramelessAppWindow,
} from './windowFactory';

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeRouteHash(route: string): string {
	const value = String(route || '').trim();
	if (!value) return '/';
	if (value.startsWith('#/')) return value.slice(1);
	if (value.startsWith('/')) return value;
	return `/${value}`;
}

function titleFromRoute(route: string): string {
	const normalized = normalizeRouteHash(route);
	const firstSegment = normalized.split('/').filter(Boolean)[0] || 'window';
	return firstSegment
		.split('-')
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');
}

export function openRouteWindow(route: string): BrowserWindow {
	const preloadPath = path.join(app.getAppPath(), 'preload.cjs');
	const useNativeTitleBar = Boolean(getAppSettingsSync().useNativeTitleBar);
	const createWindow = useNativeTitleBar ? createAppWindow : createFramelessAppWindow;
	const routeHash = normalizeRouteHash(route);

	const win = createWindow({
		modal: false,
		width: 1280,
		height: 820,
		minWidth: 760,
		minHeight: 560,
		maximizable: true,
		title: titleFromRoute(routeHash),
		webPreferences: buildSecureWebPreferences({preloadPath}),
	});
	attachWindowShortcuts(win);

	void loadWindowContent(win, {
		isDev,
		devUrls: [
			{target: 'http://127.0.0.1:5174/window.html', hash: routeHash},
			{target: 'http://127.0.0.1:5174/src/renderer/window.html', hash: routeHash},
		],
		prodFiles: [{target: path.join(__dirname, '..', '..', 'build', 'renderer', 'window.html'), hash: routeHash}],
		windowName: `route:${routeHash}`,
	}).catch((error) => {
		console.error(`Failed to load route window (${routeHash}):`, error);
	});

	return win;
}
