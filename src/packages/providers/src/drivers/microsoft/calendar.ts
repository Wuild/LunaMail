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

async function requestMicrosoftJson<T = any>(accessToken: string, url: string): Promise<T> {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
		},
	});
	const rawText = await response.text().catch(() => '');
	if (!response.ok) {
		throw new Error(`Microsoft Graph request failed (${response.status}): ${rawText || response.statusText}`);
	}
	if (!rawText) return {} as T;
	return JSON.parse(rawText) as T;
}

export class MicrosoftCalendarProvider implements ProviderCalendarRuntime {
	async sync(
		accessToken: string,
		calendarRange: CalendarRange | null,
	): Promise<{rows: CalendarSyncRow[]; legacySeriesUidsByCalendar: Record<string, string[]>}> {
		const rows: CalendarSyncRow[] = [];
		const calendars: Array<{id?: string; name?: string}> = [];
		let calendarsUrl = 'https://graph.microsoft.com/v1.0/me/calendars?$top=100&$select=id,name';
		while (calendarsUrl) {
			const payload = await requestMicrosoftJson<{
				value?: Array<{id?: string; name?: string}>;
				'@odata.nextLink'?: string;
			}>(accessToken, calendarsUrl);
			calendars.push(...(payload.value ?? []));
			calendarsUrl = String(payload['@odata.nextLink'] || '').trim();
		}

		const legacySeries = new Map<string, Set<string>>();
		for (const calendar of calendars) {
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
				const payload = await requestMicrosoftJson<{
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
				}>(accessToken, eventsUrl);
				for (const event of payload.value ?? []) {
					const providerEventId = String(event.id || '').trim();
					const providerSeriesUid = String(event.iCalUId || '').trim();
					const uid = providerEventId || providerSeriesUid;
					if (!uid) continue;
					if (providerEventId && providerSeriesUid && providerEventId !== providerSeriesUid) {
						const legacySet = legacySeries.get(calendarId) ?? new Set<string>();
						legacySet.add(providerSeriesUid);
						legacySeries.set(calendarId, legacySet);
					}
					rows.push({
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

		const legacySeriesUidsByCalendar: Record<string, string[]> = {};
		for (const [calendarId, legacySet] of legacySeries.entries()) {
			legacySeriesUidsByCalendar[calendarId] = [...legacySet];
		}
		return {rows, legacySeriesUidsByCalendar};
	}
}
