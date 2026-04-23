import {BrowserWindow, ipcMain} from 'electron';
import {createAppLogger} from '@main/debug/debugLog';
import {
	type AutoUpdateState,
	checkForUpdates,
	downloadUpdate,
	getAutoUpdateState,
	quitAndInstallUpdate,
} from '@main/updater/autoUpdate';

const logger = createAppLogger('ipc:updater');

export function registerUpdaterIpc(): void {
	ipcMain.handle('get-auto-update-state', async (): Promise<AutoUpdateState> => {
		logger.debug('IPC get-auto-update-state');
		return getAutoUpdateState();
	});

	ipcMain.handle('check-for-updates', async (): Promise<AutoUpdateState> => {
		logger.info('IPC check-for-updates');
		return await checkForUpdates();
	});

	ipcMain.handle('download-update', async (): Promise<AutoUpdateState> => {
		logger.info('IPC download-update');
		return await downloadUpdate();
	});

	ipcMain.handle('quit-and-install-update', async (): Promise<{ok: true}> => {
		logger.warn('IPC quit-and-install-update');
		quitAndInstallUpdate();
		return {ok: true} as const;
	});
}

export function broadcastAutoUpdateState(state: AutoUpdateState): void {
	logger.debug('Broadcast auto-update-status phase=%s enabled=%s', state.phase, state.enabled);
	for (const win of BrowserWindow.getAllWindows()) {
		win.webContents.send('auto-update-status', state);
	}
}
