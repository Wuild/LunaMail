import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import type {OAuthProvider, OAuthSession} from '@/shared/ipcTypes.js';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {
	MAIL_GOOGLE_OAUTH_CLIENT_ID,
	MAIL_MICROSOFT_OAUTH_CLIENT_ID,
	MAIL_OAUTH_REDIRECT_URI,
} from '@main/config.js';

type StartMailOAuthPayload = {
	email?: string | null;
	provider?: string | null;
	clientId?: string | null;
	tenantId?: string | null;
};

const pendingOAuthProtocolUrls: string[] = [];
const oauthProtocolWaiters = new Set<(url: string) => void>();
const logger = createMailDebugLogger('app', 'mail:oauth');

export function queueMailOAuthCallbackUrl(url: string): boolean {
	if (!isSupportedMailOAuthProtocolUrl(url)) return false;
	if (oauthProtocolWaiters.size === 0) {
		pendingOAuthProtocolUrls.push(url);
	} else {
		for (const notify of oauthProtocolWaiters) {
			notify(url);
		}
	}
	return true;
}

export async function startMailOAuth(payload: StartMailOAuthPayload): Promise<OAuthSession> {
	const email = String(payload?.email || '').trim().toLowerCase();
	const provider = resolveOAuthProvider(payload?.provider ?? null, email);
	if (!provider) {
		throw unsupportedProviderError(payload?.provider ?? null);
	}

	const clientId = String(payload?.clientId || '').trim() || getDefaultClientId(provider);
	if (!clientId) {
		throw unsupportedProviderError(payload?.provider ?? provider);
	}

	const tenantId = provider === 'microsoft' ? String(payload?.tenantId || '').trim() || 'common' : null;
	const state = randomBytes(16).toString('hex');
	const verifier = randomBytes(48).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const callback =
		provider === 'google'
			? await createLoopbackOAuthCallbackWaiter(state)
			: createProtocolOAuthCallbackWaiter(state, MAIL_OAUTH_REDIRECT_URI);
	const shell = await getElectronShell();

	if (provider === 'google') {
		const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		authUrl.searchParams.set('client_id', clientId);
		authUrl.searchParams.set('redirect_uri', callback.redirectUri);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('scope', GOOGLE_SCOPES);
		authUrl.searchParams.set('access_type', 'offline');
		authUrl.searchParams.set('prompt', 'consent');
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('code_challenge', challenge);
		authUrl.searchParams.set('code_challenge_method', 'S256');
		logger.info(
			'Google OAuth authorize request client_id=%s redirect_uri=%s',
			maskClientId(clientId),
			callback.redirectUri,
		);
		await shell.openExternal(authUrl.toString());

		const code = await callback.waitForCode();
		const tokenBody = new URLSearchParams({
			code,
			client_id: clientId,
			code_verifier: verifier,
			grant_type: 'authorization_code',
			redirect_uri: callback.redirectUri,
		});
		logger.info(
			'Google OAuth token request endpoint=%s content_type=%s body=%s',
			'https://oauth2.googleapis.com/token',
			'application/x-www-form-urlencoded',
			summarizeFormData(tokenBody),
		);
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: tokenBody,
		});
		if (!tokenRes.ok) {
			const description = await safeTokenErrorDescription(tokenRes);
			throw new Error(buildGoogleTokenExchangeError(description, tokenRes.status, clientId));
		}
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
		let profileEmail: string | null = null;
		let displayName: string | null = null;
		if (userRes.ok) {
			const user = (await userRes.json()) as {email?: string; name?: string};
			profileEmail = String(user.email || '').trim() || null;
			displayName = String(user.name || '').trim() || null;
		}
		return {
			provider,
			accessToken,
			refreshToken: String(token.refresh_token || '').trim() || null,
			expiresAt: Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null,
			tokenType: String(token.token_type || '').trim() || null,
			scope: String(token.scope || '').trim() || null,
			email: profileEmail,
			displayName,
			clientId,
			tenantId: null,
		};
	}

	const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenantId || 'common')}`;
	const authUrl = new URL(`${authority}/oauth2/v2.0/authorize`);
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', callback.redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', MICROSOFT_MAIL_SCOPES);
	authUrl.searchParams.set('response_mode', 'query');
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	await shell.openExternal(authUrl.toString());

	const code = await callback.waitForCode();
	const tokenRes = await fetch(`${authority}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: new URLSearchParams({
			client_id: clientId,
			grant_type: 'authorization_code',
			code,
			redirect_uri: callback.redirectUri,
			code_verifier: verifier,
			scope: MICROSOFT_MAIL_SCOPES,
		}),
	});
	if (!tokenRes.ok) {
		const description = await safeTokenErrorDescription(tokenRes);
		throw new Error(buildMicrosoftTokenExchangeError(description, tokenRes.status, clientId, callback.redirectUri));
	}
	const token = (await tokenRes.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};
	const accessToken = String(token.access_token || '').trim();
	if (!accessToken) throw new Error('Microsoft OAuth response did not include an access token.');
	const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
		headers: {Authorization: `Bearer ${accessToken}`},
	});
	let profileEmail: string | null = null;
	let displayName: string | null = null;
	if (profileRes.ok) {
		const profile = (await profileRes.json()) as {mail?: string; userPrincipalName?: string; displayName?: string};
		profileEmail = String(profile.mail || profile.userPrincipalName || '').trim() || null;
		displayName = String(profile.displayName || '').trim() || null;
	}

	return {
		provider,
		accessToken,
		refreshToken: String(token.refresh_token || '').trim() || null,
		expiresAt: Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null,
		tokenType: String(token.token_type || '').trim() || null,
		scope: String(token.scope || '').trim() || null,
		email: profileEmail,
		displayName,
		clientId,
		tenantId: tenantId || null,
	};
}

