import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo.js';
import {
	createAddressBook,
	createCalendarEvent,
	createLocalCalendarEvent,
	createLocalContact,
	deleteAddressBook as deleteLocalAddressBook,
	deleteCalendarEventById,
	deleteContactById,
	deleteLocalCalendarEvent,
	deleteLocalContact,
	getCalendarEventById,
	getContactById,
	getDavSettings,
	listAddressBooks,
	listCalendarEvents,
	listContacts,
	syncCardDavAddressBooks,
	updateCalendarEventById,
	updateCardDavContact,
	updateLocalCalendarEvent,
	updateLocalContact,
	upsertCalendarEvents,
	upsertCardDavContact,
	upsertContacts,
	upsertDavSettings,
} from '@main/db/repositories/davRepo.js';
import {randomUUID} from 'node:crypto';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import type {DavSyncOptions} from '@/shared/ipcTypes.js';

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

type DavCredentials = {
	email: string;
	user: string;
	password: string;
	imapHost: string;
};

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
	const creds = await resolveCredentials(accountId);
	const saved = getDavSettings(accountId);
	carddavLogger.debug('Starting CardDAV discovery for account=%d email=%s', accountId, creds.email);
	caldavLogger.debug('Starting CalDAV discovery for account=%d email=%s', accountId, creds.email);

	const carddavUrl = await discoverHomeUrl(
		creds,
		saved?.carddav_url || null,
		'carddav',
		'addressbook-home-set',
		carddavLogger,
	);
	const caldavUrl = await discoverHomeUrl(
		creds,
		saved?.caldav_url || null,
		'caldav',
		'calendar-home-set',
		caldavLogger,
	);

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
	const creds: DavCredentials = {
		email: String(payload.email || '').trim(),
		user: String(payload.user || '').trim(),
		password: String(payload.password || ''),
		imapHost: String(payload.imapHost || '').trim(),
	};
	if (!creds.email || !creds.user || !creds.password || !creds.imapHost) {
		throw new Error('Missing DAV preview credentials');
	}

	const carddavLogger = createMailDebugLogger('carddav', 'discover:preview');
	const caldavLogger = createMailDebugLogger('caldav', 'discover:preview');
	carddavLogger.debug('Starting CardDAV preview discovery email=%s imapHost=%s', creds.email, creds.imapHost);
	caldavLogger.debug('Starting CalDAV preview discovery email=%s imapHost=%s', creds.email, creds.imapHost);

	const carddavUrl = await discoverHomeUrl(creds, null, 'carddav', 'addressbook-home-set', carddavLogger);
	const caldavUrl = await discoverHomeUrl(creds, null, 'caldav', 'calendar-home-set', caldavLogger);

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
		throw new Error('DAV sync does not support OAuth accounts. Use provider ancillary sync service instead.');
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
	const creds = await resolveCredentials(accountId);
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
		const books = await listAddressBookCollections(creds, discovered.carddavUrl, carddavLogger);
		const sourceBooks = books.length > 0 ? books.map((book) => book.url) : [discovered.carddavUrl];
		carddavLogger.debug('Using %d CardDAV address books', sourceBooks.length);
		const syncedBookIds = syncCardDavAddressBooks(
			accountId,
			books.length > 0
				? books.map((book) => ({remoteUrl: book.url, name: book.name ?? null}))
				: [{remoteUrl: discovered.carddavUrl, name: 'Contacts'}],
		);
		const contacts = await pullContacts(creds, sourceBooks, carddavLogger);
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
		const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar', caldavLogger);
		const sourceCalendars = calendars.length > 0 ? calendars : [discovered.caldavUrl];
		caldavLogger.debug('Using %d CalDAV calendars', sourceCalendars.length);
		const events = await pullEvents(creds, sourceCalendars, caldavLogger);
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

	const creds = await resolveCredentials(accountId);
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

export function editContact(
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
	if (!current) throw new Error('Contact not found.');
	if (current.source.startsWith('local:')) {
		return updateLocalContact(contactId, payload);
	}
	if (current.source !== 'carddav') {
		throw new Error('This contact source is read-only.');
	}

	return editCardDavContact(current, payload);
}

export function removeContact(contactId: number) {
	const current = getContactById(contactId);
	if (!current) return {removed: false};
	if (current.source.startsWith('local:')) {
		return deleteLocalContact(contactId);
	}
	if (current.source !== 'carddav') {
		throw new Error('This contact source is read-only.');
	}
	return removeCardDavContact(current);
}

export function getCalendarEvents(
	accountId: number,
	startIso?: string | null,
	endIso?: string | null,
	limit: number = 500,
) {
	return listCalendarEvents(accountId, startIso, endIso, limit);
}

