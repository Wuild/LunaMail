import {app, Menu, nativeImage, Tray} from 'electron';
import path from 'node:path';
import {APP_NAME} from '@llamamail/app/appConfig';
import {__} from '@llamamail/app/i18n/main';

type TrayControllerDeps = {
	appName?: string;
	appIconPath: string | null;
	isActionsEnabled: () => boolean;
	onShowApp: () => void;
	onCompose: () => void;
	onNavigate: (route: string) => void;
	onQuit: () => void;
};

type TrayState = {
	tray: Tray | null;
	deps: TrayControllerDeps | null;
	unreadCount: number;
	lastGoodIcon: Electron.NativeImage | null;
};

const state: TrayState = {
	tray: null,
	deps: null,
	unreadCount: 0,
	lastGoodIcon: null,
};

function runAsync(fn: () => void) {
	setTimeout(fn, 0);
}

/* ---------------------------------- */
/* Public API */

/* ---------------------------------- */

export function initTray(deps: TrayControllerDeps): void {
	state.deps = deps;
}

export const tray = {
	ensure() {
		if (!state.deps) return;
		if (state.tray) return;

		const deps = state.deps;
		const appName = deps.appName || APP_NAME;

		const icon = resolveBestTrayIcon(deps.appIconPath);
		state.tray = new Tray(icon);
		state.tray.setToolTip(buildTrayTooltip(appName, state.unreadCount));

		buildMenu();

		state.tray.on('double-click', () => {
			runAsync(() => deps.onShowApp());
		});

		state.tray.on('click', () => {
			if (process.platform !== 'linux') return;
			runAsync(() => deps.onShowApp());
		});
	},

	setUnread(count: number) {
		state.unreadCount = count;

		if (!state.tray || !state.deps) return;

		const appName = state.deps.appName || APP_NAME;
		state.tray.setToolTip(buildTrayTooltip(appName, count));
	},

	refresh() {
		if (!state.tray || !state.deps) return;
		const appName = state.deps.appName || APP_NAME;
		state.tray.setToolTip(buildTrayTooltip(appName, state.unreadCount));
		buildMenu();
	},

	isReady() {
		return !!state.tray;
	},
};

function buildMenu() {
	if (!state.tray || !state.deps) return;

	const deps = state.deps;
	const appName = deps.appName || APP_NAME;
	const canUseMainWindowActions = deps.isActionsEnabled();

	const contextMenu = Menu.buildFromTemplate([
		{
			label: __('main.tray.menu.show_app', {appName}),
			click: () => runAsync(() => deps.onShowApp()),
		},
		{
			label: __('main.tray.menu.compose_email'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onCompose()),
		},
		{type: 'separator'},
		{
			label: __('main.tray.menu.mail'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/email')),
		},
		{
			label: __('main.tray.menu.contacts'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/contacts')),
		},
		{
			label: __('main.tray.menu.calendar'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/calendar')),
		},
		{
			label: __('main.tray.menu.cloud'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/cloud')),
		},
		{type: 'separator'},
		{
			label: __('main.tray.menu.settings'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/settings/application')),
		},
		{
			label: __('main.tray.menu.about'),
			enabled: canUseMainWindowActions,
			click: () => runAsync(() => deps.onNavigate('/about')),
		},
		{
			label: __('main.tray.menu.quit'),
			click: () => runAsync(() => deps.onQuit()),
		},
	]);

	state.tray.setContextMenu(contextMenu);
}

function buildTrayTooltip(appName: string, unreadCount: number): string {
	if (unreadCount <= 0) return appName;
	return __('main.tray.tooltip.unread_count', {appName, count: unreadCount});
}

function buildTrayIcon(appIconPath: string | null) {
	const windowsTrayIconPath = resolveWindowsTrayIconPath(appIconPath);
	const linuxTrayIconPath = resolveLinuxTrayIconPath(appIconPath);

	const trayPath =
		process.platform === 'win32'
			? windowsTrayIconPath || appIconPath
			: process.platform === 'linux'
				? linuxTrayIconPath || appIconPath || path.join(app.getAppPath(), 'build/icons/64x64.png')
				: appIconPath;

	const trayBaseImage = trayPath ? nativeImage.createFromPath(trayPath) : null;

	if (trayBaseImage && !trayBaseImage.isEmpty()) {
		if (process.platform === 'win32') {
			return trayBaseImage.resize({width: 16, height: 16});
		}

		if (process.platform === 'linux') {
			const linuxIcon = trayBaseImage.resize({width: 24, height: 24});
			return nativeImage.createFromBuffer(linuxIcon.toPNG());
		}

		return trayBaseImage;
	}

	return nativeImage.createEmpty();
}

function resolveBestTrayIcon(appIconPath: string | null): Electron.NativeImage {
	const icon = buildTrayIcon(appIconPath);
	if (!icon.isEmpty()) {
		state.lastGoodIcon = icon;
		return icon;
	}
	return state.lastGoodIcon || nativeImage.createEmpty();
}

export function resolveLinuxTrayIconPath(appIconPath: string | null): string | null {
	const resourceRoot = process.resourcesPath || '';
	const candidatePaths = [
		path.join(app.getAppPath(), 'build/llamatray.png'),
		resourceRoot ? path.join(resourceRoot, 'build/llamatray.png') : '',
		resourceRoot ? path.join(resourceRoot, 'app.asar.unpacked/build/llamatray.png') : '',
		path.join(app.getAppPath(), 'build/icons/256x256.png'),
		path.join(app.getAppPath(), 'build/icons/128x128.png'),
		path.join(app.getAppPath(), 'build/icons/64x64.png'),
		path.join(app.getAppPath(), 'build/icon.png'),
		path.join(process.cwd(), 'build/llamatray.png'),
		path.join(process.cwd(), 'build/icon.png'),
		path.join(process.cwd(), 'src/resources/llamatray.png'),
		appIconPath,
	];
	for (const candidate of candidatePaths) {
		if (!candidate) continue;
		const icon = nativeImage.createFromPath(candidate);
		if (!icon.isEmpty()) {
			return candidate;
		}
	}
	return null;
}

export function resolveWindowsTrayIconPath(appIconPath: string | null): string | null {
	const candidatePaths = [
		path.join(app.getAppPath(), 'build/icon.ico'),
		path.join(app.getAppPath(), 'build/icons/icon.ico'),
		appIconPath,
	];
	for (const candidate of candidatePaths) {
		if (!candidate) continue;
		const icon = nativeImage.createFromPath(candidate);
		if (!icon.isEmpty()) {
			return candidate;
		}
	}
	return null;
}
