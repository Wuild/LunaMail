import keytar from 'keytar';
import fs from 'node:fs/promises';
import path from 'node:path';
import {eq} from 'drizzle-orm';
import {getDb, getDrizzle, getSqlitePath} from '@main/db/drizzle.js';
import {accounts, type InsertAccount} from '@main/db/schema.js';
import {APP_NAME} from '@/shared/appConfig.js';
import {
	hasAnyEnabledAccountModule,
	normalizeAccountModuleSelection,
	type AccountModuleSelection,
} from '@/shared/accountModules.js';
import type {AuthMethod, OAuthProvider, OAuthSession} from '@/shared/ipcTypes.js';
import {ensureFreshMailOAuthSession, getDefaultMailOAuthAdditionalScopes} from '@main/mail/oauth.js';

// This repository still contains parameterized raw SQL for a few multi-step cleanup paths while Drizzle migration is
// completed incrementally. Keep new data access Drizzle-first unless there is a documented exception.
const SERVICE_NAME = APP_NAME;
const VCARD_DIR_NAME = 'vcards';

export interface PublicAccount {
	id: number;
	email: string;
	provider: string | null;
	auth_method: AuthMethod;
	oauth_provider: OAuthProvider | null;
	display_name: string | null;
	reply_to: string | null;
	organization: string | null;
	signature_text: string | null;
	signature_is_html: number;
	signature_file_path: string | null;
	attach_vcard: number;
	imap_host: string;
	imap_port: number;
	imap_secure: number;
	pop3_host: string | null;
	pop3_port: number | null;
	pop3_secure: number | null;
	smtp_host: string;
	smtp_port: number;
	smtp_secure: number;
	sync_emails: number;
	sync_contacts: number;
	sync_calendar: number;
	created_at: string;
	user: string;
}

export async function getAccounts(): Promise<PublicAccount[]> {
	const db = getDrizzle();
	const rows = await db.select().from(accounts).orderBy(accounts.createdAt).execute();
	// Map camel case properties to snake_case where needed for renderer shape
	return rows.map(
		(r): PublicAccount => ({
			id: r.id!,
			email: r.email!,
			provider: r.provider ?? null,
			auth_method: normalizeAuthMethod(r.authMethod ?? 'password'),
			oauth_provider: normalizeOAuthProvider(r.oauthProvider ?? null),
			display_name: r.displayName ?? null,
			reply_to: r.replyTo ?? null,
			organization: r.organization ?? null,
			signature_text: r.signatureText ?? null,
			signature_is_html: r.signatureIsHtml ?? 0,
			signature_file_path: r.signatureFilePath ?? null,
			attach_vcard: r.attachVcard ?? 0,
			imap_host: r.imapHost!,
			imap_port: r.imapPort!,
			imap_secure: r.imapSecure ?? 1,
			pop3_host: r.pop3Host ?? null,
			pop3_port: (r.pop3Port as number | null) ?? null,
			pop3_secure: (r.pop3Secure as number | null) ?? null,
			smtp_host: r.smtpHost!,
			smtp_port: r.smtpPort!,
			smtp_secure: r.smtpSecure ?? 1,
			sync_emails: r.syncEmails ?? 1,
			sync_contacts: r.syncContacts ?? 1,
			sync_calendar: r.syncCalendar ?? 1,
			user: r.user!,
			created_at: r.createdAt!,
		}),
	);
}

export interface AddAccountPayload {
	email: string;
	provider?: string | null;
	auth_method?: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	display_name?: string | null;
	reply_to?: string | null;
	organization?: string | null;
	signature_text?: string | null;
	signature_is_html?: number;
	signature_file_path?: string | null;
	attach_vcard?: number;
	imap_host: string;
	imap_port: number;
	imap_secure?: number; // 1=SSL/TLS, 0=STARTTLS
	pop3_host?: string | null;
	pop3_port?: number | null;
	pop3_secure?: number | null; // 1=SSL/TLS, 0=STARTTLS
	smtp_host: string;
	smtp_port: number;
	smtp_secure?: number; // 1=SSL/TLS, 0=STARTTLS
	sync_emails?: number;
	sync_contacts?: number;
	sync_calendar?: number;
	user: string;
	password?: string;
	oauth_session?: OAuthSession | null;
}

