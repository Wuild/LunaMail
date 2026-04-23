import type {OpenDialogOptions} from 'electron';
import {BrowserWindow, dialog, ipcMain, shell} from 'electron';
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createMailDebugLogger} from '@main/debug/debugLog';
import {
	addCloudAccount,
	type AddCloudAccountPayload,
	assertCloudProviderEnabled,
	deleteCloudAccount,
	getCloudAccountCredentials,
	getCloudAccounts,
	listCloudRecipientContacts,
	type CloudProvider,
	type PublicCloudAccount,
	updateCloudAccount,
	type UpdateCloudAccountPayload,
} from '@main/db/repositories/cloudRepo';
import {getDefaultCloudOAuthAdditionalScopes, startMailOAuth} from '@main/mail/oauth';
import {
	createCloudFolder,
	createCloudShareLink,
	deleteCloudItem,
	downloadCloudItem,
	getCloudItemStatus,
	getCloudStorageUsage,
	listCloudItems,
	moveCloudItem,
	uploadCloudFile,
} from '@main/cloud/providers';
import {syncCloudDav} from '@main/cloud/davSync';
import {APP_NAME, APP_PROTOCOL} from '@llamamail/app/appConfig';
import {appEventHandler, AppEvent} from '@llamamail/app/appEventHandler';
import {confirmFileOpen, isRiskyFileOpenTarget} from '@main/security/fileOpenRisk';

const logger = createMailDebugLogger('cloud', 'ipc:cloud');
const ONEDRIVE_APP_ID = 'e063ebfa-cd51-47fd-8a97-6a73fe65f26c';
const ONEDRIVE_TENANT_ID = 'common';
const ONEDRIVE_SCOPES = ['Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.ReadWrite.All'] as const;
const ONEDRIVE_REDIRECT_URI = `${APP_PROTOCOL}://azure/auth`;
const ONEDRIVE_AUTHORITY = `https://login.microsoftonline.com/${ONEDRIVE_TENANT_ID}`;
const ONEDRIVE_RESOURCE = 'https://graph.microsoft.com';
type OAuthProvider = 'google-drive' | 'onedrive';
type LinkCloudOAuthPayload = {
	clientId?: string | null;
	tenantId?: string | null;
};

const pendingOAuthProtocolUrls: string[] = [];
const oauthProtocolWaiters = new Set<(url: string) => void>();

export function queueCloudOAuthCallbackUrl(url: string): boolean {
	if (!isSupportedOAuthProtocolUrl(url)) return false;
	if (oauthProtocolWaiters.size === 0) {
		pendingOAuthProtocolUrls.push(url);
	} else {
		for (const notify of oauthProtocolWaiters) {
			notify(url);
		}
	}
	return true;
}