export async function ensureFreshMailOAuthSession(session: OAuthSession): Promise<OAuthSession> {
	if (!session.expiresAt || !Number.isFinite(Number(session.expiresAt))) return session;
	const expiresAt = Number(session.expiresAt);
	if (Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_MS) return session;
	if (!session.refreshToken?.trim()) return session;
	if (!session.clientId?.trim()) return session;
	return refreshMailOAuthSession(session);
}

function resolveOAuthProvider(provider: string | null, email: string): OAuthProvider | null {
	const key = String(provider || '').toLowerCase();
	if (key.includes('google') || key.includes('gmail') || email.endsWith('@gmail.com')) return 'google';
	if (
		key.includes('outlook') ||
		key.includes('hotmail') ||
		key.includes('office365') ||
		key.includes('microsoft') ||
		email.endsWith('@outlook.com') ||
		email.endsWith('@hotmail.com') ||
		email.endsWith('@live.com')
	) {
		return 'microsoft';
	}
	return null;
}

function getDefaultClientId(provider: OAuthProvider): string {
	if (provider === 'google') return MAIL_GOOGLE_OAUTH_CLIENT_ID;
	return MAIL_MICROSOFT_OAUTH_CLIENT_ID;
}

async function refreshMailOAuthSession(session: OAuthSession): Promise<OAuthSession> {
	if (session.provider === 'google') {
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: new URLSearchParams({
				client_id: session.clientId || '',
				grant_type: 'refresh_token',
				refresh_token: session.refreshToken || '',
			}),
		});
		if (!tokenRes.ok) {
			const description = await safeTokenErrorDescription(tokenRes);
			throw new Error(description || `Google OAuth token refresh failed (${tokenRes.status}).`);
		}
		const token = (await tokenRes.json()) as {
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			token_type?: string;
			scope?: string;
		};
		const accessToken = String(token.access_token || '').trim();
		if (!accessToken) throw new Error('Google token refresh response did not include an access token.');
		return {
			...session,
			accessToken,
			refreshToken: String(token.refresh_token || '').trim() || session.refreshToken || null,
			expiresAt: Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null,
			tokenType: String(token.token_type || '').trim() || session.tokenType || null,
			scope: String(token.scope || '').trim() || session.scope || null,
		};
	}

	const tenantId = String(session.tenantId || '').trim() || 'common';
	const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}`;
	const tokenRes = await fetch(`${authority}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: new URLSearchParams({
			client_id: session.clientId || '',
			grant_type: 'refresh_token',
			refresh_token: session.refreshToken || '',
			scope: MICROSOFT_MAIL_SCOPES,
		}),
	});
	if (!tokenRes.ok) {
		const description = await safeTokenErrorDescription(tokenRes);
		throw new Error(description || `Microsoft OAuth token refresh failed (${tokenRes.status}).`);
	}
	const token = (await tokenRes.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};
	const accessToken = String(token.access_token || '').trim();
	if (!accessToken) throw new Error('Microsoft token refresh response did not include an access token.');
	return {
		...session,
		accessToken,
		refreshToken: String(token.refresh_token || '').trim() || session.refreshToken || null,
		expiresAt: Number.isFinite(Number(token.expires_in)) ? Date.now() + Number(token.expires_in) * 1000 : null,
		tokenType: String(token.token_type || '').trim() || session.tokenType || null,
		scope: String(token.scope || '').trim() || session.scope || null,
	};
}

async function safeTokenErrorDescription(response: Response): Promise<string | null> {
	try {
		const payload = (await response.json()) as {error?: string; error_description?: string};
		const description = String(payload.error_description || payload.error || '').trim();
		if (!description) return null;
		return `${description} (${response.status})`;
	} catch {
		return null;
	}
}