export interface UpdateAccountPayload {
	email: string;
	provider?: string | null;
	auth_method?: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	display_name?: string | null;
	reply_to?: string | null;
	organization?: string | null;
	signature_text?: string | null;
	signature_is_html?: number;
	signature_file_path?: string | null;
	attach_vcard?: number;
	imap_host: string;
	imap_port: number;
	imap_secure?: number;
	pop3_host?: string | null;
	pop3_port?: number | null;
	pop3_secure?: number | null;
	smtp_host: string;
	smtp_port: number;
	smtp_secure?: number;
	sync_emails?: number;
	sync_contacts?: number;
	sync_calendar?: number;
	user: string;
	password?: string | null;
	oauth_session?: OAuthSession | null;
}

export async function addAccount(payload: AddAccountPayload): Promise<{id: number; email: string}> {
	const db = getDrizzle();
	const {
		email,
		provider = null,
		display_name = null,
		reply_to = null,
		organization = null,
		signature_text = null,
		signature_is_html = 0,
		signature_file_path = null,
		attach_vcard = 0,
		imap_host,
		imap_port,
		imap_secure = 1,
		pop3_host = null,
		pop3_port = null,
		pop3_secure = 1,
		smtp_host,
		smtp_port,
		smtp_secure = 1,
		sync_emails = 1,
		sync_contacts = 1,
		sync_calendar = 1,
		user,
		password = '',
		auth_method = payload.oauth_session ? 'oauth2' : 'password',
		oauth_provider = payload.oauth_session?.provider ?? null,
		oauth_session = null,
	} = payload;
	const normalizedAuthMethod = normalizeAuthMethod(auth_method);
	const normalizedOAuthProvider = normalizeOAuthProvider(oauth_provider);

	if (!email || !user || (normalizedAuthMethod !== 'oauth2' && !String(password || '').trim())) {
		throw new Error('Missing required account fields');
	}
	if (normalizedAuthMethod === 'oauth2' && !oauth_session?.accessToken?.trim()) {
		throw new Error('OAuth session is required for OAuth accounts.');
	}
	const moduleSelection = normalizeAccountModuleSelection({
		sync_emails,
		sync_contacts,
		sync_calendar,
	});
	if (!hasAnyEnabledAccountModule(moduleSelection)) {
		throw new Error('Select at least one sync module (email, contacts, or calendar).');
	}
	if (moduleSelection.sync_emails > 0 && (!imap_host || !imap_port || !smtp_host || !smtp_port)) {
		throw new Error('Missing required email server fields');
	}

	const toInsert: InsertAccount = {
		email,
		provider: provider ?? undefined,
		authMethod: normalizedAuthMethod,
		oauthProvider: normalizedOAuthProvider ?? undefined,
		displayName: display_name ?? undefined,
		replyTo: reply_to ?? undefined,
		organization: organization ?? undefined,
		signatureText: signature_text ?? undefined,
		signatureIsHtml: signature_is_html ?? 0,
		signatureFilePath: signature_file_path ?? undefined,
		attachVcard: attach_vcard ?? 0,
		imapHost: imap_host,
		imapPort: imap_port,
		imapSecure: imap_secure,
		pop3Host: pop3_host ?? undefined,
		pop3Port: (pop3_port as number | undefined) ?? undefined,
		pop3Secure: (pop3_secure as number | undefined) ?? undefined,
		smtpHost: smtp_host,
		smtpPort: smtp_port,
		smtpSecure: smtp_secure,
		syncEmails: moduleSelection.sync_emails,
		syncContacts: moduleSelection.sync_contacts,
		syncCalendar: moduleSelection.sync_calendar,
		user,
	} as InsertAccount;

	const result = await db.insert(accounts).values(toInsert).returning({id: accounts.id}).get();
	const accountId = result?.id as number;

	if (normalizedAuthMethod !== 'oauth2') {
		await keytar.setPassword(SERVICE_NAME, getAccountPasswordKey(accountId, email), String(password || '').trim());
	}
	if (normalizedAuthMethod === 'oauth2' && oauth_session) {
		await setAccountOAuthSession(accountId, email, oauth_session);
		await keytar.deletePassword(SERVICE_NAME, getAccountPasswordKey(accountId, email));
	} else {
		await keytar.deletePassword(SERVICE_NAME, getAccountOAuthKey(accountId, email));
	}
	await ensureLocalAccountVCard(
		accountId,
		{
			email,
			display_name,
			organization,
			reply_to,
		},
		null,
	);

	return {id: Number(accountId), email};
}

