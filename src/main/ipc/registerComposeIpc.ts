import {ipcMain} from 'electron';
import {parseOptionalPositiveInt, parsePositiveInt, parseRequiredObject} from './validation.js';

type ComposeIpcDeps = {
    appLogger: { debug: (...args: any[]) => void; info: (...args: any[]) => void };
    sendEmail: (payload: any) => Promise<any>;
    saveDraftEmail: (payload: any) => Promise<any>;
    runSyncAndBroadcast: (accountId: number, source: string) => Promise<any>;
};

export function registerComposeIpc(deps: ComposeIpcDeps): void {
    ipcMain.handle('send-email', async (_event, payload: any) => {
        const safePayload = parseRequiredObject(payload, 'payload');
        const accountId = parsePositiveInt(safePayload.accountId, 'payload.accountId');
        deps.appLogger.info('IPC send-email accountId=%d toLen=%d', accountId, String(safePayload.to || '').length);
        const result = await deps.sendEmail(safePayload);
        void deps.runSyncAndBroadcast(accountId, 'send').catch((error) => {
            console.warn('Post-send sync failed:', (error as any)?.message || String(error));
        });
        return result;
    });

    ipcMain.handle('save-draft', async (_event, payload: any) => {
        const safePayload = parseRequiredObject(payload, 'payload');
        const accountId = parseOptionalPositiveInt(safePayload.accountId, 'payload.accountId');
        deps.appLogger.debug('IPC save-draft accountId=%s', accountId ?? '');
        return await deps.saveDraftEmail(safePayload);
    });
}
