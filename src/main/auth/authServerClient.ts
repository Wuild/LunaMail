import {AUTH_SERVER_BASE_URL, AUTH_SERVER_MAX_RETRIES, AUTH_SERVER_TIMEOUT_MS} from '@/shared/authServerConfig.js';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {
	extractAuthServerErrorMessage,
	parseAuthServerExchangeDto,
	parseAuthServerRefreshDto,
	type AuthServerOAuthTokenDto,
} from '@/shared/authServerTypes.js';
import type {OAuthProvider, OAuthSession} from '@/shared/ipcTypes.js';

const logger = createMailDebugLogger('app', 'auth-server-client');
const REQUEST_TIMEOUT_MS = Number.isFinite(AUTH_SERVER_TIMEOUT_MS) ? Math.max(1_000, AUTH_SERVER_TIMEOUT_MS) : 8_000;
const MAX_RETRIES = Number.isFinite(AUTH_SERVER_MAX_RETRIES) ? Math.max(0, Math.floor(AUTH_SERVER_MAX_RETRIES)) : 1;

export class AuthServerClientError extends Error {
	status: number | null;
	retryable: boolean;
	causePayload: unknown;

	constructor(message: string, options: {status?: number | null; retryable?: boolean; causePayload?: unknown} = {}) {
		super(message);
		this.name = 'AuthServerClientError';
		this.status = options.status ?? null;
		this.retryable = options.retryable ?? false;
		this.causePayload = options.causePayload;
	}
}

function shouldRetryError(error: unknown): boolean {
	if (!(error instanceof AuthServerClientError)) return true;
	if (error.retryable) return true;
	return error.status === null;
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAuthServerUrl(path: string): string {
	const base = AUTH_SERVER_BASE_URL.endsWith('/') ? AUTH_SERVER_BASE_URL : `${AUTH_SERVER_BASE_URL}/`;
	const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
	return new URL(normalizedPath, base).toString();
}

async function requestJson(path: string, init: RequestInit, label: string): Promise<unknown> {
	const url = buildAuthServerUrl(path);
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(url, {
				...init,
				signal: controller.signal,
				headers: {
					Accept: 'application/json',
					...(init.headers || {}),
				},
			});
			const text = await response.text();
			const payload = text ? JSON.parse(text) : null;

			if (!response.ok) {
				const message = extractAuthServerErrorMessage(payload, `AuthServer ${label} failed`);
				throw new AuthServerClientError(message, {
					status: response.status,
					retryable: isRetryableStatus(response.status),
					causePayload: payload,
				});
			}
			return payload;
		} catch (error) {
			const canRetry = attempt < MAX_RETRIES && shouldRetryError(error);
			if (!canRetry) {
				if (error instanceof AuthServerClientError) throw error;
				throw new AuthServerClientError(`AuthServer ${label} request failed`, {
					status: null,
					retryable: false,
					causePayload: error,
				});
			}

			const backoffMs = Math.min(2_000, 200 * 2 ** attempt);
			logger.warn(
				'Retrying AuthServer %s request attempt=%d/%d waitMs=%d',
				label,
				attempt + 1,
				MAX_RETRIES + 1,
				backoffMs,
			);
			await sleep(backoffMs);
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new AuthServerClientError(`AuthServer ${label} request failed`);
}

type MailOAuthStartOptions = {
	additionalScopes?: string[];
};

export function buildMailOAuthStartUrl(
	provider: OAuthProvider,
	redirectTo: string,
	options: MailOAuthStartOptions = {},
): string {
	const url = new URL(buildAuthServerUrl(`/api/auth/${provider}/start`));
	url.searchParams.set('redirect_to', redirectTo);
	const normalizedAdditionalScopes = Array.from(
		new Set((options.additionalScopes ?? []).map((value) => String(value || '').trim()).filter(Boolean)),
	);
	if (normalizedAdditionalScopes.length > 0) {
		url.searchParams.set('scopes', normalizedAdditionalScopes.join(' '));
		for (const scope of normalizedAdditionalScopes) {
			url.searchParams.append('scope', scope);
		}
		url.searchParams.set('include_cloud_scopes', '1');
	}
	return url.toString();
}

export async function exchangeMailOAuthCode(code: string): Promise<AuthServerOAuthTokenDto> {
	const payload = await requestJson(
		'/api/auth/exchange',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({code}),
		},
		'exchange',
	);
	return parseAuthServerExchangeDto(payload);
}

export async function refreshMailOAuthSession(session: OAuthSession): Promise<AuthServerOAuthTokenDto> {
	return refreshMailOAuthSessionWithOptions(session, {});
}

type RefreshMailOAuthSessionOptions = {
	additionalScopes?: string[];
	replaceExistingScopes?: boolean;
};

function normalizeScopeList(scopes: Array<string | null | undefined>): string[] {
	const values: string[] = [];
	for (const scopeEntry of scopes) {
		const raw = String(scopeEntry || '').trim();
		if (!raw) continue;
		const splitValues = raw
			.split(/\s+/)
			.map((value) => value.trim())
			.filter(Boolean);
		for (const value of splitValues) values.push(value);
	}
	return Array.from(new Set(values));
}

export async function refreshMailOAuthSessionWithOptions(
	session: OAuthSession,
	options: RefreshMailOAuthSessionOptions = {},
): Promise<AuthServerOAuthTokenDto> {
	const requestedScopes = options.replaceExistingScopes
		? normalizeScopeList(options.additionalScopes ?? [])
		: normalizeScopeList([session.scope, ...(options.additionalScopes ?? [])]);
	const refreshBody: Record<string, unknown> = {
		provider: session.provider,
		refreshToken: session.refreshToken,
		refresh_token: session.refreshToken,
		accessToken: session.accessToken,
		expiresAt: session.expiresAt,
		tokenType: session.tokenType,
	};
	if (session.provider === 'microsoft') {
		// Microsoft refresh supports explicit scope selection. Google refresh is safer without scope overrides.
		refreshBody.scope = requestedScopes.join(' ') || session.scope;
		refreshBody.scopes = requestedScopes;
	}
	const payload = await requestJson(
		'/api/auth/refresh',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(refreshBody),
		},
		'refresh',
	);
	return parseAuthServerRefreshDto(payload);
}

export async function revokeMailOAuthSession(session: OAuthSession): Promise<void> {
	await requestJson(
		'/api/auth/revoke',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				provider: session.provider,
				accessToken: session.accessToken,
				access_token: session.accessToken,
				refreshToken: session.refreshToken,
				refresh_token: session.refreshToken,
			}),
		},
		'revoke',
	);
}
