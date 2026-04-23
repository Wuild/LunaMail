import type {AuthMethod, OAuthProvider, OAuthSession} from './ipcTypes';

export type ProviderCapability = 'emails' | 'contacts' | 'calendar' | 'files';

export interface ProviderAccountContext {
	id: number;
	provider: string | null;
	oauthProvider: OAuthProvider | null;
	authMethod: AuthMethod;
}

export interface ProviderSyncModules {
	emails: boolean;
	contacts: boolean;
	calendar: boolean;
	files: boolean;
	reasons: Partial<Record<ProviderCapability, string>>;
}

export interface ProviderSyncMetadata {
	canRunInitialSync(): boolean;
	canRunIncrementalSync(): boolean;
	supportsRealtimeEvents(): boolean;
	supportsPushNotifications(): boolean;
}

export interface ProviderMailAuthCredentials {
	id: number;
	user: string;
	auth_method: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	password: string | null;
	oauth_session: OAuthSession | null;
}

export type ProviderImapAuth = {
	user: string;
	pass?: string;
	accessToken?: string;
};

export type ProviderSmtpAuth =
	| {user: string; pass: string}
	| {type: 'OAuth2'; user: string; accessToken: string};
