import {Worker} from 'node:worker_threads';
import {ImapFlow} from 'imapflow';
import {createAppLogger, createMailDebugLogger, pushDebugLog} from '@main/debug/debugLog';
import {
	addAccount,
	deleteAccount,
	getAccountSyncCredentials,
	getAccounts,
	type PublicAccount,
	updateAccount,
} from '@main/db/repositories/accountsRepo';
import {
	deleteFolderByPath,
	deleteMessageLocally,
	getMessageById,
	getMessageContext,
	listFoldersByAccount,
	listMessagesByFolder,
	listRecentRecipients,
	listThreadMessagesByFolder,
	reorderCustomFolders,
	searchMessages,
	setMessageTag,
	updateFolderSettings,
} from '@main/db/repositories/mailRepo';
import {autodiscover, autodiscoverBasic} from '@main/mail/autodiscover';
import {deleteMailFilter, listMailFilters, runMailFiltersForMessages, upsertMailFilter} from '@main/mail/filterRules';
import {resolveImapSecurity} from '@main/mail/security';
import {
	createServerFolder,
	deleteServerFolder,
	deleteServerMessageByContext,
	moveServerMessage,
	setServerMessageFlagged,
	setServerMessageRead,
} from '@main/mail/actions';
import {saveDraftEmail, sendEmail} from '@main/mail/send';
import {downloadMessageAttachment, syncMessageBody, syncMessageSource, type SyncSummary} from '@main/mail/sync';
import {getDb, getSqlitePath} from '@main/db/drizzle';
import {verifyConnection} from '@main/mail/verify';
import {cancelPendingMailOAuth, startMailOAuth} from '@main/mail/oauth';
import {
	addAddressBook,
	addCalendarEvent,
	addContact,
	type DavSyncSummary,
	discoverDav,
	discoverDavPreview,
	editCalendarEvent,
	editContact,
	getAddressBooks,
	getCalendarEvents,
	getContacts,
	removeAddressBook,
	removeCalendarEvent,
	removeContact,
} from '@main/dav/sync';
import {registerAccountCoreIpc} from './registerAccountCoreIpc';
import {registerComposeIpc} from './registerComposeIpc';
import {registerDavIpc} from './registerDavIpc';
import {registerMailIpc} from './registerMailIpc';
import {
	DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
	normalizeAccountCalendarSyncIntervalMinutes,
	normalizeAccountContactsSyncIntervalMinutes,
	normalizeAccountEmailSyncIntervalMinutes,
	normalizeSyncIntervalMinutes,
} from '@llamamail/app/settingsRules';
import type {AccountSyncModuleStatusMap, DavSyncOptions, SyncModuleKey} from '@llamamail/app/ipcTypes';
import {
	isAccountCalendarModuleEnabled,
	isAccountContactsModuleEnabled,
	isAccountEmailModuleEnabled,
} from '@llamamail/app/accountModules';
import {appEventHandler, AppEvent} from '@llamamail/app/appEventHandler';
import {__} from '@llamamail/app/i18n/main';
import {getAppSettingsSync} from '@main/settings/store';
import {
	broadcastAccountSyncStatus,
	broadcastMessageReadUpdated as broadcastMessageReadUpdatedEvent,
	broadcastToAllWindows,
	broadcastUnreadCountUpdated,
} from './broadcast';
import {isDemoProvider} from '@main/demo/demoMode';
import {providerManager} from '@main/mail/providerManager';
import {ProviderManagerError} from '@llamamail/app/providerManager';
import {normalizeProviderSyncError} from '@llamamail/app/providerSyncError';
import {revokeMailOAuthSession} from '@main/auth/authServerClient';
import type {ProviderAncillarySyncResult as BaseProviderAncillarySyncResult} from '@llamamail/app/providerManager';

type ProviderAncillarySyncResult = BaseProviderAncillarySyncResult<DavSyncSummary>;

const bodyRequests = new Map<string, {cancel: () => void}>();
const SYNC_DEBOUNCE_MS = 350;
let autoSyncIntervalMs = 2 * 60 * 1000;
let autoSyncTimer: NodeJS.Timeout | null = null;
let autoSyncRunning = false;
let unreadCountListener: ((count: number) => void) | null = null;
let accountCountChangedListener: ((count: number) => void) | null = null;
let newMailListener:
	| ((event: {
			accountId: number;
			newMessages: number;
			source: string;
			target: {accountId: number; folderPath: string; messageId: number} | null;
	  }) => void)
	| null = null;

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
};

type AccountSyncState = {
	inFlight: boolean;
	queued: boolean;
	latestSource: string;
	latestSyncRequest: AccountSyncRequest | null;
	timer: NodeJS.Timeout | null;
	runner: Promise<void> | null;
	cancelCurrent: (() => void) | null;
	pending: Deferred<AccountSyncSummary> | null;
};

type AccountSyncRequest = {
	emails?: boolean;
	contacts?: boolean;
	calendar?: boolean;
};

export type AccountSyncSummary = SyncSummary & {
	dav?: DavSyncSummary;
	moduleStatus?: AccountSyncModuleStatusMap;
	partialSuccess?: boolean;
	failedModules?: SyncModuleKey[];
};

const accountSyncState = new Map<number, AccountSyncState>();
const blockedSyncAccounts = new Map<number, string>();
const accountLastEmailAutoSyncAt = new Map<number, number>();
const accountLastContactsAutoSyncAt = new Map<number, number>();
const accountLastCalendarAutoSyncAt = new Map<number, number>();

type IdleWatcherState = {
	accountId: number;
	stopped: boolean;
	folders: Map<string, FolderIdleState>;
};

type FolderIdleState = {
	mailboxPath: string;
	connecting: boolean;
	reconnectTimer: NodeJS.Timeout | null;
	reconnectAttempt: number;
	client: ImapFlow | null;
};

const IDLE_RECONNECT_MAX_MS = 60000;
const appLogger = createAppLogger('ipc:accounts');

const idleWatchers = new Map<number, IdleWatcherState>();

function isDemoModeEnabled(): boolean {
	return Boolean(getAppSettingsSync().developerDemoMode);
}

function filterAccountsForCurrentMode<T extends {provider: string | null | undefined}>(accounts: T[]): T[] {
	if (!isDemoModeEnabled()) return accounts;
	return accounts.filter((account) => isDemoProvider(account.provider));
}

function getVisibleUnreadCount(
	accounts: Array<{id: number; provider: string | null | undefined; sync_emails?: number | null}>,
): number {
	const visibleAccounts = filterAccountsForCurrentMode(accounts).filter((account) =>
		isAccountEmailModuleEnabled(account),
	);
	return visibleAccounts.reduce((sum, account) => {
		const folders = listFoldersByAccount(account.id);
		const accountUnread = folders.reduce((acc, folder) => acc + Math.max(0, Number(folder.unread_count) || 0), 0);
		return sum + accountUnread;
	}, 0);
}

