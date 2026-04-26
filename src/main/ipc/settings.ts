import {app, BrowserWindow, ipcMain, Notification, shell} from 'electron';
import {getAccounts} from '@main/db/repositories/accountsRepo';
import {listFoldersByAccount, listMessagesByFolder} from '@main/db/repositories/mailRepo';
import {createAppLogger} from '@main/debug/debugLog';
import {__, getI18nCatalogPayload} from '@llamamail/app/i18n/main';
import {type AppSettingsPatch, getAppSettings, updateAppSettings} from '@main/settings/store';
import {resolveNotificationIconPath} from '@main/notifications/icon';

const logger = createAppLogger('ipc:settings');
const notificationIconPath = resolveNotificationIconPath();

export function registerSettingsIpc(
	onSettingsUpdated: (settings: Awaited<ReturnType<typeof getAppSettings>>) => void,
	options?: {
		onOpenUpdaterView?: () => boolean;
	},
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

	ipcMain.handle('get-i18n-catalog', async (_event, locale?: string | null) => {
		logger.debug('IPC get-i18n-catalog locale=%s', String(locale || ''));
		return await getI18nCatalogPayload(locale);
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
				: String(payload?.title || __('notifications.dev_notification_fallback_title')).trim() ||
					__('notifications.dev_notification_fallback_title');
			const body = target
				? `${target.from || __('notifications.unknown_sender')} -> ${target.accountEmail}`
				: String(payload?.body || __('notifications.dev_notification_no_message')).trim() ||
					__('notifications.dev_notification_no_message');
			const route = target
				? `/email/${target.accountId}/${target.folderId}/${target.messageId}`
				: String(payload?.route || '/email').trim() || '/email';
			const notification = new Notification({
				title,
				body,
				silent: false,
				...(notificationIconPath ? {icon: notificationIconPath} : {}),
			});
			notification.on('click', () => {
				const navigateAndTarget = (win: BrowserWindow) => {
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
				};
				const win = getFirstAppWindow();
				if (win) {
					navigateAndTarget(win);
					return;
				}
				app.emit('activate');
				setTimeout(() => {
					const activatedWindow = getFirstAppWindow();
					if (!activatedWindow) return;
					navigateAndTarget(activatedWindow);
				}, 180);
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
					title: __('notifications.sound_test_title'),
					body: __('notifications.sound_test_body'),
					silent: false,
					...(notificationIconPath ? {icon: notificationIconPath} : {}),
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
		const opened = options?.onOpenUpdaterView?.() ?? false;
		return {ok: true, opened} as const;
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
	try {
		if (process.platform === 'linux') {
			app.focus({steal: true});
		} else {
			app.focus();
		}
	} catch {
		// ignore app focus failures
	}
	if (win.isMinimized()) win.restore();
	if (!win.isVisible()) win.show();
	win.moveTop();
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