export function registerCloudIpc(): void {
	ipcMain.handle('get-cloud-accounts', async () => {
		logger.debug('IPC get-cloud-accounts');
		return await getCloudAccounts();
	});

	ipcMain.handle('add-cloud-account', async (_event, payload: AddCloudAccountPayload) => {
		logger.info('IPC add-cloud-account provider=%s name=%s', payload?.provider ?? '', payload?.name ?? '');
		assertCloudProviderEnabled(String(payload?.provider || '').trim() as CloudProvider);
		const created = await addCloudAccount(payload);
		broadcastCloudAccountsChanged();
		appEventHandler.emit(AppEvent.CloudAccountAdded, {
			accountId: created.id,
			provider: String(created.provider || ''),
			name: created.name ?? null,
		});
		return created;
	});

	ipcMain.handle('update-cloud-account', async (_event, accountId: number, payload: UpdateCloudAccountPayload) => {
		logger.info('IPC update-cloud-account accountId=%d', accountId);
		const updated = await updateCloudAccount(accountId, payload ?? {});
		broadcastCloudAccountsChanged();
		appEventHandler.emit(AppEvent.CloudAccountUpdated, {
			accountId: updated.id,
			provider: String(updated.provider || ''),
			name: updated.name ?? null,
		});
		return updated;
	});

	ipcMain.handle('link-cloud-oauth', async (_event, provider: OAuthProvider, payload: LinkCloudOAuthPayload) => {
		logger.info('IPC link-cloud-oauth provider=%s', provider);
		if (provider !== 'google-drive' && provider !== 'onedrive') {
			throw new Error('OAuth linking is only supported for Google Drive and OneDrive.');
		}
		const rawClientId = String(payload?.clientId || '').trim();
		const clientId = provider === 'onedrive' ? rawClientId || ONEDRIVE_APP_ID : rawClientId;
		const tenantId = String(payload?.tenantId || '').trim() || 'common';
		const linked =
			provider === 'google-drive'
				? await linkGoogleDriveViaAuthService()
				: await linkOneDriveOAuth(clientId, tenantId);
		const secretPayload = buildCloudOAuthSecretPayload(linked, provider, {clientId, tenantId});
		const linkedEmail = String(linked.email || '').trim();
		const accountName = linkedEmail
			? linkedEmail
			: linked.displayName
				? `${linked.displayName} (${provider === 'google-drive' ? 'Google Drive' : 'OneDrive'})`
				: provider === 'google-drive'
					? 'Google Drive'
					: 'OneDrive';
		const created = await addCloudAccount({
			provider,
			name: accountName,
			user: linked.email || null,
			base_url: null,
			secret: secretPayload,
		});
		broadcastCloudAccountsChanged();
		appEventHandler.emit(AppEvent.CloudAccountAdded, {
			accountId: created.id,
			provider: String(created.provider || provider),
			name: created.name ?? null,
		});
		return created;
	});

	ipcMain.handle(
		'relink-cloud-oauth',
		async (_event, accountId: number, payload: LinkCloudOAuthPayload): Promise<PublicCloudAccount> => {
			logger.info('IPC relink-cloud-oauth accountId=%d', accountId);
			const credentials = await getCloudAccountCredentials(accountId);
			if (credentials.provider !== 'google-drive' && credentials.provider !== 'onedrive') {
				throw new Error('OAuth relinking is only supported for Google Drive and OneDrive accounts.');
			}
			const provider: OAuthProvider = credentials.provider;
			const persisted = parseCloudOAuthSecret(credentials.secret);
			const rawClientId = String(payload?.clientId || '').trim();
			const rawTenantId = String(payload?.tenantId || '').trim();
			const clientId =
				provider === 'onedrive'
					? rawClientId || String(persisted?.clientId || '').trim() || ONEDRIVE_APP_ID
					: rawClientId;
			const tenantId = rawTenantId || String(persisted?.tenantId || '').trim() || 'common';
			const linked =
				provider === 'google-drive'
					? await linkGoogleDriveViaAuthService()
					: await linkOneDriveOAuth(clientId, tenantId);
			const nextSecret = buildCloudOAuthSecretPayload(linked, provider, {clientId, tenantId});
			const updated = await updateCloudAccount(accountId, {
				user: linked.email || credentials.user || null,
				secret: nextSecret,
			});
			broadcastCloudAccountsChanged();
			appEventHandler.emit(AppEvent.CloudAccountUpdated, {
				accountId: updated.id,
				provider: String(updated.provider || provider),
				name: updated.name ?? null,
			});
			return updated;
		},
	);

	ipcMain.handle('delete-cloud-account', async (_event, accountId: number) => {
		logger.warn('IPC delete-cloud-account accountId=%d', accountId);
		const result = await deleteCloudAccount(accountId);
		broadcastCloudAccountsChanged();
		appEventHandler.emit(AppEvent.CloudAccountDeleted, {accountId});
		return result;
	});

	ipcMain.handle('list-cloud-items', async (_event, accountId: number, pathOrToken?: string | null) => {
		logger.debug('IPC list-cloud-items accountId=%d path=%s', accountId, String(pathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		return await listCloudItems(credentials, pathOrToken ?? null);
	});

	ipcMain.handle('sync-cloud-dav', async (_event, accountId: number) => {
		logger.info('IPC sync-cloud-dav accountId=%d', accountId);
		const credentials = await getCloudAccountCredentials(accountId);
		const result = await syncCloudDav(credentials);
		appEventHandler.emit(AppEvent.CloudDavSyncCompleted, {
			accountId,
			provider: String(credentials.provider || ''),
		});
		return result;
	});

	ipcMain.handle('get-cloud-storage-usage', async (_event, accountId: number) => {
		logger.debug('IPC get-cloud-storage-usage accountId=%d', accountId);
		const credentials = await getCloudAccountCredentials(accountId);
		return await getCloudStorageUsage(credentials);
	});

	ipcMain.handle(
		'create-cloud-folder',
		async (_event, accountId: number, parentPathOrToken: string | null, folderName: string) => {
			logger.info('IPC create-cloud-folder accountId=%d parent=%s', accountId, String(parentPathOrToken || ''));
			const credentials = await getCloudAccountCredentials(accountId);
			const created = await createCloudFolder(credentials, parentPathOrToken ?? null, folderName);
			appEventHandler.emit(AppEvent.CloudFolderCreated, {
				accountId,
				parentPathOrToken: parentPathOrToken ?? null,
				path: String(created?.path || '').trim() || null,
				name: String(created?.name || folderName).trim() || null,
			});
			return created;
		},
	);

	ipcMain.handle('delete-cloud-item', async (_event, accountId: number, itemPathOrToken: string) => {
		logger.warn('IPC delete-cloud-item accountId=%d item=%s', accountId, String(itemPathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		const result = await deleteCloudItem(credentials, itemPathOrToken);
		appEventHandler.emit(AppEvent.CloudItemDeleted, {
			accountId,
			itemPathOrToken,
		});
		return result;
	});

	ipcMain.handle(
		'move-cloud-item',
		async (_event, accountId: number, itemPathOrToken: string, targetParentPathOrToken: string | null) => {
			logger.info(
				'IPC move-cloud-item accountId=%d item=%s target=%s',
				accountId,
				String(itemPathOrToken || ''),
				String(targetParentPathOrToken || ''),
			);
			const credentials = await getCloudAccountCredentials(accountId);
			return await moveCloudItem(credentials, itemPathOrToken, targetParentPathOrToken ?? null);
		},
	);

	ipcMain.handle('get-cloud-item-status', async (_event, accountId: number, itemPathOrToken: string) => {
		logger.debug('IPC get-cloud-item-status accountId=%d item=%s', accountId, String(itemPathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		return await getCloudItemStatus(credentials, itemPathOrToken);
	});

	ipcMain.handle('create-cloud-share-link', async (_event, accountId: number, itemPathOrToken: string) => {
		logger.info('IPC create-cloud-share-link accountId=%d item=%s', accountId, String(itemPathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		return await createCloudShareLink(credentials, itemPathOrToken);
	});

	ipcMain.handle('upload-cloud-files', async (event, accountId: number, parentPathOrToken?: string | null) => {
		logger.info('IPC upload-cloud-files accountId=%d parent=%s', accountId, String(parentPathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
		const options: OpenDialogOptions = {
			title: 'Upload files to cloud',
			properties: ['openFile', 'multiSelections'],
		};
		const pick = parentWindow
			? await dialog.showOpenDialog(parentWindow, options)
			: await dialog.showOpenDialog(options);
		if (pick.canceled || !pick.filePaths.length) {
			return {uploaded: 0 as const};
		}
		let uploaded = 0;
		for (const filePath of pick.filePaths) {
			const content = await fs.readFile(filePath);
			const fileName = path.basename(filePath);
			await uploadCloudFile(credentials, parentPathOrToken ?? null, fileName, content, null);
			uploaded += 1;
		}
		appEventHandler.emit(AppEvent.CloudFilesUploaded, {
			accountId,
			parentPathOrToken: parentPathOrToken ?? null,
			uploaded,
		});
		return {uploaded};
	});

	ipcMain.handle(
		'open-cloud-item',
		async (
			event,
			accountId: number,
			itemPathOrToken: string,
			fallbackName?: string | null,
			action: 'open' | 'save' = 'open',
		) => {
			logger.info(
				'IPC open-cloud-item accountId=%d item=%s action=%s',
				accountId,
				String(itemPathOrToken || ''),
				action,
			);
			const credentials = await getCloudAccountCredentials(accountId);
			const downloaded = await downloadCloudItem(credentials, itemPathOrToken);
			const safeName = sanitizeCloudFilename(downloaded.name || fallbackName || 'cloud-item');
			const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
			if (action === 'save') {
				const saveDialogOptions = {
					title: 'Save cloud file',
					defaultPath: safeName,
					showsTagField: false,
				};
				const saveResult = parentWindow
					? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
					: await dialog.showSaveDialog(saveDialogOptions);
				if (saveResult.canceled || !saveResult.filePath) {
					return {ok: false as const, action: 'cancelled' as const, path: ''};
				}
				await fs.writeFile(saveResult.filePath, downloaded.content);
				appEventHandler.emit(AppEvent.CloudItemSaved, {
					accountId,
					itemPathOrToken,
					path: saveResult.filePath,
				});
				return {ok: true as const, action: 'saved' as const, path: saveResult.filePath};
			}
			const isRisky = isRiskyFileOpenTarget(safeName, downloaded.mimeType, downloaded.content);
			const approved = await confirmFileOpen(parentWindow, safeName, 'cloud file', isRisky);
			if (!approved) {
				return {ok: false as const, action: 'cancelled' as const, path: ''};
			}
			const targetPath = path.join(os.tmpdir(), `llamamail-cloud-${Date.now()}-${safeName}`);
			await fs.writeFile(targetPath, downloaded.content);
			const openError = await shell.openPath(targetPath);
			if (openError) throw new Error(openError);
			appEventHandler.emit(AppEvent.CloudItemOpened, {
				accountId,
				itemPathOrToken,
				path: targetPath,
			});
			return {ok: true as const, action: 'opened' as const, path: targetPath};
		},
	);

	ipcMain.handle(
		'pick-cloud-attachment',
		async (_event, accountId: number, itemPathOrToken: string, fallbackName?: string | null) => {
			logger.info('IPC pick-cloud-attachment accountId=%d item=%s', accountId, String(itemPathOrToken || ''));
			const credentials = await getCloudAccountCredentials(accountId);
			const downloaded = await downloadCloudItem(credentials, itemPathOrToken);
			const safeName = sanitizeCloudFilename(downloaded.name || fallbackName || 'cloud-attachment');
			const targetPath = path.join(os.tmpdir(), `llamamail-cloud-attachment-${Date.now()}-${safeName}`);
			await fs.writeFile(targetPath, downloaded.content);
			return {
				path: targetPath,
				filename: safeName,
				contentType: downloaded.mimeType || null,
			};
		},
	);

	ipcMain.handle('get-cloud-recipient-contacts', async (_event, query?: string | null, limit?: number) => {
		logger.debug(
			'IPC get-cloud-recipient-contacts queryLen=%d limit=%s',
			String(query || '').length,
			String(limit ?? ''),
		);
		return listCloudRecipientContacts(query ?? null, limit ?? 20);
	});
}

function sanitizeCloudFilename(value: string): string {
	const cleaned = String(value || '')
		.trim()
		.replace(/[\\/:"*?<>|]+/g, '_');
	if (!cleaned) return 'cloud-item';
	return cleaned.slice(0, 180);
}

type LinkedOAuthAccount = {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: number | null;
	tokenType: string | null;
	scope: string | null;
	displayName: string | null;
	email: string | null;
};

type ParsedCloudOAuthSecret = {
	clientId?: string | null;
	tenantId?: string | null;
};

function parseCloudOAuthSecret(value: string | null | undefined): ParsedCloudOAuthSecret | null {
	const raw = String(value || '').trim();
	if (!raw.startsWith('{')) return null;
	try {
		return JSON.parse(raw) as ParsedCloudOAuthSecret;
	} catch {
		return null;
	}
}

function buildCloudOAuthSecretPayload(
	linked: LinkedOAuthAccount,
	provider: OAuthProvider,
	options: {clientId?: string | null; tenantId?: string | null} = {},
): string {
	const clientId = String(options.clientId || '').trim() || null;
	const tenantId = String(options.tenantId || '').trim() || null;
	return JSON.stringify({
		accessToken: linked.accessToken,
		refreshToken: linked.refreshToken || null,
		expiresAt: linked.expiresAt,
		tokenType: linked.tokenType || null,
		scope: linked.scope || null,
		provider,
		clientId: provider === 'onedrive' ? clientId : null,
		tenantId: provider === 'onedrive' ? tenantId : null,
	});
}

async function linkGoogleDriveViaAuthService(): Promise<LinkedOAuthAccount> {
	const session = await startMailOAuth({
		provider: 'google',
		scopes: getDefaultCloudOAuthAdditionalScopes('google'),
	});
	return {
		accessToken: String(session.accessToken || '').trim(),
		refreshToken: String(session.refreshToken || '').trim() || null,
		expiresAt: Number.isFinite(Number(session.expiresAt)) ? Number(session.expiresAt) : null,
		tokenType: String(session.tokenType || '').trim() || null,
		scope: String(session.scope || '').trim() || null,
		displayName: String(session.displayName || '').trim() || null,
		email: String(session.email || '').trim() || null,
	};
}

async function linkGoogleDriveOAuth(clientId: string): Promise<LinkedOAuthAccount> {
	const state = randomBytes(16).toString('hex');
	const verifier = randomBytes(48).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const callback = await createOAuthCallbackWaiter(state);
	const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', callback.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', 'openid profile email https://www.googleapis.com/auth/drive');
	authUrl.searchParams.set('access_type', 'offline');
	authUrl.searchParams.set('prompt', 'consent');
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	await shell.openExternal(authUrl.toString());
	const code = await callback.waitForCode();
	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			code_verifier: verifier,
			grant_type: 'authorization_code',
			redirect_uri: callback.redirectUri,
		}),
	});
	if (!tokenRes.ok) throw new Error(`Google OAuth token exchange failed (${tokenRes.status}).`);
	const token = (await tokenReson()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};
	const accessToken = String(token.access_token || '').trim();
	if (!accessToken) throw new Error('Google OAuth response did not include an access token.');
	const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: {Authorization: `Bearer ${accessToken}`},
	});
	let displayName: string | null = null;
	let email: string | null = null;
	if (userRes.ok) {
		const user = (await userReson()) as {name?: string; email?: string};
		displayName = String(user.name || '').trim() || null;
		email = String(user.email || '').trim() || null;
	}
	const expiresAt = Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null;
	return {
		accessToken,
		refreshToken: String(token.refresh_token || '').trim() || null,
		expiresAt,
		tokenType: String(token.token_type || '').trim() || null,
		scope: String(token.scope || '').trim() || null,
		displayName,
		email,
	};
}

async function linkOneDriveOAuth(clientId: string, tenantId: string): Promise<LinkedOAuthAccount> {
	const state = randomBytes(16).toString('hex');
	const verifier = randomBytes(48).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const callback = createProtocolOAuthCallbackWaiter(state, ONEDRIVE_REDIRECT_URI);
	const tenant = tenantId || 'common';
	const authorityBase = ONEDRIVE_AUTHORITY.replace(/\/common$/i, `/${encodeURIComponent(tenant)}`);
	const authUrl = new URL(`${authorityBase}/oauth2/v2.0/authorize`);
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', callback.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', `offline_access openid profile email ${ONEDRIVE_SCOPES[0]}`);
	authUrl.searchParams.set('response_mode', 'query');
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	await shell.openExternal(authUrl.toString());
	const code = await callback.waitForCode();
	const tokenRes = await fetch(`${authorityBase}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: new URLSearchParams({
			client_id: clientId,
			grant_type: 'authorization_code',
			code,
			redirect_uri: callback.redirectUri,
			code_verifier: verifier,
			scope: `offline_access openid profile email ${ONEDRIVE_SCOPES[0]}`,
		}),
	});
	if (!tokenRes.ok) throw new Error(`OneDrive OAuth token exchange failed (${tokenRes.status}).`);
	const token = (await tokenReson()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
		id_token?: string;
	};
	const accessToken = String(token.access_token || '').trim();
	if (!accessToken) throw new Error('OneDrive OAuth response did not include an access token.');
	const idTokenClaims = parseJwtClaims(token.id_token);
	const meRes = await fetch(`${ONEDRIVE_RESOURCE}/v1.0/me`, {
		headers: {Authorization: `Bearer ${accessToken}`},
	});
	let displayName: string | null = null;
	let email: string | null = null;
	if (meRes.ok) {
		const me = (await meReson()) as {displayName?: string; mail?: string; userPrincipalName?: string};
		displayName = String(me.displayName || '').trim() || null;
		email = String(me.mail || me.userPrincipalName || '').trim() || null;
	}
	if (!displayName) {
		displayName =
			String(idTokenClaims.name || idTokenClaims.given_name || idTokenClaims.preferred_username || '').trim() ||
			null;
	}
	if (!email) {
		email =
			String(idTokenClaims.preferred_username || idTokenClaims.email || idTokenClaims.upn || '').trim() || null;
	}
	const expiresAt = Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null;
	return {
		accessToken,
		refreshToken: String(token.refresh_token || '').trim() || null,
		expiresAt,
		tokenType: String(token.token_type || '').trim() || null,
		scope: String(token.scope || '').trim() || null,
		displayName,
		email,
	};
}

function parseJwtClaims(token: string | null | undefined): Record<string, string> {
	const raw = String(token || '').trim();
	if (!raw) return {};
	const parts = raw.split('.');
	if (parts.length < 2) return {};
	try {
		const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
		const parsed = JSON.parse(payload) as Record<string, unknown>;
		const claims: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'string') claims[key] = value;
		}
		return claims;
	} catch {
		return {};
	}
}

function createProtocolOAuthCallbackWaiter(
	state: string,
	redirectUri: string,
): {
	redirectUri: string;
	waitForCode: () => Promise<string>;
} {
	let resolveCode!: (value: string) => void;
	let rejectCode!: (error: Error) => void;
	const codePromise = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
	});
	let settled = false;
	const finish = (error?: Error, code?: string) => {
		if (settled) return;
		settled = true;
		if (error) rejectCode(error);
		else if (code) resolveCode(code);
		else rejectCode(new Error('OAuth callback did not return a code.'));
	};
	const consumeUrl = (url: string) => {
		const parsed = parseOAuthProtocolCallback(url, redirectUri);
		if (!parsed) return false;
		if (parsed.state !== state) {
			finish(new Error('OAuth state mismatch.'));
			return true;
		}
		if (parsed.error) {
			finish(new Error(parsed.errorDescription || parsed.error || 'OAuth authorization failed.'));
			return true;
		}
		if (!parsed.code) {
			finish(new Error('OAuth callback did not include a code.'));
			return true;
		}
		finish(undefined, parsed.code);
		return true;
	};
	const onUrl = (url: string) => {
		consumeUrl(url);
	};
	oauthProtocolWaiters.add(onUrl);
	for (let index = 0; index < pendingOAuthProtocolUrls.length; index += 1) {
		const pending = pendingOAuthProtocolUrls[index];
		if (!consumeUrl(pending)) continue;
		pendingOAuthProtocolUrls.splice(index, 1);
		index -= 1;
		if (settled) break;
	}
	const timeoutId = setTimeout(
		() => {
			finish(new Error('OAuth login timed out. Please try again.'));
		},
		3 * 60 * 1000,
	);
	return {
		redirectUri,
		waitForCode: async () => {
			try {
				return await codePromise;
			} finally {
				clearTimeout(timeoutId);
				oauthProtocolWaiters.delete(onUrl);
			}
		},
	};
}

function isSupportedOAuthProtocolUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const redirect = new URL(ONEDRIVE_REDIRECT_URI);
		return (
			parsed.protocol === redirect.protocol &&
			parsed.hostname === redirect.hostname &&
			parsed.pathname === redirect.pathname
		);
	} catch {
		return false;
	}
}

function parseOAuthProtocolCallback(
	url: string,
	redirectUri: string,
): {code: string | null; state: string | null; error: string | null; errorDescription: string | null} | null {
	let parsedUrl: URL;
	let parsedRedirect: URL;
	try {
		parsedUrl = new URL(url);
		parsedRedirect = new URL(redirectUri);
	} catch {
		return null;
	}
	if (
		parsedUrl.protocol !== parsedRedirect.protocol ||
		parsedUrl.hostname !== parsedRedirect.hostname ||
		parsedUrl.pathname !== parsedRedirect.pathname
	) {
		return null;
	}
	return {
		code: parsedUrl.searchParams.get('code'),
		state: parsedUrl.searchParams.get('state'),
		error: parsedUrl.searchParams.get('error'),
		errorDescription: parsedUrl.searchParams.get('error_description'),
	};
}

async function createOAuthCallbackWaiter(state: string): Promise<{
	redirectUri: string;
	waitForCode: () => Promise<string>;
}> {
	let resolveCode!: (value: string) => void;
	let rejectCode!: (error: Error) => void;
	const codePromise = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
	});
	let settled = false;
	const finish = (error?: Error, code?: string) => {
		if (settled) return;
		settled = true;
		if (error) rejectCode(error);
		else if (code) resolveCode(code);
		else rejectCode(new Error('OAuth callback did not return a code.'));
	};
	const server = createServer((req, res) => {
		const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
		if (requestUrl.pathname !== '/oauth/callback') {
			res.statusCode = 404;
			res.end('Not found');
			return;
		}
		const callbackState = requestUrl.searchParams.get('state');
		const callbackError = requestUrl.searchParams.get('error');
		const callbackCode = requestUrl.searchParams.get('code');
		const callbackDescription = requestUrl.searchParams.get('error_description') || callbackError;
		if (callbackState !== state) {
			res.statusCode = 400;
			res.end('State mismatch. You can close this tab.');
			finish(new Error('OAuth state mismatch.'));
			return;
		}
		if (callbackError) {
			res.statusCode = 400;
			res.end('Authentication failed. You can close this tab.');
			finish(new Error(callbackDescription || 'OAuth authorization failed.'));
			return;
		}
		if (!callbackCode) {
			res.statusCode = 400;
			res.end('Missing authorization code. You can close this tab.');
			finish(new Error('OAuth callback did not include a code.'));
			return;
		}
		res.statusCode = 200;
		res.end(`${APP_NAME} account linked successfully. You can close this tab.`);
		finish(undefined, callbackCode);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', (error) => reject(error));
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Could not start OAuth callback listener.');
	}
	const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
	const timeoutId = setTimeout(
		() => {
			finish(new Error('OAuth login timed out. Please try again.'));
		},
		3 * 60 * 1000,
	);
	return {
		redirectUri,
		waitForCode: async () => {
			try {
				return await codePromise;
			} finally {
				clearTimeout(timeoutId);
				server.close();
			}
		},
	};
}

function broadcastCloudAccountsChanged(): void {
	void getCloudAccounts()
		.then((accounts) => {
			for (const win of BrowserWindow.getAllWindows()) {
				if (win.isDestroyed()) continue;
				win.webContents.send('cloud-accounts-updated', accounts);
			}
		})
		.catch(() => undefined);
}