export interface AccountSyncCredentials {
	id: number;
	email: string;
	auth_method: AuthMethod;
	oauth_provider: OAuthProvider | null;
	imap_host: string;
	imap_port: number;
	imap_secure: number;
	user: string;
	password: string | null;
	oauth_session: OAuthSession | null;
}

export interface AccountSendCredentials {
	id: number;
	email: string;
	display_name: string | null;
	organization: string | null;
	reply_to: string | null;
	attach_vcard: number;
	signature_text: string | null;
	signature_is_html: number;
	smtp_host: string;
	smtp_port: number;
	smtp_secure: number;
	user: string;
	auth_method: AuthMethod;
	oauth_provider: OAuthProvider | null;
	password: string | null;
	oauth_session: OAuthSession | null;
}

export async function getAccountSyncCredentials(accountId: number): Promise<AccountSyncCredentials> {
	const db = getDrizzle();
	const row = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
	if (!row?.id) throw new Error(`Account ${accountId} not found`);

	const authMethod = normalizeAuthMethod(row.authMethod ?? 'password');
	const oauthProvider = normalizeOAuthProvider(row.oauthProvider ?? null);
	const password = await keytar.getPassword(SERVICE_NAME, getAccountPasswordKey(row.id, row.email));
	let oauthSession = authMethod === 'oauth2' ? await getAccountOAuthSession(row.id, row.email) : null;
	if (oauthSession) {
		const refreshed = await ensureFreshMailOAuthSession(oauthSession, {
			additionalScopes: oauthProvider ? getDefaultMailOAuthAdditionalScopes(oauthProvider) : [],
		});
		if (hasOAuthSessionChanged(oauthSession, refreshed)) {
			await setAccountOAuthSession(row.id, row.email, refreshed);
		}
		oauthSession = refreshed;
		if (
			oauthProvider === 'microsoft' &&
			!looksLikeJwtToken(oauthSession.accessToken) &&
			String(oauthSession.refreshToken || '').trim()
		) {
			const forcedRefresh = await ensureFreshMailOAuthSession(oauthSession, {
				forceRefresh: true,
				additionalScopes: getDefaultMailOAuthAdditionalScopes('microsoft'),
			});
			if (hasOAuthSessionChanged(oauthSession, forcedRefresh)) {
				await setAccountOAuthSession(row.id, row.email, forcedRefresh);
			}
			oauthSession = forcedRefresh;
		}
	}
	if (authMethod !== 'oauth2' && !password) throw new Error('Account password not found in keychain');
	if (authMethod === 'oauth2' && !oauthSession?.accessToken?.trim()) {
		throw new Error('OAuth access token not found in keychain.');
	}

	return {
		id: row.id,
		email: row.email,
		auth_method: authMethod,
		oauth_provider: oauthProvider,
		imap_host: row.imapHost,
		imap_port: row.imapPort,
		imap_secure: row.imapSecure ?? 1,
		user: row.user,
		password: password ?? null,
		oauth_session: oauthSession,
	};
}

