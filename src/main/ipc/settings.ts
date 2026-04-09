import {app, BrowserWindow, ipcMain, Notification, shell} from 'electron';
import {getAccounts} from '../db/repositories/accountsRepo.js';
import {listFoldersByAccount, listMessagesByFolder} from '../db/repositories/mailRepo.js';
import {createAppLogger} from '../debug/debugLog.js';
import {APP_NAME} from '../config.js';
import {type AppSettingsPatch, getAppSettings, updateAppSettings} from '../settings/store.js';
import {openSplashWindow} from '../windows/splashWindow.js';

const logger = createAppLogger('ipc:settings');

export function registerSettingsIpc(
	onSettingsUpdated: (settings: Awaited<ReturnType<typeof getAppSettings>>) => void,
): void {
	ipcMain.handle('get-app-settings', async () => {
		logger.debug('IPC get-app-settings');
		return await getAppSettings();
	});

	ipcMain.handle('update-app-settings', async (_event, patch: AppSettingsPatch) => {
		logger.info('IPC update-app-settings keys=%s', Object.keys(patch || {}).join(','));
		const settings = await updateAppSettings(patch);
		onSettingsUpdated(settings);
		for (const win of BrowserWindow.getAllWindows()) {
			win.webContents.send('app-settings-updated', settings);
		}
		return settings;
	});

	ipcMain.handle('get-system-locale', async () => {
		logger.debug('IPC get-system-locale');
		return resolveSystemLocale();
	});

	ipcMain.handle(
		'dev-show-notification',
		async (
			_event,
			payload?: {
				title?: string;
				body?: string;
				route?: string | null;
			} | null,
		) => {
			logger.info('IPC dev-show-notification');
			if (!Notification.isSupported()) {
				return {ok: true, supported: false, hasTarget: false} as const;
			}
			const target = await resolveFirstMessageTarget();
			const title = target?.subject
				? `Test: ${target.subject}`
				: String(payload?.title || `${APP_NAME} developer notification`).trim() ||
				`${APP_NAME} developer notification`;
			const body = target
				? `${target.from || 'Unknown sender'} -> ${target.accountEmail}`
				: String(payload?.body || 'No message found in first account/folder.').trim() ||
				'No message found in first account/folder.';
			const route = target
				? `/email/${target.accountId}/${target.folderId}/${target.messageId}`
				: String(payload?.route || '/email').trim() || '/email';
			const notification = new Notification({title, body, silent: false});
			notification.on('click', () => {
				const win = getFirstAppWindow();
				if (!win) return;
				focusWindow(win);
				void win.webContents
					.executeJavaScript(`window.location.hash = ${JSON.stringify(route)};`)
					.catch(() => undefined);
				if (target) {
					setTimeout(() => {
						if (win.isDestroyed()) return;
						win.webContents.send('open-message-target', {
							accountId: target.accountId,
							folderPath: target.folderPath,
							messageId: target.messageId,
						});
					}, 120);
				}
			});
			notification.show();
			return {ok: true, supported: true, hasTarget: Boolean(target)} as const;
		},
	);

	ipcMain.handle('dev-play-notification-sound', async () => {
		logger.info('IPC dev-play-notification-sound');
		let played = false;
		try {
			if (Notification.isSupported()) {
				const notification = new Notification({
					title: `${APP_NAME} sound test`,
					body: 'Testing notification sound',
					silent: false,
				});
				notification.show();
				played = true;
			}
		} catch {
			// fallback below
		}
		if (!played) {
			shell.beep();
			played = true;
		}
		return {ok: true, played} as const;
	});

	ipcMain.handle('dev-open-updater-window', async () => {
		logger.info('IPC dev-open-updater-window');
		const updaterWin = openSplashWindow({forceTitleBar: true});
		focusWindow(updaterWin);
		return {ok: true, opened: true} as const;
	});

	ipcMain.handle('set-default-email-client', async () => {
		logger.info('IPC set-default-email-client');
		try {
			const ok = app.setAsDefaultProtocolClient('mailto');
			const isDefault = app.isDefaultProtocolClient('mailto');
			return {ok, isDefault} as const;
		} catch (error: any) {
			logger.warn('Failed to set default email client: %s', error?.message || String(error));
			return {
				ok: false,
				isDefault: false,
				error: error?.message || String(error),
			} as const;
		}
	});

	ipcMain.handle('get-default-email-client-status', async () => {
		logger.debug('IPC get-default-email-client-status');
		try {
			return {ok: true, isDefault: app.isDefaultProtocolClient('mailto')} as const;
		} catch (error: any) {
			logger.warn('Failed to check default email client: %s', error?.message || String(error));
			return {
				ok: false,
				isDefault: false,
				error: error?.message || String(error),
			} as const;
		}
	});
}

type FirstMessageTarget = {
	accountId: number;
	accountEmail: string;
	folderId: number;
	folderPath: string;
	messageId: number;
	subject: string | null;
	from: string | null;
};

async function resolveFirstMessageTarget(): Promise<FirstMessageTarget | null> {
	const accounts = await getAccounts();
	const firstAccount = accounts[0];
	if (!firstAccount) return null;

	const folders = listFoldersByAccount(firstAccount.id);
	const firstFolder = folders[0];
	if (!firstFolder) return null;

	const firstMessage = listMessagesByFolder(firstAccount.id, firstFolder.path, 1)[0];
	if (!firstMessage) return null;

	return {
		accountId: firstAccount.id,
		accountEmail: firstAccount.email,
		folderId: firstFolder.id,
		folderPath: firstFolder.path,
		messageId: firstMessage.id,
		subject: firstMessage.subject ?? null,
		from: firstMessage.from_address ?? firstMessage.from_name ?? null,
	};
}

function getFirstAppWindow(): BrowserWindow | null {
	const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
	if (windows.length === 0) return null;
	windows.sort((a, b) => a.id - b.id);
	return windows[0] ?? null;
}

function focusWindow(win: BrowserWindow): void {
	if (win.isDestroyed()) return;
	if (win.isMinimized()) win.restore();
	if (!win.isVisible()) win.show();
	win.focus();
}

function resolveSystemLocale(): string {
	const envCandidates = [process.env.LC_TIME, process.env.LC_ALL, process.env.LANG]
		.map((value) => normalizeLocaleTag(value))
		.filter((value): value is string => Boolean(value));
	for (const candidate of envCandidates) {
		if (isValidLocale(candidate)) return candidate;
	}

	const preferred = app.getPreferredSystemLanguages?.() ?? [];
	for (const candidate of preferred) {
		const normalized = normalizeLocaleTag(candidate);
		if (normalized && isValidLocale(normalized)) return normalized;
	}

	const appLocale = normalizeLocaleTag(app.getLocale());
	if (appLocale && isValidLocale(appLocale)) return appLocale;

	const intlLocale = normalizeLocaleTag(Intl.DateTimeFormat().resolvedOptions().locale);
	if (intlLocale && isValidLocale(intlLocale)) return intlLocale;

	return 'en-US';
}

function normalizeLocaleTag(value?: string | null): string | null {
	if (!value) return null;
	const withoutEncoding = value.split('.')[0] || value;
	const withoutVariant = withoutEncoding.split('@')[0] || withoutEncoding;
	const normalized = withoutVariant.replace(/_/g, '-').trim();
	if (!normalized || normalized.toLowerCase() === 'c' || normalized.toLowerCase() === 'posix') {
		return null;
	}
	return normalized;
}

function isValidLocale(locale: string): boolean {
	try {
		new Intl.DateTimeFormat(locale);
		return true;
	} catch {
		return false;
	}
}
