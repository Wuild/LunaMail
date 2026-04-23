import type {CalendarSyncRange, DavSyncModules, OAuthProvider} from '@llamamail/app/ipcTypes';
import type {ProviderCalendarRuntime, ProviderContactsRuntime} from '@llamamail/app/providerRuntime';
import {GoogleCalendarProvider, GoogleContactsProvider} from '@llamamail/providers/google';
import {MicrosoftCalendarProvider, MicrosoftContactsProvider} from '@llamamail/providers/microsoft';
import type {ModuleLogger, OauthSyncDependencies} from './runtimeContracts';

type DavLikeSyncSummary = {
	accountId: number;
	discovered: {accountId: number; carddavUrl: string | null; caldavUrl: string | null};
	contacts: {upserted: number; removed: number; books: number};
	events: {upserted: number; removed: number; calendars: number};
	moduleStatus?: {
		contacts?: {state: 'success' | 'failed' | 'skipped'; reason?: string};
		calendar?: {state: 'success' | 'failed' | 'skipped'; reason?: string};
	};
};

type OAuthSyncInput = {
	accountId: number;
	oauthProvider: OAuthProvider | null;
	accessToken: string;
	calendarRange?: CalendarSyncRange | null;
	modules?: DavSyncModules | null;
	carddavLogger: ModuleLogger;
	caldavLogger: ModuleLogger;
};

type OauthDavRuntime = {
	source: string;
	calendarPrefix: string;
	contacts: ProviderContactsRuntime;
	calendar: ProviderCalendarRuntime;
};

const OAUTH_DAV_RUNTIME_BY_PROVIDER: Record<OAuthProvider, OauthDavRuntime> = {
	google: {
		source: 'google-api',
		calendarPrefix: 'google',
		contacts: new GoogleContactsProvider(),
		calendar: new GoogleCalendarProvider(),
	},
	microsoft: {
		source: 'microsoft-graph',
		calendarPrefix: 'microsoft',
		contacts: new MicrosoftContactsProvider(),
		calendar: new MicrosoftCalendarProvider(),
	},
};

let dependencies: OauthSyncDependencies = {
	upsertContacts: () => ({upserted: 0, removed: 0}),
	upsertCalendarEvents: () => ({upserted: 0, removed: 0}),
	deleteCalendarEventsByUids: () => ({removed: 0}),
};

export function configureOauthSyncDependencies(nextDependencies: OauthSyncDependencies): void {
	dependencies = nextDependencies;
}

function normalizeCalendarRange(calendarRange?: CalendarSyncRange | null): {startIso: string; endIso: string} | null {
	const startIso = String(calendarRange?.startIso || '').trim();
	const endIso = String(calendarRange?.endIso || '').trim();
	if (!startIso || !endIso) return null;
	const startAt = Date.parse(startIso);
	const endAt = Date.parse(endIso);
	if (Number.isNaN(startAt) || Number.isNaN(endAt) || endAt < startAt) return null;
	return {
		startIso: new Date(startAt).toISOString(),
		endIso: new Date(endAt).toISOString(),
	};
}

function isInsufficientScopeError(error: unknown): boolean {
	const message = String((error as any)?.message || error || '').toLowerCase();
	return message.includes('access_token_scope_insufficient') || message.includes('insufficient authentication scopes');
}

function resolveRuntime(provider: OAuthProvider | null): OauthDavRuntime | null {
	if (!provider) return null;
	return OAUTH_DAV_RUNTIME_BY_PROVIDER[provider] ?? null;
}

