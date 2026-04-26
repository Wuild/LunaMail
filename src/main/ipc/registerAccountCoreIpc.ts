import {ipcMain} from 'electron';
import {parseOptionalText, parsePositiveInt, parseRequiredObject, parseRequiredText} from './validation';
import {tray} from '@main/windows/tray';
import {getAppSettings} from '@main/settings/store';
import {appEventHandler, AppEvent} from '@llamamail/app/appEventHandler';
import {
	DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
	normalizeAccountCalendarSyncIntervalMinutes,
	normalizeAccountContactsSyncIntervalMinutes,
	normalizeAccountEmailSyncIntervalMinutes,
	normalizeAccountEmailSyncLookbackMonths,
	parseMailListSort,
} from '@llamamail/app/settingsRules';

type AccountCoreIpcDeps = {
	appLogger: {debug: (...args: any[]) => void; info: (...args: any[]) => void; warn: (...args: any[]) => void};
	getAccounts: () => Promise<any>;
	getProviderDriverCatalog: () => Promise<any[]>;
	getProviderCapabilities: (accountId: number) => Promise<any>;
	getTotalUnreadCount: () => number;
	addAccount: (account: any) => Promise<any>;
	updateAccount: (accountId: number, payload: any) => Promise<any>;
	deleteAccount: (accountId: number) => Promise<any>;
	revokeAccountOAuthTokens: (accountId: number) => Promise<void>;
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
	testAccountServiceConnection: (accountId: number, payload: any) => Promise<any>;
	startMailOAuth: (payload: any) => Promise<any>;
	cancelPendingMailOAuth: (reason?: string) => number;
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

	ipcMain.handle('get-provider-driver-catalog', async () => {
		deps.appLogger.debug('IPC get-provider-driver-catalog');
		return deps.getProviderDriverCatalog();
	});

	ipcMain.handle('get-account-provider-capabilities', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		deps.appLogger.debug('IPC get-account-provider-capabilities accountId=%d', safeAccountId);
		return await deps.getProviderCapabilities(safeAccountId);
	});

	ipcMain.handle('add-account', async (_event, account: any) => {
		const rawAccount = parseRequiredObject(account, 'account');
		const payload = {
			...rawAccount,
			email: parseRequiredText(rawAccount.email, 'account.email', 320),
			name: parseOptionalText(rawAccount.name, 'account.name', 200),
			user: parseOptionalText(rawAccount.user, 'account.user', 320),
			imap_user: parseOptionalText(rawAccount.imap_user, 'account.imap_user', 320),
			smtp_user: parseOptionalText(rawAccount.smtp_user, 'account.smtp_user', 320),
			carddav_user: parseOptionalText(rawAccount.carddav_user, 'account.carddav_user', 320),
			caldav_user: parseOptionalText(rawAccount.caldav_user, 'account.caldav_user', 320),
			sync_emails: rawAccount.sync_emails === undefined ? undefined : Number(rawAccount.sync_emails) > 0 ? 1 : 0,
			sync_contacts:
				rawAccount.sync_contacts === undefined ? undefined : Number(rawAccount.sync_contacts) > 0 ? 1 : 0,
			sync_calendar:
				rawAccount.sync_calendar === undefined ? undefined : Number(rawAccount.sync_calendar) > 0 ? 1 : 0,
			contacts_sync_interval_minutes:
				rawAccount.contacts_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountContactsSyncIntervalMinutes(
							rawAccount.contacts_sync_interval_minutes,
							DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
						),
			calendar_sync_interval_minutes:
				rawAccount.calendar_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountCalendarSyncIntervalMinutes(
							rawAccount.calendar_sync_interval_minutes,
							DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
						),
			email_list_sort:
				rawAccount.email_list_sort === undefined ? undefined : parseMailListSort(rawAccount.email_list_sort),
			email_sync_interval_minutes:
				rawAccount.email_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountEmailSyncIntervalMinutes(
							rawAccount.email_sync_interval_minutes,
							DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
						),
			email_sync_lookback_months:
				rawAccount.email_sync_lookback_months === undefined
					? undefined
					: normalizeAccountEmailSyncLookbackMonths(
							rawAccount.email_sync_lookback_months,
							DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
						),
		};
		deps.appLogger.info('IPC add-account email=%s', payload.email);
		const created = await deps.addAccount(payload);
		deps.blockedSyncAccounts.delete(created.id);
		deps.broadcastAccountAdded(created);
		appEventHandler.emit(AppEvent.AccountAdded, {
			accountId: created.id,
			email: created.email,
		});
		deps.notifyAccountCountChanged();
		void deps.runSyncAndBroadcast(created.id, 'new-account').catch((error) => {
			console.warn('Initial sync after account add failed:', (error as any)?.message || String(error));
		});
		void deps.ensureIdleWatcher(created.id);

		tray.refresh();
		return created;
	});

	ipcMain.handle('update-account', async (_event, accountId: number, payload: any) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const rawPayload = parseRequiredObject(payload, 'payload');
		const before = (await deps.getAccounts()).find((account: any) => Number(account?.id) === safeAccountId) ?? null;
		const normalizedPayload = {
			...rawPayload,
			sync_emails: rawPayload.sync_emails === undefined ? undefined : Number(rawPayload.sync_emails) > 0 ? 1 : 0,
			sync_contacts:
				rawPayload.sync_contacts === undefined ? undefined : Number(rawPayload.sync_contacts) > 0 ? 1 : 0,
			sync_calendar:
				rawPayload.sync_calendar === undefined ? undefined : Number(rawPayload.sync_calendar) > 0 ? 1 : 0,
			imap_user: parseOptionalText(rawPayload.imap_user, 'payload.imap_user', 320),
			smtp_user: parseOptionalText(rawPayload.smtp_user, 'payload.smtp_user', 320),
			carddav_user: parseOptionalText(rawPayload.carddav_user, 'payload.carddav_user', 320),
			caldav_user: parseOptionalText(rawPayload.caldav_user, 'payload.caldav_user', 320),
			contacts_sync_interval_minutes:
				rawPayload.contacts_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountContactsSyncIntervalMinutes(
							rawPayload.contacts_sync_interval_minutes,
							DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
						),
			calendar_sync_interval_minutes:
				rawPayload.calendar_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountCalendarSyncIntervalMinutes(
							rawPayload.calendar_sync_interval_minutes,
							DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
						),
			email_list_sort:
				rawPayload.email_list_sort === undefined ? undefined : parseMailListSort(rawPayload.email_list_sort),
			email_sync_interval_minutes:
				rawPayload.email_sync_interval_minutes === undefined
					? undefined
					: normalizeAccountEmailSyncIntervalMinutes(
							rawPayload.email_sync_interval_minutes,
							DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
						),
			email_sync_lookback_months:
				rawPayload.email_sync_lookback_months === undefined
					? undefined
					: normalizeAccountEmailSyncLookbackMonths(
							rawPayload.email_sync_lookback_months,
							DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
						),
		};
		deps.appLogger.info('IPC update-account accountId=%d', safeAccountId);
		const updated = await deps.updateAccount(safeAccountId, normalizedPayload);
		deps.blockedSyncAccounts.delete(safeAccountId);
		deps.broadcastAccountUpdated(updated);
		appEventHandler.emit(AppEvent.AccountUpdated, {
			accountId: updated.id,
			email: updated.email,
		});
		deps.restartIdleWatcher(safeAccountId);
		deps.notifyUnreadCountChanged();
		const emailEnabledBefore = Number(before?.sync_emails ?? 1) > 0;
		const contactsEnabledBefore = Number(before?.sync_contacts ?? 1) > 0;
		const calendarEnabledBefore = Number(before?.sync_calendar ?? 1) > 0;
		const emailEnabledNow = Number(updated?.sync_emails ?? 1) > 0;
		const contactsEnabledNow = Number(updated?.sync_contacts ?? 1) > 0;
		const calendarEnabledNow = Number(updated?.sync_calendar ?? 1) > 0;
		if (
			(!emailEnabledBefore && emailEnabledNow) ||
			(!contactsEnabledBefore && contactsEnabledNow) ||
			(!calendarEnabledBefore && calendarEnabledNow)
		) {
			void deps.runSyncAndBroadcast(safeAccountId, 'module-enabled').catch((error) => {
				console.warn(
					'Sync after module enable failed accountId=%d error=%s',
					safeAccountId,
					(error as any)?.message || String(error),
				);
			});
		}
		return updated;
	});

	ipcMain.handle('delete-account', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		deps.appLogger.warn('IPC delete-account accountId=%d', safeAccountId);
		try {
			await deps.revokeAccountOAuthTokens(safeAccountId);
		} catch (error) {
			deps.appLogger.warn(
				'OAuth token revoke failed accountId=%d error=%s',
				safeAccountId,
				(error as any)?.message || String(error),
			);
		}
		const deleted = await deps.deleteAccount(safeAccountId);
		deps.blockedSyncAccounts.delete(safeAccountId);
		deps.broadcastAccountDeleted(deleted);
		appEventHandler.emit(AppEvent.AccountDeleted, {
			accountId: deleted.id,
			email: deleted.email,
		});
		deps.stopIdleWatcher(safeAccountId);
		deps.notifyAccountCountChanged();
		deps.notifyUnreadCountChanged();

		tray.refresh();
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

	ipcMain.handle('test-account-service-connection', async (_event, accountId: number, payload: any) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safePayload = parseRequiredObject(payload, 'payload');
		return await deps.testAccountServiceConnection(safeAccountId, safePayload);
	});

	ipcMain.handle('start-mail-oauth', async (_event, payload: any) => {
		const safePayload = parseRequiredObject(payload, 'payload');
		return await deps.startMailOAuth({
			email: parseOptionalText(safePayload.email, 'payload.email', 320),
			provider: parseOptionalText(safePayload.provider, 'payload.provider', 80),
			clientId: parseOptionalText(safePayload.clientId, 'payload.clientId', 256),
			tenantId: parseOptionalText(safePayload.tenantId, 'payload.tenantId', 128),
		});
	});

	ipcMain.handle('cancel-mail-oauth', async (_event) => {
		deps.appLogger.info('IPC cancel-mail-oauth');
		const cancelled = deps.cancelPendingMailOAuth('OAuth login cancelled by user');
		return {ok: true as const, cancelled};
	});

	ipcMain.handle('sync-account', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		deps.appLogger.info('IPC sync-account accountId=%d', safeAccountId);
		return await deps.runSyncAndBroadcast(safeAccountId, 'manual');
	});
}
