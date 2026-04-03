import {BrowserWindow, ipcMain} from 'electron';
import {
    type AutoUpdateState,
    checkForUpdates,
    downloadUpdate,
    getAutoUpdateState,
    quitAndInstallUpdate,
} from '../updater/autoUpdate.js';

export function registerUpdaterIpc(): void {
    ipcMain.handle('get-auto-update-state', async (): Promise<AutoUpdateState> => {
        return getAutoUpdateState();
    });

    ipcMain.handle('check-for-updates', async (): Promise<AutoUpdateState> => {
        return await checkForUpdates();
    });

    ipcMain.handle('download-update', async (): Promise<AutoUpdateState> => {
        return await downloadUpdate();
    });

    ipcMain.handle('quit-and-install-update', async (): Promise<{ ok: true }> => {
        quitAndInstallUpdate();
        return {ok: true} as const;
    });
}

export function broadcastAutoUpdateState(state: AutoUpdateState): void {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('auto-update-status', state);
    }
}