export async function syncOauthProviderDav(input: OAuthSyncInput): Promise<DavLikeSyncSummary> {
	const runtime = resolveRuntime(input.oauthProvider);
	const normalizedRange = normalizeCalendarRange(input.calendarRange);
	const syncModules = {
		contacts: input.modules?.contacts !== false,
		calendar: input.modules?.calendar !== false,
	};
	input.carddavLogger.debug(
		'OAuth DAV bridge start provider=%s account=%d contacts=%s',
		input.oauthProvider,
		input.accountId,
		syncModules.contacts ? 'on' : 'off',
	);
	input.caldavLogger.debug(
		'OAuth DAV bridge start provider=%s account=%d calendar=%s range=%s..%s',
		input.oauthProvider,
		input.accountId,
		syncModules.calendar ? 'on' : 'off',
		normalizedRange?.startIso ?? 'none',
		normalizedRange?.endIso ?? 'none',
	);

	if (!runtime) {
		input.carddavLogger.warn('Skipping OAuth ancillary sync for unsupported provider=%s', input.oauthProvider);
		input.caldavLogger.warn('Skipping OAuth ancillary sync for unsupported provider=%s', input.oauthProvider);
		return {
			accountId: input.accountId,
			discovered: {accountId: input.accountId, carddavUrl: null, caldavUrl: null},
			contacts: {upserted: 0, removed: 0, books: 0},
			events: {upserted: 0, removed: 0, calendars: 0},
			moduleStatus: {
				contacts: {state: 'failed', reason: 'Unsupported OAuth provider for contacts sync.'},
				calendar: {state: 'failed', reason: 'Unsupported OAuth provider for calendar sync.'},
			},
		};
	}

	let contactsPersisted = {upserted: 0, removed: 0};
	let contactsModuleStatus: {state: 'success' | 'failed' | 'skipped'; reason?: string};
	if (syncModules.contacts) {
		try {
			const contactsResult = await runtime.contacts.sync(input.accessToken);
			contactsPersisted = dependencies.upsertContacts(input.accountId, contactsResult.rows, runtime.source);
			input.carddavLogger.info(
				'OAuth contacts persisted provider=%s upserted=%d removed=%d rows=%d',
				input.oauthProvider,
				contactsPersisted.upserted,
				contactsPersisted.removed,
				contactsResult.rows.length,
			);
			contactsModuleStatus = {state: 'success'};
		} catch (error: any) {
			const reason =
				runtime.source === 'google-api' && isInsufficientScopeError(error)
					? 'Google contacts permission missing. Reconnect this account to grant required contacts scopes.'
					: error?.message || String(error);
			input.carddavLogger.error(
				'OAuth contacts sync failed provider=%s account=%d reason=%s',
				input.oauthProvider,
				input.accountId,
				reason,
			);
			contactsModuleStatus = {state: 'failed', reason};
		}
	} else {
		contactsModuleStatus = {state: 'skipped', reason: 'Contacts sync module disabled.'};
		input.carddavLogger.debug('Skipping OAuth contacts sync because contacts module is disabled');
	}

	let eventsPersisted = {upserted: 0, removed: 0};
	let calendarModuleStatus: {state: 'success' | 'failed' | 'skipped'; reason?: string};
	if (syncModules.calendar) {
		try {
			const calendarResult = await runtime.calendar.sync(input.accessToken, normalizedRange);
			for (const [calendarId, legacySeriesUids] of Object.entries(calendarResult.legacySeriesUidsByCalendar)) {
				dependencies.deleteCalendarEventsByUids(
					input.accountId,
					runtime.source,
					`${runtime.calendarPrefix}:${calendarId}`,
					legacySeriesUids,
				);
			}
			eventsPersisted = dependencies.upsertCalendarEvents(input.accountId, calendarResult.rows, runtime.source, {
				removeMissing: !normalizedRange,
			});
			input.caldavLogger.info(
				'OAuth calendar persisted provider=%s upserted=%d removed=%d rows=%d',
				input.oauthProvider,
				eventsPersisted.upserted,
				eventsPersisted.removed,
				calendarResult.rows.length,
			);
			calendarModuleStatus = {state: 'success'};
		} catch (error: any) {
			const reason = error?.message || String(error);
			input.caldavLogger.error(
				'OAuth calendar sync failed provider=%s account=%d reason=%s',
				input.oauthProvider,
				input.accountId,
				reason,
			);
			calendarModuleStatus = {state: 'failed', reason};
		}
	} else {
		calendarModuleStatus = {state: 'skipped', reason: 'Calendar sync module disabled.'};
		input.caldavLogger.debug('Skipping OAuth calendar sync because calendar module is disabled');
	}

	return {
		accountId: input.accountId,
		discovered: {accountId: input.accountId, carddavUrl: runtime.source, caldavUrl: runtime.source},
		contacts: {upserted: contactsPersisted.upserted, removed: contactsPersisted.removed, books: 1},
		events: {upserted: eventsPersisted.upserted, removed: eventsPersisted.removed, calendars: 1},
		moduleStatus: {
			contacts: contactsModuleStatus,
			calendar: calendarModuleStatus,
		},
	};
}