function escapeCsvValue(value: string): string {
	if (!/[",\n\r]/.test(value)) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(
	contacts: Array<{
		full_name: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	}>,
): string {
	const lines = ['full_name,email,phone,organization,title,note'];
	for (const contact of contacts) {
		lines.push(
			[
				escapeCsvValue(contact.full_name ?? ''),
				escapeCsvValue(contact.email ?? ''),
				escapeCsvValue(contact.phone ?? ''),
				escapeCsvValue(contact.organization ?? ''),
				escapeCsvValue(contact.title ?? ''),
				escapeCsvValue(contact.note ?? ''),
			].join(','),
		);
	}
	return `${lines.join('\n')}\n`;
}

function escapeVCardValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function toVcf(
	contacts: Array<{
		full_name: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	}>,
): string {
	return (
		contacts
			.map((contact) => {
				const fullName = (contact.full_name || contact.email || '').trim();
				const safeName = escapeVCardValue(fullName);
				const safeEmail = escapeVCardValue((contact.email || '').trim());
				const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${safeName}`, `EMAIL;TYPE=INTERNET:${safeEmail}`];
				if (contact.phone?.trim()) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(contact.phone.trim())}`);
				if (contact.organization?.trim()) lines.push(`ORG:${escapeVCardValue(contact.organization.trim())}`);
				if (contact.title?.trim()) lines.push(`TITLE:${escapeVCardValue(contact.title.trim())}`);
				if (contact.note?.trim()) lines.push(`NOTE:${escapeVCardValue(contact.note.trim())}`);
				lines.push('END:VCARD');
				return lines.join('\n');
			})
			.join('\n') + '\n'
	);
}

export function registerAccountIpc(): void {
	const clearAccountAutoSyncMarkers = (accountId: number): void => {
		accountLastEmailAutoSyncAt.delete(accountId);
		accountLastContactsAutoSyncAt.delete(accountId);
		accountLastCalendarAutoSyncAt.delete(accountId);
	};

	registerAccountCoreIpc({
		appLogger,
		getAccounts: async () => filterAccountsForCurrentMode(await getAccounts()),
		getProviderDriverCatalog: () => providerManager.getProviderDriverCatalog(),
		getProviderCapabilities: async (accountId: number) => await providerManager.getCapabilities(accountId),
		getTotalUnreadCount: () => getVisibleUnreadCount(getAccountsSyncSnapshot()),
		addAccount: async (payload) => {
			const created = await addAccount(payload);
			clearAccountAutoSyncMarkers(created.id);
			return created;
		},
		updateAccount: async (accountId, payload) => {
			const updated = await updateAccount(accountId, payload);
			clearAccountAutoSyncMarkers(accountId);
			return updated;
		},
		deleteAccount: async (accountId) => {
			const deleted = await deleteAccount(accountId);
			clearAccountAutoSyncMarkers(accountId);
			return deleted;
		},
		revokeAccountOAuthTokens: async (accountId: number) => {
			try {
				const credentials = await getAccountSyncCredentials(accountId);
				if (credentials.auth_method !== 'oauth2' || !credentials.oauth_session) return;
				await revokeMailOAuthSession(credentials.oauth_session);
				appLogger.info(
					'OAuth tokens revoked accountId=%d provider=%s',
					accountId,
					credentials.oauth_provider ?? credentials.oauth_session.provider,
				);
			} catch (error) {
				appLogger.warn(
					'OAuth token revoke skipped accountId=%d error=%s',
					accountId,
					(error as any)?.message || String(error),
				);
			}
		},
		blockedSyncAccounts,
		broadcastAccountAdded: (payload) => broadcastToAllWindows('account-added', payload),
		broadcastAccountUpdated: (payload) => broadcastToAllWindows('account-updated', payload),
		broadcastAccountDeleted: (payload) => broadcastToAllWindows('account-deleted', payload),
		notifyAccountCountChanged,
		notifyUnreadCountChanged,
		runSyncAndBroadcast,
		ensureIdleWatcher,
		restartIdleWatcher,
		stopIdleWatcher,
		autodiscover,
		autodiscoverBasic,
		verifyConnection,
		testAccountServiceConnection: async (accountId, payload) => {
			const service = String(payload?.service || '')
				.trim()
				.toLowerCase();
			const mode = String(payload?.mode || 'authentication')
				.trim()
				.toLowerCase();
			if (service !== 'imap' && service !== 'smtp') {
				throw new Error(__('accounts.error.invalid_service'));
			}
			if (mode !== 'connection' && mode !== 'authentication') {
				throw new Error(__('accounts.error.invalid_mode'));
			}
			const hostOverride = String(payload?.host || '').trim() || null;
			const userOverride = String(payload?.user || '').trim() || null;
			const passwordOverride = String(payload?.password || '').trim() || null;
			const portOverride = Number(payload?.port);
			const secureOverride = typeof payload?.secure === 'boolean' ? payload.secure : null;

			if (service === 'imap') {
				const credentials = await getAccountSyncCredentials(accountId);
				const host = hostOverride || credentials.imap_host;
				const port =
					Number.isFinite(portOverride) && portOverride > 0
						? Math.round(portOverride)
						: credentials.imap_port;
				const secure = secureOverride === null ? Number(credentials.imap_secure ?? 1) > 0 : secureOverride;
				const user =
					userOverride || String(credentials.imap_user || credentials.user || credentials.email || '').trim();
				const password =
					mode === 'authentication'
						? passwordOverride ||
							String(credentials.imap_password || credentials.password || '').trim() ||
							undefined
						: undefined;
				return await verifyConnection({
					type: 'imap',
					mode: mode as 'connection' | 'authentication',
					host,
					port,
					secure,
					user,
					password,
					auth_method: credentials.auth_method,
					oauth_session: credentials.oauth_session,
				});
			}

			const credentials = await getAccountSendCredentials(accountId);
			const host = hostOverride || credentials.smtp_host;
			const port =
				Number.isFinite(portOverride) && portOverride > 0 ? Math.round(portOverride) : credentials.smtp_port;
			const secure = secureOverride === null ? Number(credentials.smtp_secure ?? 1) > 0 : secureOverride;
			const user =
				userOverride || String(credentials.smtp_user || credentials.user || credentials.email || '').trim();
			const password =
				mode === 'authentication'
					? passwordOverride ||
						String(credentials.smtp_password || credentials.password || '').trim() ||
						undefined
					: undefined;
			return await verifyConnection({
				type: 'smtp',
				mode: mode as 'connection' | 'authentication',
				host,
				port,
				secure,
				user,
				password,
				auth_method: credentials.auth_method,
				oauth_session: credentials.oauth_session,
			});
		},
		startMailOAuth,
		cancelPendingMailOAuth,
	});

	registerComposeIpc({
		appLogger,
		sendEmail,
		saveDraftEmail,
		runSyncAndBroadcast,
		broadcastAccountSyncStatus,
		broadcastSendEmailBackgroundStatus: (payload) => broadcastToAllWindows('send-email-background-status', payload),
	});

	registerMailIpc({
		appLogger,
		runSyncAndBroadcast,
		listFoldersByAccount,
		listMessagesByFolder,
		listThreadMessagesByFolder,
		createServerFolder,
		deleteServerFolder,
		deleteFolderByPath,
		updateFolderSettings,
		reorderCustomFolders,
		listMailFilters,
		upsertMailFilter,
		deleteMailFilter,
		runMailFiltersForMessages,
		getMessageById,
		searchMessages,
		syncMessageBody,
		syncMessageSource,
		bodyRequests,
		downloadMessageAttachment,
		sanitizeAttachmentFilename,
		setServerMessageRead,
		notifyUnreadCountChanged,
		broadcastMessageReadUpdated,
		setServerMessageFlagged,
		setMessageTag,
		moveServerMessage,
		getMessageContext,
		resolveArchiveFolderPath,
		deleteMessageLocally,
		deleteServerMessageByContext,
	});

	registerDavIpc({
		discoverDav,
		discoverDavPreview,
		syncDav: async (accountId, options?: DavSyncOptions | null) => {
			const result = await syncAccountAncillaryInWorker(accountId, options ?? null);
			if (result.dav) return result.dav;
			throw new Error(formatAncillarySyncFailure(result));
		},
		getContacts,
		listRecentRecipients,
		getAddressBooks,
		addAddressBook,
		addContact,
		editContact,
		removeAddressBook,
		removeContact,
		toVcf,
		toCsv,
		getCalendarEvents,
		addCalendarEvent,
		editCalendarEvent,
		removeCalendarEvent,
	});
}

function getAccountsSyncSnapshot(): Array<{id: number; provider: string | null | undefined; sync_emails: number}> {
	try {
		const db = getDb();
		const rows = db
			.prepare('SELECT id, provider, sync_emails FROM accounts ORDER BY created_at ASC')
			.all() as Array<{
			id: number;
			provider: string | null | undefined;
			sync_emails: number;
		}>;
		return rows;
	} catch {
		return [];
	}
}

function resolveAccountEmailSyncIntervalMs(account: PublicAccount): number {
	const minutes = normalizeAccountEmailSyncIntervalMinutes(
		account.email_sync_interval_minutes,
		DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
	);
	return minutes * 60 * 1000;
}

function resolveAccountContactsSyncIntervalMs(account: PublicAccount): number {
	const minutes = normalizeAccountContactsSyncIntervalMinutes(
		account.contacts_sync_interval_minutes,
		DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
	);
	return minutes * 60 * 1000;
}

function resolveAccountCalendarSyncIntervalMs(account: PublicAccount): number {
	const minutes = normalizeAccountCalendarSyncIntervalMinutes(
		account.calendar_sync_interval_minutes,
		DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
	);
	return minutes * 60 * 1000;
}

function isAutoSyncModuleDue(
	lastRunAtByAccountId: Map<number, number>,
	accountId: number,
	intervalMs: number,
	nowMs: number,
): boolean {
	const lastRunAt = lastRunAtByAccountId.get(accountId) ?? 0;
	if (!lastRunAt) return true;
	return nowMs - lastRunAt >= intervalMs;
}

function resolveIntervalSyncRequest(account: PublicAccount, nowMs: number): AccountSyncRequest | null {
	const shouldSyncEmails =
		isAccountEmailModuleEnabled(account) &&
		isAutoSyncModuleDue(accountLastEmailAutoSyncAt, account.id, resolveAccountEmailSyncIntervalMs(account), nowMs);
	const shouldSyncContacts =
		isAccountContactsModuleEnabled(account) &&
		isAutoSyncModuleDue(
			accountLastContactsAutoSyncAt,
			account.id,
			resolveAccountContactsSyncIntervalMs(account),
			nowMs,
		);
	const shouldSyncCalendar =
		isAccountCalendarModuleEnabled(account) &&
		isAutoSyncModuleDue(
			accountLastCalendarAutoSyncAt,
			account.id,
			resolveAccountCalendarSyncIntervalMs(account),
			nowMs,
		);
	if (!shouldSyncEmails && !shouldSyncContacts && !shouldSyncCalendar) return null;
	return {
		emails: shouldSyncEmails,
		contacts: shouldSyncContacts,
		calendar: shouldSyncCalendar,
	};
}

export function startAccountAutoSync(): void {
	if (autoSyncTimer) return;
	appLogger.info('Starting account auto sync intervalMs=%d', autoSyncIntervalMs);
	void runAutoSyncCycle('startup');
	void ensureIdleWatchersForAllAccounts();
	autoSyncTimer = setInterval(() => {
		void runAutoSyncCycle('interval');
	}, autoSyncIntervalMs);
}

function resolveArchiveFolderPath(accountId: number, currentFolderPath: string | null): string | null {
	const folders = listFoldersByAccount(accountId);
	if (folders.length === 0) return null;
	const current = String(currentFolderPath || '').toLowerCase();
	const byType = folders.find((folder) => (folder.type || '').toLowerCase() === 'archive');
	if (byType?.path && byType.path.toLowerCase() !== current) return byType.path;

	const byPath = folders.find((folder) => /archive|all mail/.test(folder.path.toLowerCase()));
	if (byPath?.path && byPath.path.toLowerCase() !== current) return byPath.path;

	return null;
}

export function stopAccountAutoSync(): void {
	if (!autoSyncTimer) return;
	appLogger.info('Stopping account auto sync');
	clearInterval(autoSyncTimer);
	autoSyncTimer = null;
	stopAllIdleWatchers();
}

export function setAutoSyncIntervalMinutes(minutes: number): void {
	const normalized = normalizeSyncIntervalMinutes(minutes);
	autoSyncIntervalMs = normalized * 60 * 1000;
	appLogger.info('Set auto sync interval minutes=%d', normalized);
	if (!autoSyncTimer) return;
	clearInterval(autoSyncTimer);
	autoSyncTimer = setInterval(() => {
		void runAutoSyncCycle('interval');
	}, autoSyncIntervalMs);
}

export function setUnreadCountListener(listener: ((count: number) => void) | null): void {
	unreadCountListener = listener;
}

export function setAccountCountChangedListener(listener: ((count: number) => void) | null): void {
	accountCountChangedListener = listener;
}

export function setNewMailListener(
	listener:
		| ((event: {
				accountId: number;
				newMessages: number;
				source: string;
				target: {accountId: number; folderPath: string; messageId: number} | null;
		  }) => void)
		| null,
): void {
	newMailListener = listener;
}

export function getCurrentUnreadCount(): number {
	return getVisibleUnreadCount(getAccountsSyncSnapshot());
}

async function runAutoSyncCycle(source: 'startup' | 'interval'): Promise<void> {
	if (autoSyncRunning) return;
	appLogger.debug('runAutoSyncCycle source=%s', source);
	autoSyncRunning = true;
	try {
		const accounts = await getAccounts();
		const syncableAccounts = accounts.filter(
			(account) =>
				!isDemoProvider(account.provider) &&
				!isDemoModeEnabled() &&
				(isAccountEmailModuleEnabled(account) ||
					isAccountContactsModuleEnabled(account) ||
					isAccountCalendarModuleEnabled(account)),
		);
		const nowMs = Date.now();
		void ensureIdleWatchersForAccounts(
			syncableAccounts.filter((account) => isAccountEmailModuleEnabled(account)).map((account) => account.id),
		);
		for (const account of syncableAccounts) {
			const syncRequest = source === 'interval' ? resolveIntervalSyncRequest(account, nowMs) : null;
			if (source === 'interval' && !syncRequest) continue;
			if (blockedSyncAccounts.has(account.id)) continue;
			try {
				await runSyncAndBroadcast(account.id, source, syncRequest ?? undefined);
			} catch (error) {
				console.error(`Autosync failed for account ${account.email}:`, error);
			} finally {
				if (source === 'interval' || source === 'startup') {
					const completedAt = Date.now();
					const completedRequest: AccountSyncRequest =
						source === 'interval'
							? (syncRequest ?? {emails: false, contacts: false, calendar: false})
							: {
									emails: isAccountEmailModuleEnabled(account),
									contacts: isAccountContactsModuleEnabled(account),
									calendar: isAccountCalendarModuleEnabled(account),
								};
					if (completedRequest.emails) accountLastEmailAutoSyncAt.set(account.id, completedAt);
					if (completedRequest.contacts) accountLastContactsAutoSyncAt.set(account.id, completedAt);
					if (completedRequest.calendar) accountLastCalendarAutoSyncAt.set(account.id, completedAt);
				}
			}
		}
	} finally {
		autoSyncRunning = false;
	}
}

async function runSyncAndBroadcast(
	accountId: number,
	source: string,
	syncRequest?: AccountSyncRequest,
): Promise<AccountSyncSummary> {
	appLogger.debug('runSyncAndBroadcast accountId=%d source=%s', accountId, source);
	const account = (await getAccounts()).find((item) => item.id === accountId) ?? null;
	if (account && isDemoModeEnabled() && !isDemoProvider(account.provider)) {
		const summary: AccountSyncSummary = {
			accountId,
			folders: 0,
			messages: 0,
			newMessages: 0,
			newMessageIds: [],
			newestMessageTarget: null,
		};
		broadcastSync({accountId, status: 'done', summary, source: 'demo-mode'});
		appEventHandler.emit(AppEvent.AccountSyncCompleted, {
			accountId,
			source: 'demo-mode',
			newMessages: 0,
			messages: 0,
			folders: 0,
		});
		return summary;
	}
	if (account && isDemoProvider(account.provider)) {
		const summary: AccountSyncSummary = {
			accountId,
			folders: 0,
			messages: 0,
			newMessages: 0,
			newMessageIds: [],
			newestMessageTarget: null,
		};
		broadcastSync({accountId, status: 'done', summary, source});
		appEventHandler.emit(AppEvent.AccountSyncCompleted, {
			accountId,
			source,
			newMessages: 0,
			messages: 0,
			folders: 0,
		});
		return summary;
	}
	const blockedReason = blockedSyncAccounts.get(accountId);
	if (blockedReason) {
		const error = __('accounts.sync.paused_for_account', {reason: blockedReason});
		broadcastSync({accountId, status: 'error', error, source, syncError: normalizeProviderSyncError(error)});
		appEventHandler.emit(AppEvent.AccountSyncFailed, {
			accountId,
			source,
			error,
			category: 'auth',
		});
		throw new Error(error);
	}

	const state = getAccountSyncState(accountId);
	state.latestSource = source;
	state.latestSyncRequest = syncRequest ?? null;
	if (!state.pending) {
		state.pending = createDeferred<AccountSyncSummary>();
	}

	if (state.inFlight) {
		state.queued = true;
		state.cancelCurrent?.();
		return state.pending.promise;
	}

	if (state.timer) {
		clearTimeout(state.timer);
	}

	state.timer = setTimeout(() => {
		state.timer = null;
		if (state.runner) return;
		state.runner = runSyncLoop(accountId, state).finally(() => {
			state.runner = null;
		});
	}, SYNC_DEBOUNCE_MS);

	return state.pending.promise;
}

async function runSyncLoop(accountId: number, state: AccountSyncState): Promise<void> {
	for (;;) {
		state.inFlight = true;
		state.queued = false;
		const source = state.latestSource;
		const syncRequest = state.latestSyncRequest;
		let accountSnapshot: PublicAccount | null = null;
		let cancelled = false;
		let activeMailWorker: Worker | null = null;
		let activeContactsWorker: Worker | null = null;
		let activeCalendarWorker: Worker | null = null;

		state.cancelCurrent = () => {
			cancelled = true;
			try {
				activeMailWorker?.postMessage({type: 'cancel'});
			} catch {
				// ignore post errors
			}
			try {
				activeMailWorker?.terminate();
			} catch {
				// ignore termination errors
			}
			try {
				activeContactsWorker?.terminate();
			} catch {
				// ignore termination errors
			}
			try {
				activeCalendarWorker?.terminate();
			} catch {
				// ignore termination errors
			}
		};

		broadcastSync({accountId, status: 'syncing', source});
		appEventHandler.emit(AppEvent.AccountSyncStarted, {accountId, source});
		appLogger.info('Sync started accountId=%d source=%s', accountId, source);

		try {
			accountSnapshot = (await getAccounts()).find((item) => item.id === accountId) ?? null;
			const emailsEnabled = isAccountEmailModuleEnabled(accountSnapshot);
			const contactsEnabled = isAccountContactsModuleEnabled(accountSnapshot);
			const calendarEnabled = isAccountCalendarModuleEnabled(accountSnapshot);
			const shouldSyncEmails = emailsEnabled && (syncRequest?.emails ?? true);
			const shouldSyncContacts = contactsEnabled && (syncRequest?.contacts ?? true);
			const shouldSyncCalendar = calendarEnabled && (syncRequest?.calendar ?? true);
			let mailSummary: SyncSummary = {
				accountId,
				folders: 0,
				messages: 0,
				newMessages: 0,
				newMessageIds: [],
				newestMessageTarget: null,
			};
			const moduleStatus: AccountSyncModuleStatusMap = {
				emails: shouldSyncEmails
					? {state: 'success'}
					: {
							state: 'skipped',
							reason: emailsEnabled
								? __('accounts.sync.email_not_requested')
								: __('accounts.sync.email_disabled_for_account'),
						},
				contacts: shouldSyncContacts
					? {state: 'skipped', reason: __('accounts.sync.contacts_not_executed')}
					: {
							state: 'skipped',
							reason: contactsEnabled
								? __('accounts.sync.contacts_not_requested')
								: __('accounts.sync.contacts_disabled_for_account'),
						},
				calendar: shouldSyncCalendar
					? {state: 'skipped', reason: __('accounts.sync.calendar_not_executed')}
					: {
							state: 'skipped',
							reason: calendarEnabled
								? __('accounts.sync.calendar_not_requested')
								: __('accounts.sync.calendar_disabled_for_account'),
						},
				files: {state: 'skipped', reason: __('accounts.sync.files_not_implemented')},
			};
			if (shouldSyncEmails) {
				const emailSyncService = await providerManager.resolveEmailSyncServiceForAccount(accountId);
				mailSummary = await emailSyncService.syncMailbox(accountId, (worker) => {
					activeMailWorker = worker;
					worker.on('message', (payload: unknown) => {
						if (!payload || typeof payload !== 'object') return;
						const data = payload as {type?: string; entry?: unknown};
						if (data.type !== 'debug-log' || !data.entry || typeof data.entry !== 'object') return;
						const entry = data.entry as {
							source?: unknown;
							level?: unknown;
							scope?: unknown;
							message?: unknown;
						};
						const source = String(entry.source || '').trim();
						const level = String(entry.level || '')
							.trim()
							.toLowerCase();
						if (
							(source !== 'imap' &&
								source !== 'smtp' &&
								source !== 'carddav' &&
								source !== 'caldav' &&
								source !== 'cloud' &&
								source !== 'app') ||
							(level !== 'trace' &&
								level !== 'debug' &&
								level !== 'info' &&
								level !== 'warn' &&
								level !== 'error' &&
								level !== 'fatal')
						) {
							return;
						}
						pushDebugLog({
							source: source as any,
							level: level as any,
							scope: String(entry.scope || 'mail-sync-worker').trim() || 'mail-sync-worker',
							message: String(entry.message || ''),
						});
					});
				});
			}
			if (cancelled && state.queued) continue;

			if (shouldSyncEmails && source !== 'manual' && mailSummary.newMessageIds.length > 0) {
				try {
					await runMailFiltersForMessages(accountId, mailSummary.newMessageIds, 'incoming');
				} catch (filterError) {
					console.warn(
						`Mail filter run failed for account ${accountId}:`,
						(filterError as any)?.message || String(filterError),
					);
				}
			}

			const [contactsAncillarySummary, calendarAncillarySummary] = await Promise.all([
				contactsEnabled
					? syncAccountAncillaryInWorker(
							accountId,
							{
								modules: {
									contacts: shouldSyncContacts,
									calendar: false,
								},
							},
							(worker) => {
								activeContactsWorker = worker;
							},
						)
					: Promise.resolve<ProviderAncillarySyncResult>({}),
				calendarEnabled
					? syncAccountAncillaryInWorker(
							accountId,
							{
								modules: {
									contacts: false,
									calendar: shouldSyncCalendar,
								},
							},
							(worker) => {
								activeCalendarWorker = worker;
							},
						)
					: Promise.resolve<ProviderAncillarySyncResult>({}),
			]);
			if (!shouldSyncContacts) {
				contactsAncillarySummary.moduleStatus = {
					...(contactsAncillarySummary.moduleStatus ?? {}),
					contacts: {
						state: 'skipped',
						reason: contactsEnabled
							? __('accounts.sync.contacts_not_requested')
							: __('accounts.sync.contacts_disabled_for_account'),
					},
				};
			}
			if (!shouldSyncCalendar) {
				calendarAncillarySummary.moduleStatus = {
					...(calendarAncillarySummary.moduleStatus ?? {}),
					calendar: {
						state: 'skipped',
						reason: calendarEnabled
							? __('accounts.sync.calendar_not_requested')
							: __('accounts.sync.calendar_disabled_for_account'),
					},
				};
			}
			const contactsDavSummary = contactsAncillarySummary.dav;
			const calendarDavSummary = calendarAncillarySummary.dav;
			const discoveredSummary = contactsDavSummary?.discovered ?? calendarDavSummary?.discovered ?? undefined;
			const davSummary: DavSyncSummary | undefined = discoveredSummary
				? {
						accountId: discoveredSummary.accountId,
						discovered: discoveredSummary,
						contacts: contactsDavSummary?.contacts ?? {
							upserted: 0,
							removed: 0,
							books: 0,
						},
						events: calendarDavSummary?.events ?? {
							upserted: 0,
							removed: 0,
							calendars: 0,
						},
					}
				: undefined;
			if (shouldSyncContacts) {
				moduleStatus.contacts = contactsAncillarySummary.moduleStatus?.contacts ?? {
					state: 'skipped',
					reason: __('accounts.sync.contacts_not_executed'),
				};
			}
			if (shouldSyncCalendar) {
				moduleStatus.calendar = calendarAncillarySummary.moduleStatus?.calendar ?? {
					state: 'skipped',
					reason: __('accounts.sync.calendar_not_executed'),
				};
			}
			moduleStatus.files =
				contactsAncillarySummary.moduleStatus?.files ??
				calendarAncillarySummary.moduleStatus?.files ??
				moduleStatus.files;
			const failedModules = (
				Object.entries(moduleStatus) as Array<[SyncModuleKey, AccountSyncModuleStatusMap[SyncModuleKey]]>
			)
				.filter(([, status]) => status.state === 'failed')
				.map(([module]) => module);
			const successModules = (Object.values(moduleStatus) as AccountSyncModuleStatusMap[SyncModuleKey][]).filter(
				(status) => status.state === 'success',
			).length;
			const summary: AccountSyncSummary = {
				...mailSummary,
				...(davSummary ? {dav: davSummary} : {}),
				moduleStatus,
				partialSuccess: failedModules.length > 0 && successModules > 0,
				failedModules,
			};

			notifyUnreadCountChanged();
			if (shouldSyncEmails && mailSummary.newMessages > 0 && newMailListener) {
				newMailListener({
					accountId,
					newMessages: mailSummary.newMessages,
					source,
					target: mailSummary.newestMessageTarget,
				});
			}
			if (shouldSyncEmails && mailSummary.newMessages > 0) {
				appEventHandler.emit(AppEvent.EmailNew, {
					accountId,
					newMessages: mailSummary.newMessages,
					source,
					target: mailSummary.newestMessageTarget,
				});
			}
			broadcastSync({accountId, status: 'done', summary, source});
			appEventHandler.emit(AppEvent.AccountSyncCompleted, {
				accountId,
				source,
				newMessages: Number(summary.newMessages || 0),
				messages: Number(summary.messages || 0),
				folders: Number(summary.folders || 0),
			});
			appLogger.info(
				'Sync done accountId=%d source=%s messages=%d newMessages=%d',
				accountId,
				source,
				summary.messages ?? 0,
				summary.newMessages ?? 0,
			);
			state.pending?.resolve(summary);
			state.pending = null;
			return;
		} catch (error: any) {
			const normalizedError = normalizeProviderSyncError(error);
			const message = normalizedError.message;
			const isCancelled = cancelled || normalizedError.category === 'cancelled';
			if (isCancelled && state.queued) {
				continue;
			}
			if (!isCancelled) {
				const autoDisabled = await maybeDisableEmailSyncForMailboxlessMicrosoftAccount(
					accountSnapshot,
					message,
					source,
				);
				if (autoDisabled) {
					state.pending?.reject(new Error(autoDisabled.message));
					state.pending = null;
					return;
				}
				if (error instanceof ProviderManagerError) {
					const providerError = __('accounts.sync.unavailable', {message});
					broadcastSync({
						accountId,
						status: 'error',
						error: providerError,
						source,
						syncError: {
							...normalizedError,
							category: 'provider_api',
							message: providerError,
						},
					});
					appEventHandler.emit(AppEvent.AccountSyncFailed, {
						accountId,
						source,
						error: providerError,
						category: 'provider_api',
					});
					appLogger.warn('Sync unavailable accountId=%d source=%s error=%s', accountId, source, message);
				} else if (
					normalizedError.category === 'auth' ||
					normalizedError.category === 'renewal' ||
					isCredentialFailure(message)
				) {
					blockedSyncAccounts.set(accountId, message);
					stopIdleWatcher(accountId);
					broadcastSync({
						accountId,
						status: 'error',
						error: __('accounts.sync.paused_credentials', {message}),
						source,
						syncError: normalizedError,
					});
					appEventHandler.emit(AppEvent.AccountSyncFailed, {
						accountId,
						source,
						error: message,
						category: normalizedError.category ?? 'auth',
					});
					appLogger.warn('Sync paused accountId=%d source=%s error=%s', accountId, source, message);
				} else {
					broadcastSync({accountId, status: 'error', error: message, source, syncError: normalizedError});
					appEventHandler.emit(AppEvent.AccountSyncFailed, {
						accountId,
						source,
						error: message,
						category: normalizedError.category ?? null,
					});
					appLogger.warn('Sync error accountId=%d source=%s error=%s', accountId, source, message);
				}
			}
			state.pending?.reject(error);
			state.pending = null;
			return;
		} finally {
			state.inFlight = false;
			state.cancelCurrent = null;
		}
	}
}

function isMicrosoftProviderAccount(account: PublicAccount | null): boolean {
	if (!account) return false;
	const provider = String(account.provider || '')
		.trim()
		.toLowerCase();
	const oauthProvider = String(account.oauth_provider || '')
		.trim()
		.toLowerCase();
	return provider === 'microsoft' || oauthProvider === 'microsoft';
}

function isMicrosoftMailboxMissingError(message: string): boolean {
	const text = String(message || '').toLowerCase();
	if (!text) return false;
	return (
		text.includes('noaduserbysid') ||
		text.includes('mailboxnotenabledforrestapi') ||
		text.includes('no mailbox') ||
		text.includes('user has no mailbox') ||
		text.includes('command error. 12')
	);
}

async function maybeDisableEmailSyncForMailboxlessMicrosoftAccount(
	account: PublicAccount | null,
	message: string,
	source: string,
): Promise<{message: string} | null> {
	if (!isMicrosoftProviderAccount(account) || !isMicrosoftMailboxMissingError(message)) return null;
	if (!account || !isAccountEmailModuleEnabled(account)) return null;

	if (!isAccountContactsModuleEnabled(account) && !isAccountCalendarModuleEnabled(account)) {
		const syncMessage = __('accounts.sync.microsoft_no_mailbox_sync_disabled');
		blockedSyncAccounts.set(account.id, syncMessage);
		stopIdleWatcher(account.id);
		broadcastSync({
			accountId: account.id,
			status: 'error',
			error: syncMessage,
			source,
			syncError: normalizeProviderSyncError(syncMessage),
		});
		appLogger.warn('Blocked sync for mailboxless Microsoft account accountId=%d reason=%s', account.id, message);
		return {
			message: syncMessage,
		};
	}

	const updated = await updateAccount(account.id, {
		email: account.email,
		provider: account.provider,
		auth_method: account.auth_method,
		oauth_provider: account.oauth_provider,
		display_name: account.display_name,
		reply_to: account.reply_to,
		organization: account.organization,
		signature_text: account.signature_text,
		signature_is_html: account.signature_is_html,
		signature_file_path: account.signature_file_path,
		attach_vcard: account.attach_vcard,
		imap_host: account.imap_host,
		imap_port: account.imap_port,
		imap_secure: account.imap_secure,
		pop3_host: account.pop3_host,
		pop3_port: account.pop3_port,
		pop3_secure: account.pop3_secure,
		smtp_host: account.smtp_host,
		smtp_port: account.smtp_port,
		smtp_secure: account.smtp_secure,
		sync_emails: 0,
		sync_contacts: account.sync_contacts,
		sync_calendar: account.sync_calendar,
		user: account.user,
	});

	blockedSyncAccounts.set(account.id, __('accounts.sync.microsoft_no_mailbox_signin_succeeded'));
	stopIdleWatcher(account.id);
	broadcastToAllWindows('account-updated', updated);
	const syncMessage = __('accounts.sync.microsoft_email_sync_turned_off');
	broadcastSync({
		accountId: account.id,
		status: 'error',
		error: syncMessage,
		source,
		syncError: normalizeProviderSyncError(syncMessage),
	});
	appLogger.warn('Auto-disabled email sync accountId=%d provider=microsoft reason=%s', account.id, message);
	notifyUnreadCountChanged();
	return {message: syncMessage};
}

async function syncAccountAncillaryInWorker(
	accountId: number,
	options?: DavSyncOptions | null,
	onWorkerReady?: (worker: Worker) => void,
): Promise<ProviderAncillarySyncResult> {
	const account = (await getAccounts()).find((item) => item.id === accountId) ?? null;
	const accountContactsEnabled = isAccountContactsModuleEnabled(account);
	const accountCalendarEnabled = isAccountCalendarModuleEnabled(account);
	const requestedContactsEnabled = options?.modules?.contacts ?? true;
	const requestedCalendarEnabled = options?.modules?.calendar ?? true;
	const effectiveContactsEnabled = accountContactsEnabled && requestedContactsEnabled;
	const effectiveCalendarEnabled = accountCalendarEnabled && requestedCalendarEnabled;
	const carddavLogger = createMailDebugLogger('carddav', `sync:${accountId}`);
	const caldavLogger = createMailDebugLogger('caldav', `sync:${accountId}`);
	const authMethod =
		String(account?.auth_method || '')
			.trim()
			.toLowerCase() || 'unknown';
	const provider =
		String(account?.provider || '')
			.trim()
			.toLowerCase() || 'none';
	const oauthProvider =
		String(account?.oauth_provider || '')
			.trim()
			.toLowerCase() || 'none';
	let driverKey = 'unknown';
	try {
		const driver = await providerManager.resolveDriverForAccount(accountId);
		driverKey =
			String(driver.key() || '')
				.trim()
				.toLowerCase() || 'unknown';
	} catch {
		// Keep unknown driver key when provider resolution fails; sync path below will report actual failure.
	}
	const route =
		authMethod === 'oauth2' && (driverKey === 'google' || driverKey === 'microsoft') ? 'oauth-api' : 'dav';
	carddavLogger.debug(
		'Ancillary sync dispatch account=%d route=%s provider=%s oauthProvider=%s authMethod=%s driver=%s contacts=%s',
		accountId,
		route,
		provider,
		oauthProvider,
		authMethod,
		driverKey,
		effectiveContactsEnabled ? 'on' : 'off',
	);
	caldavLogger.debug(
		'Ancillary sync dispatch account=%d route=%s provider=%s oauthProvider=%s authMethod=%s driver=%s calendar=%s',
		accountId,
		route,
		provider,
		oauthProvider,
		authMethod,
		driverKey,
		effectiveCalendarEnabled ? 'on' : 'off',
	);
	if (!effectiveContactsEnabled && !effectiveCalendarEnabled) {
		return {
			moduleStatus: {
				contacts: {
					state: 'skipped',
					reason: accountContactsEnabled
						? __('accounts.sync.contacts_not_requested')
						: __('accounts.sync.contacts_disabled_for_account'),
				},
				calendar: {
					state: 'skipped',
					reason: accountCalendarEnabled
						? __('accounts.sync.calendar_not_requested')
						: __('accounts.sync.calendar_disabled_for_account'),
				},
			},
		};
	}
	const worker = new Worker(new URL('../main/ancillarySyncWorker', import.meta.url), {
		workerData: {
			dbPath: getSqlitePath(),
			accountId,
			options: {
				...(options ?? {}),
				modules: {
					contacts: effectiveContactsEnabled,
					calendar: effectiveCalendarEnabled,
				},
			},
		},
	});
	onWorkerReady?.(worker);

	return await new Promise<ProviderAncillarySyncResult>((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			worker.removeAllListeners();
			fn();
		};

		worker.on('message', (payload: unknown) => {
			if (!payload || typeof payload !== 'object') return;
			const data = payload as {
				type?: string;
				summary?: ProviderAncillarySyncResult;
				error?: string;
				entry?: {
					source?: 'imap' | 'smtp' | 'carddav' | 'caldav' | 'cloud' | 'app';
					level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
					scope?: string;
					message?: string;
				};
			};
			if (data.type === 'debug-log' && data.entry) {
				const source = data.entry.source;
				const level = data.entry.level;
				if (!source || !level) return;
				pushDebugLog({
					source,
					level,
					scope: String(data.entry.scope || 'mail'),
					message: String(data.entry.message || ''),
				});
				return;
			}
			if (data.type === 'result' && data.summary) {
				finish(() => resolve(data.summary as ProviderAncillarySyncResult));
				return;
			}
			if (data.type === 'error') {
				finish(() => reject(new Error(data.error || __('accounts.error.ancillary_worker_failed'))));
			}
		});

		worker.on('error', (error) => {
			finish(() => reject(error));
		});

		worker.on('exit', (code) => {
			if (settled) return;
			if (code === 0) {
				finish(() => reject(new Error(__('accounts.error.ancillary_worker_no_result'))));
				return;
			}
			finish(() => reject(new Error(__('accounts.error.ancillary_worker_exit_code', {code}))));
		});
	});
}

