import {randomUUID} from 'node:crypto';
import {GoogleCalendarProvider} from '@llamamail/providers/google/calendar';
import {
	createOauthContact,
	deleteOauthContactForAccount,
	isOauthProviderContactSource,
	resolveOauthContactContext,
	updateOauthContactForAccount,
} from './oauthContactsRuntime';
import type {DavSyncOptions} from '@llamamail/app/ipcTypes';
import {__} from '@llamamail/app/i18n/main';
import type {ModuleLogger} from './runtimeContracts';

type DavSyncDependencies = {
	getAccountSyncCredentials: (accountId: number) => Promise<any>;
	createAddressBook: (...args: any[]) => any;
	createCalendarEvent: (...args: any[]) => any;
	createLocalCalendarEvent: (...args: any[]) => any;
	createLocalContact: (...args: any[]) => any;
	deleteLocalAddressBook: (...args: any[]) => any;
	deleteCalendarEventById: (...args: any[]) => any;
	deleteContactById: (...args: any[]) => any;
	deleteLocalCalendarEvent: (...args: any[]) => any;
	deleteLocalContact: (...args: any[]) => any;
	getCalendarEventById: (...args: any[]) => any;
	getContactById: (...args: any[]) => any;
	getDavSettings: (...args: any[]) => any;
	listAddressBooks: (...args: any[]) => any;
	listCalendarEvents: (...args: any[]) => any;
	listContacts: (...args: any[]) => any;
	syncCardDavAddressBooks: (...args: any[]) => any;
	updateCalendarEventById: (...args: any[]) => any;
	updateCardDavContact: (...args: any[]) => any;
	updateExternalContact: (...args: any[]) => any;
	updateLocalCalendarEvent: (...args: any[]) => any;
	updateLocalContact: (...args: any[]) => any;
	upsertCalendarEvents: (...args: any[]) => any;
	upsertCardDavContact: (...args: any[]) => any;
	upsertContacts: (...args: any[]) => any;
	upsertDavSettings: (...args: any[]) => any;
	createMailDebugLogger: (channel: string, context: string) => ModuleLogger;
};

const notConfigured = () => {
	throw new Error(__('dav.sync.error.runtime_dependencies_not_configured'));
};

let getAccountSyncCredentials: DavSyncDependencies['getAccountSyncCredentials'] = notConfigured as any;
let createAddressBook: DavSyncDependencies['createAddressBook'] = notConfigured;
let createCalendarEvent: DavSyncDependencies['createCalendarEvent'] = notConfigured;
let createLocalCalendarEvent: DavSyncDependencies['createLocalCalendarEvent'] = notConfigured;
let createLocalContact: DavSyncDependencies['createLocalContact'] = notConfigured;
let deleteLocalAddressBook: DavSyncDependencies['deleteLocalAddressBook'] = notConfigured;
let deleteCalendarEventById: DavSyncDependencies['deleteCalendarEventById'] = notConfigured;
let deleteContactById: DavSyncDependencies['deleteContactById'] = notConfigured;
let deleteLocalCalendarEvent: DavSyncDependencies['deleteLocalCalendarEvent'] = notConfigured;
let deleteLocalContact: DavSyncDependencies['deleteLocalContact'] = notConfigured;
let getCalendarEventById: DavSyncDependencies['getCalendarEventById'] = notConfigured;
let getContactById: DavSyncDependencies['getContactById'] = notConfigured;
let getDavSettings: DavSyncDependencies['getDavSettings'] = notConfigured;
let listAddressBooks: DavSyncDependencies['listAddressBooks'] = notConfigured;
let listCalendarEvents: DavSyncDependencies['listCalendarEvents'] = notConfigured;
let listContacts: DavSyncDependencies['listContacts'] = notConfigured;
let syncCardDavAddressBooks: DavSyncDependencies['syncCardDavAddressBooks'] = notConfigured;
let updateCalendarEventById: DavSyncDependencies['updateCalendarEventById'] = notConfigured;
let updateCardDavContact: DavSyncDependencies['updateCardDavContact'] = notConfigured;
let updateExternalContact: DavSyncDependencies['updateExternalContact'] = notConfigured;
let updateLocalCalendarEvent: DavSyncDependencies['updateLocalCalendarEvent'] = notConfigured;
let updateLocalContact: DavSyncDependencies['updateLocalContact'] = notConfigured;
let upsertCalendarEvents: DavSyncDependencies['upsertCalendarEvents'] = notConfigured;
let upsertCardDavContact: DavSyncDependencies['upsertCardDavContact'] = notConfigured;
let upsertContacts: DavSyncDependencies['upsertContacts'] = notConfigured;
let upsertDavSettings: DavSyncDependencies['upsertDavSettings'] = notConfigured;
let createMailDebugLogger: DavSyncDependencies['createMailDebugLogger'] = notConfigured as any;

export function configureDavSyncDependencies(dependencies: DavSyncDependencies): void {
	getAccountSyncCredentials = dependencies.getAccountSyncCredentials;
	createAddressBook = dependencies.createAddressBook;
	createCalendarEvent = dependencies.createCalendarEvent;
	createLocalCalendarEvent = dependencies.createLocalCalendarEvent;
	createLocalContact = dependencies.createLocalContact;
	deleteLocalAddressBook = dependencies.deleteLocalAddressBook;
	deleteCalendarEventById = dependencies.deleteCalendarEventById;
	deleteContactById = dependencies.deleteContactById;
	deleteLocalCalendarEvent = dependencies.deleteLocalCalendarEvent;
	deleteLocalContact = dependencies.deleteLocalContact;
	getCalendarEventById = dependencies.getCalendarEventById;
	getContactById = dependencies.getContactById;
	getDavSettings = dependencies.getDavSettings;
	listAddressBooks = dependencies.listAddressBooks;
	listCalendarEvents = dependencies.listCalendarEvents;
	listContacts = dependencies.listContacts;
	syncCardDavAddressBooks = dependencies.syncCardDavAddressBooks;
	updateCalendarEventById = dependencies.updateCalendarEventById;
	updateCardDavContact = dependencies.updateCardDavContact;
	updateExternalContact = dependencies.updateExternalContact;
	updateLocalCalendarEvent = dependencies.updateLocalCalendarEvent;
	updateLocalContact = dependencies.updateLocalContact;
	upsertCalendarEvents = dependencies.upsertCalendarEvents;
	upsertCardDavContact = dependencies.upsertCardDavContact;
	upsertContacts = dependencies.upsertContacts;
	upsertDavSettings = dependencies.upsertDavSettings;
	createMailDebugLogger = dependencies.createMailDebugLogger;
}

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';
const googleCalendarRuntime = new GoogleCalendarProvider();

type DavCredentials = {
	email: string;
	user: string;
	password: string;
	imapHost: string;
};

type DavProtocol = 'carddav' | 'caldav';

export interface DavDiscoveryResult {
	accountId: number;
	carddavUrl: string | null;
	caldavUrl: string | null;
}

export interface DavDiscoveryPreviewPayload {
	email: string;
	user: string;
	password: string;
	imapHost: string;
	carddavUser?: string | null;
	carddavPassword?: string | null;
	caldavUser?: string | null;
	caldavPassword?: string | null;
}

export interface DavSyncSummary {
	accountId: number;
	discovered: DavDiscoveryResult;
	contacts: {upserted: number; removed: number; books: number};
	events: {upserted: number; removed: number; calendars: number};
}

export async function discoverDav(accountId: number): Promise<DavDiscoveryResult> {
	const carddavLogger = createMailDebugLogger('carddav', `discover:${accountId}`);
	const caldavLogger = createMailDebugLogger('caldav', `discover:${accountId}`);
	const saved = getDavSettings(accountId);
	let carddavUrl = saved?.carddav_url || null;
	let caldavUrl = saved?.caldav_url || null;

	try {
		const carddavCreds = await resolveCredentials(accountId, 'carddav');
		carddavLogger.debug('Starting CardDAV discovery for account=%d email=%s', accountId, carddavCreds.email);
		carddavUrl = await discoverHomeUrl(
			carddavCreds,
			saved?.carddav_url || null,
			'carddav',
			'addressbook-home-set',
			carddavLogger,
		);
	} catch (error: any) {
		carddavLogger.warn(
			'CardDAV discovery skipped for account=%d, using saved URL. reason=%s',
			accountId,
			String(error?.message || error || 'unknown'),
		);
	}

	try {
		const caldavCreds = await resolveCredentials(accountId, 'caldav');
		caldavLogger.debug('Starting CalDAV discovery for account=%d email=%s', accountId, caldavCreds.email);
		caldavUrl = await discoverHomeUrl(
			caldavCreds,
			saved?.caldav_url || null,
			'caldav',
			'calendar-home-set',
			caldavLogger,
		);
	} catch (error: any) {
		caldavLogger.warn(
			'CalDAV discovery skipped for account=%d, using saved URL. reason=%s',
			accountId,
			String(error?.message || error || 'unknown'),
		);
	}

	if (carddavUrl || caldavUrl) {
		upsertDavSettings(accountId, carddavUrl, caldavUrl);
		carddavLogger.info('DAV discovery saved urls carddav=%s caldav=%s', carddavUrl ?? 'null', caldavUrl ?? 'null');
		caldavLogger.info('DAV discovery saved urls carddav=%s caldav=%s', carddavUrl ?? 'null', caldavUrl ?? 'null');
	} else {
		carddavLogger.warn('DAV discovery found no CardDAV/CalDAV home URL');
		caldavLogger.warn('DAV discovery found no CardDAV/CalDAV home URL');
	}

	return {accountId, carddavUrl: carddavUrl ?? null, caldavUrl: caldavUrl ?? null};
}

