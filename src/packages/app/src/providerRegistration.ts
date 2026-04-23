import type {AuthMethod, ProviderCapabilities, ProviderDriverCatalogItem, ProviderDriverSyncMetadata, ProviderLogoKey} from './ipcTypes';
import type {ProviderAccountContext, ProviderCapability, ProviderImapAuth, ProviderMailAuthCredentials, ProviderSmtpAuth, ProviderSyncMetadata, ProviderSyncModules} from './providerDriver';
import type {ProviderAccountSyncCredentials} from './mainProcessDependencies';

export interface ProviderRuntimeDriver extends ProviderSyncMetadata {
	key(): string;
	label(): string;
	supports(capability: ProviderCapability): boolean;
	resolveSyncModules(account: ProviderAccountContext): ProviderSyncModules;
	resolveSyncCredentials(accountId: number): Promise<ProviderAccountSyncCredentials>;
	resolveImapAuth(credentials: ProviderMailAuthCredentials): ProviderImapAuth;
	resolveSmtpAuth(credentials: ProviderMailAuthCredentials): ProviderSmtpAuth;
}

export interface ProviderDriverRegistration {
	key: string;
	label: string;
	logo: ProviderLogoKey;
	enabled: boolean;
	capabilities: ProviderCapabilities;
	sync: ProviderDriverSyncMetadata;
	recommendedAuthMethod: AuthMethod;
	supportedAuthMethods: AuthMethod[];
	createDriver(): ProviderRuntimeDriver;
}

export type ProviderDriverCatalogEntry = Pick<
	ProviderDriverCatalogItem,
	'key' | 'label' | 'logo' | 'enabled' | 'capabilities' | 'sync' | 'recommendedAuthMethod' | 'supportedAuthMethods'
>;
