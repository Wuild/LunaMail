import type {OpenDialogOptions} from 'electron';
import {BrowserWindow, dialog, ipcMain, shell} from 'electron';
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {
	addCloudAccount,
	type AddCloudAccountPayload,
	deleteCloudAccount,
	getCloudAccountCredentials,
	getCloudAccounts,
	listCloudRecipientContacts,
	updateCloudAccount,
	type UpdateCloudAccountPayload,
} from '@main/db/repositories/cloudRepo.js';
import {getAccountSyncCredentials, getAccounts as getMailAccounts} from '@main/db/repositories/accountsRepo.js';
import {
	createCloudFolder,
	createCloudShareLink,
	deleteCloudItem,
	downloadCloudItem,
	getCloudItemStatus,
	getCloudStorageUsage,
	listCloudItems,
	uploadCloudFile,
} from '@main/cloud/providers.js';
import {syncCloudDav} from '@main/cloud/davSync.js';
import {APP_NAME, APP_PROTOCOL} from '@/shared/appConfig.js';
import {confirmFileOpen, isRiskyFileOpenTarget} from '@main/security/fileOpenRisk.js';

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
		const created = await addCloudAccount(payload);
		broadcastCloudAccountsChanged();
		return created;
	});

	ipcMain.handle('update-cloud-account', async (_event, accountId: number, payload: UpdateCloudAccountPayload) => {
		logger.info('IPC update-cloud-account accountId=%d', accountId);
		const updated = await updateCloudAccount(accountId, payload ?? {});
		broadcastCloudAccountsChanged();
		return updated;
	});

	ipcMain.handle('link-cloud-oauth', async (_event, provider: OAuthProvider, payload: LinkCloudOAuthPayload) => {
		logger.info('IPC link-cloud-oauth provider=%s', provider);
		if (provider !== 'google-drive' && provider !== 'onedrive') {
			throw new Error('OAuth linking is only supported for Google Drive and OneDrive.');
		}
		const rawClientId = String(payload?.clientId || '').trim();
		const clientId = provider === 'onedrive' ? rawClientId || ONEDRIVE_APP_ID : rawClientId;
		if (!clientId) throw new Error('Client ID is required.');
		const tenantId = String(payload?.tenantId || '').trim() || 'common';
		const linked =
			provider === 'google-drive'
				? await linkGoogleDriveOAuth(clientId)
				: await linkOneDriveOAuth(clientId, tenantId);

		const secretPayload = JSON.stringify({
			accessToken: linked.accessToken,
			refreshToken: linked.refreshToken || null,
			expiresAt: linked.expiresAt,
			tokenType: linked.tokenType || null,
			scope: linked.scope || null,
			provider,
			clientId,
			tenantId: provider === 'onedrive' ? tenantId : null,
		});
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
		return created;
	});

	ipcMain.handle('delete-cloud-account', async (_event, accountId: number) => {
		logger.warn('IPC delete-cloud-account accountId=%d', accountId);
		const accounts = await getCloudAccounts();
		const target = accounts.find((account) => account.id === Number(accountId)) ?? null;
		if (target && (target.provider === 'google-drive' || target.provider === 'onedrive')) {
			throw new Error('OAuth cloud accounts are managed from Account Settings and cannot be deleted here.');
		}
		const result = await deleteCloudAccount(accountId);
		broadcastCloudAccountsChanged();
		return result;
	});

	ipcMain.handle('unlink-account-cloud-drive', async (_event, accountId: number) => {
		const safeAccountId = Number(accountId);
		if (!Number.isFinite(safeAccountId) || safeAccountId <= 0) {
			throw new Error('Invalid accountId.');
		}
		logger.info('IPC unlink-account-cloud-drive accountId=%d', safeAccountId);
		const mailAccounts = await getMailAccounts();
		const mailAccount = mailAccounts.find((account) => account.id === safeAccountId) ?? null;
		if (!mailAccount) {
			throw new Error(`Account ${safeAccountId} not found.`);
		}
		const cloudProvider = resolveOAuthCloudProvider(mailAccount.provider ?? null, mailAccount.oauth_provider ?? null);
		if (!cloudProvider) {
			return {removed: false as const, reason: 'provider-not-supported' as const, cloudAccountId: null};
		}
		const linkedEmail = String(mailAccount.email || '')
			.trim()
			.toLowerCase();
		const cloudAccounts = await getCloudAccounts();
		const providerAccounts = cloudAccounts.filter((account) => account.provider === cloudProvider);
		if (providerAccounts.length === 0) {
			return {removed: false as const, reason: 'not-linked' as const, cloudAccountId: null};
		}
		const target =
			providerAccounts.find((account) => {
				const user = String(account.user || '')
					.trim()
					.toLowerCase();
				return Boolean(linkedEmail) && user === linkedEmail;
			}) ?? providerAccounts[0];
		await deleteCloudAccount(target.id);
		broadcastCloudAccountsChanged();
		return {removed: true as const, reason: null, cloudAccountId: target.id};
	});

	ipcMain.handle('link-account-cloud-drive', async (_event, accountId: number) => {
		const safeAccountId = Number(accountId);
		if (!Number.isFinite(safeAccountId) || safeAccountId <= 0) {
			throw new Error('Invalid accountId.');
		}
		logger.info('IPC link-account-cloud-drive accountId=%d', safeAccountId);
		const mailAccounts = await getMailAccounts();
		const mailAccount = mailAccounts.find((account) => account.id === safeAccountId) ?? null;
		if (!mailAccount) {
			throw new Error(`Account ${safeAccountId} not found.`);
		}
		const cloudProvider = resolveOAuthCloudProvider(mailAccount.provider ?? null, mailAccount.oauth_provider ?? null);
		if (!cloudProvider) {
			return {linked: false as const, reason: 'provider-not-supported' as const, cloudAccount: null};
		}
		const linkedEmail = String(mailAccount.email || '')
			.trim()
			.toLowerCase();
		const existingCloudAccounts = await getCloudAccounts();
		const alreadyLinked =
			existingCloudAccounts.find((account) => {
				if (account.provider !== cloudProvider) return false;
				const user = String(account.user || '')
					.trim()
					.toLowerCase();
				return Boolean(linkedEmail) && user === linkedEmail;
			}) ?? null;
		if (alreadyLinked) {
			return {linked: false as const, reason: 'already-linked' as const, cloudAccount: alreadyLinked};
		}

		const credentials = await getAccountSyncCredentials(safeAccountId);
		if (credentials.auth_method !== 'oauth2' || !credentials.oauth_session?.accessToken?.trim()) {
			throw new Error('This account does not have an active OAuth session for cloud linking.');
		}
		const oauthSession = credentials.oauth_session;
		const providerClientId =
			cloudProvider === 'onedrive' ? String(oauthSession.clientId || '').trim() || ONEDRIVE_APP_ID : String(oauthSession.clientId || '').trim() || null;
		const providerTenantId =
			cloudProvider === 'onedrive' ? String(oauthSession.tenantId || '').trim() || ONEDRIVE_TENANT_ID : null;
		const secretPayload = JSON.stringify({
			accessToken: oauthSession.accessToken,
			refreshToken: oauthSession.refreshToken || null,
			expiresAt: oauthSession.expiresAt,
			tokenType: oauthSession.tokenType || null,
			scope: oauthSession.scope || null,
			provider: cloudProvider,
			clientId: providerClientId,
			tenantId: providerTenantId,
		});
		const accountName = String(mailAccount.email || '').trim() || String(mailAccount.display_name || '').trim() || (cloudProvider === 'google-drive' ? 'Google Drive' : 'OneDrive');
		const created = await addCloudAccount({
			provider: cloudProvider,
			name: accountName,
			user: mailAccount.email || null,
			base_url: null,
			secret: secretPayload,
		});
		broadcastCloudAccountsChanged();
		return {linked: true as const, reason: null, cloudAccount: created};
	});

	ipcMain.handle('list-cloud-items', async (_event, accountId: number, pathOrToken?: string | null) => {
		logger.debug('IPC list-cloud-items accountId=%d path=%s', accountId, String(pathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		return await listCloudItems(credentials, pathOrToken ?? null);
	});

	ipcMain.handle('sync-cloud-dav', async (_event, accountId: number) => {
		logger.info('IPC sync-cloud-dav accountId=%d', accountId);
		const credentials = await getCloudAccountCredentials(accountId);
		return await syncCloudDav(credentials);
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
			return await createCloudFolder(credentials, parentPathOrToken ?? null, folderName);
		},
	);

	ipcMain.handle('delete-cloud-item', async (_event, accountId: number, itemPathOrToken: string) => {
		logger.warn('IPC delete-cloud-item accountId=%d item=%s', accountId, String(itemPathOrToken || ''));
		const credentials = await getCloudAccountCredentials(accountId);
		return await deleteCloudItem(credentials, itemPathOrToken);
	});

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

function resolveOAuthCloudProvider(
	provider: string | null | undefined,
	oauthProvider: string | null | undefined,
): OAuthProvider | null {
	const normalizedProvider = String(provider || '')
		.trim()
		.toLowerCase();
	const normalizedOauthProvider = String(oauthProvider || '')
		.trim()
		.toLowerCase();
	if (normalizedProvider === 'google' || normalizedOauthProvider === 'google') return 'google-drive';
	if (normalizedProvider === 'microsoft' || normalizedOauthProvider === 'microsoft') return 'onedrive';
	return null;
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
	const token = (await tokenRes.json()) as {
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
		const user = (await userRes.json()) as {name?: string; email?: string};
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
	const token = (await tokenRes.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};
	const accessToken = String(token.access_token || '').trim();
	if (!accessToken) throw new Error('OneDrive OAuth response did not include an access token.');
	const meRes = await fetch(`${ONEDRIVE_RESOURCE}/v1.0/me`, {
		headers: {Authorization: `Bearer ${accessToken}`},
	});
	let displayName: string | null = null;
	let email: string | null = null;
	if (meRes.ok) {
		const me = (await meRes.json()) as {displayName?: string; mail?: string; userPrincipalName?: string};
		displayName = String(me.displayName || '').trim() || null;
		email = String(me.mail || me.userPrincipalName || '').trim() || null;
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