function getAccountSyncState(accountId: number): AccountSyncState {
	const existing = accountSyncState.get(accountId);
	if (existing) return existing;
	const created: AccountSyncState = {
		inFlight: false,
		queued: false,
		latestSource: 'manual',
		latestSyncRequest: null,
		timer: null,
		runner: null,
		cancelCurrent: null,
		pending: null,
	};
	accountSyncState.set(accountId, created);
	return created;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
}

function formatAncillarySyncFailure(result: ProviderAncillarySyncResult): string {
	const moduleStatuses = [result.moduleStatus?.contacts, result.moduleStatus?.calendar];
	const preferredReasons = moduleStatuses
		.filter((status) => status?.state === 'failed')
		.map((status) => String(status?.reason || '').trim())
		.filter(Boolean);
	const fallbackReasons = moduleStatuses
		.filter((status) => status?.state !== 'success')
		.map((status) => String(status?.reason || '').trim())
		.filter(Boolean);
	const reasons = (preferredReasons.length > 0 ? preferredReasons : fallbackReasons).filter(
		(reason, index, all) => all.indexOf(reason) === index,
	);
	return reasons.join(' ').trim() || __('accounts.sync.dav_not_executed');
}

function broadcastSync(payload: any) {
	broadcastAccountSyncStatus(payload);
}

