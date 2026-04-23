export type ReconnectKind = 'mail' | 'cloud';

export type ReconnectRequest = {
	kind: ReconnectKind;
	accountId: number;
	reason: string;
};

export const RECONNECT_REQUIRED_EVENT = 'llamamail:reconnect-required';

export function emitReconnectRequired(request: ReconnectRequest): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent<ReconnectRequest>(RECONNECT_REQUIRED_EVENT, {detail: request}));
}

export function isReconnectRequiredMessage(message: string): boolean {
	const normalized = String(message || '').toLowerCase();
	return (
		normalized.includes('please reconnect this account') ||
		normalized.includes('reconnect this account') ||
		normalized.includes('access_token_scope_insufficient') ||
		normalized.includes('insufficient authentication scopes') ||
		normalized.includes('oauth access token missing') ||
		normalized.includes('session expired') ||
		normalized.includes('token has been expired or revoked') ||
		normalized.includes('invalid_grant')
	);
}
