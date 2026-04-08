import {ipcMain} from 'electron';

type AccountCoreIpcDeps = {
    appLogger: { debug: (...args: any[]) => void; info: (...args: any[]) => void; warn: (...args: any[]) => void };
    getAccounts: () => Promise<any>;
    getTotalUnreadCount: () => number;
    addAccount: (account: any) => Promise<any>;
    updateAccount: (accountId: number, payload: any) => Promise<any>;
    deleteAccount: (accountId: number) => Promise<any>;
    blockedSyncAccounts: Map<number, string>;
    broadcastAccountAdded: (payload: any) => void;
    broadcastAccountUpdated: (payload: any) => void;
    broadcastAccountDeleted: (payload: any) => void;
    notifyAccountCountChanged: () => void;
    notifyUnreadCountChanged: () => void;
    runSyncAndBroadcast: (accountId: number, source: string) => Promise<any>;
    ensureIdleWatcher: (accountId: number) => void;
    restartIdleWatcher: (accountId: number) => void;
    stopIdleWatcher: (accountId: number) => void;
    autodiscover: (email: string) => Promise<any>;
    autodiscoverBasic: (email: string) => Promise<any>;
    verifyConnection: (payload: any) => Promise<any>;
};

export function registerAccountCoreIpc(deps: AccountCoreIpcDeps): void {
    ipcMain.handle('get-accounts', async () => {
        deps.appLogger.debug('IPC get-accounts');
        return await deps.getAccounts();
    });

    ipcMain.handle('get-unread-count', async () => {
        deps.appLogger.debug('IPC get-unread-count');
        return deps.getTotalUnreadCount();
    });

    ipcMain.handle('add-account', async (_event, account: any) => {
        deps.appLogger.info('IPC add-account email=%s', account?.email ?? '');
        const created = await deps.addAccount(account);
        deps.blockedSyncAccounts.delete(created.id);
        deps.broadcastAccountAdded(created);
        deps.notifyAccountCountChanged();
        void deps.runSyncAndBroadcast(created.id, 'new-account').catch((error) => {
            console.warn('Initial sync after account add failed:', (error as any)?.message || String(error));
        });
        void deps.ensureIdleWatcher(created.id);
        return created;
    });

    ipcMain.handle('update-account', async (_event, accountId: number, payload: any) => {
        deps.appLogger.info('IPC update-account accountId=%d', accountId);
        const updated = await deps.updateAccount(accountId, payload);
        deps.blockedSyncAccounts.delete(accountId);
        deps.broadcastAccountUpdated(updated);
        deps.restartIdleWatcher(accountId);
        return updated;
    });

    ipcMain.handle('delete-account', async (_event, accountId: number) => {
        deps.appLogger.warn('IPC delete-account accountId=%d', accountId);
        const deleted = await deps.deleteAccount(accountId);
        deps.blockedSyncAccounts.delete(accountId);
        deps.broadcastAccountDeleted(deleted);
        deps.stopIdleWatcher(accountId);
        deps.notifyAccountCountChanged();
        deps.notifyUnreadCountChanged();
        return deleted;
    });

    ipcMain.handle('discover-mail-settings', async (_event, email: string) => {
        try {
            return await deps.autodiscover(email);
        } catch (error) {
            console.error('discover-mail-settings failed, using basic fallback:', error);
            return await deps.autodiscoverBasic(email);
        }
    });

    ipcMain.handle('verify-credentials', async (_event, payload: any) => {
        return await deps.verifyConnection(payload);
    });

    ipcMain.handle('sync-account', async (_event, accountId: number) => {
        deps.appLogger.info('IPC sync-account accountId=%d', accountId);
        return await deps.runSyncAndBroadcast(accountId, 'manual');
    });
}