export async function discoverDavPreview(payload: DavDiscoveryPreviewPayload): Promise<DavDiscoveryResult> {
	const baseCreds: DavCredentials = {
		email: String(payload.email || '').trim(),
		user: String(payload.user || '').trim(),
		password: String(payload.password || ''),
		imapHost: String(payload.imapHost || '').trim(),
	};
	if (!baseCreds.email || !baseCreds.user || !baseCreds.password || !baseCreds.imapHost) {
		throw new Error(__('dav.sync.error.missing_preview_credentials'));
	}
	const carddavCreds: DavCredentials = {
		...baseCreds,
		user: String(payload.carddavUser || '').trim() || baseCreds.user,
		password: String(payload.carddavPassword || '').trim() || baseCreds.password,
	};
	const caldavCreds: DavCredentials = {
		...baseCreds,
		user: String(payload.caldavUser || '').trim() || baseCreds.user,
		password: String(payload.caldavPassword || '').trim() || baseCreds.password,
	};

	const carddavLogger = createMailDebugLogger('carddav', 'discover:preview');
	const caldavLogger = createMailDebugLogger('caldav', 'discover:preview');
	carddavLogger.debug(
		'Starting CardDAV preview discovery email=%s imapHost=%s',
		carddavCreds.email,
		carddavCreds.imapHost,
	);
	caldavLogger.debug(
		'Starting CalDAV preview discovery email=%s imapHost=%s',
		caldavCreds.email,
		caldavCreds.imapHost,
	);

	const carddavUrl = await discoverHomeUrl(carddavCreds, null, 'carddav', 'addressbook-home-set', carddavLogger);
	const caldavUrl = await discoverHomeUrl(caldavCreds, null, 'caldav', 'calendar-home-set', caldavLogger);

	return {
		accountId: 0,
		carddavUrl: carddavUrl ?? null,
		caldavUrl: caldavUrl ?? null,
	};
}

export async function syncDav(accountId: number, options?: DavSyncOptions | null): Promise<DavSyncSummary> {
	const carddavLogger = createMailDebugLogger('carddav', `sync:${accountId}`);
	const caldavLogger = createMailDebugLogger('caldav', `sync:${accountId}`);
	const syncContacts = options?.modules?.contacts !== false;
	const syncCalendar = options?.modules?.calendar !== false;
	carddavLogger.info('Starting CardDAV sync');
	caldavLogger.info('Starting CalDAV sync');
	if (!syncContacts && !syncCalendar) {
		const saved = getDavSettings(accountId);
		return {
			accountId,
			discovered: {
				accountId,
				carddavUrl: saved?.carddav_url ?? null,
				caldavUrl: saved?.caldav_url ?? null,
			},
			contacts: {upserted: 0, removed: 0, books: 0},
			events: {upserted: 0, removed: 0, calendars: 0},
		};
	}
	const accountCreds = await getAccountSyncCredentials(accountId);
	if (accountCreds.auth_method === 'oauth2') {
		throw new Error(__('dav.sync.error.oauth_not_supported_use_ancillary'));
	}
	const saved = getDavSettings(accountId);
	const discovered =
		saved?.carddav_url || saved?.caldav_url
			? {
					accountId,
					carddavUrl: saved.carddav_url ?? null,
					caldavUrl: saved.caldav_url ?? null,
				}
			: await discoverDav(accountId);
	if (saved?.carddav_url || saved?.caldav_url) {
		carddavLogger.info(
			'Using saved DAV endpoints carddav=%s caldav=%s',
			discovered.carddavUrl ?? 'null',
			discovered.caldavUrl ?? 'null',
		);
		caldavLogger.info(
			'Using saved DAV endpoints carddav=%s caldav=%s',
			discovered.carddavUrl ?? 'null',
			discovered.caldavUrl ?? 'null',
		);
	}
	const carddavCreds = await resolveCredentials(accountId, 'carddav');
	const caldavCreds = await resolveCredentials(accountId, 'caldav');
	carddavLogger.debug(
		'Discovery result carddav=%s caldav=%s',
		discovered.carddavUrl ?? 'null',
		discovered.caldavUrl ?? 'null',
	);
	caldavLogger.debug(
		'Discovery result carddav=%s caldav=%s',
		discovered.carddavUrl ?? 'null',
		discovered.caldavUrl ?? 'null',
	);

	let contactsResult = {upserted: 0, removed: 0, books: 0};
	if (!syncContacts) {
		carddavLogger.debug('Skipping CardDAV contacts sync because contacts module is disabled');
	} else if (discovered.carddavUrl) {
		const books = await listAddressBookCollections(carddavCreds, discovered.carddavUrl, carddavLogger);
		const sourceBooks = books.length > 0 ? books.map((book) => book.url) : [discovered.carddavUrl];
		carddavLogger.debug('Using %d CardDAV address books', sourceBooks.length);
		const syncedBookIds = syncCardDavAddressBooks(
			accountId,
			books.length > 0
				? books.map((book) => ({remoteUrl: book.url, name: book.name ?? null}))
				: [{remoteUrl: discovered.carddavUrl, name: __('dav.sync.contacts_default_address_book')}],
		);
		const contacts = await pullContacts(carddavCreds, sourceBooks, carddavLogger);
		const persisted = upsertContacts(
			accountId,
			contacts.map((contact) => ({
				...contact,
				addressBookId: contact.addressBookUrl ? (syncedBookIds[contact.addressBookUrl] ?? null) : null,
			})),
			'carddav',
		);
		contactsResult = {upserted: persisted.upserted, removed: persisted.removed, books: books.length || 1};
		carddavLogger.info(
			'CardDAV contacts persisted upserted=%d removed=%d books=%d',
			contactsResult.upserted,
			contactsResult.removed,
			contactsResult.books,
		);
	} else {
		carddavLogger.warn('Skipping CardDAV contacts sync because no carddavUrl was discovered');
	}

	let eventsResult = {upserted: 0, removed: 0, calendars: 0};
	if (!syncCalendar) {
		caldavLogger.debug('Skipping CalDAV sync because calendar module is disabled');
	} else if (discovered.caldavUrl) {
		const calendars = await listCollections(caldavCreds, discovered.caldavUrl, 'calendar', caldavLogger);
		const sourceCalendars = calendars.length > 0 ? calendars : [discovered.caldavUrl];
		caldavLogger.debug('Using %d CalDAV calendars', sourceCalendars.length);
		const events = await pullEvents(caldavCreds, sourceCalendars, caldavLogger);
		const persisted = upsertCalendarEvents(accountId, events, 'caldav');
		eventsResult = {upserted: persisted.upserted, removed: persisted.removed, calendars: calendars.length || 1};
		caldavLogger.info(
			'CalDAV events persisted upserted=%d removed=%d calendars=%d',
			eventsResult.upserted,
			eventsResult.removed,
			eventsResult.calendars,
		);
	} else {
		caldavLogger.debug('Skipping CalDAV sync because no caldavUrl was discovered');
	}

	return {
		accountId,
		discovered,
		contacts: contactsResult,
		events: eventsResult,
	};
}

export function getContacts(
	accountId: number,
	query?: string | null,
	limit: number = 200,
	addressBookId?: number | null,
) {
	return listContacts(accountId, query, limit, addressBookId);
}

export function getAddressBooks(accountId: number) {
	return listAddressBooks(accountId);
}

export function addAddressBook(accountId: number, name: string) {
	return createAddressBook(accountId, name);
}

export function removeAddressBook(accountId: number, addressBookId: number) {
	return deleteLocalAddressBook(accountId, addressBookId);
}

