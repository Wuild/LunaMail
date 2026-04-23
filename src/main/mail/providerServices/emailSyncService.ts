import {Worker} from 'node:worker_threads';
import {getSqlitePath} from '@main/db/drizzle';
import type {SyncSummary} from '@main/mail/sync';
import type {ProviderEmailSyncService} from '@llamamail/app/providerManager';
import type {ProviderRuntimeDriver} from '@llamamail/app/providerRegistration';
import {ImapWorkerEmailSyncService as ProviderImapWorkerEmailSyncService} from '@llamamail/providers/custom/ImapWorkerEmailSyncService';

export class ImapWorkerEmailSyncService implements ProviderEmailSyncService {
	readonly #service: ProviderImapWorkerEmailSyncService<any, Worker, SyncSummary>;

	constructor(driver: ProviderRuntimeDriver) {
		this.#service = new ProviderImapWorkerEmailSyncService({
			supportsEmails: () => driver.supports('emails'),
			canRunIncrementalSync: () => driver.canRunIncrementalSync(),
			providerKey: () => driver.key(),
			resolveSyncCredentials: async (accountId) => await driver.resolveSyncCredentials(accountId),
			createWorker: (credentials) =>
				new Worker(new URL('../mailSyncWorker', import.meta.url), {
					workerData: {
						dbPath: getSqlitePath(),
						credentials,
					},
				}),
		});
	}

	async syncMailbox(accountId: number, onWorkerReady?: (worker: Worker) => void): Promise<SyncSummary> {
		return await this.#service.syncMailbox(accountId, onWorkerReady);
	}
}