export async function getAccountSendCredentials(accountId: number): Promise<AccountSendCredentials> {
	const db = getDrizzle();
	const row = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
	if (!row?.id) throw new Error(`Account ${accountId} not found`);

	const authMethod = normalizeAuthMethod(row.authMethod ?? 'password');
	const oauthProvider = normalizeOAuthProvider(row.oauthProvider ?? null);
	const password = await keytar.getPassword(SERVICE_NAME, getAccountPasswordKey(row.id, row.email));
	let oauthSession = authMethod === 'oauth2' ? await getAccountOAuthSession(row.id, row.email) : null;
	if (oauthSession) {
		const refreshed = await ensureFreshMailOAuthSession(oauthSession, {
			additionalScopes: oauthProvider ? getDefaultMailOAuthAdditionalScopes(oauthProvider) : [],
		});
		if (hasOAuthSessionChanged(oauthSession, refreshed)) {
			await setAccountOAuthSession(row.id, row.email, refreshed);
		}
		oauthSession = refreshed;
		if (
			oauthProvider === 'microsoft' &&
			!looksLikeJwtToken(oauthSession.accessToken) &&
			String(oauthSession.refreshToken || '').trim()
		) {
			const forcedRefresh = await ensureFreshMailOAuthSession(oauthSession, {
				forceRefresh: true,
				additionalScopes: getDefaultMailOAuthAdditionalScopes('microsoft'),
			});
			if (hasOAuthSessionChanged(oauthSession, forcedRefresh)) {
				await setAccountOAuthSession(row.id, row.email, forcedRefresh);
			}
			oauthSession = forcedRefresh;
		}
	}
	if (authMethod !== 'oauth2' && !password) throw new Error('Account password not found in keychain');
	if (authMethod === 'oauth2' && !oauthSession?.accessToken?.trim()) {
		throw new Error('OAuth access token not found in keychain.');
	}

	return {
		id: row.id,
		email: row.email,
		auth_method: authMethod,
		oauth_provider: oauthProvider,
		display_name: row.displayName ?? null,
		organization: row.organization ?? null,
		reply_to: row.replyTo ?? null,
		attach_vcard: row.attachVcard ?? 0,
		signature_text: row.signatureText ?? null,
		signature_is_html: row.signatureIsHtml ?? 0,
		smtp_host: row.smtpHost,
		smtp_port: row.smtpPort,
		smtp_secure: row.smtpSecure ?? 1,
		user: row.user,
		password: password ?? null,
		oauth_session: oauthSession,
	};
}