export async function addContact(
	accountId: number,
	payload: {
		addressBookId?: number | null;
		fullName?: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	},
) {
	const logger = createMailDebugLogger('carddav', `add-contact:${accountId}`);
	const oauthContext = await resolveOauthContactContext(accountId);
	if (oauthContext) {
		return await createOauthContact(accountId, payload, oauthContext);
	}
	const saved = getDavSettings(accountId);
	const discovered = saved?.carddav_url
		? {
				accountId,
				carddavUrl: saved.carddav_url,
				caldavUrl: saved.caldav_url ?? null,
			}
		: await discoverDav(accountId).catch(() => ({
				accountId,
				carddavUrl: null,
				caldavUrl: null,
			}));
	if (!discovered.carddavUrl) {
		logger.warn('No CardDAV endpoint discovered; storing local contact for %s', payload.email);
		return createLocalContact(accountId, payload.addressBookId ?? null, payload.fullName ?? null, payload.email, {
			phone: payload.phone ?? null,
			organization: payload.organization ?? null,
			title: payload.title ?? null,
			note: payload.note ?? null,
		});
	}

	const creds = await resolveCredentials(accountId, 'carddav');
	const books = await listCollections(creds, discovered.carddavUrl, 'addressbook', logger).catch(() => []);
	const targetBookUrl = books[0] ?? discovered.carddavUrl;
	const sourceUid = randomUUID();
	const cardUrl = resolveUrl(ensureTrailingSlash(targetBookUrl), `${encodeURIComponent(sourceUid)}.vcf`);
	const channels = extractCardDavChannels(payload.email, payload.phone ?? null, payload.note ?? null);
	const cardBody = buildVCard({
		uid: sourceUid,
		fullName: payload.fullName ?? null,
		email: channels.emails[0] || payload.email,
		emails: channels.emails,
		phone: channels.phones[0] ?? null,
		phones: channels.phones,
		organization: payload.organization ?? null,
		title: payload.title ?? null,
		note: channels.noteText,
	});
	const etag = await putCardDavContact(creds, cardUrl, cardBody);
	logger.info('Pushed CardDAV contact email=%s target=%s', payload.email, targetBookUrl);

	return upsertCardDavContact(accountId, {
		sourceUid,
		fullName: payload.fullName ?? null,
		email: payload.email,
		phone: payload.phone ?? null,
		organization: payload.organization ?? null,
		title: payload.title ?? null,
		note: payload.note ?? null,
		etag,
		addressBookId: payload.addressBookId ?? null,
	});
}

export async function editContact(
	contactId: number,
	payload: {
		addressBookId?: number | null;
		fullName?: string | null;
		email?: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	},
) {
	const current = getContactById(contactId);
	if (!current) throw new Error(__('dav.sync.error.contact_not_found'));
	if (current.source.startsWith('local:')) {
		return updateLocalContact(contactId, payload);
	}
	if (current.source !== 'carddav') {
		if (isOauthProviderContactSource(current.source)) {
			await updateOauthContactForAccount(current, payload);
			return updateExternalContact(contactId, payload);
		}
		throw new Error(__('dav.sync.error.contact_source_read_only'));
	}

	return await editCardDavContact(current, payload);
}

export async function removeContact(contactId: number) {
	const current = getContactById(contactId);
	if (!current) return {removed: false};
	if (current.source.startsWith('local:')) {
		return deleteLocalContact(contactId);
	}
	if (current.source !== 'carddav') {
		if (isOauthProviderContactSource(current.source)) {
			await deleteOauthContactForAccount(current);
			return deleteContactById(contactId);
		}
		throw new Error(__('dav.sync.error.contact_source_read_only'));
	}
	return await removeCardDavContact(current);
}

export function getCalendarEvents(
	accountId: number,
	startIso?: string | null,
	endIso?: string | null,
	limit: number = 500,
) {
	return listCalendarEvents(accountId, startIso, endIso, limit);
}

type ParsedGoogleCalendarMetadata = {
	providerEventId: string | null;
	calendarId: string | null;
	calendarSummary: string | null;
};

function parseGoogleCalendarMetadata(rawIcs: string | null | undefined): ParsedGoogleCalendarMetadata {
	const raw = String(rawIcs || '').trim();
	if (!raw.startsWith('{')) {
		return {providerEventId: null, calendarId: null, calendarSummary: null};
	}
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (String(parsed.provider || '').trim() !== 'google-api') {
			return {providerEventId: null, calendarId: null, calendarSummary: null};
		}
		return {
			providerEventId: String(parsed.providerEventId || '').trim() || null,
			calendarId: String(parsed.calendarId || '').trim() || null,
			calendarSummary: String(parsed.calendarSummary || '').trim() || null,
		};
	} catch {
		return {providerEventId: null, calendarId: null, calendarSummary: null};
	}
}

function parseGoogleCalendarId(calendarUrl: string | null | undefined, rawIcs: string | null | undefined): string {
	const normalized = String(calendarUrl || '').trim();
	if (normalized.toLowerCase().startsWith('google:')) {
		const parsed = normalized.slice('google:'.length).trim();
		if (parsed) return parsed;
	}
	const metadata = parseGoogleCalendarMetadata(rawIcs);
	return metadata.calendarId || 'primary';
}

function parseGoogleEventId(uid: string | null | undefined, rawIcs: string | null | undefined): string {
	const metadata = parseGoogleCalendarMetadata(rawIcs);
	return metadata.providerEventId || String(uid || '').trim();
}

async function createGoogleCalendarEvent(
	accountId: number,
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
	accessToken: string,
) {
	const created = await googleCalendarRuntime.create(accessToken, payload);
	return createCalendarEvent({
		accountId,
		source: 'google-api',
		calendarUrl: `google:${created.calendarId}`,
		uid: created.uid,
		summary: created.summary,
		description: created.description,
		location: created.location,
		startsAt: created.startsAt || payload.startsAt,
		endsAt: created.endsAt || payload.endsAt,
		etag: created.etag,
		rawIcs: created.rawIcs,
		lastSeenSync: new Date().toISOString(),
	});
}

async function editGoogleCalendarEvent(
	current: {
		id: number;
		account_id: number;
		calendar_url: string;
		uid: string;
		summary: string | null;
		description: string | null;
		location: string | null;
		starts_at: string | null;
		ends_at: string | null;
		etag: string | null;
		raw_ics: string | null;
	},
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
	const oauthContext = await resolveOauthContactContext(current.account_id, 'google');
	if (!oauthContext) throw new Error(__('dav.sync.error.google_oauth_session_missing_calendar_update'));
	const calendarId = parseGoogleCalendarId(current.calendar_url, current.raw_ics);
	const eventId = parseGoogleEventId(current.uid, current.raw_ics);
	if (!eventId) throw new Error(__('dav.sync.error.google_event_id_missing_sync_calendar'));
	const metadata = parseGoogleCalendarMetadata(current.raw_ics);
	const updated = await googleCalendarRuntime.update(oauthContext.accessToken, {
		calendarId,
		calendarSummary: metadata.calendarSummary,
		eventId,
		summary: payload.summary,
		description: payload.description,
		location: payload.location,
		startsAt: payload.startsAt,
		endsAt: payload.endsAt,
		etag: current.etag,
	});
	return updateCalendarEventById(current.id, {
		summary: updated.summary,
		description: updated.description,
		location: updated.location,
		startsAt: updated.startsAt || payload.startsAt,
		endsAt: updated.endsAt || payload.endsAt,
		etag: updated.etag,
		rawIcs: updated.rawIcs,
	});
}

async function removeGoogleCalendarEvent(current: {
	id: number;
	account_id: number;
	calendar_url: string;
	uid: string;
	etag: string | null;
	raw_ics: string | null;
}) {
	const isIgnorableGoogleDeleteError = (error: unknown): boolean => {
		const message = String((error as any)?.message || error || '')
			.trim()
			.toLowerCase();
		if (!message) return false;
		return (
			message.includes('google api request failed (404)') ||
			message.includes('google api request failed (410)') ||
			message.includes('google api request failed (412)') ||
			message.includes('conditionnotmet') ||
			message.includes('not found')
		);
	};

	const oauthContext = await resolveOauthContactContext(current.account_id, 'google');
	if (!oauthContext) throw new Error(__('dav.sync.error.google_oauth_session_missing_calendar_delete'));
	const calendarId = parseGoogleCalendarId(current.calendar_url, current.raw_ics);
	const eventId = parseGoogleEventId(current.uid, current.raw_ics);
	if (!eventId) throw new Error(__('dav.sync.error.google_event_id_missing_sync_calendar'));
	try {
		await googleCalendarRuntime.delete(oauthContext.accessToken, {
			calendarId,
			eventId,
			etag: current.etag,
		});
	} catch (error) {
		if (!isIgnorableGoogleDeleteError(error)) throw error;
	}
	return deleteCalendarEventById(current.id);
}

export async function addCalendarEvent(
	accountId: number,
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
	const oauthContext = await resolveOauthContactContext(accountId);
	if (oauthContext?.provider === 'google') {
		return await createGoogleCalendarEvent(accountId, payload, oauthContext.accessToken);
	}
	if (oauthContext?.provider) {
		throw new Error(
			__('dav.sync.error.calendar_edit_oauth_provider_not_supported', {provider: oauthContext.provider}),
		);
	}
	return createCalDavEvent(accountId, payload);
}

export async function editCalendarEvent(
	eventId: number,
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
	const current = getCalendarEventById(eventId);
	if (!current) throw new Error(__('dav.sync.error.calendar_event_not_found'));
	if (current.source === 'local') {
		return updateLocalCalendarEvent(eventId, payload);
	}
	if (current.source === 'google-api') {
		return await editGoogleCalendarEvent(current, payload);
	}
	if (current.source !== 'caldav') {
		throw new Error(__('dav.sync.error.calendar_source_read_only'));
	}
	return editCalDavEvent(current, payload);
}

