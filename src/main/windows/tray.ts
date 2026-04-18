import {app, Menu, nativeImage, Tray} from 'electron';
import path from 'path';
import {APP_NAME} from '@/shared/appConfig.js';

type TrayControllerDeps = {
	appName?: string;
	appIconPath: string | null;
	isActionsEnabled: () => boolean;
	onShowApp: () => void;
	onCompose: () => void;
	onNavigate: (route: string) => void;
	onQuit: () => void;
};

export function createTrayController(deps: TrayControllerDeps): {
	ensureTray: (unreadCount: number) => void;
	hideTray: () => void;
	reloadTray: (unreadCount: number) => void;
	updateTooltip: (unreadCount: number) => void;
	refreshMenu: () => void;
} {
	let tray: Tray | null = null;
	const appName = deps.appName || APP_NAME;
	const runAsync = (fn: () => void) => {
		setTimeout(fn, 0);
	};

	function ensureTray(unreadCount: number): void {
		if (tray) return;
		tray = new Tray(buildTrayIcon(deps.appIconPath));
		tray.setToolTip(buildTrayTooltip(appName, unreadCount));
		refreshMenu();
		tray.on('double-click', () => {
			runAsync(() => deps.onShowApp());
		});
		tray.on('click', () => {
			if (process.platform !== 'linux') return;
			runAsync(() => deps.onShowApp());
		});
	}

	function hideTray(): void {
		if (!tray) return;
		tray.destroy();
		tray = null;
	}

	function reloadTray(unreadCount: number): void {
		if (!tray) return;
		hideTray();
		ensureTray(unreadCount);
	}

	function refreshMenu(): void {
		if (!tray) return;
		const canUseMainWindowActions = deps.isActionsEnabled();
		const contextMenu = Menu.buildFromTemplate([
			{
				label: `Show ${appName}`,
				click: () => runAsync(() => deps.onShowApp()),
			},
			{
				label: 'Compose Email',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onCompose()),
			},
			{type: 'separator'},
			{
				label: 'Mail',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/email')),
			},
			{
				label: 'Contacts',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/contacts')),
			},
			{
				label: 'Calendar',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/calendar')),
			},
			{
				label: 'Cloud',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/cloud')),
			},
			{type: 'separator'},
			{
				label: 'Settings',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/settings/application')),
			},
			{
				label: 'About',
				enabled: canUseMainWindowActions,
				click: () => runAsync(() => deps.onNavigate('/about')),
			},
			{
				label: 'Quit',
				click: () => runAsync(() => deps.onQuit()),
			},
		]);
		tray.setContextMenu(contextMenu);
	}

	function updateTooltip(unreadCount: number): void {
		if (!tray) return;
		tray.setToolTip(buildTrayTooltip(appName, unreadCount));
	}

	return {
		ensureTray,
		hideTray,
		reloadTray,
		updateTooltip,
		refreshMenu,
	};
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
		if (process.platform === 'win32') return trayBaseImage.resize({width: 16, height: 16});
		if (process.platform === 'linux') {
			const linuxIcon = trayBaseImage.resize({width: 24, height: 24});
			return nativeImage.createFromBuffer(linuxIcon.toPNG());
		}
		return trayBaseImage;
	}

	const fallbackIcon = nativeImage.createEmpty();
	if (process.platform === 'win32') return fallbackIcon.resize({width: 16, height: 16});
	if (process.platform === 'linux') return fallbackIcon.resize({width: 22, height: 22});
	return fallbackIcon;
}

function buildTrayTooltip(appName: string, unreadCount: number): string {
	if (unreadCount <= 0) return appName;
	return `${appName} (${unreadCount} unread)`;
}

export function resolveLinuxTrayIconPath(appIconPath: string | null): string | null {
	const resourceRoot = process.resourcesPath || '';
	const candidatePaths = [
		path.join(app.getAppPath(), 'build/lunatray.png'),
		path.join(app.getAppPath(), 'build/llamatray.png'),
		resourceRoot ? path.join(resourceRoot, 'build/lunatray.png') : '',
		resourceRoot ? path.join(resourceRoot, 'build/llamatray.png') : '',
		resourceRoot ? path.join(resourceRoot, 'app.asar.unpacked/build/lunatray.png') : '',
		resourceRoot ? path.join(resourceRoot, 'app.asar.unpacked/build/llamatray.png') : '',
		path.join(app.getAppPath(), 'build/icons/lunatray.png'),
		path.join(app.getAppPath(), 'build/icons/256x256.png'),
		path.join(app.getAppPath(), 'build/icons/128x128.png'),
		path.join(app.getAppPath(), 'build/icons/64x64.png'),
		path.join(app.getAppPath(), 'build/icon.png'),
		path.join(process.cwd(), 'build/lunatray.png'),
		path.join(process.cwd(), 'build/llamatray.png'),
		path.join(process.cwd(), 'build/icon.png'),
		path.join(process.cwd(), 'src/resources/lunatray.png'),
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
		path.join(app.getAppPath(), 'build/lunatray.ico'),
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
