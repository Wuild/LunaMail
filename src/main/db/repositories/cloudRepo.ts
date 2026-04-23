import keytar from 'keytar';
import {eq} from 'drizzle-orm';
import {getDb, getDrizzle} from '@main/db/drizzle';
import {cloudAccounts, type InsertCloudAccount} from '@main/db/schema';
import {APP_NAME} from '@llamamail/app/appConfig';
import {getUnifiedProviderDefinition} from '@llamamail/app/providerCatalog';

// This repository keeps some parameterized raw SQL where cloud/DAV bridge cleanup is still transitioning to Drizzle.
// Retain SQL only in this layer and prefer Drizzle for new queries.
const SERVICE_NAME = APP_NAME;
export const CLOUD_DAV_ACCOUNT_ID_OFFSET = 1_000_000;

export type CloudProvider = 'nextcloud' | 'webdav' | 'icloud-drive' | 'google-drive' | 'onedrive' | 'google' | 'microsoft';

export function assertCloudProviderEnabled(provider: CloudProvider): void {
	const definition = getUnifiedProviderDefinition(provider);
	if (!definition) throw new Error(`Unsupported cloud provider: ${provider}`);
	if (!definition.enabled) throw new Error(`${definition.label} provider is currently disabled.`);
	if (!definition.capabilities.files) throw new Error(`${definition.label} does not support cloud files.`);
}

export interface PublicCloudAccount {
	id: number;
	provider: CloudProvider;
	name: string;
	base_url: string | null;
	user: string | null;
	created_at: string;
}

export interface AddCloudAccountPayload {
	provider: CloudProvider;
	name: string;
	base_url?: string | null;
	user?: string | null;
	secret: string;
}

export interface UpdateCloudAccountPayload {
	name?: string | null;
	base_url?: string | null;
	user?: string | null;
	secret?: string | null;
}

export interface CloudAccountCredentials extends PublicCloudAccount {
	secret: string;
}

export interface CloudRecipientContact {
	id: number;
	full_name: string | null;
	email: string;
}

export async function getCloudAccounts(): Promise<PublicCloudAccount[]> {
	const db = getDrizzle();
	const rows = await db.select().from(cloudAccounts).orderBy(cloudAccounts.createdAt).execute();
	return rows.map(
		(row): PublicCloudAccount => ({
			id: row.id!,
			provider: row.provider as CloudProvider,
			name: row.name!,
			base_url: row.baseUrl ?? null,
			user: row.user ?? null,
			created_at: row.createdAt!,
		}),
	);
}

export async function addCloudAccount(payload: AddCloudAccountPayload): Promise<PublicCloudAccount> {
	const provider = String(payload.provider || '').trim() as CloudProvider;
	const name = String(payload.name || '').trim();
	const secret = String(payload.secret || '').trim();
	const baseUrl = String(payload.base_url || '').trim() || null;
	const user = String(payload.user || '').trim() || null;

	if (!provider || !name || !secret) {
		throw new Error('Missing required cloud account fields.');
	}
	assertCloudProviderEnabled(provider);

	if ((provider === 'nextcloud' || provider === 'webdav') && (!baseUrl || !user)) {
		throw new Error('WebDAV/Nextcloud requires server URL and username.');
	}
	const db = getDrizzle();
	const insertPayload: InsertCloudAccount = {
		provider,
		name,
		baseUrl: baseUrl ?? undefined,
		user: user ?? undefined,
	};
	const inserted = await db.insert(cloudAccounts).values(insertPayload).returning({id: cloudAccounts.id}).get();
	const accountId = Number(inserted?.id);
	await keytar.setPassword(SERVICE_NAME, `cloud:${accountId}`, secret);

	const rows = await getCloudAccounts();
	const created = rows.find((row) => row.id === accountId);
	if (!created) throw new Error('Cloud account created but could not be loaded.');
	return created;
}

export async function deleteCloudAccount(accountId: number): Promise<{removed: boolean}> {
	const db = getDrizzle();
	await db.delete(cloudAccounts).where(eq(cloudAccounts.id, accountId)).run();
	await keytar.deletePassword(SERVICE_NAME, `cloud:${accountId}`);
	purgeCloudDavData(accountId);
	return {removed: true};
}