export async function removeCalendarEvent(eventId: number) {
	const current = getCalendarEventById(eventId);
	if (!current) return {removed: false};
	if (current.source === 'local') {
		return deleteLocalCalendarEvent(eventId);
	}
	if (current.source === 'google-api') {
		return await removeGoogleCalendarEvent(current);
	}
	if (current.source !== 'caldav') {
		throw new Error(__('dav.sync.error.calendar_source_read_only'));
	}
	return removeCalDavEvent(current);
}

async function resolveCredentials(accountId: number, protocol: DavProtocol): Promise<DavCredentials> {
	const creds = await getAccountSyncCredentials(accountId);
	if (creds.auth_method === 'oauth2') {
		const providerLabel = creds.oauth_provider ? `${creds.oauth_provider}` : 'selected provider';
		throw new Error(__('dav.sync.error.oauth_dav_credentials_required', {providerLabel}));
	}
	const protocolUser =
		protocol === 'carddav'
			? String(creds.carddav_user || creds.user || '').trim()
			: String(creds.caldav_user || creds.user || '').trim();
	const protocolPassword =
		protocol === 'carddav'
			? String(creds.carddav_password || creds.password || '').trim()
			: String(creds.caldav_password || creds.password || '').trim();
	if (!protocolUser || !protocolPassword) {
		throw new Error(__('dav.sync.error.protocol_requires_user_password', {protocol: protocol.toUpperCase()}));
	}
	return {
		email: creds.email,
		user: protocolUser,
		password: protocolPassword,
		imapHost: creds.imap_host,
	};
}

async function discoverHomeUrl(
	creds: DavCredentials,
	preferredUrl: string | null,
	wellKnownKind: 'carddav' | 'caldav',
	homeProperty: 'addressbook-home-set' | 'calendar-home-set',
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	const candidates: string[] = [];
	if (preferredUrl) candidates.push(preferredUrl);
	if (creds.imapHost) {
		candidates.push(...buildRadicaleCandidates(creds.imapHost, creds.email));
		candidates.push(`https://${creds.imapHost}/.well-known/${wellKnownKind}`);
		for (const hostDomain of deriveHostDomains(creds.imapHost)) {
			candidates.push(...buildRadicaleCandidates(hostDomain, creds.email));
			candidates.push(`https://${hostDomain}/.well-known/${wellKnownKind}`);
			candidates.push(`https://${wellKnownKind}.${hostDomain}/`);
		}
	}
	const domain = extractEmailDomain(creds.email);
	if (domain) {
		candidates.push(...buildRadicaleCandidates(domain, creds.email));
		candidates.push(`https://${domain}/.well-known/${wellKnownKind}`);
		candidates.push(`https://${wellKnownKind}.${domain}/`);
	}

	const dedupedCandidates = dedupe(candidates);
	logger?.debug('Discovery %s candidates=%s', wellKnownKind, JSON.stringify(dedupedCandidates));

	for (const candidate of dedupedCandidates) {
		try {
			const resolved = await resolveHomeFromEntry(creds, candidate, homeProperty, logger);
			if (resolved) {
				logger?.info('Resolved %s home from %s -> %s', wellKnownKind, candidate, resolved);
				return resolved;
			}
			if (isRadicaleCollectionCandidate(candidate)) {
				const fallback = ensureTrailingSlash(candidate);
				logger?.warn('Using %s fallback home from DAV-capable Radicale candidate: %s', wellKnownKind, fallback);
				return fallback;
			}
		} catch (error: any) {
			logger?.warn('Failed %s candidate %s: %s', wellKnownKind, candidate, error?.message || String(error));
			if (isWellKnownCandidate(candidate)) {
				const fallback = await tryHostRootFallback(creds, candidate, homeProperty, logger);
				if (fallback) {
					logger?.info(
						'Resolved %s home via host-root fallback from %s -> %s',
						wellKnownKind,
						candidate,
						fallback,
					);
					return fallback;
				}
			}
		}
	}
	logger?.warn('Unable to resolve %s home URL from candidates', wellKnownKind);
	return null;
}

function deriveHostDomains(host: string): string[] {
	const normalized = host.trim().toLowerCase().replace(/\.$/, '');
	if (!normalized || !normalized.includes('.')) return [];
	const parts = normalized.split('.').filter(Boolean);
	if (parts.length < 2) return [];

	const out: string[] = [];
	for (let i = 1; i <= parts.length - 2; i += 1) {
		const candidate = parts.slice(i).join('.');
		if (candidate.split('.').length < 2) continue;
		if (isLikelyPublicSuffixDomain(candidate)) continue;
		out.push(candidate);
	}
	return dedupe(out);
}

function isLikelyPublicSuffixDomain(domain: string): boolean {
	const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
	const parts = normalized.split('.').filter(Boolean);
	if (parts.length < 2) return true;
	if (parts.length !== 2) return false;

	const [left, right] = parts;
	const commonSecondLevelLabels = new Set([
		'ac',
		'co',
		'com',
		'edu',
		'gov',
		'ltd',
		'me',
		'mil',
		'net',
		'nhs',
		'nic',
		'nom',
		'org',
		'plc',
		'police',
		'sch',
	]);
	return right.length === 2 && commonSecondLevelLabels.has(left);
}

function buildRadicaleCandidates(host: string, email: string): string[] {
	const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '');
	const normalizedEmail = email.trim().toLowerCase();
	if (!normalizedHost || !normalizedEmail) return [];
	const encodedEmail = encodeURIComponent(normalizedEmail);
	return dedupe([
		`https://${normalizedHost}/radicale/${normalizedEmail}/`,
		`https://${normalizedHost}/radicale/${encodedEmail}/`,
	]);
}

function isWellKnownCandidate(url: string): boolean {
	return /\/\.well-known\/(?:carddav|caldav)\/?$/i.test(url);
}

function isRadicaleCollectionCandidate(url: string): boolean {
	return /\/radicale\/.+\/?$/i.test(url);
}

async function tryHostRootFallback(
	creds: DavCredentials,
	candidate: string,
	homeProperty: 'addressbook-home-set' | 'calendar-home-set',
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	try {
		const parsed = new URL(candidate);
		const originRoot = `${parsed.origin}/`;
		if (originRoot === candidate) return null;
		logger?.debug('Trying host-root fallback %s', originRoot);
		return await resolveHomeFromEntry(creds, originRoot, homeProperty, logger);
	} catch (error: any) {
		logger?.warn('Host-root fallback failed for %s: %s', candidate, error?.message || String(error));
		return null;
	}
}

async function resolveHomeFromEntry(
	creds: DavCredentials,
	entryUrl: string,
	homeProperty: 'addressbook-home-set' | 'calendar-home-set',
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	const probe = await fetch(entryUrl, {
		method: 'GET',
		headers: {
			Authorization: authHeader(creds),
			Accept: '*/*',
		},
	});
	const baseUrl = probe.url || entryUrl;
	logger?.debug('Probe %s -> status=%d resolved=%s', entryUrl, probe.status, baseUrl);
	if (isWellKnownCandidate(entryUrl) && probe.url === entryUrl && probe.status >= 400) {
		throw new Error(__('dav.sync.error.well_known_endpoint_unavailable', {status: probe.status}));
	}

	const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
	const xml = await davRequest(creds, baseUrl, 'PROPFIND', body, '0', logger);
	const root = firstResponse(xml);
	if (!root) return null;

	const directHome = extractPropertyHref(root, homeProperty) ?? extractTagValue(root, homeProperty);
	if (directHome) return resolveUrl(baseUrl, directHome);

	const principal =
		extractPropertyHref(root, 'current-user-principal') ?? extractTagValue(root, 'current-user-principal');
	if (!principal) return null;
	const principalUrl = resolveUrl(baseUrl, principal);
	const principalBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
	const principalXml = await davRequest(creds, principalUrl, 'PROPFIND', principalBody, '0', logger);
	const principalResp = firstResponse(principalXml);
	if (!principalResp) return null;
	const home = extractPropertyHref(principalResp, homeProperty) ?? extractTagValue(principalResp, homeProperty);
	return home ? resolveUrl(principalUrl, home) : null;
}