function notifyUnreadCountChanged(): void {
	const count = getVisibleUnreadCount(getAccountsSyncSnapshot());
	appLogger.debug('Broadcast unread-count-updated count=%d', count);
	broadcastUnreadCountUpdated(count);
	appEventHandler.emit(AppEvent.UnreadCountUpdated, {unreadCount: count});
	if (!unreadCountListener) return;
	unreadCountListener(count);
}

function broadcastMessageReadUpdated(payload: {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	unreadCount: number;
	totalCount: number;
	isRead: number;
}): void {
	broadcastMessageReadUpdatedEvent(payload);
	appEventHandler.emit(AppEvent.EmailReadUpdated, {
		messageId: payload.messageId,
		isRead: Number(payload.isRead) > 0,
		accountId: payload.accountId,
		folderPath: payload.folderPath,
	});
}

function notifyAccountCountChanged(): void {
	if (!accountCountChangedListener) return;
	void getAccounts()
		.then((accounts) => {
			accountCountChangedListener?.(accounts.length);
		})
		.catch(() => {
			// ignore listener failures
		});
}

function sanitizeAttachmentFilename(filename: string): string {
	const trimmed = String(filename || '').trim();
	const normalized = trimmed.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ');
	if (!normalized || normalized === '.' || normalized === '..') return 'attachment.bin';
	return normalized.slice(0, 255);
}

