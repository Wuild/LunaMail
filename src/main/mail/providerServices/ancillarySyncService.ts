import {createMailDebugLogger} from '@main/debug/debugLog';
import type {DavSyncSummary} from '@main/dav/sync';
import {syncDav} from '@main/dav/sync';
import {syncOauthProviderDav} from '@main/dav/oauthSync';
import {refreshMailOAuthSessionWithOptions} from '@main/auth/authServerClient';
import {getMicrosoftGraphOAuthScopes} from '@main/mail/oauth';
import type {ProviderAncillarySyncResult, ProviderAncillarySyncService} from '@llamamail/app/providerManager';
import type {ProviderRuntimeDriver} from '@llamamail/app/providerRegistration';
import type {DavSyncOptions, OAuthProvider} from '@llamamail/app/ipcTypes';

export class DavAncillarySyncService implements ProviderAncillarySyncService<DavSyncSummary> {
	readonly #driver: ProviderRuntimeDriver;

	constructor(driver: ProviderRuntimeDriver) {
		this.#driver = driver;
	}

	async sync(accountId: number, options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult<DavSyncSummary>> {
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
					contacts: {
						state: 'skipped',
						reason: resolveSkippedReason('contacts', supportsContacts, syncContacts),
					},
					calendar: {
						state: 'skipped',
						reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar),
					},
				},
			};
		}

		try {
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

export class OAuthApiAncillarySyncService implements ProviderAncillarySyncService<DavSyncSummary> {
	readonly #driver: ProviderRuntimeDriver;
	readonly #provider: OAuthProvider;

	constructor(driver: ProviderRuntimeDriver, provider: OAuthProvider) {
		this.#driver = driver;
		this.#provider = provider;
	}

	async sync(accountId: number, options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult<DavSyncSummary>> {
		const syncContacts = options?.modules?.contacts !== false;
		const syncCalendar = options?.modules?.calendar !== false;
		const supportsContacts = this.#driver.supports('contacts');
		const supportsCalendar = this.#driver.supports('calendar');
		const shouldSyncContacts = supportsContacts && syncContacts;
		const shouldSyncCalendar = supportsCalendar && syncCalendar;
		const carddavLogger = createMailDebugLogger('carddav', `sync:${accountId}`);
		const caldavLogger = createMailDebugLogger('caldav', `sync:${accountId}`);
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
					contacts: {
						state: 'skipped',
						reason: resolveSkippedReason('contacts', supportsContacts, syncContacts),
					},
					calendar: {
						state: 'skipped',
						reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar),
					},
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
							: {
									state: 'skipped',
									reason: resolveSkippedReason('contacts', supportsContacts, syncContacts),
								},
						calendar: shouldSyncCalendar
							? {state: 'success'}
							: {
									state: 'skipped',
									reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar),
								},
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
				carddavLogger,
				caldavLogger,
			});
			const contactsStatus =
				dav.moduleStatus?.contacts ??
				(shouldSyncContacts
					? {state: 'success' as const}
					: {state: 'skipped' as const, reason: resolveSkippedReason('contacts', supportsContacts, syncContacts)});
			const calendarStatus =
				dav.moduleStatus?.calendar ??
				(shouldSyncCalendar
					? {state: 'success' as const}
					: {state: 'skipped' as const, reason: resolveSkippedReason('calendar', supportsCalendar, syncCalendar)});
			return {
				dav,
				moduleStatus: {
					contacts: contactsStatus,
					calendar: calendarStatus,
				},
			};
		} catch (error: any) {
			const reason = error?.message || String(error);
			carddavLogger.error('OAuth ancillary contacts sync failed provider=%s account=%d reason=%s', this.#provider, accountId, reason);
			caldavLogger.error('OAuth ancillary calendar sync failed provider=%s account=%d reason=%s', this.#provider, accountId, reason);
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

function resolveSkippedReason(module: 'contacts' | 'calendar', isSupported: boolean, isEnabled: boolean): string {
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