async function listCollections(
	creds: DavCredentials,
	homeUrl: string,
	kind: 'addressbook' | 'calendar',
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string[]> {
	const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
  </d:prop>
</d:propfind>`;
	const xml = await davRequest(creds, homeUrl, 'PROPFIND', body, '1', logger);
	const responses = extractResponses(xml);
	const out: string[] = [];
	for (const response of responses) {
		if (!hasTag(response, kind)) continue;
		const href = extractTagValue(response, 'href');
		if (!href) continue;
		const absolute = resolveUrl(homeUrl, href);
		out.push(absolute);
	}
	const deduped = dedupe(out);
	logger?.debug('Collections kind=%s home=%s count=%d', kind, homeUrl, deduped.length);
	return deduped;
}

async function listAddressBookCollections(
	creds: DavCredentials,
	homeUrl: string,
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<Array<{url: string; name: string | null}>> {
	const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
  </d:prop>
</d:propfind>`;
	const xml = await davRequest(creds, homeUrl, 'PROPFIND', body, '1', logger);
	const responses = extractResponses(xml);
	const out: Array<{url: string; name: string | null}> = [];
	for (const response of responses) {
		if (!hasTag(response, 'addressbook')) continue;
		const href = extractTagValue(response, 'href');
		if (!href) continue;
		const absolute = ensureTrailingSlash(resolveUrl(homeUrl, href));
		const name = normalizeDavDisplayName(extractTagValue(response, 'displayname'));
		out.push({url: absolute, name});
	}
	const deduped = dedupeAddressBookCollections(out);
	logger?.debug('Addressbook collections home=%s count=%d', homeUrl, deduped.length);
	return deduped;
}

async function pullContacts(
	creds: DavCredentials,
	addressBooks: string[],
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<
	Array<{
		sourceUid: string;
		fullName: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
		etag?: string | null;
		addressBookUrl?: string | null;
	}>
> {
	const out: Array<{
		sourceUid: string;
		fullName: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
		etag?: string | null;
		addressBookUrl?: string | null;
	}> = [];
	const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <c:address-data />
  </d:prop>
</c:addressbook-query>`;

	for (const bookUrl of addressBooks) {
		const xml = await davRequest(creds, bookUrl, 'REPORT', reportBody, '1', logger);
		const responses = extractResponses(xml);
		logger?.debug('CardDAV REPORT responses book=%s count=%d', bookUrl, responses.length);
		for (const response of responses) {
			const card = extractTagValue(response, 'address-data');
			if (!card) continue;
			const etag = extractTagValue(response, 'getetag') || null;
			const href = extractTagValue(response, 'href') || '';
			const parsed = parseVCard(card, href);
			const syncedNote = composeSyncedContactNote(parsed.note, parsed.emails, parsed.phones);
			const primaryPhone = parsed.phones[0] ?? null;
			const primaryEmail = parsed.emails[0];
			if (!primaryEmail) continue;
			out.push({
				sourceUid: parsed.uid,
				fullName: parsed.fullName,
				email: primaryEmail,
				phone: primaryPhone,
				organization: parsed.organization ?? null,
				title: parsed.title ?? null,
				note: syncedNote,
				etag,
				addressBookUrl: ensureTrailingSlash(bookUrl),
			});
		}
	}

	const deduped = dedupeBy(out, (row) => `${row.sourceUid}|${row.addressBookUrl || ''}`);
	logger?.info('CardDAV pull collected contacts=%d (raw=%d)', deduped.length, out.length);
	return deduped;
}

async function pullEvents(
	creds: DavCredentials,
	calendars: string[],
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<
	Array<{
		calendarUrl: string;
		uid: string;
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt?: string | null;
		endsAt?: string | null;
		etag?: string | null;
		rawIcs?: string | null;
	}>
> {
	const now = new Date();
	const past = new Date(now);
	past.setDate(now.getDate() - 30);
	const future = new Date(now);
	future.setDate(now.getDate() + 365);

	const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavDate(past)}" end="${toCalDavDate(future)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
	logger?.debug('CalDAV time-range start=%s end=%s', toCalDavDate(past), toCalDavDate(future));

	const out: Array<{
		calendarUrl: string;
		uid: string;
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt?: string | null;
		endsAt?: string | null;
		etag?: string | null;
		rawIcs?: string | null;
	}> = [];

	for (const calendarUrl of calendars) {
		const xml = await davRequest(creds, calendarUrl, 'REPORT', reportBody, '1', logger);
		const responses = extractResponses(xml);
		logger?.debug('CalDAV REPORT responses calendar=%s count=%d', calendarUrl, responses.length);
		let eventsInCalendar = 0;
		for (const response of responses) {
			const ics = extractTagValue(response, 'calendar-data');
			if (!ics) continue;
			const etag = extractTagValue(response, 'getetag') || null;
			const events = parseIcsEvents(ics);
			eventsInCalendar += events.length;
			for (const event of events) {
				out.push({
					calendarUrl,
					uid: event.uid,
					summary: event.summary ?? null,
					description: event.description ?? null,
					location: event.location ?? null,
					startsAt: event.startsAt ?? null,
					endsAt: event.endsAt ?? null,
					etag,
					rawIcs: ics,
				});
			}
		}
		logger?.debug('CalDAV parsed events calendar=%s count=%d', calendarUrl, eventsInCalendar);
	}
	const deduped = dedupeBy(out, (row) => `${row.calendarUrl}|${row.uid}`);
	logger?.info('CalDAV pull collected events=%d (raw=%d)', deduped.length, out.length);
	return deduped;
}

async function davRequest(
	creds: DavCredentials,
	url: string,
	method: 'PROPFIND' | 'REPORT',
	body: string,
	depth: '0' | '1',
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string> {
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: authHeader(creds),
			Depth: depth,
			'Content-Type': 'application/xml; charset=utf-8',
			Accept: 'application/xml, text/xml, */*',
		},
		body,
	});
	if (!response.ok && response.status !== 207) {
		logger?.error('DAV request failed method=%s status=%d url=%s', method, response.status, url);
		throw new Error(__('dav.sync.error.dav_request_failed', {method, status: response.status, url}));
	}
	logger?.debug('DAV request ok method=%s status=%d depth=%s url=%s', method, response.status, depth, url);
	return await response.text();
}

function authHeader(creds: DavCredentials): string {
	const raw = `${creds.user}:${creds.password}`;
	return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function putCardDavContact(creds: DavCredentials, url: string, vcard: string): Promise<string | null> {
	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			Authorization: authHeader(creds),
			'Content-Type': 'text/vcard; charset=utf-8',
			Accept: '*/*',
		},
		body: vcard,
	});
	if (!response.ok && response.status !== 201 && response.status !== 204) {
		throw new Error(__('dav.sync.error.carddav_put_failed', {status: response.status, url}));
	}
	const etag = response.headers.get('etag');
	return etag ? etag.trim() : null;
}

async function putCalDavEvent(
	creds: DavCredentials,
	url: string,
	ics: string,
	etag?: string | null,
): Promise<string | null> {
	const headers: Record<string, string> = {
		Authorization: authHeader(creds),
		'Content-Type': 'text/calendar; charset=utf-8',
		Accept: '*/*',
	};
	if (etag && etag.trim()) {
		headers['If-Match'] = etag.trim();
	}
	const response = await fetch(url, {
		method: 'PUT',
		headers,
		body: ics,
	});
	if (!response.ok && response.status !== 201 && response.status !== 204) {
		throw new Error(__('dav.sync.error.caldav_put_failed', {status: response.status, url}));
	}
	const nextEtag = response.headers.get('etag');
	return nextEtag ? nextEtag.trim() : null;
}

async function deleteCardDavContact(creds: DavCredentials, url: string, etag?: string | null): Promise<void> {
	const headers: Record<string, string> = {
		Authorization: authHeader(creds),
		Accept: '*/*',
	};
	if (etag && etag.trim()) {
		headers['If-Match'] = etag.trim();
	}
	const response = await fetch(url, {
		method: 'DELETE',
		headers,
	});
	if (response.status === 404) return;
	if (!response.ok && response.status !== 204) {
		throw new Error(__('dav.sync.error.carddav_delete_failed', {status: response.status, url}));
	}
}

async function deleteCalDavEvent(creds: DavCredentials, url: string, etag?: string | null): Promise<void> {
	const headers: Record<string, string> = {
		Authorization: authHeader(creds),
		Accept: '*/*',
	};
	if (etag && etag.trim()) {
		headers['If-Match'] = etag.trim();
	}
	const response = await fetch(url, {
		method: 'DELETE',
		headers,
	});
	if (response.status === 404) return;
	if (!response.ok && response.status !== 204) {
		throw new Error(__('dav.sync.error.caldav_delete_failed', {status: response.status, url}));
	}
}

async function findCardDavContactUrl(
	creds: DavCredentials,
	addressBooks: string[],
	sourceUid: string,
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <c:address-data />
  </d:prop>
</c:addressbook-query>`;
	for (const bookUrl of addressBooks) {
		const xml = await davRequest(creds, bookUrl, 'REPORT', reportBody, '1', logger);
		const responses = extractResponses(xml);
		for (const response of responses) {
			const card = extractTagValue(response, 'address-data');
			if (!card) continue;
			const href = extractTagValue(response, 'href');
			if (!href) continue;
			const parsed = parseVCard(card, href);
			if (parsed.uid !== sourceUid) continue;
			return resolveUrl(bookUrl, href);
		}
	}
	return null;
}

async function findCalDavEventUrl(
	creds: DavCredentials,
	calendars: string[],
	sourceUid: string,
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
</c:calendar-query>`;
	for (const calendarUrl of calendars) {
		const xml = await davRequest(creds, calendarUrl, 'REPORT', reportBody, '1', logger);
		const responses = extractResponses(xml);
		for (const response of responses) {
			const ics = extractTagValue(response, 'calendar-data');
			if (!ics) continue;
			const href = extractTagValue(response, 'href');
			if (!href) continue;
			const events = parseIcsEvents(ics);
			if (!events.some((event) => event.uid === sourceUid)) continue;
			return resolveUrl(calendarUrl, href);
		}
	}
	return null;
}

async function findCardDavContactUrlByEmail(
	creds: DavCredentials,
	addressBooks: string[],
	email: string,
	logger?: ReturnType<typeof createMailDebugLogger>,
): Promise<string | null> {
	const normalizedEmail = String(email || '')
		.trim()
		.toLowerCase();
	if (!normalizedEmail) return null;
	const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <c:address-data />
  </d:prop>
</c:addressbook-query>`;
	for (const bookUrl of addressBooks) {
		const xml = await davRequest(creds, bookUrl, 'REPORT', reportBody, '1', logger);
		const responses = extractResponses(xml);
		for (const response of responses) {
			const card = extractTagValue(response, 'address-data');
			if (!card) continue;
			const href = extractTagValue(response, 'href');
			if (!href) continue;
			const parsed = parseVCard(card, href);
			if (
				!parsed.emails.some(
					(value) =>
						String(value || '')
							.trim()
							.toLowerCase() === normalizedEmail,
				)
			)
				continue;
			return resolveUrl(bookUrl, href);
		}
	}
	return null;
}

async function editCardDavContact(
	current: {
		id: number;
		account_id: number;
		source_uid: string;
		full_name: string | null;
		email: string;
		phone: string | null;
		organization: string | null;
		title: string | null;
		note: string | null;
		etag: string | null;
	},
	payload: {
		fullName?: string | null;
		email?: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	},
) {
	const logger = createMailDebugLogger('carddav', `edit-contact:${current.account_id}`);
	const saved = getDavSettings(current.account_id);
	const discovered = saved?.carddav_url
		? {
				accountId: current.account_id,
				carddavUrl: saved.carddav_url,
				caldavUrl: saved.caldav_url ?? null,
			}
		: await discoverDav(current.account_id);
	if (!discovered.carddavUrl) {
		throw new Error(__('dav.sync.error.no_carddav_endpoint_for_account'));
	}

	const creds = await resolveCredentials(current.account_id, 'carddav');
	const books = await listCollections(creds, discovered.carddavUrl, 'addressbook', logger).catch(() => []);
	const sourceBooks = books.length > 0 ? books : [discovered.carddavUrl];
	const fullName = payload.fullName === undefined ? current.full_name : payload.fullName;
	const email = payload.email === undefined ? current.email : payload.email;
	const phone = payload.phone === undefined ? current.phone : payload.phone;
	const organization = payload.organization === undefined ? current.organization : payload.organization;
	const title = payload.title === undefined ? current.title : payload.title;
	const note = payload.note === undefined ? current.note : payload.note;
	const channels = extractCardDavChannels(email, phone ?? null, note ?? null);
	const existingCardUrlByUid = await findCardDavContactUrl(creds, sourceBooks, current.source_uid, logger);
	const existingCardUrlByCurrentEmail = await findCardDavContactUrlByEmail(creds, sourceBooks, current.email, logger);
	const existingCardUrlByNextEmail = await findCardDavContactUrlByEmail(
		creds,
		sourceBooks,
		channels.emails[0] || email,
		logger,
	);
	const cardUrl = existingCardUrlByUid || existingCardUrlByCurrentEmail || existingCardUrlByNextEmail;
	if (!cardUrl) {
		throw new Error(__('dav.sync.error.remote_carddav_contact_not_found_sync_contacts'));
	}

	const cardBody = buildVCard({
		uid: current.source_uid,
		fullName: fullName ?? null,
		email: channels.emails[0] || email,
		emails: channels.emails,
		phone: channels.phones[0] ?? null,
		phones: channels.phones,
		organization: organization ?? null,
		title: title ?? null,
		note: channels.noteText,
	});
	const etag = await putCardDavContact(creds, cardUrl, cardBody);
	logger.info('Updated CardDAV contact id=%d sourceUid=%s', current.id, current.source_uid);

	return updateCardDavContact(current.id, {
		fullName: fullName ?? null,
		email,
		phone: phone ?? null,
		organization: organization ?? null,
		title: title ?? null,
		note: note ?? null,
		etag,
	});
}

async function removeCardDavContact(current: {
	id: number;
	account_id: number;
	source_uid: string;
	etag: string | null;
}) {
	const logger = createMailDebugLogger('carddav', `delete-contact:${current.account_id}`);
	const saved = getDavSettings(current.account_id);
	const discovered = saved?.carddav_url
		? {
				accountId: current.account_id,
				carddavUrl: saved.carddav_url,
				caldavUrl: saved.caldav_url ?? null,
			}
		: await discoverDav(current.account_id);
	if (!discovered.carddavUrl) {
		throw new Error(__('dav.sync.error.no_carddav_endpoint_for_account'));
	}

	const creds = await resolveCredentials(current.account_id, 'carddav');
	const books = await listCollections(creds, discovered.carddavUrl, 'addressbook', logger).catch(() => []);
	const sourceBooks = books.length > 0 ? books : [discovered.carddavUrl];
	const existingCardUrl = await findCardDavContactUrl(creds, sourceBooks, current.source_uid, logger);
	if (existingCardUrl) {
		await deleteCardDavContact(creds, existingCardUrl, current.etag);
		logger.info('Deleted CardDAV contact id=%d sourceUid=%s', current.id, current.source_uid);
	} else {
		logger.warn(
			'CardDAV href not found for id=%d sourceUid=%s, removing local row only',
			current.id,
			current.source_uid,
		);
	}
	return deleteContactById(current.id);
}

async function createCalDavEvent(
	accountId: number,
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
	const logger = createMailDebugLogger('caldav', `create-event:${accountId}`);
	const saved = getDavSettings(accountId);
	const discovered = saved?.caldav_url
		? {
				accountId,
				carddavUrl: saved.carddav_url ?? null,
				caldavUrl: saved.caldav_url,
			}
		: await discoverDav(accountId).catch(() => ({
				accountId,
				carddavUrl: null,
				caldavUrl: null,
			}));

	if (!discovered.caldavUrl) {
		logger.warn('No CalDAV endpoint found, creating local-only event account=%d', accountId);
		return createLocalCalendarEvent(accountId, payload);
	}

	const startsAt = String(payload.startsAt || '').trim();
	const endsAt = String(payload.endsAt || '').trim();
	if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
		throw new Error(__('dav.sync.error.event_start_required'));
	}
	if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
		throw new Error(__('dav.sync.error.event_end_required'));
	}
	if (Date.parse(endsAt) < Date.parse(startsAt)) {
		throw new Error(__('dav.sync.error.event_end_after_start'));
	}

	const creds = await resolveCredentials(accountId, 'caldav');
	const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar', logger).catch(() => []);
	const calendarUrl = (calendars[0] || discovered.caldavUrl).trim();
	const uid = randomUUID();
	const eventUrl = new URL(`${uid}.ics`, ensureTrailingSlash(calendarUrl)).toString();
	const rawIcs = buildCalDavEventIcs({
		uid,
		summary: payload.summary ?? null,
		description: payload.description ?? null,
		location: payload.location ?? null,
		startsAt,
		endsAt,
	});
	const etag = await putCalDavEvent(creds, eventUrl, rawIcs);
	logger.info('Created CalDAV event account=%d uid=%s calendar=%s', accountId, uid, calendarUrl);

	return createCalendarEvent({
		accountId,
		source: 'caldav',
		calendarUrl,
		uid,
		summary: payload.summary ?? null,
		description: payload.description ?? null,
		location: payload.location ?? null,
		startsAt,
		endsAt,
		etag,
		rawIcs,
		lastSeenSync: new Date().toISOString(),
	});
}

