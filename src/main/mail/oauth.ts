import {randomBytes} from 'node:crypto';
import type {OAuthProvider, OAuthSession} from '@/shared/ipcTypes.js';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {addAccount} from '../db/repositories/accountsRepo.js';
import {
	AuthServerClientError,
	buildMailOAuthStartUrl,
	exchangeMailOAuthCode,
	refreshMailOAuthSession,
} from '@main/auth/authServerClient.js';

const logger = createMailDebugLogger('app', 'mail:oauth');
const OAUTH_LOGIN_TIMEOUT_MS = 2 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type StartMailOAuthPayload = {
	email?: string | null;
	provider?: string | null;
	clientId?: string | null;
	tenantId?: string | null;
};

type PendingOAuthRequest = {
	resolve: (value: OAuthSession) => void;
	reject: (reason?: unknown) => void;
	timeout: NodeJS.Timeout;
	fallbackEmail: string | null;
};

const pendingOAuthRequests = new Map<string, PendingOAuthRequest>();

function getImapHost(provider: 'google' | 'microsoft'): string {
	return provider === 'google' ? 'imap.gmail.com' : 'outlook.office365.com';
}

function getSmtpHost(provider: 'google' | 'microsoft'): string {
	return provider === 'google' ? 'smtp.gmail.com' : 'smtp.office365.com';
}

async function getElectronShell(): Promise<{ openExternal: (url: string) => Promise<void> }> {
	const electron = (await import('electron')) as {
		shell?: {openExternal: (url: string) => Promise<void>};
	};

	if (!electron?.shell?.openExternal) {
		throw new Error('Electron shell unavailable');
	}

	return electron.shell;
}

async function saveOAuthAccount(session: OAuthSession) {
	const normalizedEmail = String(session.email || '').trim();
	await addAccount({
		display_name: session.displayName || '',
		email: normalizedEmail,
		provider: session.provider,
		auth_method: 'oauth2',
		oauth_provider: session.provider,
		user: normalizedEmail,

		imap_host: getImapHost(session.provider),
		imap_port: 993,
		imap_secure: 1,

		smtp_host: getSmtpHost(session.provider),
		smtp_port: 587,
		smtp_secure: 0,

		oauth_session: session,
	});
}

async function exchangeBrokerCode(code: string): Promise<OAuthSession> {
	const payload = await exchangeMailOAuthCode(code);
	if (!payload.provider) {
		throw new Error('OAuth exchange response is missing provider.');
	}

	return {
		provider: payload.provider,
		accessToken: payload.accessToken,
		refreshToken: payload.refreshToken,
		expiresAt: payload.expiresInSeconds ? Date.now() + payload.expiresInSeconds * 1000 : null,
		tokenType: payload.tokenType,
		scope: payload.scope,
		email: payload.email,
		displayName: payload.displayName,
		clientId: null,
		tenantId: null,
	};
}

async function resolveOAuthCallback(rawUrl: string) {
	const url = new URL(rawUrl);
	const requestId = url.searchParams.get('request_id');
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	logger.info(
		'Parsed callback code=%s error=%s',
		code ? 'yes' : 'no',
		error || 'none',
	);

	if (!requestId) return;

	const pending = pendingOAuthRequests.get(requestId);
	if (!pending) return;

	try {
		if (error) throw new Error(error);
		if (!code) throw new Error('Missing exchange code');

		const session = await exchangeBrokerCode(code);
		const sessionEmail = String(session.email || '').trim();
		const fallbackEmail = String(pending.fallbackEmail || '').trim();
		const resolvedEmail = sessionEmail || fallbackEmail || null;
		const resolvedSession: OAuthSession = {
			...session,
			email: resolvedEmail,
		};
		if (!resolvedSession.email) {
			throw new Error('OAuth account email is missing in callback response.');
		}
		await saveOAuthAccount(resolvedSession);

		clearTimeout(pending.timeout);
		pendingOAuthRequests.delete(requestId);
		pending.resolve(resolvedSession);
	} catch (err) {
		clearTimeout(pending.timeout);
		pendingOAuthRequests.delete(requestId);
		pending.reject(err);
	}
}

export function queueMailOAuthCallbackUrl(url: string): boolean {
	if (!/^llamamail:\/\/oauth\/callback/i.test(url)) {
		return false;
	}
	logger.info('OAuth callback received url=%s', url);
	void resolveOAuthCallback(url);
	return true;
}

export async function startMailOAuth(
	payload: StartMailOAuthPayload
): Promise<OAuthSession> {
	const provider = (payload.provider === 'microsoft'
		? 'microsoft'
		: 'google') as OAuthProvider;

	const requestId = randomBytes(16).toString('hex');
	const redirectTo = `llamamail://oauth/callback?request_id=${encodeURIComponent(requestId)}`;
	const authUrl = buildMailOAuthStartUrl(provider, redirectTo);

	logger.info('Opening broker auth provider=%s', provider);

	let resolveFn!: (value: OAuthSession) => void;
	let rejectFn!: (reason?: unknown) => void;

	const promise = new Promise<OAuthSession>((resolve, reject) => {
		resolveFn = resolve;
		rejectFn = reject;
	});

	const timeout = setTimeout(() => {
		pendingOAuthRequests.delete(requestId);
		rejectFn(new Error('OAuth login timed out'));
	}, OAUTH_LOGIN_TIMEOUT_MS);

	pendingOAuthRequests.set(requestId, {
		resolve: resolveFn,
		reject: rejectFn,
		timeout,
		fallbackEmail: String(payload.email || '').trim() || null,
	});
	logger.info('Starting OAuth provider=%s url=%s', provider, authUrl);
	const shell = await getElectronShell();
	await shell.openExternal(authUrl);

	return promise;
}

export function cancelPendingMailOAuth(reason = 'OAuth login cancelled'): number {
	const entries = Array.from(pendingOAuthRequests.entries());
	for (const [requestId, pending] of entries) {
		clearTimeout(pending.timeout);
		pending.reject(new Error(reason));
		pendingOAuthRequests.delete(requestId);
	}
	if (entries.length > 0) {
		logger.info('Cancelled pending OAuth requests count=%d', entries.length);
	}
	return entries.length;
}

export async function ensureFreshMailOAuthSession(
	session: OAuthSession
): Promise<OAuthSession> {
	if (!session.expiresAt) return session;
	if (Date.now() < session.expiresAt - TOKEN_REFRESH_BUFFER_MS) return session;
	if (!session.refreshToken) return session;

	try {
		const refreshed = await refreshMailOAuthSession(session);
		return {
			...session,
			provider: refreshed.provider ?? session.provider,
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken || session.refreshToken,
			expiresAt: refreshed.expiresInSeconds ? Date.now() + refreshed.expiresInSeconds * 1000 : null,
			tokenType: refreshed.tokenType || session.tokenType,
			scope: refreshed.scope || session.scope,
			email: refreshed.email || session.email,
			displayName: refreshed.displayName || session.displayName,
		};
	} catch (error) {
		if (error instanceof AuthServerClientError) {
			logger.warn(
				'AuthServer refresh failed provider=%s status=%s message=%s',
				session.provider,
				String(error.status ?? 'none'),
				error.message,
			);
		}
		throw error;
	}
}
