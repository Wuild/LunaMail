import type {ProviderContactsRuntime} from '@llamamail/app/providerRuntime';
import type {ContactSyncRow, OAuthContactPayload} from '../../types';

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

function normalizeContactValues(values: Array<string | null | undefined>): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of values) {
		const value = String(raw || '').trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}

function composeSyncedContactNote(noteText: string | null, emails: string[], phones: string[]): string | null {
	const normalizedNote = String(noteText || '').trim();
	const meta = {emails, phones};
	const hasMeta = emails.length > 1 || phones.length > 1;
	if (!hasMeta) return normalizedNote || null;
	const serializedMeta = `${CONTACT_META_PREFIX}\n${JSON.stringify(meta)}`;
	if (!normalizedNote) return serializedMeta;
	return `${normalizedNote}\n\n${serializedMeta}`;
}

async function requestGoogleJson<T = any>(
	accessToken: string,
	url: string,
	options: {method?: string; body?: unknown} = {},
): Promise<T> {
	const response = await fetch(url, {
		method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
			...(options.body === undefined ? {} : {'Content-Type': 'application/json'}),
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

function toGoogleResourceName(resourceNameOrId: string): string {
	const normalized = String(resourceNameOrId || '').trim();
	if (!normalized) return '';
	return normalized.includes('/') ? normalized : `people/${normalized}`;
}

export class GoogleContactsProvider implements ProviderContactsRuntime {
	async sync(accessToken: string): Promise<{rows: ContactSyncRow[]; meta?: Record<string, number | string | boolean | null>}> {
		const rows: ContactSyncRow[] = [];
		let connectionsCount = 0;
		let peopleUrl =
			'https://people.googleapis.com/v1/people/me/connections?' +
			new URLSearchParams({
				personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
				pageSize: '1000',
				sources: 'READ_SOURCE_TYPE_CONTACT',
			}).toString();
		while (peopleUrl) {
			const payload = await requestGoogleJson<{
				connections?: Array<{
					resourceName?: string;
					names?: Array<{displayName?: string}>;
					emailAddresses?: Array<{value?: string}>;
					phoneNumbers?: Array<{value?: string}>;
					organizations?: Array<{name?: string; title?: string}>;
					biographies?: Array<{value?: string}>;
				}>;
				nextPageToken?: string;
			}>(accessToken, peopleUrl);
			for (const person of payload.connections ?? []) {
				connectionsCount += 1;
				const fullName = String(person.names?.[0]?.displayName || '').trim() || null;
				const emails = normalizeContactValues((person.emailAddresses ?? []).map((entry) => entry.value));
				if (!fullName || emails.length === 0) continue;
				const phones = normalizeContactValues((person.phoneNumbers ?? []).map((entry) => entry.value));
				rows.push({
					sourceUid: String(person.resourceName || '').trim() || emails[0],
					fullName,
					email: emails[0],
					phone: phones[0] || null,
					organization: String(person.organizations?.[0]?.name || '').trim() || null,
					title: String(person.organizations?.[0]?.title || '').trim() || null,
					note: composeSyncedContactNote(String(person.biographies?.[0]?.value || '').trim() || null, emails, phones),
				});
			}
			const nextPageToken = String(payload.nextPageToken || '').trim();
			peopleUrl = nextPageToken
				? 'https://people.googleapis.com/v1/people/me/connections?' +
					new URLSearchParams({
						personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
						pageSize: '1000',
						sources: 'READ_SOURCE_TYPE_CONTACT',
						pageToken: nextPageToken,
					}).toString()
				: '';
		}
		return {rows, meta: {connectionsCount, otherContactsCount: 0}};
	}

	async create(accessToken: string, payload: OAuthContactPayload): Promise<{sourceUid: string}> {
		const emails = normalizeContactValues([payload.email, ...(payload.emails ?? [])]);
		const phones = normalizeContactValues([payload.phone ?? '', ...(payload.phones ?? [])]);
		if (emails.length === 0) throw new Error('A valid email is required.');
		const fullName = String(payload.fullName || '').trim() || emails[0];
		const response = await requestGoogleJson<{resourceName?: string}>(accessToken, 'https://people.googleapis.com/v1/people:createContact', {
			method: 'POST',
			body: {
				names: [{displayName: fullName}],
				emailAddresses: emails.map((email) => ({value: email})),
				phoneNumbers: phones.map((phone) => ({value: phone})),
				organizations:
					payload.organization || payload.title
						? [{name: String(payload.organization || '').trim() || undefined, title: String(payload.title || '').trim() || undefined}]
						: undefined,
				biographies: payload.note ? [{value: String(payload.note).trim()}] : undefined,
			},
		});
		return {sourceUid: String(response?.resourceName || '').trim()};
	}

	async update(accessToken: string, sourceUid: string, payload: OAuthContactPayload): Promise<void> {
		const resourceName = toGoogleResourceName(sourceUid);
		if (!resourceName) throw new Error('Google contact id is missing.');
		const emails = normalizeContactValues([payload.email, ...(payload.emails ?? [])]);
		const phones = normalizeContactValues([payload.phone ?? '', ...(payload.phones ?? [])]);
		if (emails.length === 0) throw new Error('A valid email is required.');
		const fullName = String(payload.fullName || '').trim() || emails[0];
		const existing = await requestGoogleJson<{
			etag?: string;
			metadata?: {sources?: Array<{etag?: string}>};
		}>(accessToken, `https://people.googleapis.com/v1/${resourceName}?personFields=metadata`);
		const sourceWithEtag =
			Array.isArray(existing?.metadata?.sources)
				? existing.metadata.sources.find((source) => String(source?.etag || '').trim())
				: null;
		const etag = String(sourceWithEtag?.etag || existing?.etag || '').trim();
		if (!etag) throw new Error('Google contact etag is missing.');
		await requestGoogleJson(
			accessToken,
			`https://people.googleapis.com/v1/${resourceName}:updateContact?${new URLSearchParams({
				updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
			}).toString()}`,
			{
				method: 'PATCH',
				body: {
					resourceName,
					etag,
					metadata: sourceWithEtag ? {sources: [sourceWithEtag]} : undefined,
					names: [{displayName: fullName}],
					emailAddresses: emails.map((email) => ({value: email})),
					phoneNumbers: phones.map((phone) => ({value: phone})),
					organizations:
						payload.organization || payload.title
							? [{name: String(payload.organization || '').trim() || undefined, title: String(payload.title || '').trim() || undefined}]
							: [],
					biographies: payload.note ? [{value: String(payload.note).trim()}] : [],
				},
			},
		);
	}

	async delete(accessToken: string, sourceUid: string): Promise<void> {
		const resourceName = toGoogleResourceName(sourceUid);
		if (!resourceName) return;
		const response = await fetch(`https://people.googleapis.com/v1/${resourceName}:deleteContact`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/json',
			},
		});
		if (!response.ok) {
			const detail = (await response.text().catch(() => '')) || response.statusText || String(response.status);
			throw new Error(`Google API request failed (${response.status}): ${detail}`);
		}
	}
}