function restartIdleWatcher(accountId: number): void {
	stopIdleWatcher(accountId);
	ensureIdleWatcher(accountId);
}

function stopAllIdleWatchers(): void {
	for (const accountId of Array.from(idleWatchers.keys())) {
		stopIdleWatcher(accountId);
	}
}

async function ensureIdleWatchersForAllAccounts(): Promise<void> {
	const accounts = await getAccounts();
	ensureIdleWatchersForAccounts(
		accounts
			.filter(
				(account) =>
					!isDemoProvider(account.provider) && !isDemoModeEnabled() && isAccountEmailModuleEnabled(account),
			)
			.map((account) => account.id),
	);
}

function ensureIdleWatchersForAccounts(accountIds: number[]): void {
	const keep = new Set(accountIds);
	for (const accountId of keep) {
		ensureIdleWatcher(accountId);
	}
	for (const [accountId] of idleWatchers) {
		if (!keep.has(accountId)) {
			stopIdleWatcher(accountId);
		}
	}
}

function ensureIdleWatcher(accountId: number): void {
	const accountSnapshot = getAccountsSyncSnapshot().find((row) => row.id === accountId);
	if (accountSnapshot && !isAccountEmailModuleEnabled(accountSnapshot)) {
		stopIdleWatcher(accountId);
		return;
	}
	const existing = idleWatchers.get(accountId);
	if (existing && !existing.stopped) return;

	const state: IdleWatcherState = {
		accountId,
		stopped: false,
		folders: new Map<string, FolderIdleState>(),
	};
	idleWatchers.set(accountId, state);
	void connectIdleWatcher(state);
}

