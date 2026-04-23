import {getAccounts, getAccountSyncCredentials} from '@main/db/repositories/accountsRepo';
import type {DavSyncSummary} from '@main/dav/sync';
import type {SyncSummary} from '@main/mail/sync';
import type {Worker} from 'node:worker_threads';
import {
	configureProviderMainProcessDependencies,
	ProviderManager,
	type ProviderManagerDependencies,
} from '@llamamail/app';
import type {ProviderDriverRegistration} from '@llamamail/app/providerRegistration';
import type {ProviderRuntimeDriver} from '@llamamail/app/providerRegistration';
import {getProviderDriverRegistrations} from '@llamamail/providers/registrations';
import {ImapWorkerEmailSyncService} from './providerServices/emailSyncService';
import {DavAncillarySyncService, OAuthApiAncillarySyncService} from './providerServices/ancillarySyncService';

configureProviderMainProcessDependencies({
	getAccountSyncCredentials: async (accountId) => await getAccountSyncCredentials(accountId),
});

const dependencies: ProviderManagerDependencies<SyncSummary, Worker, DavSyncSummary> = {
	getAccounts: async () => await getAccounts(),
	discoverProviderDriverRegistrations: async () => getProviderDriverRegistrations(),
	createEmailSyncService: (_registration: ProviderDriverRegistration, driver: ProviderRuntimeDriver) =>
		new ImapWorkerEmailSyncService(driver),
	createAncillarySyncService: (registration: ProviderDriverRegistration, driver: ProviderRuntimeDriver) => {
		if (registration.key === 'google' || registration.key === 'microsoft') {
			return new OAuthApiAncillarySyncService(driver, registration.key);
		}
		return new DavAncillarySyncService(driver);
	},
};

export const providerManager = new ProviderManager<SyncSummary, Worker, DavSyncSummary>(dependencies);
