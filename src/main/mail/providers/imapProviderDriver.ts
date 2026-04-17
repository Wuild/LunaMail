import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo.js';
import type {
	MailProviderDriver,
	ProviderAccountContext,
	ProviderCapability,
	ProviderSyncModules,
} from './contracts.js';

export interface ImapProviderDriverOptions {
	key: string;
	label: string;
	capabilities: ProviderCapability[];
}

export class ImapProviderDriver implements MailProviderDriver {
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

	async resolveSyncCredentials(accountId: number) {
		return await getAccountSyncCredentials(accountId);
	}
}
