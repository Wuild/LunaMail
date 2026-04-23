import type {AuthMethod, ProviderCapabilities, ProviderLogoKey} from './ipcTypes';

export type UnifiedProviderKey = 'custom' | 'google' | 'microsoft' | 'nextcloud' | 'icloud';

export interface UnifiedProviderDefinition {
	key: UnifiedProviderKey;
	label: string;
	logo: ProviderLogoKey;
	enabled: boolean;
	capabilities: ProviderCapabilities;
	recommendedAuthMethod: AuthMethod;
	supportedAuthMethods: AuthMethod[];
	cloudAliases: string[];
}

export const PROVIDER_CATALOG: Record<UnifiedProviderKey, UnifiedProviderDefinition> = {
	custom: {
		key: 'custom',
		label: 'IMAP',
		logo: 'mail',
		enabled: true,
		capabilities: {emails: true, contacts: true, calendar: true, files: false},
		recommendedAuthMethod: 'password',
		supportedAuthMethods: ['password', 'app_password'],
		cloudAliases: [],
	},
	google: {
		key: 'google',
		label: 'Google',
		logo: 'google',
		enabled: true,
		capabilities: {emails: true, contacts: true, calendar: true, files: true},
		recommendedAuthMethod: 'oauth2',
		supportedAuthMethods: ['oauth2', 'app_password'],
		cloudAliases: ['google-drive'],
	},
	microsoft: {
		key: 'microsoft',
		label: 'Microsoft',
		logo: 'microsoft',
		enabled: true,
		capabilities: {emails: true, contacts: true, calendar: true, files: true},
		recommendedAuthMethod: 'oauth2',
		supportedAuthMethods: ['oauth2', 'app_password'],
		cloudAliases: ['onedrive'],
	},
	nextcloud: {
		key: 'nextcloud',
		label: 'Nextcloud',
		logo: 'mail',
		enabled: true,
		capabilities: {emails: false, contacts: false, calendar: false, files: true},
		recommendedAuthMethod: 'password',
		supportedAuthMethods: ['password', 'app_password'],
		cloudAliases: ['webdav'],
	},
	icloud: {
		key: 'icloud',
		label: 'iCloud',
		logo: 'mail',
		enabled: false,
		capabilities: {emails: true, contacts: true, calendar: true, files: false},
		recommendedAuthMethod: 'app_password',
		supportedAuthMethods: ['app_password'],
		cloudAliases: ['icloud-drive'],
	},
};

export function getUnifiedProviderDefinition(providerKey: string): UnifiedProviderDefinition | null {
	const normalized = String(providerKey || '')
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	const direct = PROVIDER_CATALOG[normalized as UnifiedProviderKey];
	if (direct) return direct;
	return Object.values(PROVIDER_CATALOG).find((entry) => entry.cloudAliases.includes(normalized)) ?? null;
}

export function resolveUnifiedProviderKey(providerKey: string): UnifiedProviderKey | null {
	return getUnifiedProviderDefinition(providerKey)?.key ?? null;
}
