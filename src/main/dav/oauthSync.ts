import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {upsertCalendarEvents, upsertContacts} from '@main/db/repositories/davRepo.js';
import type {CalendarSyncRange, DavSyncModules, OAuthProvider} from '@/shared/ipcTypes.js';

type OAuthTokenContext = {
	accountId: number;
	accessToken: string;
};

type DavLikeSyncSummary = {
	accountId: number;
	discovered: {accountId: number; carddavUrl: string | null; caldavUrl: string | null};
	contacts: {upserted: number; removed: number; books: number};
	events: {upserted: number; removed: number; calendars: number};
};

type OAuthSyncInput = {
	accountId: number;
	oauthProvider: OAuthProvider | null;
	accessToken: string;
	calendarRange?: CalendarSyncRange | null;
	modules?: DavSyncModules | null;
	carddavLogger: ReturnType<typeof createMailDebugLogger>;
	caldavLogger: ReturnType<typeof createMailDebugLogger>;
};

function normalizeCalendarRange(
	calendarRange?: CalendarSyncRange | null,
): {startIso: string; endIso: string} | null {
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

async function fetchOAuthJson(
	ctx: OAuthTokenContext,
	url: string,
	logger: ReturnType<typeof createMailDebugLogger>,
): Promise<unknown> {
	const response = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${ctx.accessToken}`,
			'Accept': 'application/json',
		},
	});
	if (!response.ok) {
		const body = await response.text().catch(() => '');
		logger.warn('OAuth API request failed account=%d status=%d url=%s', ctx.accountId, response.status, url);
		throw new Error(`Provider API request failed (${response.status}): ${body || response.statusText}`);
	}
	return await response.json();
}

function normalizeProviderDateTime(dateTime: string | null | undefined): string | null {
	const value = String(dateTime || '').trim();
	if (!value) return null;
	const parsed = Date.parse(value);
	if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
	const parsedUtc = Date.parse(`${value}Z`);
	if (!Number.isNaN(parsedUtc)) return new Date(parsedUtc).toISOString();
	return null;
}

function normalizeGoogleEventDateTime(
	eventDate: {dateTime?: string | null; date?: string | null} | null | undefined,
): string | null {
	if (!eventDate) return null;
	if (eventDate.dateTime) return normalizeProviderDateTime(eventDate.dateTime);
	if (eventDate.date) return normalizeProviderDateTime(`${eventDate.date}T00:00:00Z`);
	return null;
}

async function syncGoogleOAuthApis(
	accountId: number,
	ctx: OAuthTokenContext,
	calendarRange: {startIso: string; endIso: string} | null,
	syncModules: {contacts: boolean; calendar: boolean},
	carddavLogger: ReturnType<typeof createMailDebugLogger>,
	caldavLogger: ReturnType<typeof createMailDebugLogger>,
): Promise<DavLikeSyncSummary> {
	const contactRows: Array<{
		sourceUid: string;
		fullName: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	}> = [];

	let contactsPersisted = {upserted: 0, removed: 0};
	if (syncModules.contacts) {
		let peopleUrl =
			'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,biographies&pageSize=1000';
		while (peopleUrl) {
			const payload = (await fetchOAuthJson(ctx, peopleUrl, carddavLogger)) as {
				connections?: Array<{
					resourceName?: string;
					names?: Array<{displayName?: string}>;
					emailAddresses?: Array<{value?: string}>;
					phoneNumbers?: Array<{value?: string}>;
					organizations?: Array<{name?: string; title?: string}>;
					biographies?: Array<{value?: string}>;
				}>;
				nextPageToken?: string;
			};
			for (const person of payload.connections ?? []) {
				const emails = (person.emailAddresses ?? [])
					.map((entry) => String(entry.value || '').trim())
					.filter(Boolean);
				if (emails.length === 0) continue;
				const phone = String(person.phoneNumbers?.[0]?.value || '').trim() || null;
				const organization = String(person.organizations?.[0]?.name || '').trim() || null;
				const title = String(person.organizations?.[0]?.title || '').trim() || null;
				const note = String(person.biographies?.[0]?.value || '').trim() || null;
				const fullName = String(person.names?.[0]?.displayName || '').trim() || null;
				const sourceUid = String(person.resourceName || '').trim() || emails[0];
				for (const email of emails) {
					contactRows.push({
						sourceUid,
						fullName,
						email,
						phone,
						organization,
						title,
						note,
					});
				}
			}
			const nextPageToken = String(payload.nextPageToken || '').trim();
			peopleUrl = nextPageToken
				? `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,biographies&pageSize=1000&pageToken=${encodeURIComponent(nextPageToken)}`
				: '';
		}

		contactsPersisted = upsertContacts(accountId, contactRows, 'google-api');
		carddavLogger.info(
			'Google People contacts persisted upserted=%d removed=%d',
			contactsPersisted.upserted,
			contactsPersisted.removed,
		);
	} else {
		carddavLogger.debug('Skipping Google contacts sync because contacts module is disabled');
	}

	const eventsRows: Array<{
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
	let eventsPersisted = {upserted: 0, removed: 0};
	if (syncModules.calendar) {
		const calendarList = (await fetchOAuthJson(
			ctx,
			'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',
			caldavLogger,
		)) as {items?: Array<{id?: string; summary?: string}>};

		for (const calendar of calendarList.items ?? []) {
			const calendarId = String(calendar.id || '').trim();
			if (!calendarId) continue;
			const searchParams = new URLSearchParams({
				singleEvents: 'true',
				showDeleted: 'false',
				maxResults: '2500',
				orderBy: 'startTime',
			});
			if (calendarRange) {
				searchParams.set('timeMin', calendarRange.startIso);
				searchParams.set('timeMax', calendarRange.endIso);
			}
			let eventsUrl =
				`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
				`?${searchParams.toString()}`;
			while (eventsUrl) {
				const payload = (await fetchOAuthJson(ctx, eventsUrl, caldavLogger)) as {
					items?: Array<{
						id?: string;
						iCalUID?: string;
						summary?: string | null;
						description?: string | null;
						location?: string | null;
						etag?: string | null;
						organizer?: {email?: string | null; displayName?: string | null};
						start?: {dateTime?: string | null; date?: string | null};
						end?: {dateTime?: string | null; date?: string | null};
					}>;
					nextPageToken?: string;
				};
				for (const event of payload.items ?? []) {
					const uid = String(event.iCalUID || event.id || '').trim();
					if (!uid) continue;
					eventsRows.push({
						calendarUrl: `google:${calendarId}`,
						uid,
						summary: event.summary ?? null,
						description: event.description ?? null,
						location: event.location ?? null,
						startsAt: normalizeGoogleEventDateTime(event.start),
						endsAt: normalizeGoogleEventDateTime(event.end),
						etag: event.etag ?? null,
						rawIcs: JSON.stringify({
							provider: 'google-api',
							calendarId,
							calendarSummary: String(calendar.summary || '').trim() || null,
							organizerEmail: String(event.organizer?.email || '').trim() || null,
							organizerName: String(event.organizer?.displayName || '').trim() || null,
						}),
					});
				}
				const nextPageToken = String(payload.nextPageToken || '').trim();
				if (!nextPageToken) {
					eventsUrl = '';
					continue;
				}
				const nextParams = new URLSearchParams(searchParams);
				nextParams.set('pageToken', nextPageToken);
				eventsUrl =
					`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
					`?${nextParams.toString()}`;
			}
		}

		eventsPersisted = upsertCalendarEvents(accountId, eventsRows, 'google-api', {
			removeMissing: !calendarRange,
		});
		caldavLogger.info(
			'Google Calendar events persisted upserted=%d removed=%d',
			eventsPersisted.upserted,
			eventsPersisted.removed,
		);
	} else {
		caldavLogger.debug('Skipping Google calendar sync because calendar module is disabled');
	}
	return {
		accountId,
		discovered: {accountId, carddavUrl: 'google-api', caldavUrl: 'google-api'},
		contacts: {upserted: contactsPersisted.upserted, removed: contactsPersisted.removed, books: 1},
		events: {upserted: eventsPersisted.upserted, removed: eventsPersisted.removed, calendars: 1},
	};
}

async function syncMicrosoftOAuthApis(
	accountId: number,
	ctx: OAuthTokenContext,
	calendarRange: {startIso: string; endIso: string} | null,
	syncModules: {contacts: boolean; calendar: boolean},
	carddavLogger: ReturnType<typeof createMailDebugLogger>,
	caldavLogger: ReturnType<typeof createMailDebugLogger>,
): Promise<DavLikeSyncSummary> {
	const contactRows: Array<{
		sourceUid: string;
		fullName: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	}> = [];

	let contactsPersisted = {upserted: 0, removed: 0};
	if (syncModules.contacts) {
		let contactsUrl =
			'https://graph.microsoft.com/v1.0/me/contacts?$top=500&$select=id,displayName,emailAddresses,mobilePhone,businessPhones,companyName,jobTitle';
		while (contactsUrl) {
			const payload = (await fetchOAuthJson(ctx, contactsUrl, carddavLogger)) as {
				value?: Array<{
					id?: string;
					displayName?: string;
					emailAddresses?: Array<{address?: string}>;
					mobilePhone?: string | null;
					businessPhones?: string[] | null;
					companyName?: string | null;
					jobTitle?: string | null;
				}>;
				'@odata.nextLink'?: string;
			};
			for (const person of payload.value ?? []) {
				const emails = (person.emailAddresses ?? [])
					.map((entry) => String(entry.address || '').trim())
					.filter(Boolean);
				if (emails.length === 0) continue;
				const phone =
					String(person.mobilePhone || '').trim() || String(person.businessPhones?.[0] || '').trim() || null;
				const organization = String(person.companyName || '').trim() || null;
				const title = String(person.jobTitle || '').trim() || null;
				const fullName = String(person.displayName || '').trim() || null;
				const sourceUid = String(person.id || '').trim() || emails[0];
				for (const email of emails) {
					contactRows.push({
						sourceUid,
						fullName,
						email,
						phone,
						organization,
						title,
						note: null,
					});
				}
			}
			contactsUrl = String(payload['@odata.nextLink'] || '').trim();
		}

		contactsPersisted = upsertContacts(accountId, contactRows, 'microsoft-graph');
		carddavLogger.info(
			'Microsoft Graph contacts persisted upserted=%d removed=%d',
			contactsPersisted.upserted,
			contactsPersisted.removed,
		);
	} else {
		carddavLogger.debug('Skipping Microsoft contacts sync because contacts module is disabled');
	}

	const eventsRows: Array<{
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
	let eventsPersisted = {upserted: 0, removed: 0};
	if (syncModules.calendar) {
		const calendars = (await fetchOAuthJson(
			ctx,
			'https://graph.microsoft.com/v1.0/me/calendars?$top=100&$select=id,name',
			caldavLogger,
		)) as {value?: Array<{id?: string; name?: string}>};

		for (const calendar of calendars.value ?? []) {
			const calendarId = String(calendar.id || '').trim();
			if (!calendarId) continue;
			let eventsUrl = '';
			if (calendarRange) {
				const searchParams = new URLSearchParams({
					startDateTime: calendarRange.startIso,
					endDateTime: calendarRange.endIso,
					$top: '1000',
					$select: 'id,iCalUId,subject,bodyPreview,location,start,end',
				});
				eventsUrl =
					`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView` +
					`?${searchParams.toString()}`;
			} else {
				eventsUrl =
					`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events` +
					'?$top=500&$select=id,iCalUId,subject,bodyPreview,location,start,end';
			}
			while (eventsUrl) {
				const payload = (await fetchOAuthJson(ctx, eventsUrl, caldavLogger)) as {
					value?: Array<{
						id?: string;
						iCalUId?: string;
						subject?: string | null;
						bodyPreview?: string | null;
						location?: {displayName?: string | null};
						start?: {dateTime?: string | null};
						end?: {dateTime?: string | null};
					}>;
					'@odata.nextLink'?: string;
				};
				for (const event of payload.value ?? []) {
					const uid = String(event.iCalUId || event.id || '').trim();
					if (!uid) continue;
					eventsRows.push({
						calendarUrl: `microsoft:${calendarId}`,
						uid,
						summary: event.subject ?? null,
						description: event.bodyPreview ?? null,
						location: event.location?.displayName ?? null,
						startsAt: normalizeProviderDateTime(event.start?.dateTime),
						endsAt: normalizeProviderDateTime(event.end?.dateTime),
						etag: null,
						rawIcs: null,
					});
				}
				eventsUrl = String(payload['@odata.nextLink'] || '').trim();
			}
		}

		eventsPersisted = upsertCalendarEvents(accountId, eventsRows, 'microsoft-graph', {
			removeMissing: !calendarRange,
		});
		caldavLogger.info(
			'Microsoft Graph events persisted upserted=%d removed=%d',
			eventsPersisted.upserted,
			eventsPersisted.removed,
		);
	} else {
		caldavLogger.debug('Skipping Microsoft calendar sync because calendar module is disabled');
	}

	return {
		accountId,
		discovered: {accountId, carddavUrl: 'microsoft-graph', caldavUrl: 'microsoft-graph'},
		contacts: {upserted: contactsPersisted.upserted, removed: contactsPersisted.removed, books: 1},
		events: {upserted: eventsPersisted.upserted, removed: eventsPersisted.removed, calendars: 1},
	};
}

export async function syncOauthProviderDav(input: OAuthSyncInput): Promise<DavLikeSyncSummary> {
	const ctx: OAuthTokenContext = {accountId: input.accountId, accessToken: input.accessToken};
	const normalizedRange = normalizeCalendarRange(input.calendarRange);
	const syncModules = {
		contacts: input.modules?.contacts !== false,
		calendar: input.modules?.calendar !== false,
	};
	if (input.oauthProvider === 'google') {
		return await syncGoogleOAuthApis(
			input.accountId,
			ctx,
			normalizedRange,
			syncModules,
			input.carddavLogger,
			input.caldavLogger,
		);
	}
	if (input.oauthProvider === 'microsoft') {
		return await syncMicrosoftOAuthApis(
			input.accountId,
			ctx,
			normalizedRange,
			syncModules,
			input.carddavLogger,
			input.caldavLogger,
		);
	}

	input.carddavLogger.warn('Skipping OAuth ancillary sync for unsupported provider=%s', input.oauthProvider);
	input.caldavLogger.warn('Skipping OAuth ancillary sync for unsupported provider=%s', input.oauthProvider);
	return {
		accountId: input.accountId,
		discovered: {accountId: input.accountId, carddavUrl: null, caldavUrl: null},
		contacts: {upserted: 0, removed: 0, books: 0},
		events: {upserted: 0, removed: 0, calendars: 0},
	};
}
