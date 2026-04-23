import type {CloudAccountCredentials} from '@main/db/repositories/cloudRepo';
import {setCloudAccountSecret} from '@main/db/repositories/cloudRepo';
import {refreshMailOAuthSessionWithOptions} from '@main/auth/authServerClient';
import {getDefaultCloudOAuthAdditionalScopes} from '@main/mail/oauth';
import {
	type CloudItem,
	type CloudItemStatus,
	type CloudShareLinkResult,
	type CloudStorageUsage,
	type CloudUploadedItem,
	type DownloadedCloudItem,
} from '@llamamail/providers/types';
import {GoogleCloudProvider} from '@llamamail/providers/google/cloud';
import {MicrosoftCloudProvider} from '@llamamail/providers/microsoft/cloud';
import {NextcloudCloudProvider} from '@llamamail/providers/nextcloud/cloud';
import type {OAuthProvider, OAuthSession} from '@llamamail/app/ipcTypes';
import {resolveUnifiedProviderKey} from '@llamamail/app/providerCatalog';

const googleCloud = new GoogleCloudProvider();
const microsoftCloud = new MicrosoftCloudProvider();
const nextcloudCloud = new NextcloudCloudProvider();
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type CloudOAuthSecret = {
	accessToken?: string | null;
	refreshToken?: string | null;
	expiresAt?: number | null;
	tokenType?: string | null;
	scope?: string | null;
	displayName?: string | null;
	email?: string | null;
	provider?: string | null;
	clientId?: string | null;
	tenantId?: string | null;
};

function resolveCloudDriver(account: CloudAccountCredentials): GoogleCloudProvider | MicrosoftCloudProvider | NextcloudCloudProvider {
	const unifiedKey = resolveUnifiedProviderKey(account.provider);
	if (unifiedKey === 'google') return googleCloud;
	if (unifiedKey === 'microsoft') return microsoftCloud;
	if (unifiedKey === 'nextcloud') return nextcloudCloud;
	throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

function parseCloudOAuthSecret(secret: string): CloudOAuthSecret | null {
	const raw = String(secret || '').trim();
	if (!raw.startsWith('{')) return null;
	try {
		return JSON.parse(raw) as CloudOAuthSecret;
	} catch {
		return null;
	}
}

function resolveOAuthProvider(account: CloudAccountCredentials): OAuthProvider | null {
	const unifiedKey = resolveUnifiedProviderKey(account.provider);
	if (unifiedKey === 'google') return 'google';
	if (unifiedKey === 'microsoft') return 'microsoft';
	return null;
}

function hasFreshAccessToken(payload: CloudOAuthSecret): boolean {
	const token = String(payload.accessToken || '').trim();
	if (!token) return false;
	const expiresAt = Number(payload.expiresAt);
	if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
	return Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

function isOauthAuthFailure(error: unknown): boolean {
	const message = String((error as {message?: unknown})?.message || error || '').toLowerCase();
	return (
		message.includes('(401)') ||
		message.includes('401') ||
		message.includes('unauthorized') ||
		message.includes('invalid_grant') ||
		message.includes('token has been expired or revoked') ||
		message.includes('access token is missing') ||
		message.includes('reconnect this account')
	);
}

function buildRefreshedSecretPayload(
	current: CloudOAuthSecret,
	provider: OAuthProvider,
	session: OAuthSession,
): CloudOAuthSecret {
	return {
		...current,
		accessToken: session.accessToken,
		refreshToken: session.refreshToken || current.refreshToken || null,
		expiresAt: Number.isFinite(Number(session.expiresAt)) ? Number(session.expiresAt) : null,
		tokenType: session.tokenType || current.tokenType || null,
		scope: session.scope || current.scope || null,
		displayName: session.displayName || current.displayName || null,
		email: session.email || current.email || null,
		provider,
	};
}

async function refreshCloudOauthAccount(
	account: CloudAccountCredentials,
	options: {force?: boolean} = {},
): Promise<CloudAccountCredentials> {
	const provider = resolveOAuthProvider(account);
	if (!provider) return account;
	const parsedSecret = parseCloudOAuthSecret(account.secret);
	if (!parsedSecret) return account;

	const force = Boolean(options.force);
	if (!force && hasFreshAccessToken(parsedSecret)) return account;

	const refreshToken = String(parsedSecret.refreshToken || '').trim();
	if (!refreshToken) {
		if (hasFreshAccessToken(parsedSecret)) return account;
		throw new Error('OAuth session expired and refresh token is missing. Reconnect this account.');
	}

	const session: OAuthSession = {
		provider,
		accessToken: String(parsedSecret.accessToken || '').trim(),
		refreshToken,
		expiresAt: Number.isFinite(Number(parsedSecret.expiresAt)) ? Number(parsedSecret.expiresAt) : null,
		tokenType: String(parsedSecret.tokenType || '').trim() || null,
		scope: String(parsedSecret.scope || '').trim() || null,
		email: String(parsedSecret.email || '').trim() || null,
		displayName: String(parsedSecret.displayName || '').trim() || null,
		clientId: String(parsedSecret.clientId || '').trim() || null,
		tenantId: String(parsedSecret.tenantId || '').trim() || null,
	};
	const refreshed = await refreshMailOAuthSessionWithOptions(session, {
		additionalScopes: getDefaultCloudOAuthAdditionalScopes(provider),
	});
	const refreshedSession: OAuthSession = {
		...session,
		provider: refreshed.provider ?? provider,
		accessToken: refreshed.accessToken,
		refreshToken: refreshed.refreshToken || session.refreshToken,
		expiresAt: refreshed.expiresInSeconds ? Date.now() + refreshed.expiresInSeconds * 1000 : null,
		tokenType: refreshed.tokenType || session.tokenType,
		scope: refreshed.scope || session.scope,
		email: refreshed.email || session.email,
		displayName: refreshed.displayName || session.displayName,
	};
	const nextSecretPayload = buildRefreshedSecretPayload(parsedSecret, provider, refreshedSession);
	const nextSecret = JSON.stringify(nextSecretPayload);
	await setCloudAccountSecret(account.id, nextSecret);
	return {
		...account,
		secret: nextSecret,
		user: refreshedSession.email || account.user || null,
	};
}

async function withCloudAccountAuth<T>(
	account: CloudAccountCredentials,
	operation: (resolved: CloudAccountCredentials) => Promise<T>,
): Promise<T> {
	const provider = resolveOAuthProvider(account);
	let resolvedAccount = provider ? await refreshCloudOauthAccount(account) : account;
	try {
		return await operation(resolvedAccount);
	} catch (error) {
		if (!provider || !isOauthAuthFailure(error)) throw error;
		resolvedAccount = await refreshCloudOauthAccount(account, {force: true});
		return await operation(resolvedAccount);
	}
}

export async function listCloudItems(
	account: CloudAccountCredentials,
	pathOrToken?: string | null,
): Promise<{path: string; items: CloudItem[]}> {
	return await withCloudAccountAuth(account, async (resolved) => await resolveCloudDriver(resolved).listItems(resolved, pathOrToken));
}

export async function createCloudFolder(
	account: CloudAccountCredentials,
	parentPathOrToken: string | null | undefined,
	folderName: string,
): Promise<CloudUploadedItem> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).createFolder(resolved, parentPathOrToken, folderName),
	);
}