async function editCalDavEvent(
	current: {
		id: number;
		account_id: number;
		uid: string;
		summary: string | null;
		description: string | null;
		location: string | null;
		starts_at: string | null;
		ends_at: string | null;
		etag: string | null;
	},
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
	const logger = createMailDebugLogger('caldav', `edit-event:${current.account_id}`);
	const saved = getDavSettings(current.account_id);
	const discovered = saved?.caldav_url
		? {
				accountId: current.account_id,
				carddavUrl: saved.carddav_url ?? null,
				caldavUrl: saved.caldav_url,
			}
		: await discoverDav(current.account_id);
	if (!discovered.caldavUrl) {
		throw new Error(__('dav.sync.error.no_caldav_endpoint_for_account'));
	}

	const startsAt = String(payload.startsAt || '').trim();
	const endsAt = String(payload.endsAt || '').trim();
	if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
		throw new Error(__('dav.sync.error.event_start_required'));
	}
	if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
		throw new Error(__('dav.sync.error.event_end_required'));
	}
	if (Date.parse(endsAt) < Date.parse(startsAt)) {
		throw new Error(__('dav.sync.error.event_end_after_start'));
	}

	const creds = await resolveCredentials(current.account_id, 'caldav');
	const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar', logger).catch(() => []);
	const sourceCalendars = calendars.length > 0 ? calendars : [discovered.caldavUrl];
	const eventUrl = await findCalDavEventUrl(creds, sourceCalendars, current.uid, logger);
	if (!eventUrl) {
		throw new Error(__('dav.sync.error.remote_caldav_event_not_found_sync_calendar'));
	}

	const summary = payload.summary === undefined ? current.summary : payload.summary;
	const description = payload.description === undefined ? current.description : payload.description;
	const location = payload.location === undefined ? current.location : payload.location;
	const rawIcs = buildCalDavEventIcs({
		uid: current.uid,
		summary,
		description,
		location,
		startsAt,
		endsAt,
	});
	const etag = await putCalDavEvent(creds, eventUrl, rawIcs, current.etag);
	logger.info('Updated CalDAV event id=%d uid=%s', current.id, current.uid);

	return updateCalendarEventById(current.id, {
		summary,
		description,
		location,
		startsAt,
		endsAt,
		etag,
		rawIcs,
	});
}

