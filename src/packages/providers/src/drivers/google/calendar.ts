import type {ProviderCalendarRuntime} from '@llamamail/app/providerRuntime';
import type {CalendarRange, CalendarSyncRow} from '../../types';

function normalizeProviderDateTime(dateTime: string | null | undefined): string | null {
	const value = String(dateTime || '').trim();
	if (!value) return null;
	const parsed = Date.parse(value);
	if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
	const parsedUtc = Date.parse(`${value}Z`);
	if (!Number.isNaN(parsedUtc)) return new Date(parsedUtc).toISOString();
	return null;
}

function normalizeGoogleEventDateTime(eventDate: {dateTime?: string | null; date?: string | null} | null | undefined): string | null {
	if (!eventDate) return null;
	if (eventDate.dateTime) return normalizeProviderDateTime(eventDate.dateTime);
	if (eventDate.date) return normalizeProviderDateTime(`${eventDate.date}T00:00:00Z`);
	return null;
}

type GoogleCalendarApiEvent = {
	id?: string;
	iCalUID?: string;
	etag?: string | null;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	organizer?: {email?: string | null; displayName?: string | null};
	start?: {dateTime?: string | null; date?: string | null};
	end?: {dateTime?: string | null; date?: string | null};
};

export type GoogleCalendarMutationResult = {
	calendarId: string;
	uid: string;
	summary: string | null;
	description: string | null;
	location: string | null;
	startsAt: string | null;
	endsAt: string | null;
	etag: string | null;
	rawIcs: string | null;
};

async function requestGoogleJson<T = any>(
	accessToken: string,
	url: string,
	options: {method?: string; body?: unknown; headers?: Record<string, string>} = {},
): Promise<T> {
	const response = await fetch(url, {
		method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
			...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
			...(options.headers ?? {}),
		},
		...(options.body === undefined ? {} : {body: JSON.stringify(options.body)}),
	});
	const rawText = await response.text().catch(() => '');
	if (!response.ok) {
		throw new Error(`Google API request failed (${response.status}): ${rawText || response.statusText}`);
	}
	if (!rawText) return {} as T;
	return JSON.parse(rawText) as T;
}

function mapGoogleApiEventToMutationResult(
	event: GoogleCalendarApiEvent,
	calendarId: string,
	calendarSummary: string | null,
): GoogleCalendarMutationResult {
	const providerEventId = String(event.id || '').trim();
	const providerSeriesUid = String(event.iCalUID || '').trim();
	const uid = providerEventId || providerSeriesUid;
	if (!uid) throw new Error('Google Calendar response did not include an event id.');
	return {
		calendarId,
		uid,
		summary: String(event.summary || '').trim() || null,
		description: String(event.description || '').trim() || null,
		location: String(event.location || '').trim() || null,
		startsAt: normalizeGoogleEventDateTime(event.start),
		endsAt: normalizeGoogleEventDateTime(event.end),
		etag: String(event.etag || '').trim() || null,
		rawIcs: JSON.stringify({
			provider: 'google-api',
			calendarId,
			calendarSummary,
			providerEventId: providerEventId || null,
			providerSeriesUid: providerSeriesUid || null,
			organizerEmail: String(event.organizer?.email || '').trim() || null,
			organizerName: String(event.organizer?.displayName || '').trim() || null,
		}),
	};
}

function normalizeGoogleCalendarId(calendarId: string | null | undefined): string {
	const normalized = String(calendarId || '').trim();
	if (!normalized) return 'primary';
	if (normalized.toLowerCase() === 'primary') return 'primary';
	return normalized;
}

