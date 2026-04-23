import type {OAuthProvider} from '@llamamail/app/ipcTypes';
import type {ProviderContactsRuntime} from '@llamamail/app/providerRuntime';
import {GoogleContactsProvider} from '@llamamail/providers/google/contacts';
import {MicrosoftContactsProvider} from '@llamamail/providers/microsoft/contacts';
import type {
	ContactMutationPayload,
	ContactRow,
	OauthContactsDependencies,
	OAuthProviderContactContext,
} from './runtimeContracts';
export type {ContactMutationPayload, OAuthProviderContactContext};

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

type ProviderContactAdapter = {
	source: string;
	runtime: ProviderContactsRuntime;
	create: (
		accessToken: string,
		payload: {
			fullName?: string | null;
			email: string;
			emails: string[];
			phone?: string | null;
			phones: string[];
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		},
	) => Promise<string>;
	update: (
		accessToken: string,
		sourceUid: string,
		payload: {
			fullName?: string | null;
			email: string;
			emails: string[];
			phone?: string | null;
			phones: string[];
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		},
	) => Promise<void>;
	remove: (accessToken: string, sourceUid: string) => Promise<void>;
};

const noopAsync = async () => {
	throw new Error('OAuth contacts runtime dependencies are not configured.');
};

let dependencies: OauthContactsDependencies = {
	getAccountSyncCredentials: noopAsync as OauthContactsDependencies['getAccountSyncCredentials'],
	refreshMailOAuthSessionWithOptions: noopAsync as OauthContactsDependencies['refreshMailOAuthSessionWithOptions'],
	getMicrosoftGraphOAuthScopes: () => [],
	listContacts: () => [],
	upsertContacts: () => ({upserted: 0, removed: 0}),
};

const googleContactsRuntime = new GoogleContactsProvider();
const microsoftContactsRuntime = new MicrosoftContactsProvider();

const PROVIDER_CONTACT_ADAPTERS: Record<OAuthProvider, ProviderContactAdapter> = {
	google: {
		source: 'google-api',
		runtime: googleContactsRuntime,
		create: async (accessToken, payload) => (await googleContactsRuntime.create(accessToken, payload)).sourceUid,
		update: async (accessToken, sourceUid, payload) =>
			await googleContactsRuntime.update(accessToken, sourceUid, payload),
		remove: async (accessToken, sourceUid) => await googleContactsRuntime.delete(accessToken, sourceUid),
	},
	microsoft: {
		source: 'microsoft-graph',
		runtime: microsoftContactsRuntime,
		create: async (accessToken, payload) => (await microsoftContactsRuntime.create(accessToken, payload)).sourceUid,
		update: async (accessToken, sourceUid, payload) =>
			await microsoftContactsRuntime.update(accessToken, sourceUid, payload),
		remove: async (accessToken, sourceUid) => await microsoftContactsRuntime.delete(accessToken, sourceUid),
	},
};

export function configureOauthContactsDependencies(nextDependencies: OauthContactsDependencies): void {
	dependencies = nextDependencies;
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}

function normalizeEmailList(values: Array<string | null | undefined>): string[] {
	return dedupe(
		values
			.map((value) =>
				String(value || '')
					.trim()
					.toLowerCase(),
			)
			.filter(Boolean),
	);
}

function normalizePhoneList(values: Array<string | null | undefined>): string[] {
	return dedupe(
		values
			.map((value) => String(value || '').trim())
			.filter(Boolean),
	);
}

function extractContactMeta(note: string | null | undefined): {
	noteText: string;
	emails: string[];
	phones: string[];
} {
	const raw = String(note || '');
	const markerIndex = raw.lastIndexOf(CONTACT_META_PREFIX);
	if (markerIndex < 0) return {noteText: raw.trim(), emails: [], phones: []};
	const noteText = raw.slice(0, markerIndex).trimEnd();
	const metaRaw = raw.slice(markerIndex + CONTACT_META_PREFIX.length).trim();
	if (!metaRaw) return {noteText: noteText.trim(), emails: [], phones: []};
	try {
		const parsed = JSON.parse(metaRaw) as {emails?: string[]; phones?: string[]};
		return {
			noteText: noteText.trim(),
			emails: normalizeEmailList(Array.isArray(parsed.emails) ? parsed.emails : []),
			phones: normalizePhoneList(Array.isArray(parsed.phones) ? parsed.phones : []),
		};
	} catch {
		return {noteText: raw.trim(), emails: [], phones: []};
	}
}