async function connectIdleWatcher(state: IdleWatcherState): Promise<void> {
	if (state.stopped) return;
	try {
		const driver = await providerManager.resolveDriverForAccount(state.accountId);
		if (!driver.supportsPushNotifications()) {
			return;
		}
		const account = await driver.resolveSyncCredentials(state.accountId);
		if (state.stopped) return;

		const probeClient = new ImapFlow({
			host: account.imap_host,
			port: account.imap_port,
			...resolveImapSecurity(account.imap_secure),
			auth: driver.resolveImapAuth(account),
			logger: createMailDebugLogger('imap', `idle-probe:${state.accountId}`),
		});
		let mailboxes: any[] = [];
		try {
			await probeClient.connect();
			mailboxes = await probeClient.list();
		} finally {
			try {
				await probeClient.logout();
			} catch {
				// ignore close errors
			}
		}
		if (state.stopped) return;

		const inboxPath = resolveInboxPath(mailboxes);
		const mailboxPaths = inboxPath ? [inboxPath] : ['INBOX'];
		const keep = new Set(mailboxPaths);

		for (const mailboxPath of mailboxPaths) {
			let folder = state.folders.get(mailboxPath);
			if (!folder) {
				folder = {
					mailboxPath,
					connecting: false,
					reconnectTimer: null,
					reconnectAttempt: 0,
					client: null,
				};
				state.folders.set(mailboxPath, folder);
			}
			void connectFolderIdleWatcher(state, folder);
		}

		for (const [mailboxPath] of state.folders) {
			if (!keep.has(mailboxPath)) {
				stopFolderIdleWatcher(state, mailboxPath);
			}
		}
	} catch (error: any) {
		if (!state.stopped) {
			const message = error?.message || String(error);
			const account = (await getAccounts()).find((item) => item.id === state.accountId) ?? null;
			const autoDisabled = await maybeDisableEmailSyncForMailboxlessMicrosoftAccount(
				account,
				message,
				'idle-probe',
			);
			if (autoDisabled) return;
			console.error(`IMAP IDLE connect failed for account ${state.accountId}:`, message);
			for (const folder of state.folders.values()) {
				scheduleFolderIdleReconnect(state, folder);
			}
			if (state.folders.size === 0) {
				const fallbackFolder: FolderIdleState = {
					mailboxPath: 'INBOX',
					connecting: false,
					reconnectTimer: null,
					reconnectAttempt: 0,
					client: null,
				};
				state.folders.set(fallbackFolder.mailboxPath, fallbackFolder);
				scheduleFolderIdleReconnect(state, fallbackFolder);
			}
		}
	}
}