export function addCalendarEvent(
	accountId: number,
	payload: {
		summary?: string | null;
		description?: string | null;
		location?: string | null;
		startsAt: string;
		endsAt: string;
	},
) {
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
	if (!current) throw new Error('Calendar event not found.');
	if (current.source === 'local') {
		return updateLocalCalendarEvent(eventId, payload);
	}
	if (current.source !== 'caldav') {
		throw new Error('This calendar source is read-only.');
	}
	return editCalDavEvent(current, payload);
}

export async function removeCalendarEvent(eventId: number) {
	const current = getCalendarEventById(eventId);
	if (!current) return {removed: false};
	if (current.source === 'local') {
		return deleteLocalCalendarEvent(eventId);
	}
	if (current.source !== 'caldav') {
		throw new Error('This calendar source is read-only.');
	}
	return removeCalDavEvent(current);
}

async function resolveCredentials(accountId: number): Promise<DavCredentials> {
	const creds = await getAccountSyncCredentials(accountId);
	if (creds.auth_method === 'oauth2') {
		const providerLabel = creds.oauth_provider ? `${creds.oauth_provider}` : 'selected provider';
		throw new Error(
			`Calendar and contacts sync via ${providerLabel} OAuth is not supported yet. ` +
				`Use account/app password DAV credentials for now, or report this on GitHub: https://github.com/wuild/LlamaMail/issues`,
		);
	}
	if (!creds.password) {
		throw new Error('DAV sync currently requires account password or app password credentials.');
	}
	return {
		email: creds.email,
		user: creds.user,
		password: creds.password,
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
		throw new Error(`Well-known endpoint unavailable (${probe.status})`);
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
		throw new Error(`DAV ${method} failed (${response.status}) for ${url}`);
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
		throw new Error(`CardDAV PUT failed (${response.status}) for ${url}`);
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
		throw new Error(`CalDAV PUT failed (${response.status}) for ${url}`);
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
		throw new Error(`CardDAV DELETE failed (${response.status}) for ${url}`);
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
		throw new Error(`CalDAV DELETE failed (${response.status}) for ${url}`);
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
		throw new Error('No CardDAV endpoint discovered for this account.');
	}

	const creds = await resolveCredentials(current.account_id);
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
		throw new Error('Could not locate remote CardDAV contact to update. Please sync contacts and try again.');
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
		throw new Error('No CardDAV endpoint discovered for this account.');
	}

	const creds = await resolveCredentials(current.account_id);
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
		throw new Error('Event start date/time is required.');
	}
	if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
		throw new Error('Event end date/time is required.');
	}
	if (Date.parse(endsAt) < Date.parse(startsAt)) {
		throw new Error('Event end must be after start.');
	}

	const creds = await resolveCredentials(accountId);
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
		throw new Error('No CalDAV endpoint discovered for this account.');
	}

	const startsAt = String(payload.startsAt || '').trim();
	const endsAt = String(payload.endsAt || '').trim();
	if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
		throw new Error('Event start date/time is required.');
	}
	if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
		throw new Error('Event end date/time is required.');
	}
	if (Date.parse(endsAt) < Date.parse(startsAt)) {
		throw new Error('Event end must be after start.');
	}

	const creds = await resolveCredentials(current.account_id);
	const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar', logger).catch(() => []);
	const sourceCalendars = calendars.length > 0 ? calendars : [discovered.caldavUrl];
	const eventUrl = await findCalDavEventUrl(creds, sourceCalendars, current.uid, logger);
	if (!eventUrl) {
		throw new Error('Could not locate remote CalDAV event to update. Please sync calendar and try again.');
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
		throw new Error('No CalDAV endpoint discovered for this account.');
	}

	const creds = await resolveCredentials(current.account_id);
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
			const key = keyRaw.split(';')[0].toUpperCase();
			const value = rest.join(':').trim();
			if (!value) continue;
			if (key === 'UID') uid = value;
			if (key === 'SUMMARY') summary = value;
			if (key === 'DESCRIPTION') description = value.replace(/\\n/g, '\n');
			if (key === 'LOCATION') location = value;
			if (key === 'DTSTART') startsAt = parseIcsDate(value);
			if (key === 'DTEND') endsAt = parseIcsDate(value);
		}
		if (!uid) continue;
		out.push({uid, summary, description, location, startsAt, endsAt});
	}
	return out;
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

function parseIcsDate(value: string): string | null {
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
	if (/^\d{8}$/.test(v)) {
		const y = Number(v.slice(0, 4));
		const m = Number(v.slice(4, 6)) - 1;
		const d = Number(v.slice(6, 8));
		return new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
	}
	const parsed = Date.parse(v);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
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
		throw new Error('Invalid event date/time.');
	}
	const now = new Date();
	const dtStamp = toCalDavDate(now);
	const dtStart = toCalDavDate(startsAt);
	const dtEnd = toCalDavDate(endsAt);
	const summary = toIcsText(payload.summary) || 'Untitled Event';
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
