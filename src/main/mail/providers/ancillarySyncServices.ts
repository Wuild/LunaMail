import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {syncDav} from '@main/dav/sync.js';
import {syncOauthProviderDav} from '@main/dav/oauthSync.js';
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
		if (!this.#driver.supports('contacts') && !this.#driver.supports('calendar')) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Provider does not support contacts sync.'},
					calendar: {state: 'skipped', reason: 'Provider does not support calendar sync.'},
				},
			};
		}
		if (!syncContacts && !syncCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Contacts sync is disabled for this account.'},
					calendar: {state: 'skipped', reason: 'Calendar sync is disabled for this account.'},
				},
			};
		}

		try {
			const dav = await syncDav(accountId, _options ?? null);
			return {
				dav,
				moduleStatus: {
					contacts: syncContacts
						? {state: 'success'}
						: {state: 'skipped', reason: 'Contacts sync is disabled for this account.'},
					calendar: syncCalendar
						? {state: 'success'}
						: {state: 'skipped', reason: 'Calendar sync is disabled for this account.'},
				},
			};
		} catch (davError: any) {
			const reason = davError?.message || String(davError);
			createMailDebugLogger('carddav', `sync:${accountId}`).error('DAV sync skipped: %s', reason);
			createMailDebugLogger('caldav', `sync:${accountId}`).error('DAV sync skipped: %s', reason);
			return {
				moduleStatus: {
					contacts: {state: 'failed', reason},
					calendar: {state: 'failed', reason},
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
		if (!this.#driver.supports('contacts') && !this.#driver.supports('calendar')) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Provider does not support contacts sync.'},
					calendar: {state: 'skipped', reason: 'Provider does not support calendar sync.'},
				},
			};
		}
		if (!syncContacts && !syncCalendar) {
			return {
				moduleStatus: {
					contacts: {state: 'skipped', reason: 'Contacts sync is disabled for this account.'},
					calendar: {state: 'skipped', reason: 'Calendar sync is disabled for this account.'},
				},
			};
		}

		try {
			const credentials = await this.#driver.resolveSyncCredentials(accountId);
			const accessToken = String(credentials.oauth_session?.accessToken || '').trim();
			if (credentials.auth_method !== 'oauth2' || !accessToken) {
				const dav = await syncDav(accountId, options ?? null);
				return {
					dav,
					moduleStatus: {
						contacts: syncContacts
							? {state: 'success'}
							: {state: 'skipped', reason: 'Contacts sync is disabled for this account.'},
						calendar: syncCalendar
							? {state: 'success'}
							: {state: 'skipped', reason: 'Calendar sync is disabled for this account.'},
					},
				};
			}
			if (this.#provider === 'microsoft' && !looksLikeJwt(accessToken)) {
				throw new Error(
					'Microsoft OAuth token is invalid for Graph API. Reconnect the Microsoft account to refresh cloud/contacts/calendar scopes.',
				);
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
					contacts: syncContacts
						? {state: 'success'}
						: {state: 'skipped', reason: 'Contacts sync is disabled for this account.'},
					calendar: syncCalendar
						? {state: 'success'}
						: {state: 'skipped', reason: 'Calendar sync is disabled for this account.'},
				},
			};
		} catch (error: any) {
			const reason = error?.message || String(error);
			createMailDebugLogger('carddav', `sync:${accountId}`).error('OAuth ancillary sync failed: %s', reason);
			createMailDebugLogger('caldav', `sync:${accountId}`).error('OAuth ancillary sync failed: %s', reason);
			return {
				moduleStatus: {
					contacts: {state: 'failed', reason},
					calendar: {state: 'failed', reason},
				},
			};
		}
	}
}

function looksLikeJwt(token: string): boolean {
	return String(token || '')
		.trim()
		.split('.').length === 3;
}
