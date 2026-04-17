import type {OAuthProvider} from './ipcTypes.js';

export interface AuthServerOAuthTokenDto {
	provider: OAuthProvider | null;
	accessToken: string;
	refreshToken: string | null;
	expiresInSeconds: number | null;
	tokenType: string | null;
	scope: string | null;
	email: string | null;
	displayName: string | null;
	version: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid AuthServer payload format');
	}
	return value as Record<string, unknown>;
}

function readText(record: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return null;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
	for (const key of keys) {
		const value = record[key];
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) continue;
		return Math.max(0, Math.floor(parsed));
	}
	return null;
}

function readProvider(record: Record<string, unknown>, required: boolean): OAuthProvider | null {
	const provider = readText(record, 'provider');
	if (provider === 'google' || provider === 'microsoft') return provider;
	if (!required) return null;
	throw new Error('Invalid AuthServer provider');
}

function parseTokenDto(input: unknown, requiredProvider: boolean): AuthServerOAuthTokenDto {
	const record = asRecord(input);
	const accessToken = readText(record, 'accessToken', 'access_token');
	if (!accessToken) {
		throw new Error('Invalid AuthServer access token');
	}

	return {
		provider: readProvider(record, requiredProvider),
		accessToken,
		refreshToken: readText(record, 'refreshToken', 'refresh_token'),
		expiresInSeconds: readNumber(record, 'expiresIn', 'expires_in'),
		tokenType: readText(record, 'tokenType', 'token_type'),
		scope: readText(record, 'scope'),
		email: readText(record, 'email'),
		displayName: readText(record, 'displayName', 'display_name'),
		version: readText(record, 'version', 'schemaVersion', 'schema_version'),
	};
}

export function parseAuthServerExchangeDto(input: unknown): AuthServerOAuthTokenDto {
	return parseTokenDto(input, true);
}

export function parseAuthServerRefreshDto(input: unknown): AuthServerOAuthTokenDto {
	return parseTokenDto(input, false);
}

export function extractAuthServerErrorMessage(input: unknown, fallback: string): string {
	try {
		const record = asRecord(input);
		return (
			readText(record, 'error_description', 'errorDescription', 'message', 'error', 'detail', 'description') ||
			fallback
		);
	} catch {
		return fallback;
	}
}
