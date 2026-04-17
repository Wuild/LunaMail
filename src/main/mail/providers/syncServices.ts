import {Worker} from 'node:worker_threads';
import {getSqlitePath} from '@main/db/drizzle.js';
import type {SyncSummary} from '@main/mail/sync.js';
import type {
	MailProviderDriver,
	ProviderEmailSyncService,
	WorkerReadyCallback,
} from './contracts.js';

export class ImapWorkerEmailSyncService implements ProviderEmailSyncService {
	readonly #driver: MailProviderDriver;

	constructor(driver: MailProviderDriver) {
		this.#driver = driver;
	}

	async syncMailbox(accountId: number, onWorkerReady?: WorkerReadyCallback): Promise<SyncSummary> {
		if (!this.#driver.supports('emails') || !this.#driver.canRunIncrementalSync()) {
			throw new Error(`Provider ${this.#driver.key()} does not support email sync for account ${accountId}`);
		}

		const credentials = await this.#driver.resolveSyncCredentials(accountId);
		const worker = new Worker(new URL('../../workers/mailSyncWorker.mjs', import.meta.url), {
			workerData: {
				dbPath: getSqlitePath(),
				credentials,
			},
		});
		onWorkerReady?.(worker);

		return await new Promise<SyncSummary>((resolve, reject) => {
			let settled = false;
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				worker.removeAllListeners();
				fn();
			};

			worker.on('message', (payload: unknown) => {
				if (!payload || typeof payload !== 'object') return;
				const data = payload as {type?: string; summary?: SyncSummary; error?: string};
				if (data.type === 'result' && data.summary) {
					finish(() => resolve(data.summary as SyncSummary));
					return;
				}
				if (data.type === 'error') {
					finish(() => reject(new Error(data.error || 'Mailbox sync worker failed')));
				}
			});

			worker.on('error', (error) => {
				finish(() => reject(error));
			});

			worker.on('exit', (code) => {
				if (settled) return;
				if (code === 0) {
					finish(() => reject(new Error('Mailbox sync worker exited without result')));
					return;
				}
				finish(() => reject(new Error(`Mailbox sync worker exited with code ${code}`)));
			});
		});
	}
}
