import {ipcMain} from 'electron';

type ComposeIpcDeps = {
    appLogger: { debug: (...args: any[]) => void; info: (...args: any[]) => void };
    sendEmail: (payload: any) => Promise<any>;
    saveDraftEmail: (payload: any) => Promise<any>;
    runSyncAndBroadcast: (accountId: number, source: string) => Promise<any>;
};

export function registerComposeIpc(deps: ComposeIpcDeps): void {
    ipcMain.handle('send-email', async (_event, payload: any) => {
        deps.appLogger.info('IPC send-email accountId=%d toLen=%d', payload.accountId, String(payload.to || '').length);
        const result = await deps.sendEmail(payload);
        void deps.runSyncAndBroadcast(payload.accountId, 'send').catch((error) => {
            console.warn('Post-send sync failed:', (error as any)?.message || String(error));
        });
        return result;
    });

    ipcMain.handle('save-draft', async (_event, payload: any) => {
        deps.appLogger.debug('IPC save-draft accountId=%d', payload.accountId);
        return await deps.saveDraftEmail(payload);
    });
}
