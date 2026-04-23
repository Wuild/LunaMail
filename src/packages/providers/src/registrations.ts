import {getProviderMainProcessDependencies} from '@llamamail/app/mainProcessDependencies';
import {getUnifiedProviderDefinition} from '@llamamail/app/providerCatalog';
import type {ProviderDriverRegistration} from '@llamamail/app/providerRegistration';
import {ImapProviderDriver} from './drivers/custom/ImapProviderDriver';

function buildImapRegistration(providerKey: 'custom' | 'google' | 'microsoft' | 'icloud', label: string): ProviderDriverRegistration {
	const definition = getUnifiedProviderDefinition(providerKey);
	if (!definition) {
		throw new Error(`Missing provider definition for ${providerKey}.`);
	}
	return {
		key: definition.key,
		label: definition.label,
		logo: definition.logo,
		enabled: definition.enabled,
		capabilities: definition.capabilities,
		sync: {
			canRunInitialSync: true,
			canRunIncrementalSync: true,
			supportsRealtimeEvents: true,
			supportsPushNotifications: true,
		},
		recommendedAuthMethod: definition.recommendedAuthMethod,
		supportedAuthMethods: definition.supportedAuthMethods,
		createDriver: () =>
			new ImapProviderDriver({
				key: providerKey,
				label,
				capabilities: ['emails', 'contacts', 'calendar'],
				resolveSyncCredentials: async (accountId) =>
					await getProviderMainProcessDependencies().getAccountSyncCredentials(accountId),
			}),
	};
}

export function getProviderDriverRegistrations(): ProviderDriverRegistration[] {
	return [
		buildImapRegistration('custom', 'IMAP'),
		buildImapRegistration('google', 'Google (IMAP)'),
		buildImapRegistration('microsoft', 'Microsoft (IMAP)'),
		buildImapRegistration('icloud', 'iCloud (IMAP)'),
	];
}