function composeSyncedContactNote(note: string | null, emails: string[], phones: string[]): string | null {
	const normalizedNote = String(note || '').trim();
	const normalizedEmails = normalizeEmailList(emails);
	const normalizedPhones = normalizePhoneList(phones);
	const hasMeta = normalizedEmails.length > 1 || normalizedPhones.length > 1;
	if (!hasMeta) return normalizedNote || null;
	const payload = JSON.stringify({emails: normalizedEmails, phones: normalizedPhones});
	if (!normalizedNote) return `${CONTACT_META_PREFIX}\n${payload}`;
	return `${normalizedNote}\n\n${CONTACT_META_PREFIX}\n${payload}`;
}

function extractChannels(primaryEmail: string, primaryPhone: string | null, note: string | null | undefined) {
	const parsed = extractContactMeta(note);
	const emails = normalizeEmailList([primaryEmail, ...parsed.emails]);
	const phones = normalizePhoneList([primaryPhone || '', ...parsed.phones]);
	return {
		noteText: parsed.noteText || null,
		emails,
		phones,
	};
}

function getContactAdapterForProvider(provider: OAuthProvider): ProviderContactAdapter {
	const adapter = PROVIDER_CONTACT_ADAPTERS[provider];
	if (!adapter) {
		throw new Error(`OAuth contacts adapter not found for provider: ${provider}`);
	}
	return adapter;
}

function providerFromContactSource(source: string): OAuthProvider | null {
	if (source === 'google-api') return 'google';
	if (source === 'microsoft-graph') return 'microsoft';
	return null;
}

export function isOauthProviderContactSource(source: string): boolean {
	return providerFromContactSource(source) !== null;
}

function hasGoogleContactsWriteScope(scope: string | null | undefined): boolean {
	const normalized = String(scope || '').trim();
	if (!normalized) return true;
	const granted = new Set(
		normalized
			.split(/\s+/)
			.map((value) => value.trim())
			.filter(Boolean),
	);
	return granted.has('https://www.googleapis.com/auth/contacts');
}

function isGoogleContactsScopeError(error: unknown): boolean {
	const message = String((error as any)?.message || error || '').toLowerCase();
	return message.includes('access_token_scope_insufficient') || message.includes('insufficient authentication scopes');
}

function toGoogleContactsScopeError(): Error {
	return new Error('Google contacts permission missing. Reconnect this account and grant Contacts access.');
}

export async function resolveOauthContactContext(
	accountId: number,
	expectedProvider?: OAuthProvider,
): Promise<OAuthProviderContactContext | null> {
	const credentials = await dependencies.getAccountSyncCredentials(accountId);
	if (credentials.auth_method !== 'oauth2' || !credentials.oauth_provider || !credentials.oauth_session) {
		return null;
	}
	if (expectedProvider && credentials.oauth_provider !== expectedProvider) {
		throw new Error(`OAuth provider mismatch. Expected ${expectedProvider}, got ${credentials.oauth_provider}.`);
	}
	let accessToken = String(credentials.oauth_session.accessToken || '').trim();
	if (!accessToken) {
		throw new Error('OAuth access token missing. Reconnect this account.');
	}
	if (credentials.oauth_provider === 'google' && !hasGoogleContactsWriteScope(credentials.oauth_session.scope)) {
		throw toGoogleContactsScopeError();
	}
	if (credentials.oauth_provider === 'microsoft' && credentials.oauth_session.refreshToken) {
		const refreshed = await dependencies.refreshMailOAuthSessionWithOptions(credentials.oauth_session, {
			additionalScopes: dependencies.getMicrosoftGraphOAuthScopes(),
			replaceExistingScopes: true,
		});
		accessToken = String(refreshed.accessToken || '').trim();
		if (!accessToken) {
			throw new Error('Microsoft Graph access token missing after refresh. Reconnect this account.');
		}
	}
	return {
		provider: credentials.oauth_provider,
		accessToken,
	};
}