export async function updateAccount(accountId: number, payload: UpdateAccountPayload): Promise<PublicAccount> {
	const db = getDrizzle();
	const rawDb = getDb();
	const existing = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
	if (!existing?.id) throw new Error(`Account ${accountId} not found`);

	const email = payload.email?.trim();
	const imapHost = payload.imap_host?.trim();
	const smtpHost = payload.smtp_host?.trim();
	const user = payload.user?.trim();
	const authMethod = normalizeAuthMethod(payload.auth_method ?? existing.authMethod ?? 'password');
	const oauthProvider = normalizeOAuthProvider(payload.oauth_provider ?? existing.oauthProvider ?? null);
	if (!email || !user) {
		throw new Error('Missing required account fields');
	}
	const moduleFallback: AccountModuleSelection = {
		sync_emails: existing.syncEmails ?? 1,
		sync_contacts: existing.syncContacts ?? 1,
		sync_calendar: existing.syncCalendar ?? 1,
	};
	const moduleSelection = normalizeAccountModuleSelection(
		{
			sync_emails: payload.sync_emails,
			sync_contacts: payload.sync_contacts,
			sync_calendar: payload.sync_calendar,
		},
		moduleFallback,
	);
	if (!hasAnyEnabledAccountModule(moduleSelection)) {
		throw new Error('Select at least one sync module (email, contacts, or calendar).');
	}
	if (moduleSelection.sync_emails > 0 && (!imapHost || !payload.imap_port || !smtpHost || !payload.smtp_port)) {
		throw new Error('Missing required email server fields');
	}
	const emailModuleWasEnabled = Number(existing.syncEmails ?? 1) > 0;
	const contactsModuleWasEnabled = Number(existing.syncContacts ?? 1) > 0;
	const calendarModuleWasEnabled = Number(existing.syncCalendar ?? 1) > 0;
	const emailModuleEnabled = moduleSelection.sync_emails > 0;
	const contactsModuleEnabled = moduleSelection.sync_contacts > 0;
	const calendarModuleEnabled = moduleSelection.sync_calendar > 0;

	await db
		.update(accounts)
		.set({
			email,
			provider: payload.provider?.trim() || null,
			authMethod,
			oauthProvider,
			displayName: payload.display_name?.trim() || null,
			replyTo: payload.reply_to?.trim() || null,
			organization: payload.organization?.trim() || null,
			signatureText: payload.signature_text ?? null,
			signatureIsHtml: payload.signature_is_html ? 1 : 0,
			signatureFilePath: payload.signature_file_path?.trim() || null,
			attachVcard: payload.attach_vcard ? 1 : 0,
			imapHost,
			imapPort: payload.imap_port,
			imapSecure: payload.imap_secure ?? 1,
			pop3Host: payload.pop3_host?.trim() || null,
			pop3Port: payload.pop3_port ?? null,
			pop3Secure: payload.pop3_secure ?? null,
			smtpHost,
			smtpPort: payload.smtp_port,
			smtpSecure: payload.smtp_secure ?? 1,
			syncEmails: moduleSelection.sync_emails,
			syncContacts: moduleSelection.sync_contacts,
			syncCalendar: moduleSelection.sync_calendar,
			user,
		})
		.where(eq(accounts.id, accountId))
		.run();
	if (emailModuleWasEnabled && !emailModuleEnabled) {
		clearAccountEmailCache(rawDb, accountId);
	}
	if (contactsModuleWasEnabled && !contactsModuleEnabled) {
		clearAccountContactsCache(rawDb, accountId);
	}
	if (calendarModuleWasEnabled && !calendarModuleEnabled) {
		clearAccountCalendarCache(rawDb, accountId);
	}
	if ((contactsModuleWasEnabled && !contactsModuleEnabled) || (calendarModuleWasEnabled && !calendarModuleEnabled)) {
		cleanupAccountDavSettings(rawDb, accountId, {
			keepCardDav: contactsModuleEnabled,
			keepCalDav: calendarModuleEnabled,
		});
	}

	const oldServiceAccount = `${accountId}:${existing.email}`;
	const newServiceAccount = `${accountId}:${email}`;
	const existingPassword = await keytar.getPassword(SERVICE_NAME, oldServiceAccount);
	const password = payload.password?.trim() || existingPassword;
	if (authMethod !== 'oauth2' && password) {
		await keytar.setPassword(SERVICE_NAME, newServiceAccount, password);
	}
	if (authMethod === 'oauth2' && payload.oauth_session) {
		await setAccountOAuthSession(accountId, email, payload.oauth_session);
		await keytar.deletePassword(SERVICE_NAME, newServiceAccount);
	}
	if (authMethod !== 'oauth2') {
		await keytar.deletePassword(SERVICE_NAME, getAccountOAuthKey(accountId, existing.email));
		await keytar.deletePassword(SERVICE_NAME, getAccountOAuthKey(accountId, email));
	}
	if (oldServiceAccount !== newServiceAccount) {
		await keytar.deletePassword(SERVICE_NAME, oldServiceAccount);
		await keytar.deletePassword(SERVICE_NAME, getAccountOAuthKey(accountId, existing.email));
	}
	await ensureLocalAccountVCard(
		accountId,
		{
			email,
			display_name: payload.display_name ?? null,
			organization: payload.organization ?? null,
			reply_to: payload.reply_to ?? null,
		},
		existing.email,
	);

	const updated = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
	if (!updated?.id) throw new Error(`Account ${accountId} not found after update`);
	return {
		id: updated.id,
		email: updated.email,
		provider: updated.provider ?? null,
		auth_method: normalizeAuthMethod(updated.authMethod ?? 'password'),
		oauth_provider: normalizeOAuthProvider(updated.oauthProvider ?? null),
		display_name: updated.displayName ?? null,
		reply_to: updated.replyTo ?? null,
		organization: updated.organization ?? null,
		signature_text: updated.signatureText ?? null,
		signature_is_html: updated.signatureIsHtml ?? 0,
		signature_file_path: updated.signatureFilePath ?? null,
		attach_vcard: updated.attachVcard ?? 0,
		imap_host: updated.imapHost,
		imap_port: updated.imapPort,
		imap_secure: updated.imapSecure ?? 1,
		pop3_host: updated.pop3Host ?? null,
		pop3_port: (updated.pop3Port as number | null) ?? null,
		pop3_secure: (updated.pop3Secure as number | null) ?? null,
		smtp_host: updated.smtpHost,
		smtp_port: updated.smtpPort,
		smtp_secure: updated.smtpSecure ?? 1,
		sync_emails: updated.syncEmails ?? 1,
		sync_contacts: updated.syncContacts ?? 1,
		sync_calendar: updated.syncCalendar ?? 1,
		user: updated.user,
		created_at: updated.createdAt,
	};
}