export async function uploadCloudFile(
	account: CloudAccountCredentials,
	parentPathOrToken: string | null | undefined,
	fileName: string,
	content: Buffer,
	contentType?: string | null,
): Promise<CloudUploadedItem> {
	return await withCloudAccountAuth(
		account,
		async (resolved) =>
			await resolveCloudDriver(resolved).uploadFile(resolved, parentPathOrToken, fileName, content, contentType),
	);
}

export async function deleteCloudItem(
	account: CloudAccountCredentials,
	itemPathOrToken: string,
): Promise<{removed: true}> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).deleteItem(resolved, itemPathOrToken),
	);
}

export async function moveCloudItem(
	account: CloudAccountCredentials,
	itemPathOrToken: string,
	targetParentPathOrToken: string | null | undefined,
): Promise<{moved: true}> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).moveItem(resolved, itemPathOrToken, targetParentPathOrToken),
	);
}

export async function downloadCloudItem(
	account: CloudAccountCredentials,
	itemPathOrToken: string,
): Promise<DownloadedCloudItem> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).downloadItem(resolved, itemPathOrToken),
	);
}

export async function getCloudStorageUsage(account: CloudAccountCredentials): Promise<CloudStorageUsage> {
	return await withCloudAccountAuth(account, async (resolved) => await resolveCloudDriver(resolved).getStorageUsage(resolved));
}

export async function getCloudItemStatus(
	account: CloudAccountCredentials,
	itemPathOrToken: string,
): Promise<CloudItemStatus> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).getItemStatus(resolved, itemPathOrToken),
	);
}

export async function createCloudShareLink(
	account: CloudAccountCredentials,
	itemPathOrToken: string,
): Promise<CloudShareLinkResult> {
	return await withCloudAccountAuth(
		account,
		async (resolved) => await resolveCloudDriver(resolved).createShareLink(resolved, itemPathOrToken),
	);
}
