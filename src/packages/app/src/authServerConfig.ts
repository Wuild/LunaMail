import {loadRuntimeEnvOnce} from './runtimeEnv.js';

loadRuntimeEnvOnce();

const DEFAULT_AUTH_SERVER_BASE_URL = 'https://llama.voracious.se';

function readRuntimeEnv(name: string): string | undefined {
	return process.env[`LLAMA_${name}`] ?? process.env[`LUNAMAIL_${name}`];
}

function parseNumberSetting(raw: string | undefined, fallback: number): number {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return value;
}

function normalizeAuthServerBaseUrl(raw: string | undefined): string {
	const input = String(raw || '').trim();
	const source = input || DEFAULT_AUTH_SERVER_BASE_URL;
	const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(source) ? source : `https://${source}`;
	return withProtocol.replace(/\/+$/, '');
}

export const AUTH_SERVER_BASE_URL = normalizeAuthServerBaseUrl(readRuntimeEnv('AUTH_SERVER_BASE_URL'));
export const AUTH_SERVER_TIMEOUT_MS = parseNumberSetting(readRuntimeEnv('AUTH_SERVER_TIMEOUT_MS'), 8000);
export const AUTH_SERVER_MAX_RETRIES = parseNumberSetting(readRuntimeEnv('AUTH_SERVER_MAX_RETRIES'), 1);