export async function deleteAccount(accountId: number): Promise<{id: number; email: string}> {
	const db = getDrizzle();
	const rawDb = getDb();
	const existing = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
	if (!existing?.id) throw new Error(`Account ${accountId} not found`);

	const tx = rawDb.transaction((id: number) => {
		rawDb
			.prepare(
				`
                DELETE
                FROM message_bodies
                WHERE message_id IN (SELECT id
                                     FROM messages
                                     WHERE account_id = ?)
            `,
			)
			.run(id);
		rawDb
			.prepare(
				`
                DELETE
                FROM attachments
                WHERE message_id IN (SELECT id
                                     FROM messages
                                     WHERE account_id = ?)
            `,
			)
			.run(id);
		rawDb.prepare('DELETE FROM messages WHERE account_id = ?').run(id);
		rawDb.prepare('DELETE FROM folders WHERE account_id = ?').run(id);
		rawDb.prepare('DELETE FROM accounts WHERE id = ?').run(id);
	});

	tx(accountId);
	await keytar.deletePassword(SERVICE_NAME, `${accountId}:${existing.email}`);
	await keytar.deletePassword(SERVICE_NAME, getAccountOAuthKey(accountId, existing.email));
	await removeLocalAccountVCard(accountId, existing.email);
	return {id: accountId, email: existing.email};
}

function normalizeAuthMethod(value: string): AuthMethod {
	const method = String(value || '')
		.trim()
		.toLowerCase();
	if (method === 'oauth2' || method === 'app_password') return method;
	return 'password';
}

function normalizeOAuthProvider(value: string | null): OAuthProvider | null {
	const provider = String(value || '')
		.trim()
		.toLowerCase();
	if (provider === 'google' || provider === 'microsoft') return provider;
	return null;
}

function getAccountPasswordKey(accountId: number, email: string): string {
	return `${accountId}:${email}`;
}

function getAccountOAuthKey(accountId: number, email: string): string {
	return `${accountId}:${email}:oauth`;
}

function clearAccountEmailCache(db: ReturnType<typeof getDb>, accountId: number): void {
	const tx = db.transaction((id: number) => {
		db.prepare(
			`
                DELETE
                FROM message_bodies
                WHERE message_id IN (SELECT id
                                     FROM messages
                                     WHERE account_id = ?)
            `,
		).run(id);
		db.prepare(
			`
                DELETE
                FROM attachments
                WHERE message_id IN (SELECT id
                                     FROM messages
                                     WHERE account_id = ?)
            `,
		).run(id);
		db.prepare('DELETE FROM messages WHERE account_id = ?').run(id);
		db.prepare('DELETE FROM folders WHERE account_id = ?').run(id);
		// Keep thread table compact after removing account messages.
		db.prepare(
			`
                DELETE
                FROM threads
                WHERE id NOT IN (SELECT DISTINCT thread_id
                                 FROM messages
                                 WHERE thread_id IS NOT NULL)
            `,
		).run();
	});
	tx(accountId);
}

function clearAccountContactsCache(db: ReturnType<typeof getDb>, accountId: number): void {
	const tx = db.transaction((id: number) => {
		db.prepare('DELETE FROM contacts WHERE account_id = ?').run(id);
		db.prepare('DELETE FROM address_books WHERE account_id = ?').run(id);
	});
	tx(accountId);
}

function clearAccountCalendarCache(db: ReturnType<typeof getDb>, accountId: number): void {
	db.prepare('DELETE FROM calendar_events WHERE account_id = ?').run(accountId);
}

function cleanupAccountDavSettings(
	db: ReturnType<typeof getDb>,
	accountId: number,
	input: {keepCardDav: boolean; keepCalDav: boolean},
): void {
	if (!input.keepCardDav && !input.keepCalDav) {
		db.prepare('DELETE FROM account_dav_settings WHERE account_id = ?').run(accountId);
		return;
	}
	db.prepare(
		`
            UPDATE account_dav_settings
            SET carddav_url = CASE WHEN ? THEN carddav_url ELSE NULL END,
                caldav_url = CASE WHEN ? THEN caldav_url ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE account_id = ?
        `,
	).run(input.keepCardDav ? 1 : 0, input.keepCalDav ? 1 : 0, accountId);
}