function buildGoogleTokenExchangeError(description: string | null, status: number, clientId: string): string {
	const normalized = String(description || '').toLowerCase();
	if (normalized.includes('client_secret is missing')) {
		return `Google reports this client requires a secret, which means the active client ID is not an installed-app PKCE client. Active client: ${clientId}. Check for LUNAMAIL_GOOGLE_OAUTH_CLIENT_ID env override and use a Desktop app client ID. (${status})`;
	}
	if (normalized.includes('invalid_client')) {
		return `Google OAuth client is invalid for desktop PKCE flow. Use a Google "Desktop app" OAuth client ID (no client secret) or set LUNAMAIL_GOOGLE_OAUTH_CLIENT_ID to one. (${status})`;
	}
	if (normalized.includes('redirect_uri_mismatch')) {
		return 'Google OAuth redirect URI mismatch. For Desktop app credentials, Google requires loopback redirect URIs '
			+ '(http://127.0.0.1:<port>/oauth/callback), not custom app protocols. '
			+ `(${status})`;
	}
	if (normalized.includes('unauthorized_client')) {
		return `Google OAuth client is not authorized for this flow/scopes. Verify Gmail API/OAuth consent config for mail scopes. (${status})`;
	}
	if (description) {
		return `Google OAuth token exchange failed: ${description}`;
	}
	return `Google OAuth token exchange failed (${status}).`;
}

function buildMicrosoftTokenExchangeError(
	description: string | null,
	status: number,
	clientId: string,
	redirectUri: string,
): string {
	const normalized = String(description || '').toLowerCase();
	if (normalized.includes('redirect_uri') || normalized.includes('aadsts50011')) {
		return `Microsoft redirect URI mismatch. Register ${redirectUri} in your Entra app authentication settings. client_id=${clientId} (${status})`;
	}
	if (normalized.includes('public client') || normalized.includes('aadsts7000218')) {
		return `Microsoft app is not configured as public client for PKCE/native flow. Enable mobile/desktop public client flow for client_id=${clientId}. (${status})`;
	}
	if (normalized.includes('consent') || normalized.includes('permission') || normalized.includes('scope')) {
		return `Microsoft scope/consent issue. Ensure delegated permissions for IMAP/SMTP/Calendars/Contacts are granted for client_id=${clientId}. (${status})`;
	}
	if (description) {
		return `Microsoft OAuth token exchange failed: ${description}`;
	}
	return `Microsoft OAuth token exchange failed (${status}).`;
}

const GOOGLE_SCOPES =
	'openid profile email https://mail.google.com/ https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/carddav';
// Azure AD v2 tokens cannot request Graph + Outlook resource scopes together.
const MICROSOFT_MAIL_SCOPES =
	'offline_access openid profile email https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const OAUTH_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const GITHUB_ISSUES_URL = 'https://github.com/wuild/LlamaMail/issues';

function unsupportedProviderError(provider: string | null | undefined): Error {
	const label = String(provider || '').trim() || 'selected provider';
	return new Error(`OAuth sign-in for ${label} is not supported yet. Please report this on GitHub: ${GITHUB_ISSUES_URL}`);
}

async function getElectronShell(): Promise<{openExternal: (url: string) => Promise<void>}> {
	const electron = (await import('electron')) as {shell?: {openExternal: (url: string) => Promise<void>}};
	if (!electron?.shell?.openExternal) {
		throw new Error('Electron shell is unavailable in this process.');
	}
	return electron.shell;
}

async function createOAuthCallbackWaiter(state: string): Promise<{
	redirectUri: string;
	waitForCode: () => Promise<string>;
}> {
	return createLoopbackOAuthCallbackWaiter(state);
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
			finish(new Error('OAuth login timed out after 10 minutes. Please try again.'));
		},
		OAUTH_LOGIN_TIMEOUT_MS,
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

async function createLoopbackOAuthCallbackWaiter(state: string): Promise<{
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
		res.end('LlamaMail account linked successfully. You can close this tab.');
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
			finish(new Error('OAuth login timed out after 10 minutes. Please try again.'));
		},
		OAUTH_LOGIN_TIMEOUT_MS,
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

function isSupportedMailOAuthProtocolUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const redirect = new URL(MAIL_OAUTH_REDIRECT_URI);
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

function summarizeFormData(params: URLSearchParams): string {
	const sensitive = new Set(['code', 'code_verifier', 'refresh_token', 'access_token']);
	const items = Array.from(params.entries()).map(([key, value]) => {
		if (key === 'client_id') return `${key}=${maskClientId(value)}`;
		if (sensitive.has(key)) return `${key}=<redacted:${value.length}>`;
		return `${key}=${value}`;
	});
	return items.join('&');
}

function maskClientId(clientId: string): string {
	const text = String(clientId || '').trim();
	if (!text) return '<empty>';
	if (text.length <= 16) return `${text.slice(0, 4)}...`;
	return `${text.slice(0, 12)}...${text.slice(-12)}`;
}