export async function updateCloudAccount(
	accountId: number,
	payload: UpdateCloudAccountPayload,
): Promise<PublicCloudAccount> {
	const db = getDrizzle();
	const existing = await db.select().from(cloudAccounts).where(eq(cloudAccounts.id, accountId)).get();
	if (!existing?.id) throw new Error(`Cloud account ${accountId} not found.`);

	const nextName =
		payload.name === undefined ? String(existing.name || '').trim() : String(payload.name || '').trim();
	const nextBaseUrl =
		payload.base_url === undefined ? (existing.baseUrl ?? null) : String(payload.base_url || '').trim() || null;
	const nextUser = payload.user === undefined ? (existing.user ?? null) : String(payload.user || '').trim() || null;
	const nextSecret = payload.secret === undefined ? null : String(payload.secret || '').trim() || null;

	if (!nextName) {
		throw new Error('Account name is required.');
	}

	const provider = existing.provider as CloudProvider;
	assertCloudProviderEnabled(provider);
	if ((provider === 'nextcloud' || provider === 'webdav') && (!nextBaseUrl || !nextUser)) {
		throw new Error('WebDAV/Nextcloud requires server URL and username.');
	}

	await db
		.update(cloudAccounts)
		.set({
			name: nextName,
			baseUrl: nextBaseUrl,
			user: nextUser,
		})
		.where(eq(cloudAccounts.id, accountId))
		.run();

	if (nextSecret !== null) {
		if (!nextSecret) throw new Error('Secret cannot be empty.');
		await keytar.setPassword(SERVICE_NAME, `cloud:${accountId}`, nextSecret);
	}

	const rows = await getCloudAccounts();
	const updated = rows.find((row) => row.id === accountId);
	if (!updated) throw new Error('Cloud account updated but could not be loaded.');
	return updated;
}

export async function getCloudAccountCredentials(accountId: number): Promise<CloudAccountCredentials> {
	const db = getDrizzle();
	const row = await db.select().from(cloudAccounts).where(eq(cloudAccounts.id, accountId)).get();
	if (!row?.id) throw new Error(`Cloud account ${accountId} not found.`);
	assertCloudProviderEnabled(row.provider as CloudProvider);
	const secret = await keytar.getPassword(SERVICE_NAME, `cloud:${row.id}`);
	if (!secret) throw new Error('Cloud account secret not found in keychain.');
	return {
		id: row.id,
		provider: row.provider as CloudProvider,
		name: row.name,
		base_url: row.baseUrl ?? null,
		user: row.user ?? null,
		created_at: row.createdAt,
		secret,
	};
}

export async function setCloudAccountSecret(accountId: number, secret: string): Promise<void> {
	const normalizedSecret = String(secret || '').trim();
	if (!normalizedSecret) throw new Error('Secret cannot be empty.');
	await keytar.setPassword(SERVICE_NAME, `cloud:${Number(accountId)}`, normalizedSecret);
}

export function cloudAccountToDavAccountId(accountId: number): number {
	return CLOUD_DAV_ACCOUNT_ID_OFFSET + Number(accountId);
}

export function listCloudRecipientContacts(query?: string | null, limit: number = 20): CloudRecipientContact[] {
	const db = getDb();
	const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 20));
	const q = String(query || '')
		.trim()
		.toLowerCase();
	if (!q) {
		return db
			.prepare(
				`
                    SELECT id, full_name, email
                    FROM contacts
                    WHERE source = 'cloud-carddav'
                    ORDER BY lower(coalesce(full_name, '')), lower(email) LIMIT ?
                `,
			)
			.all(normalizedLimit) as CloudRecipientContact[];
	}
	const pattern = `%${q}%`;
	return db
		.prepare(
			`
                SELECT id, full_name, email
                FROM contacts
                WHERE source = 'cloud-carddav'
                  AND (
                    lower(coalesce(full_name, '')) LIKE ?
                        OR lower(email) LIKE ?
                    )
                ORDER BY lower(coalesce(full_name, '')), lower(email) LIMIT ?
            `,
		)
		.all(pattern, pattern, normalizedLimit) as CloudRecipientContact[];
}

function purgeCloudDavData(accountId: number): void {
	const db = getDb();
	const davAccountId = cloudAccountToDavAccountId(accountId);
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM account_dav_settings WHERE account_id = ?').run(davAccountId);
		db.prepare('DELETE FROM contacts WHERE account_id = ? AND source = ?').run(davAccountId, 'cloud-carddav');
		db.prepare('DELETE FROM calendar_events WHERE account_id = ? AND source = ?').run(davAccountId, 'cloud-caldav');
	});
	tx();
}
