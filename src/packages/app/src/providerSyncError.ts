import type {ProviderErrorCategory, ProviderSyncError} from './ipcTypes';

function toMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return String(error || 'Unknown sync error');
}

function toCode(error: unknown): string | null {
	if (!error || typeof error !== 'object') return null;
	const value = (error as {code?: unknown; status?: unknown}).code ?? (error as {status?: unknown}).status;
	if (value === null || value === undefined) return null;
	const text = String(value).trim();
	return text || null;
}

function classifyCategory(message: string): ProviderErrorCategory {
	const text = message.toLowerCase();
	if (/cancel/.test(text)) return 'cancelled';
	if (/refresh token|token.*expired|oauth.*refresh/.test(text)) return 'renewal';
	if (/authentication|auth failed|invalid credentials|login failed|not authenticated|password/.test(text))
		return 'auth';
	if (/timeout|timed out|etimedout|econnaborted/.test(text)) return 'timeout';
	if (/rate limit|too many requests|429/.test(text)) return 'rate_limit';
	if (/validation|invalid payload|invalid input|missing required/.test(text)) return 'validation';
	if (/partial sync|partial success/.test(text)) return 'partial_sync';
	if (/provider|api|http|request failed|service unavailable|bad gateway|502|503|504/.test(text))
		return 'provider_api';
	return 'unknown';
}

function isRetryable(category: ProviderErrorCategory): boolean {
	return category === 'timeout' || category === 'rate_limit' || category === 'provider_api';
}

export function normalizeProviderSyncError(error: unknown): ProviderSyncError {
	const message = toMessage(error);
	const category = classifyCategory(message);
	return {
		category,
		message,
		retryable: isRetryable(category),
		code: toCode(error),
	};
}