async function getAccountOAuthSession(accountId: number, email: string): Promise<OAuthSession | null> {
	const raw = await keytar.getPassword(SERVICE_NAME, getAccountOAuthKey(accountId, email));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as OAuthSession;
		if (!parsed || !String(parsed.accessToken || '').trim()) return null;
		const provider = normalizeOAuthProvider(parsed.provider ?? null);
		if (!provider) return null;
		return {
			provider,
			accessToken: String(parsed.accessToken || '').trim(),
			refreshToken: String(parsed.refreshToken || '').trim() || null,
			expiresAt: Number.isFinite(Number(parsed.expiresAt)) ? Number(parsed.expiresAt) : null,
			tokenType: String(parsed.tokenType || '').trim() || null,
			scope: String(parsed.scope || '').trim() || null,
			email: String(parsed.email || '').trim() || null,
			displayName: String(parsed.displayName || '').trim() || null,
			clientId: String(parsed.clientId || '').trim() || null,
			tenantId: String(parsed.tenantId || '').trim() || null,
		};
	} catch {
		return null;
	}
}

async function setAccountOAuthSession(accountId: number, email: string, session: OAuthSession): Promise<void> {
	await keytar.setPassword(SERVICE_NAME, getAccountOAuthKey(accountId, email), JSON.stringify(session));
}

function hasOAuthSessionChanged(before: OAuthSession, after: OAuthSession): boolean {
	return (
		before.accessToken !== after.accessToken ||
		before.refreshToken !== after.refreshToken ||
		before.expiresAt !== after.expiresAt ||
		before.tokenType !== after.tokenType ||
		before.scope !== after.scope
	);
}

function looksLikeJwtToken(token: string | null | undefined): boolean {
	const value = String(token || '').trim();
	if (!value) return false;
	return value.split('.').length === 3;
}

export function getLocalAccountVCardPath(accountId: number, email: string): string {
	const safeEmail = String(email || '')
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 96);
	const suffix = safeEmail || `account-${accountId}`;
	const dbPath = getSqlitePath();
	const baseDir = path.dirname(dbPath);
	return path.join(baseDir, VCARD_DIR_NAME, `account-${accountId}-${suffix}.vcf`);
}

function escapeVCardValue(value: string): string {
	return String(value || '')
		.replace(/\\/g, '\\\\')
		.replace(/\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,');
}

function buildAccountVCard(input: {
	email: string;
	display_name?: string | null;
	organization?: string | null;
	reply_to?: string | null;
}): string {
	const email = String(input.email || '').trim();
	const displayName = String(input.display_name || '').trim();
	const organization = String(input.organization || '').trim();
	const replyTo = String(input.reply_to || '').trim();
	const fullName = displayName || email;

	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`FN:${escapeVCardValue(fullName)}`,
		`EMAIL;TYPE=INTERNET:${escapeVCardValue(email)}`,
	];
	if (organization) lines.push(`ORG:${escapeVCardValue(organization)}`);
	if (replyTo && replyTo.toLowerCase() !== email.toLowerCase()) {
		lines.push(`EMAIL;TYPE=OTHER:${escapeVCardValue(replyTo)}`);
	}
	lines.push('END:VCARD');
	return `${lines.join('\n')}\n`;
}

async function ensureLocalAccountVCard(
	accountId: number,
	input: {
		email: string;
		display_name?: string | null;
		organization?: string | null;
		reply_to?: string | null;
	},
	oldEmail: string | null,
): Promise<void> {
	try {
		const nextPath = getLocalAccountVCardPath(accountId, input.email);
		await fs.mkdir(path.dirname(nextPath), {recursive: true});
		await fs.writeFile(nextPath, buildAccountVCard(input), 'utf8');
		if (oldEmail && oldEmail.trim() && oldEmail !== input.email) {
			await removeLocalAccountVCard(accountId, oldEmail);
		}
	} catch (error) {
		console.warn(`Failed to write local vCard for account ${accountId}:`, error);
	}
}

async function removeLocalAccountVCard(accountId: number, email: string): Promise<void> {
	const vcardPath = getLocalAccountVCardPath(accountId, email);
	try {
		await fs.unlink(vcardPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			console.warn(`Failed to remove local vCard for account ${accountId}:`, error);
		}
	}
}
