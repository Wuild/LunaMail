import type {OpenDialogOptions} from 'electron';
import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import path from 'node:path';
import {clearDebugLogs, createAppLogger, getDebugLogs} from '@main/debug/debugLog';
import {getComposeDraft, openComposeWindow} from '@main/windows/composeWindow';
import {getMessageWindowTargetId, openMessageWindow} from '@main/windows/messageWindow';
import {openDebugWindow} from '@main/windows/debugWindow';
import {openRouteWindow} from '@main/windows/routeWindow';
import {__} from '@llamamail/app/i18n/main';

const logger = createAppLogger('ipc:windows');

export function registerWindowIpc(options?: {onOpenAddAccountRoute?: () => void}): void {
	ipcMain.handle('open-add-account-window', async (_event) => {
		logger.info('IPC open-add-account-window');
		options?.onOpenAddAccountRoute?.();
		return {ok: true} as const;
	});

	ipcMain.handle('open-compose-window', async (event, draft?: ComposeDraftPayload | null) => {
		logger.info('IPC open-compose-window hasDraft=%s', Boolean(draft));
		const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
		openComposeWindow(parentWindow, draft ?? null);
		return {ok: true} as const;
	});

	ipcMain.handle('get-compose-draft', async () => {
		logger.debug('IPC get-compose-draft');
		return getComposeDraft();
	});

	ipcMain.handle('get-debug-logs', async (_event, limit?: number) => {
		logger.debug('IPC get-debug-logs limit=%s', limit ?? '');
		return getDebugLogs(limit);
	});

	ipcMain.handle('clear-debug-logs', async () => {
		logger.warn('IPC clear-debug-logs');
		clearDebugLogs();
		return {ok: true} as const;
	});

	ipcMain.handle('open-message-window', async (_event, messageId?: number | null) => {
		logger.info('IPC open-message-window messageId=%s', messageId ?? '');
		const normalizedMessageId =
			typeof messageId === 'number' && Number.isFinite(messageId) ? Math.floor(messageId) : null;
		openMessageWindow(normalizedMessageId);
		return {ok: true} as const;
	});

	ipcMain.handle('open-debug-window', async (_event) => {
		logger.info('IPC open-debug-window');
		openDebugWindow();
		return {ok: true} as const;
	});

	ipcMain.handle('open-route-window', async (_event, route: string) => {
		const safeRoute = String(route || '').trim();
		if (!safeRoute) {
			throw new Error(__('windows.error.invalid_route'));
		}
		logger.info('IPC open-route-window route=%s', safeRoute);
		openRouteWindow(safeRoute);
		return {ok: true} as const;
	});

	ipcMain.handle('get-message-window-target', async (event) => {
		logger.debug('IPC get-message-window-target');
		return getMessageWindowTargetId(event.sender.id);
	});

	ipcMain.handle('pick-compose-attachments', async (event) => {
		logger.info('IPC pick-compose-attachments');
		const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
		const dialogOptions: OpenDialogOptions = {
			title: __('windows.dialog.select_attachments'),
			properties: ['openFile', 'multiSelections'],
		};
		const result = parentWindow
			? await dialog.showOpenDialog(parentWindow, dialogOptions)
			: await dialog.showOpenDialog(dialogOptions);
		if (result.canceled || !result.filePaths.length) return [];

		return result.filePaths.map((filePath) => ({
			path: filePath,
			filename: path.basename(filePath),
			contentType: null,
		}));
	});

	ipcMain.handle('window-minimize', async (event) => {
		logger.debug('IPC window-minimize');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && !win.isDestroyed()) {
			win.minimize();
		}
		return {ok: true} as const;
	});

	ipcMain.handle('window-toggle-maximize', async (event) => {
		logger.debug('IPC window-toggle-maximize');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && !win.isDestroyed()) {
			if (win.isMaximized()) win.unmaximize();
			else win.maximize();
			return {ok: true as const, isMaximized: win.isMaximized()};
		}
		return {ok: true as const, isMaximized: false};
	});

	ipcMain.handle('window-close', async (event) => {
		logger.debug('IPC window-close');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && !win.isDestroyed()) {
			win.close();
		}
		return {ok: true} as const;
	});

	ipcMain.handle('window-is-maximized', async (event) => {
		logger.debug('IPC window-is-maximized');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || win.isDestroyed()) return false;
		return win.isMaximized();
	});

	ipcMain.handle('window-controls-capabilities', async (event) => {
		logger.debug('IPC window-controls-capabilities');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || win.isDestroyed()) {
			return {
				minimizable: false,
				maximizable: false,
			};
		}
		return {
			minimizable: win.isMinimizable(),
			maximizable: win.isMaximizable(),
		};
	});

	ipcMain.handle('window-open-dev-tools', async (event) => {
		logger.info('IPC window-open-dev-tools');
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && !win.isDestroyed()) {
			win.webContents.openDevTools({mode: 'detach'});
		}
		return {ok: true} as const;
	});

	ipcMain.handle('app-restart', async () => {
		logger.info('IPC app-restart');
		app.relaunch();
		app.quit();
		return {ok: true} as const;
	});
}