export async function createOauthContact(
	accountId: number,
	payload: {
		fullName?: string | null;
		email: string;
		phone?: string | null;
		organization?: string | null;
		title?: string | null;
		note?: string | null;
	},
	context: OAuthProviderContactContext,
): Promise<ContactRow> {
	const adapter = getContactAdapterForProvider(context.provider);
	const channels = extractChannels(payload.email, payload.phone ?? null, payload.note ?? null);
	if (channels.emails.length === 0) throw new Error('A valid email is required.');
	const fullName = String(payload.fullName || '').trim() || channels.emails[0];
	let sourceUid = '';
	try {
		sourceUid = await adapter.create(context.accessToken, {
			fullName,
			email: channels.emails[0],
			emails: channels.emails,
			phone: channels.phones[0] || null,
			phones: channels.phones,
			organization: String(payload.organization || '').trim() || null,
			title: String(payload.title || '').trim() || null,
			note: extractContactMeta(payload.note).noteText || null,
		});
	} catch (error) {
		if (context.provider === 'google' && isGoogleContactsScopeError(error)) {
			throw toGoogleContactsScopeError();
		}
		throw error;
	}
	dependencies.upsertContacts(
		accountId,
		[
			{
				sourceUid,
				fullName,
				email: channels.emails[0],
				phone: channels.phones[0] || null,
				organization: String(payload.organization || '').trim() || null,
				title: String(payload.title || '').trim() || null,
				note: composeSyncedContactNote(
					extractContactMeta(payload.note).noteText || null,
					channels.emails,
					channels.phones,
				),
			},
		],
		adapter.source,
	);
	const row = dependencies
		.listContacts(accountId, null, 5000)
		.find((item) => item.source === adapter.source && item.source_uid === sourceUid && item.email === channels.emails[0]);
	if (!row) throw new Error('Provider contact was created remotely but could not be cached locally.');
	return row;
}

export async function updateOauthContactForAccount(current: ContactRow, payload: ContactMutationPayload): Promise<void> {
	const sourceProvider = providerFromContactSource(current.source);
	if (!sourceProvider) {
		throw new Error(`Unsupported OAuth contact source: ${current.source}`);
	}
	const context = await resolveOauthContactContext(current.account_id, sourceProvider);
	if (!context) throw new Error('OAuth session missing for provider contact update. Reconnect this account.');
	const adapter = getContactAdapterForProvider(context.provider);

	const nextFullName = payload.fullName === undefined ? current.full_name : payload.fullName;
	const nextEmail = payload.email === undefined ? current.email : payload.email;
	const nextPhone = payload.phone === undefined ? current.phone : payload.phone;
	const nextOrganization = payload.organization === undefined ? current.organization : payload.organization;
	const nextTitle = payload.title === undefined ? current.title : payload.title;
	const nextNote = payload.note === undefined ? current.note : payload.note;
	const channels = extractChannels(nextEmail || '', nextPhone ?? null, nextNote ?? null);
	if (channels.emails.length === 0) throw new Error('A valid email is required.');
	try {
		await adapter.update(context.accessToken, String(current.source_uid || '').trim(), {
			fullName: String(nextFullName || '').trim() || channels.emails[0],
			email: channels.emails[0],
			emails: channels.emails,
			phone: channels.phones[0] || null,
			phones: channels.phones,
			organization: String(nextOrganization || '').trim() || null,
			title: String(nextTitle || '').trim() || null,
			note: extractContactMeta(nextNote).noteText || null,
		});
	} catch (error) {
		if (context.provider === 'google' && isGoogleContactsScopeError(error)) {
			throw toGoogleContactsScopeError();
		}
		throw error;
	}
}

export async function deleteOauthContactForAccount(current: ContactRow): Promise<void> {
	const sourceProvider = providerFromContactSource(current.source);
	if (!sourceProvider) {
		throw new Error(`Unsupported OAuth contact source: ${current.source}`);
	}
	const context = await resolveOauthContactContext(current.account_id, sourceProvider);
	if (!context) throw new Error('OAuth session missing for provider contact delete. Reconnect this account.');
	const adapter = getContactAdapterForProvider(context.provider);
	try {
		await adapter.remove(context.accessToken, String(current.source_uid || '').trim());
	} catch (error) {
		if (context.provider === 'google' && isGoogleContactsScopeError(error)) {
			throw toGoogleContactsScopeError();
		}
		throw error;
	}
}