export class GoogleCalendarProvider implements ProviderCalendarRuntime {
	async sync(
		accessToken: string,
		calendarRange: CalendarRange | null,
	): Promise<{rows: CalendarSyncRow[]; legacySeriesUidsByCalendar: Record<string, string[]>}> {
		const rows: CalendarSyncRow[] = [];
		const calendars: Array<{id?: string; summary?: string}> = [];
		let calendarListUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250';
		while (calendarListUrl) {
			const calendarList = await requestGoogleJson<{
				items?: Array<{id?: string; summary?: string}>;
				nextPageToken?: string;
			}>(accessToken, calendarListUrl);
			calendars.push(...(calendarList.items ?? []));
			const nextPageToken = String(calendarList.nextPageToken || '').trim();
			if (!nextPageToken) {
				calendarListUrl = '';
				continue;
			}
			calendarListUrl =
				'https://www.googleapis.com/calendar/v3/users/me/calendarList?' +
				new URLSearchParams({
					maxResults: '250',
					pageToken: nextPageToken,
				}).toString();
		}

		const legacySeries = new Map<string, Set<string>>();
		for (const calendar of calendars) {
			const calendarId = String(calendar.id || '').trim();
			if (!calendarId) continue;
			let eventsUrl = '';
			const searchParams = new URLSearchParams({
				maxResults: '2500',
				singleEvents: 'true',
			});
			if (calendarRange) {
				searchParams.set('timeMin', calendarRange.startIso);
				searchParams.set('timeMax', calendarRange.endIso);
			}
			eventsUrl =
				`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
				`?${searchParams.toString()}`;
			while (eventsUrl) {
				const payload = await requestGoogleJson<{
					items?: Array<{
						id?: string;
						iCalUID?: string;
						etag?: string | null;
						summary?: string | null;
						description?: string | null;
						location?: string | null;
						organizer?: {email?: string | null; displayName?: string | null};
						start?: {dateTime?: string | null; date?: string | null};
						end?: {dateTime?: string | null; date?: string | null};
					}>;
					nextPageToken?: string;
				}>(accessToken, eventsUrl);
				for (const event of payload.items ?? []) {
					const providerEventId = String(event.id || '').trim();
					const providerSeriesUid = String(event.iCalUID || '').trim();
					const uid = providerEventId || providerSeriesUid;
					if (!uid) continue;
					if (providerEventId && providerSeriesUid && providerEventId !== providerSeriesUid) {
						const legacySet = legacySeries.get(calendarId) ?? new Set<string>();
						legacySet.add(providerSeriesUid);
						legacySeries.set(calendarId, legacySet);
					}
					rows.push({
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
							providerEventId: providerEventId || null,
							providerSeriesUid: providerSeriesUid || null,
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
		const legacySeriesUidsByCalendar: Record<string, string[]> = {};
		for (const [calendarId, legacySet] of legacySeries.entries()) {
			legacySeriesUidsByCalendar[calendarId] = [...legacySet];
		}
		return {rows, legacySeriesUidsByCalendar};
	}

	async create(
		accessToken: string,
		payload: {
			calendarId?: string | null;
			calendarSummary?: string | null;
			summary?: string | null;
			description?: string | null;
			location?: string | null;
			startsAt: string;
			endsAt: string;
		},
	): Promise<GoogleCalendarMutationResult> {
		const startsAt = normalizeProviderDateTime(payload.startsAt);
		const endsAt = normalizeProviderDateTime(payload.endsAt);
		if (!startsAt || !endsAt) throw new Error('Event start and end date/time are required.');
		if (Date.parse(endsAt) < Date.parse(startsAt)) throw new Error('Event end must be after start.');

		const calendarId = normalizeGoogleCalendarId(payload.calendarId);
		const response = await requestGoogleJson<GoogleCalendarApiEvent>(
			accessToken,
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
			{
				method: 'POST',
				body: {
					summary: String(payload.summary || '').trim() || undefined,
					description: String(payload.description || '').trim() || undefined,
					location: String(payload.location || '').trim() || undefined,
					start: {dateTime: startsAt},
					end: {dateTime: endsAt},
				},
			},
		);
		return mapGoogleApiEventToMutationResult(response, calendarId, String(payload.calendarSummary || '').trim() || null);
	}

	async update(
		accessToken: string,
		payload: {
			calendarId: string;
			calendarSummary?: string | null;
			eventId: string;
			summary?: string | null;
			description?: string | null;
			location?: string | null;
			startsAt: string;
			endsAt: string;
			etag?: string | null;
		},
	): Promise<GoogleCalendarMutationResult> {
		const startsAt = normalizeProviderDateTime(payload.startsAt);
		const endsAt = normalizeProviderDateTime(payload.endsAt);
		if (!startsAt || !endsAt) throw new Error('Event start and end date/time are required.');
		if (Date.parse(endsAt) < Date.parse(startsAt)) throw new Error('Event end must be after start.');

		const calendarId = normalizeGoogleCalendarId(payload.calendarId);
		const eventId = String(payload.eventId || '').trim();
		if (!eventId) throw new Error('Google event id is required.');
		const response = await requestGoogleJson<GoogleCalendarApiEvent>(
			accessToken,
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
			{
				method: 'PATCH',
				headers: String(payload.etag || '').trim() ? {'If-Match': String(payload.etag || '').trim()} : {},
				body: {
					summary: String(payload.summary || '').trim() || undefined,
					description: String(payload.description || '').trim() || undefined,
					location: String(payload.location || '').trim() || undefined,
					start: {dateTime: startsAt},
					end: {dateTime: endsAt},
				},
			},
		);
		return mapGoogleApiEventToMutationResult(response, calendarId, String(payload.calendarSummary || '').trim() || null);
	}

	async delete(
		accessToken: string,
		payload: {
			calendarId: string;
			eventId: string;
			etag?: string | null;
		},
	): Promise<void> {
		const calendarId = normalizeGoogleCalendarId(payload.calendarId);
		const eventId = String(payload.eventId || '').trim();
		if (!eventId) throw new Error('Google event id is required.');
		const url =
			`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}` +
			`/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
		const etag = String(payload.etag || '').trim();
		const runDelete = async (ifMatch: string | null) =>
			await fetch(url, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json',
					...(ifMatch ? {'If-Match': ifMatch} : {}),
				},
			});

		let response = await runDelete(etag || null);
		if (response.status === 412 && etag) {
			// ETag can be stale after background sync; retry optimistic delete without precondition once.
			response = await runDelete(null);
		}
		const detail = (await response.text().catch(() => '')).trim();
		if (!response.ok) throw new Error(`Google API request failed (${response.status}): ${detail || response.statusText}`);
	}
}
