import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {syncDav} from '@main/dav/sync.js';
import {syncOauthProviderDav} from '@main/dav/oauthSync.js';
import {refreshMailOAuthSessionWithOptions} from '@main/auth/authServerClient.js';
import {getMicrosoftGraphOAuthScopes} from '@main/mail/oauth.js';
import type {MailProviderDriver, ProviderAncillarySyncResult, ProviderAncillarySyncService} from './contracts.js';
import type {DavSyncOptions, OAuthProvider} from '@/shared/ipcTypes.js';

export class DavAncillarySyncService implements ProviderAncillarySyncService {
	readonly #driver: MailProviderDriver;

	constructor(driver: MailProviderDriver) {
		this.#driver = driver;
	}

	async sync(accountId: number, _options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult> {
		const syncContacts = _options?.modules?.contacts !== false;
		const syncCalendar = _options?.modules?.calendar !== false;
		const supportsContacts = this.#driver.supports('contacts');
		const supportsCalendar = this.#driver.supports('calendar');
		const shouldSyncContacts = supportsContacts && syncContacts;
		const shouldSyncCalendar = supportsCalendar && syncCalendar;
		if (!supportsContacts && !supportsCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Provider does not support contacts sync.'},
					calendar: {state: 'skipped', reason: 'Provider does not support calendar sync.'},
				},
			};
		}
		if (!shouldSyncContacts && !shouldSyncCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		}

		try {
			const dav = await syncDav(accountId, _options ?? null);
			return {
				dav,
				moduleStatus: {
					contacts: shouldSyncContacts
						? {state: 'success'}
						: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: shouldSyncCalendar
						? {state: 'success'}
						: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		} catch (davError: any) {
			const reason = davError?.message || String(davError);
			createMailDebugLogger('carddav', `sync:${accountId}`).error('DAV sync skipped: %s', reason);
			createMailDebugLogger('caldav', `sync:${accountId}`).error('DAV sync skipped: %s', reason);
			return {
				moduleStatus: {
					contacts: shouldSyncContacts
						? {state: 'failed', reason}
						: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: shouldSyncCalendar
						? {state: 'failed', reason}
						: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		}
	}
}

export class OAuthApiAncillarySyncService implements ProviderAncillarySyncService {
	readonly #driver: MailProviderDriver;
	readonly #provider: OAuthProvider;

	constructor(driver: MailProviderDriver, provider: OAuthProvider) {
		this.#driver = driver;
		this.#provider = provider;
	}

	async sync(accountId: number, options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult> {
		const syncContacts = options?.modules?.contacts !== false;
		const syncCalendar = options?.modules?.calendar !== false;
		const supportsContacts = this.#driver.supports('contacts');
		const supportsCalendar = this.#driver.supports('calendar');
		const shouldSyncContacts = supportsContacts && syncContacts;
		const shouldSyncCalendar = supportsCalendar && syncCalendar;
		if (!supportsContacts && !supportsCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Provider does not support contacts sync.'},
					calendar: {state: 'skipped', reason: 'Provider does not support calendar sync.'},
				},
			};
		}
		if (!shouldSyncContacts && !shouldSyncCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		}

		try {
			const credentials = await this.#driver.resolveSyncCredentials(accountId);
			let accessToken = String(credentials.oauth_session?.accessToken || '').trim();
			if (credentials.auth_method !== 'oauth2' || !accessToken) {
				const dav = await syncDav(accountId, options ?? null);
				return {
					dav,
					moduleStatus: {
						contacts: shouldSyncContacts
							? {state: 'success'}
							: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
						calendar: shouldSyncCalendar
							? {state: 'success'}
							: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
						},
					};
				}
			if (this.#provider === 'microsoft' && credentials.oauth_session?.refreshToken) {
				const refreshed = await refreshMailOAuthSessionWithOptions(credentials.oauth_session, {
					additionalScopes: getMicrosoftGraphOAuthScopes(),
					replaceExistingScopes: true,
				});
				accessToken = String(refreshed.accessToken || '').trim();
				if (!accessToken) {
					throw new Error('Microsoft OAuth token refresh did not return a Graph API access token.');
				}
			}
			const dav = await syncOauthProviderDav({
				accountId,
				oauthProvider: this.#provider,
				accessToken,
				calendarRange: options?.calendarRange ?? null,
				carddavLogger: createMailDebugLogger('carddav', `sync:${accountId}`),
				caldavLogger: createMailDebugLogger('caldav', `sync:${accountId}`),
			});
			return {
				dav,
				moduleStatus: {
					contacts: shouldSyncContacts
						? {state: 'success'}
						: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: shouldSyncCalendar
						? {state: 'success'}
						: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		} catch (error: any) {
			const reason = error?.message || String(error);
			createMailDebugLogger('carddav', `sync:${accountId}`).error('OAuth ancillary sync failed: %s', reason);
			createMailDebugLogger('caldav', `sync:${accountId}`).error('OAuth ancillary sync failed: %s', reason);
			return {
				moduleStatus: {
					contacts: shouldSyncContacts
						? {state: 'failed', reason}
						: {state: 'skipped', reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)},
					calendar: shouldSyncCalendar
						? {state: 'failed', reason}
						: {state: 'skipped', reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)},
				},
			};
		}
	}
}

function resolveSkippedReason(
	module: 'contacts' | 'calendar',
	isSupported: boolean,
	isEnabled: boolean,
): string {
	if (!isSupported) {
		return module === 'contacts'
			? 'Provider does not support contacts sync.'
			: 'Provider does not support calendar sync.';
	}
	if (!isEnabled) {
		return module === 'contacts'
			? 'Contacts sync is disabled for this account.'
			: 'Calendar sync is disabled for this account.';
	}
	return module === 'contacts' ? 'Contacts sync was not executed.' : 'Calendar sync was not executed.';
}