async function connectFolderIdleWatcher(state: IdleWatcherState, folder: FolderIdleState): Promise<void> {
	if (state.stopped || folder.connecting || folder.client) return;
	folder.connecting = true;
	try {
		const driver = await providerManager.resolveDriverForAccount(state.accountId);
		if (!driver.supportsPushNotifications()) {
			return;
		}
		const account = await driver.resolveSyncCredentials(state.accountId);
		if (state.stopped) return;
		const client = new ImapFlow({
			host: account.imap_host,
			port: account.imap_port,
			...resolveImapSecurity(account.imap_secure),
			auth: driver.resolveImapAuth(account),
			logger: createMailDebugLogger('imap', `idle:${state.accountId}:${folder.mailboxPath}`),
		});

		client.on('exists', () => {
			if (state.stopped) return;
			void runSyncAndBroadcast(state.accountId, 'push').catch((error) => {
				if (state.stopped) return;
				console.warn(
					`Push-triggered sync failed for account ${state.accountId}:`,
					(error as any)?.message || String(error),
				);
			});
		});

		client.on('close', () => {
			if (state.stopped) return;
			scheduleFolderIdleReconnect(state, folder);
		});

		client.on('error', (error: any) => {
			if (state.stopped) return;
			const message = error?.message || String(error);
			console.error(
				`IMAP IDLE watcher error for account ${state.accountId} folder ${folder.mailboxPath}:`,
				message,
			);
			scheduleFolderIdleReconnect(state, folder);
		});

		await client.connect();
		await client.mailboxOpen(folder.mailboxPath, {readOnly: true});
		folder.client = client;
		folder.reconnectAttempt = 0;
	} catch (error: any) {
		if (!state.stopped) {
			const message = error?.message || String(error);
			const account = (await getAccounts()).find((item) => item.id === state.accountId) ?? null;
			const autoDisabled = await maybeDisableEmailSyncForMailboxlessMicrosoftAccount(account, message, 'idle');
			if (autoDisabled) return;
			console.error(
				`IMAP IDLE connect failed for account ${state.accountId} folder ${folder.mailboxPath}:`,
				message,
			);
			scheduleFolderIdleReconnect(state, folder);
		}
	} finally {
		folder.connecting = false;
	}
}

