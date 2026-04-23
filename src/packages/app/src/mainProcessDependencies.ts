import type {AuthMethod, OAuthProvider, OAuthSession} from './ipcTypes';

export interface ProviderAccountSyncCredentials {
	id: number;
	email: string;
	auth_method: AuthMethod;
	oauth_provider: OAuthProvider | null;
	imap_host: string;
	imap_port: number;
	imap_secure: number;
	user: string;
	password: string | null;
	oauth_session: OAuthSession | null;
}

export interface ProviderMainProcessDependencies {
	getAccountSyncCredentials(accountId: number): Promise<ProviderAccountSyncCredentials>;
}

let providerMainProcessDependencies: ProviderMainProcessDependencies | null = null;

export function configureProviderMainProcessDependencies(dependencies: ProviderMainProcessDependencies): void {
	providerMainProcessDependencies = dependencies;
}

export function getProviderMainProcessDependencies(): ProviderMainProcessDependencies {
	if (!providerMainProcessDependencies) {
		throw new Error('Provider main-process dependencies are not configured.');
	}
	return providerMainProcessDependencies;
}
