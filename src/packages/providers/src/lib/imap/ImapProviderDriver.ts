import type {
	ProviderAccountContext,
	ProviderCapability,
	ProviderImapAuth,
	ProviderMailAuthCredentials,
	ProviderSmtpAuth,
	ProviderSyncMetadata,
	ProviderSyncModules,
} from '@llamamail/app/providerDriver';

export interface ImapProviderDriverOptions {
	key: string;
	label: string;
	capabilities: ProviderCapability[];
	resolveSyncCredentials: (accountId: number) => Promise<any>;
}

export class ImapProviderDriver implements ProviderSyncMetadata {
	readonly #options: ImapProviderDriverOptions;
	readonly #capabilities: Set<ProviderCapability>;

	constructor(options: ImapProviderDriverOptions) {
		this.#options = options;
		this.#capabilities = new Set(options.capabilities);
	}

	key(): string {
		return this.#options.key;
	}

	label(): string {
		return this.#options.label;
	}

	supports(capability: ProviderCapability): boolean {
		return this.#capabilities.has(capability);
	}

	resolveSyncModules(account: ProviderAccountContext): ProviderSyncModules {
		const supportsOauthAncillary =
			account.authMethod === 'oauth2' &&
			(account.oauthProvider === 'google' || account.oauthProvider === 'microsoft');
		const requiresPasswordForDav = account.authMethod === 'oauth2' && !supportsOauthAncillary;
		return {
			emails: true,
			contacts: !requiresPasswordForDav,
			calendar: !requiresPasswordForDav,
			files: false,
			reasons: requiresPasswordForDav
				? {
						contacts: 'DAV sync currently requires password/app-password credentials.',
						calendar: 'DAV sync currently requires password/app-password credentials.',
					}
				: {},
		};
	}

	canRunInitialSync(): boolean {
		return true;
	}

	canRunIncrementalSync(): boolean {
		return true;
	}

	supportsRealtimeEvents(): boolean {
		return true;
	}

	supportsPushNotifications(): boolean {
		return true;
	}

	async resolveSyncCredentials(accountId: number): Promise<any> {
		return await this.#options.resolveSyncCredentials(accountId);
	}

	resolveImapAuth(credentials: ProviderMailAuthCredentials): ProviderImapAuth {
		const user = String(credentials.imap_user || credentials.user || '').trim();
		if (!user) throw new Error('IMAP username is missing.');
		if (credentials.auth_method === 'oauth2') {
			const accessToken = String(credentials.oauth_session?.accessToken || '').trim();
			if (!accessToken) throw new Error('OAuth access token is missing.');
			return {user, accessToken};
		}
		const pass = String(credentials.imap_password || credentials.password || '').trim();
		if (!pass) throw new Error('IMAP password is missing.');
		return {user, pass};
	}

	resolveSmtpAuth(credentials: ProviderMailAuthCredentials): ProviderSmtpAuth {
		const user = String(credentials.smtp_user || credentials.user || '').trim();
		if (!user) throw new Error('SMTP username is missing.');
		if (credentials.auth_method === 'oauth2') {
			const accessToken = String(credentials.oauth_session?.accessToken || '').trim();
			if (!accessToken) throw new Error('OAuth access token is missing.');
			return {type: 'OAuth2', user, accessToken};
		}
		const pass = String(credentials.smtp_password || credentials.password || '').trim();
		if (!pass) throw new Error('SMTP password is missing.');
		return {user, pass};
	}
}
