import type {AuthMethod, OAuthProvider, OAuthSession} from '@/shared/ipcTypes.js';

export type MailAuthCredentials = {
	user: string;
	auth_method: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	password: string | null;
	oauth_session: OAuthSession | null;
};

export function resolveImapAuth(credentials: MailAuthCredentials): {user: string; pass?: string; accessToken?: string} {
	if (credentials.auth_method === 'oauth2') {
		const accessToken = String(credentials.oauth_session?.accessToken || '').trim();
		if (!accessToken) throw new Error('OAuth access token is missing.');
		return {user: credentials.user, accessToken};
	}
	const pass = String(credentials.password || '').trim();
	if (!pass) throw new Error('Password is missing.');
	return {user: credentials.user, pass};
}

export function resolveSmtpAuth(
	credentials: MailAuthCredentials,
): {user: string; pass: string} | {type: 'OAuth2'; user: string; accessToken: string} {
	if (credentials.auth_method === 'oauth2') {
		const accessToken = String(credentials.oauth_session?.accessToken || '').trim();
		if (!accessToken) throw new Error('OAuth access token is missing.');
		return {type: 'OAuth2', user: credentials.user, accessToken};
	}
	const pass = String(credentials.password || '').trim();
	if (!pass) throw new Error('Password is missing.');
	return {user: credentials.user, pass};
}