function scheduleFolderIdleReconnect(state: IdleWatcherState, folder: FolderIdleState): void {
	if (state.stopped) return;
	if (folder.reconnectTimer) return;
	if (folder.client) {
		try {
			const closeResult = (folder.client as any).close?.();
			if (closeResult && typeof closeResult.then === 'function') {
				void closeResult.catch(() => {
					// ignore
				});
			}
		} catch {
			// ignore
		}
		try {
			const logoutResult = folder.client.logout();
			if (logoutResult && typeof (logoutResult as any).then === 'function') {
				void (logoutResult as Promise<void>).catch(() => {
					// ignore
				});
			}
		} catch {
			// ignore
		}
		folder.client = null;
	}
	const delayMs = Math.min(IDLE_RECONNECT_MAX_MS, 2000 * Math.max(1, 2 ** folder.reconnectAttempt));
	folder.reconnectTimer = setTimeout(() => {
		folder.reconnectTimer = null;
		folder.reconnectAttempt += 1;
		void connectFolderIdleWatcher(state, folder);
	}, delayMs);
}

function stopFolderIdleWatcher(state: IdleWatcherState, mailboxPath: string): void {
	const folder = state.folders.get(mailboxPath);
	if (!folder) return;
	if (folder.reconnectTimer) {
		clearTimeout(folder.reconnectTimer);
		folder.reconnectTimer = null;
	}
	if (folder.client) {
		try {
			const closeResult = (folder.client as any).close?.();
			if (closeResult && typeof closeResult.then === 'function') {
				void closeResult.catch(() => {
					// ignore
				});
			}
		} catch {
			// ignore
		}
		try {
			const logoutResult = folder.client.logout();
			if (logoutResult && typeof (logoutResult as any).then === 'function') {
				void (logoutResult as Promise<void>).catch(() => {
					// ignore
				});
			}
		} catch {
			// ignore
		}
		folder.client = null;
	}
	state.folders.delete(mailboxPath);
}

function stopIdleWatcher(accountId: number): void {
	const state = idleWatchers.get(accountId);
	if (!state) return;
	state.stopped = true;
	for (const mailboxPath of Array.from(state.folders.keys())) {
		stopFolderIdleWatcher(state, mailboxPath);
	}
	idleWatchers.delete(accountId);
}

function resolveInboxPath(mailboxes: any[]): string | null {
	if (!Array.isArray(mailboxes) || mailboxes.length === 0) return null;
	const selectable = mailboxes.filter((box) => {
		const flags = box?.flags;
		if (flags && typeof flags?.has === 'function' && flags.has('\\Noselect')) return false;
		return Boolean(box?.path);
	});
	const bySpecialUse = selectable.find((box) => String(box?.specialUse || '').toLowerCase() === '\\inbox');
	if (bySpecialUse?.path) return String(bySpecialUse.path);
	const byPath = selectable.find((box) => String(box?.path || '').toLowerCase() === 'inbox');
	if (byPath?.path) return String(byPath.path);
	const byName = selectable.find((box) => String(box?.name || '').toLowerCase() === 'inbox');
	if (byName?.path) return String(byName.path);
	return null;
}

function isCredentialFailure(message: string): boolean {
	const text = String(message || '').toLowerCase();
	return (
		text.includes('authentication failed') ||
		text.includes('auth failed') ||
		text.includes('invalid credentials') ||
		text.includes('login failed') ||
		text.includes('password') ||
		text.includes('oauth') ||
		text.includes('not authenticated') ||
		text.includes('invalid user') ||
		text.includes('application-specific password') ||
		/\bauth\b/.test(text)
	);
}
