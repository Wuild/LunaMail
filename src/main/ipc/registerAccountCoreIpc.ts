import {ipcMain} from 'electron';
import {
    parseOptionalText,
    parsePositiveInt,
    parseRequiredObject,
    parseRequiredText,
} from './validation.js';

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
        const rawAccount = parseRequiredObject(account, 'account');
        const payload = {
            ...rawAccount,
            email: parseRequiredText(rawAccount.email, 'account.email', 320),
            name: parseOptionalText(rawAccount.name, 'account.name', 200),
            user: parseOptionalText(rawAccount.user, 'account.user', 320),
        };
        deps.appLogger.info('IPC add-account email=%s', payload.email);
        const created = await deps.addAccount(payload);
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
        const safeAccountId = parsePositiveInt(accountId, 'accountId');
        const rawPayload = parseRequiredObject(payload, 'payload');
        deps.appLogger.info('IPC update-account accountId=%d', safeAccountId);
        const updated = await deps.updateAccount(safeAccountId, rawPayload);
        deps.blockedSyncAccounts.delete(safeAccountId);
        deps.broadcastAccountUpdated(updated);
        deps.restartIdleWatcher(safeAccountId);
        return updated;
    });

    ipcMain.handle('delete-account', async (_event, accountId: number) => {
        const safeAccountId = parsePositiveInt(accountId, 'accountId');
        deps.appLogger.warn('IPC delete-account accountId=%d', safeAccountId);
        const deleted = await deps.deleteAccount(safeAccountId);
        deps.blockedSyncAccounts.delete(safeAccountId);
        deps.broadcastAccountDeleted(deleted);
        deps.stopIdleWatcher(safeAccountId);
        deps.notifyAccountCountChanged();
        deps.notifyUnreadCountChanged();
        return deleted;
    });

    ipcMain.handle('discover-mail-settings', async (_event, email: string) => {
        const safeEmail = parseRequiredText(email, 'email', 320);
        try {
            return await deps.autodiscover(safeEmail);
        } catch (error) {
            console.error('discover-mail-settings failed, using basic fallback:', error);
            return await deps.autodiscoverBasic(safeEmail);
        }
    });

    ipcMain.handle('verify-credentials', async (_event, payload: any) => {
        const safePayload = parseRequiredObject(payload, 'payload');
        return await deps.verifyConnection(safePayload);
    });

    ipcMain.handle('sync-account', async (_event, accountId: number) => {
        const safeAccountId = parsePositiveInt(accountId, 'accountId');
        deps.appLogger.info('IPC sync-account accountId=%d', safeAccountId);
        return await deps.runSyncAndBroadcast(safeAccountId, 'manual');
    });
}