async function removeCalDavEvent(current: {id: number; account_id: number; uid: string; etag: string | null}) {
	const logger = createMailDebugLogger('caldav', `delete-event:${current.account_id}`);
	const saved = getDavSettings(current.account_id);
	const discovered = saved?.caldav_url
		? {
				accountId: current.account_id,
				carddavUrl: saved.carddav_url ?? null,
				caldavUrl: saved.caldav_url,
			}
		: await discoverDav(current.account_id);
	if (!discovered.caldavUrl) {
		throw new Error(__('dav.sync.error.no_caldav_endpoint_for_account'));
	}

	const creds = await resolveCredentials(current.account_id, 'caldav');
	const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar', logger).catch(() => []);
	const sourceCalendars = calendars.length > 0 ? calendars : [discovered.caldavUrl];
	const eventUrl = await findCalDavEventUrl(creds, sourceCalendars, current.uid, logger);
	if (eventUrl) {
		await deleteCalDavEvent(creds, eventUrl, current.etag);
		logger.info('Deleted CalDAV event id=%d uid=%s', current.id, current.uid);
	} else {
		logger.warn('CalDAV href not found for id=%d uid=%s, removing local row only', current.id, current.uid);
	}
	return deleteCalendarEventById(current.id);
}

function extractEmailDomain(email: string): string | null {
	const idx = email.indexOf('@');
	if (idx < 0) return null;
	const domain = email.slice(idx + 1).trim();
	return domain || null;
}

function normalizeXml(xml: string): string {
	return xml.replace(/<\/?[A-Za-z0-9_-]+:/g, (m) => m.replace(/([<\/]?)[A-Za-z0-9_-]+:/, '$1')).replace(/\r/g, '');
}

function extractResponses(xml: string): string[] {
	const normalized = normalizeXml(xml);
	const matches = normalized.match(/<response\b[\s\S]*?<\/response>/g);
	return matches ?? [];
}

function firstResponse(xml: string): string | null {
	const responses = extractResponses(xml);
	return responses[0] ?? null;
}

function extractTagValue(xmlFragment: string, tag: string): string | null {
	const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
	const m = xmlFragment.match(re);
	if (!m) return null;
	return decodeXmlEntities(m[1]).trim();
}

function extractPropertyHref(xmlFragment: string, propertyTag: string): string | null {
	const propertyRe = new RegExp(`<${propertyTag}\\b[^>]*>([\\s\\S]*?)<\\/${propertyTag}>`, 'i');
	const propertyMatch = xmlFragment.match(propertyRe);
	if (!propertyMatch) return null;
	const hrefMatch = propertyMatch[1].match(/<href\b[^>]*>([\s\S]*?)<\/href>/i);
	if (!hrefMatch) return null;
	return decodeXmlEntities(hrefMatch[1]).trim();
}

function hasTag(xmlFragment: string, tag: string): boolean {
	const re = new RegExp(`<${tag}(\\s|\\/|>)`, 'i');
	return re.test(xmlFragment);
}

function resolveUrl(baseUrl: string, href: string): string {
	return new URL(href, baseUrl).toString();
}

function ensureTrailingSlash(url: string): string {
	return url.endsWith('/') ? url : `${url}/`;
}

function normalizeDavDisplayName(value: string | null | undefined): string | null {
	const normalized = String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.slice(0, 120);
	return normalized || null;
}

function decodeXmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

function escapeVCardValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildVCard(payload: {
	uid: string;
	fullName: string | null;
	email: string;
	emails?: string[] | null;
	phone?: string | null;
	phones?: string[] | null;
	organization?: string | null;
	title?: string | null;
	note?: string | null;
}): string {
	const fullName = (payload.fullName || '').trim();
	const displayName = fullName || payload.email.trim();
	const safeName = escapeVCardValue(displayName);
	const normalizedEmails = dedupe(
		[payload.email, ...(payload.emails || [])]
			.map((value) =>
				String(value || '')
					.trim()
					.toLowerCase(),
			)
			.filter(Boolean),
	);
	const safeEmail = escapeVCardValue((normalizedEmails[0] || payload.email).trim().toLowerCase());
	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`UID:${escapeVCardValue(payload.uid)}`,
		`FN:${safeName}`,
		`N:${safeName};;;;`,
		`EMAIL;TYPE=INTERNET:${safeEmail}`,
	];
	for (let index = 1; index < normalizedEmails.length; index += 1) {
		lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(normalizedEmails[index])}`);
	}
	const normalizedPhones = dedupe(
		[payload.phone || '', ...(payload.phones || [])].map((value) => String(value || '').trim()).filter(Boolean),
	);
	for (const phone of normalizedPhones) {
		lines.push(`TEL;TYPE=CELL:${escapeVCardValue(phone)}`);
	}
	if (payload.organization?.trim()) lines.push(`ORG:${escapeVCardValue(payload.organization.trim())}`);
	if (payload.title?.trim()) lines.push(`TITLE:${escapeVCardValue(payload.title.trim())}`);
	if (payload.note?.trim()) lines.push(`NOTE:${escapeVCardValue(payload.note.trim())}`);
	lines.push('END:VCARD', '');
	return lines.join('\r\n');
}

function parseVCard(
	rawCard: string,
	fallbackUid: string,
): {
	uid: string;
	fullName: string | null;
	emails: string[];
	phones: string[];
	organization: string | null;
	title: string | null;
	note: string | null;
} {
	const lines = unfoldIcs(rawCard);
	let uid = '';
	let fullName: string | null = null;
	const phones: string[] = [];
	let organization: string | null = null;
	let title: string | null = null;
	let note: string | null = null;
	const emails: string[] = [];
	for (const line of lines) {
		const [keyRaw, ...rest] = line.split(':');
		if (!keyRaw || rest.length === 0) continue;
		const key = keyRaw.split(';')[0].toUpperCase();
		const value = rest.join(':').trim();
		if (!value) continue;
		if (key === 'UID') uid = value;
		if (key === 'FN') fullName = value;
		if (key === 'EMAIL') emails.push(value.toLowerCase());
		if (key === 'TEL') phones.push(value);
		if (key === 'ORG' && !organization) organization = value;
		if (key === 'TITLE' && !title) title = value;
		if (key === 'NOTE' && !note) note = value;
	}
	const dedupedPhones = dedupe(phones.map((value) => value.trim()).filter(Boolean));
	if (emails.length === 0) {
		return {
			uid: uid || fallbackUid,
			fullName,
			emails: [],
			phones: dedupedPhones,
			organization,
			title,
			note,
		};
	}
	return {
		uid: uid || fallbackUid,
		fullName,
		emails: dedupe(emails),
		phones: dedupedPhones,
		organization,
		title,
		note,
	};
}

function composeSyncedContactNote(note: string | null, emails: string[], phones: string[]): string | null {
	const normalizedNote = String(note || '').trim();
	const normalizedEmails = dedupe(emails.map((value) => value.trim().toLowerCase()).filter(Boolean));
	const normalizedPhones = dedupe(phones.map((value) => value.trim()).filter(Boolean));
	const hasMeta = normalizedEmails.length > 1 || normalizedPhones.length > 1;
	if (!hasMeta) return normalizedNote || null;
	const payload = JSON.stringify({emails: normalizedEmails, phones: normalizedPhones});
	if (!normalizedNote) return `${CONTACT_META_PREFIX}\n${payload}`;
	return `${normalizedNote}\n\n${CONTACT_META_PREFIX}\n${payload}`;
}

function extractContactMeta(note: string | null | undefined): {
	noteText: string;
	emails: string[];
	phones: string[];
} {
	const raw = String(note || '');
	const markerIndex = raw.lastIndexOf(CONTACT_META_PREFIX);
	if (markerIndex < 0) {
		return {noteText: raw.trim(), emails: [], phones: []};
	}
	const noteText = raw.slice(0, markerIndex).trimEnd();
	const metaRaw = raw.slice(markerIndex + CONTACT_META_PREFIX.length).trim();
	if (!metaRaw) {
		return {noteText: noteText.trim(), emails: [], phones: []};
	}
	try {
		const parsed = JSON.parse(metaRaw) as {emails?: string[]; phones?: string[]};
		return {
			noteText: noteText.trim(),
			emails: Array.isArray(parsed.emails)
				? parsed.emails
						.map((value) =>
							String(value || '')
								.trim()
								.toLowerCase(),
						)
						.filter(Boolean)
				: [],
			phones: Array.isArray(parsed.phones)
				? parsed.phones.map((value) => String(value || '').trim()).filter(Boolean)
				: [],
		};
	} catch {
		return {noteText: raw.trim(), emails: [], phones: []};
	}
}

function extractCardDavChannels(
	primaryEmail: string,
	primaryPhone: string | null,
	note: string | null | undefined,
): {noteText: string | null; emails: string[]; phones: string[]} {
	const parsed = extractContactMeta(note);
	const emails = dedupe(
		[primaryEmail, ...parsed.emails]
			.map((value) =>
				String(value || '')
					.trim()
					.toLowerCase(),
			)
			.filter(Boolean),
	);
	const phones = dedupe(
		[primaryPhone || '', ...parsed.phones].map((value) => String(value || '').trim()).filter(Boolean),
	);
	return {
		noteText: parsed.noteText || null,
		emails,
		phones,
	};
}

function parseIcsEvents(rawIcs: string): Array<{
	uid: string;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	startsAt?: string | null;
	endsAt?: string | null;
}> {
	const unfolded = unfoldIcs(rawIcs).join('\n');
	const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
	const out: Array<{
		uid: string;
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt?: string | null;
		endsAt?: string | null;
	}> = [];
	for (const block of blocks) {
		let uid = '';
		let summary: string | null = null;
		let description: string | null = null;
		let location: string | null = null;
		let startsAt: string | null = null;
		let endsAt: string | null = null;

		const lines = block.split('\n');
		for (const line of lines) {
			const [keyRaw, ...rest] = line.split(':');
			if (!keyRaw || rest.length === 0) continue;
			const {name: key, params} = parseIcsPropertyKey(keyRaw);
			const value = rest.join(':').trim();
			if (!value) continue;
			if (key === 'UID') uid = value;
			if (key === 'SUMMARY') summary = value;
			if (key === 'DESCRIPTION') description = value.replace(/\\n/g, '\n');
			if (key === 'LOCATION') location = value;
			if (key === 'DTSTART') startsAt = parseIcsDate(value, params.TZID);
			if (key === 'DTEND') endsAt = parseIcsDate(value, params.TZID);
		}
		if (!uid) continue;
		out.push({uid, summary, description, location, startsAt, endsAt});
	}
	return out;
}

function parseIcsPropertyKey(keyRaw: string): {name: string; params: Record<string, string>} {
	const segments = String(keyRaw || '')
		.split(';')
		.map((segment) => segment.trim())
		.filter(Boolean);
	const name = String(segments[0] || '')
		.trim()
		.toUpperCase();
	const params: Record<string, string> = {};
	for (const segment of segments.slice(1)) {
		const equalIndex = segment.indexOf('=');
		if (equalIndex <= 0) continue;
		const paramName = segment.slice(0, equalIndex).trim().toUpperCase();
		const paramValue = segment
			.slice(equalIndex + 1)
			.trim()
			.replace(/^"(.*)"$/, '$1');
		if (!paramName || !paramValue) continue;
		params[paramName] = paramValue;
	}
	return {name, params};
}

function unfoldIcs(input: string): string[] {
	const source = input.replace(/\r/g, '').split('\n');
	const lines: string[] = [];
	for (const line of source) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else {
			lines.push(line);
		}
	}
	return lines.filter((line) => line.length > 0);
}

function parseIcsDate(value: string, timeZone?: string | null): string | null {
	const v = value.trim();
	if (/^\d{8}T\d{6}Z$/.test(v)) {
		const y = Number(v.slice(0, 4));
		const m = Number(v.slice(4, 6)) - 1;
		const d = Number(v.slice(6, 8));
		const hh = Number(v.slice(9, 11));
		const mm = Number(v.slice(11, 13));
		const ss = Number(v.slice(13, 15));
		return new Date(Date.UTC(y, m, d, hh, mm, ss)).toISOString();
	}
	if (/^\d{8}T\d{4}Z$/.test(v)) {
		const y = Number(v.slice(0, 4));
		const m = Number(v.slice(4, 6)) - 1;
		const d = Number(v.slice(6, 8));
		const hh = Number(v.slice(9, 11));
		const mm = Number(v.slice(11, 13));
		return new Date(Date.UTC(y, m, d, hh, mm, 0)).toISOString();
	}
	if (/^\d{8}$/.test(v)) {
		const y = Number(v.slice(0, 4));
		const m = Number(v.slice(4, 6)) - 1;
		const d = Number(v.slice(6, 8));
		return new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
	}
	if (/^\d{8}T\d{6}$/.test(v) || /^\d{8}T\d{4}$/.test(v)) {
		const y = Number(v.slice(0, 4));
		const m = Number(v.slice(4, 6)) - 1;
		const d = Number(v.slice(6, 8));
		const hh = Number(v.slice(9, 11));
		const mm = Number(v.slice(11, 13));
		const ss = v.length >= 15 ? Number(v.slice(13, 15)) : 0;
		const parsedFromTimeZone = parseFloatingIcsDateWithTimeZone(y, m, d, hh, mm, ss, timeZone);
		if (parsedFromTimeZone) return parsedFromTimeZone;
		const localDate = new Date(y, m, d, hh, mm, ss);
		return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
	}
	const parsed = Date.parse(v);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseFloatingIcsDateWithTimeZone(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	timeZone?: string | null,
): string | null {
	const normalizedZone = String(timeZone || '').trim();
	if (!normalizedZone) return null;
	try {
		// Validate that this runtime recognizes the IANA time zone.
		new Intl.DateTimeFormat('en-US', {timeZone: normalizedZone}).format(new Date());
	} catch {
		return null;
	}

	const baseUtcMs = Date.UTC(year, month, day, hour, minute, second);
	let utcMs = baseUtcMs;
	for (let pass = 0; pass < 2; pass += 1) {
		const offsetMinutes = getTimeZoneOffsetMinutes(utcMs, normalizedZone);
		if (offsetMinutes === null) break;
		utcMs = baseUtcMs - offsetMinutes * 60_000;
	}
	return new Date(utcMs).toISOString();
}

function getTimeZoneOffsetMinutes(timestampMs: number, timeZone: string): number | null {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZoneName: 'shortOffset',
		});
		const parts = formatter.formatToParts(new Date(timestampMs));
		const offsetLabel = String(parts.find((part) => part.type === 'timeZoneName')?.value || '').trim();
		if (!offsetLabel) return null;
		if (/^GMT$/i.test(offsetLabel)) return 0;
		const match = offsetLabel.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
		if (!match) return null;
		const sign = match[1] === '-' ? -1 : 1;
		const hours = Number(match[2] || '0');
		const minutes = Number(match[3] || '0');
		if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
		return sign * (hours * 60 + minutes);
	} catch {
		return null;
	}
}

function toCalDavDate(d: Date): string {
	const y = d.getUTCFullYear().toString().padStart(4, '0');
	const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = d.getUTCDate().toString().padStart(2, '0');
	const hh = d.getUTCHours().toString().padStart(2, '0');
	const mm = d.getUTCMinutes().toString().padStart(2, '0');
	const ss = d.getUTCSeconds().toString().padStart(2, '0');
	return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function escapeIcsText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function toIcsText(value: string | null | undefined): string | null {
	const normalized = String(value || '').trim();
	if (!normalized) return null;
	return escapeIcsText(normalized);
}

function buildCalDavEventIcs(payload: {
	uid: string;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	startsAt: string;
	endsAt: string;
}): string {
	const startsAt = new Date(payload.startsAt);
	const endsAt = new Date(payload.endsAt);
	if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
		throw new Error(__('dav.sync.error.invalid_event_datetime'));
	}
	const now = new Date();
	const dtStamp = toCalDavDate(now);
	const dtStart = toCalDavDate(startsAt);
	const dtEnd = toCalDavDate(endsAt);
	const summary = toIcsText(payload.summary) || __('dav.sync.untitled_event');
	const description = toIcsText(payload.description);
	const location = toIcsText(payload.location);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//LlamaMail//Calendar//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${payload.uid}`,
		`DTSTAMP:${dtStamp}`,
		`DTSTART:${dtStart}`,
		`DTEND:${dtEnd}`,
		`SUMMARY:${summary}`,
	];
	if (description) lines.push(`DESCRIPTION:${description}`);
	if (location) lines.push(`LOCATION:${location}`);
	lines.push('END:VEVENT', 'END:VCALENDAR');
	return `${lines.join('\r\n')}\r\n`;
}

function dedupe<T>(items: T[]): T[] {
	return Array.from(new Set(items));
}

function dedupeBy<T>(items: T[], keyFn: (value: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const key = keyFn(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

function dedupeAddressBookCollections(items: Array<{url: string; name: string | null}>): Array<{
	url: string;
	name: string | null;
}> {
	const seen = new Set<string>();
	const out: Array<{url: string; name: string | null}> = [];
	for (const item of items) {
		const key = ensureTrailingSlash(item.url);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({url: key, name: item.name});
	}
	return out;
}
