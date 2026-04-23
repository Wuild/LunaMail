import type {ProviderContactsRuntime} from '@llamamail/app/providerRuntime';
import type {ContactSyncRow, OAuthContactPayload} from '../../types';

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

async function requestMicrosoftJson<T = any>(
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
		throw new Error(`Microsoft Graph request failed (${response.status}): ${rawText || response.statusText}`);
	}
	if (!rawText) return {} as T;
	return JSON.parse(rawText) as T;
}

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
	const hasMeta = emails.length > 1 || phones.length > 1;
	if (!hasMeta) return normalizedNote || null;
	const serializedMeta = `${CONTACT_META_PREFIX}\n${JSON.stringify({emails, phones})}`;
	if (!normalizedNote) return serializedMeta;
	return `${normalizedNote}\n\n${serializedMeta}`;
}

export class MicrosoftContactsProvider implements ProviderContactsRuntime {
	async sync(accessToken: string): Promise<{rows: ContactSyncRow[]; meta?: Record<string, number | string | boolean | null>}> {
		const rows: ContactSyncRow[] = [];
		let contactsUrl =
			'https://graph.microsoft.com/v1.0/me/contacts?$top=500&$select=id,displayName,emailAddresses,mobilePhone,businessPhones,companyName,jobTitle,personalNotes';
		while (contactsUrl) {
			const payload = await requestMicrosoftJson<{
				value?: Array<{
					id?: string;
					displayName?: string;
					emailAddresses?: Array<{address?: string}>;
					mobilePhone?: string | null;
					businessPhones?: string[] | null;
					companyName?: string | null;
					jobTitle?: string | null;
					personalNotes?: string | null;
				}>;
				'@odata.nextLink'?: string;
			}>(accessToken, contactsUrl);
			for (const person of payload.value ?? []) {
				const fullName = String(person.displayName || '').trim() || null;
				const emails = normalizeContactValues((person.emailAddresses ?? []).map((entry) => entry.address));
				if (!fullName || emails.length === 0) continue;
				const phones = normalizeContactValues([person.mobilePhone, ...(person.businessPhones ?? [])]);
				rows.push({
					sourceUid: String(person.id || '').trim() || emails[0],
					fullName,
					email: emails[0],
					phone: phones[0] || null,
					organization: String(person.companyName || '').trim() || null,
					title: String(person.jobTitle || '').trim() || null,
					note: composeSyncedContactNote(String(person.personalNotes || '').trim() || null, emails, phones),
				});
			}
			contactsUrl = String(payload['@odata.nextLink'] || '').trim();
		}
		return {rows};
	}

	async create(accessToken: string, payload: OAuthContactPayload): Promise<{sourceUid: string}> {
		const emails = normalizeContactValues([payload.email, ...(payload.emails ?? [])]);
		const phones = normalizeContactValues([payload.phone ?? '', ...(payload.phones ?? [])]);
		if (emails.length === 0) throw new Error('A valid email is required.');
		const fullName = String(payload.fullName || '').trim() || emails[0];
		const created = await requestMicrosoftJson<{id?: string}>(
			accessToken,
			'https://graph.microsoft.com/v1.0/me/contacts',
			{
				method: 'POST',
				body: {
					displayName: fullName,
					emailAddresses: emails.map((email) => ({address: email, name: fullName})),
					mobilePhone: phones[0] || null,
					businessPhones: phones.slice(1),
					companyName: String(payload.organization || '').trim() || null,
					jobTitle: String(payload.title || '').trim() || null,
					personalNotes: String(payload.note || '').trim() || null,
				},
			},
		);
		return {sourceUid: String(created?.id || '').trim()};
	}

	async update(accessToken: string, sourceUid: string, payload: OAuthContactPayload): Promise<void> {
		const normalizedId = String(sourceUid || '').trim();
		if (!normalizedId) throw new Error('Microsoft contact id is missing.');
		const emails = normalizeContactValues([payload.email, ...(payload.emails ?? [])]);
		const phones = normalizeContactValues([payload.phone ?? '', ...(payload.phones ?? [])]);
		if (emails.length === 0) throw new Error('A valid email is required.');
		const fullName = String(payload.fullName || '').trim() || emails[0];
		await requestMicrosoftJson(
			accessToken,
			`https://graph.microsoft.com/v1.0/me/contacts/${encodeURIComponent(normalizedId)}`,
			{
				method: 'PATCH',
				body: {
					displayName: fullName,
					emailAddresses: emails.map((email) => ({address: email, name: fullName})),
					mobilePhone: phones[0] || null,
					businessPhones: phones.slice(1),
					companyName: String(payload.organization || '').trim() || null,
					jobTitle: String(payload.title || '').trim() || null,
					personalNotes: String(payload.note || '').trim() || null,
				},
			},
		);
	}

	async delete(accessToken: string, sourceUid: string): Promise<void> {
		const normalizedId = String(sourceUid || '').trim();
		if (!normalizedId) return;
		const response = await fetch(`https://graph.microsoft.com/v1.0/me/contacts/${encodeURIComponent(normalizedId)}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/json',
			},
		});
		if (!response.ok) {
			const detail = (await response.text().catch(() => '')) || response.statusText || String(response.status);
			throw new Error(`Microsoft Graph request failed (${response.status}): ${detail}`);
		}
	}
}
