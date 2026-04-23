type WorkerLike = {
	on(event: 'message', listener: (payload: unknown) => void): unknown;
	on(event: 'error', listener: (error: unknown) => void): unknown;
	on(event: 'exit', listener: (code: number) => void): unknown;
	removeAllListeners(): unknown;
};

type WorkerReadyCallback<TWorker extends WorkerLike> = (worker: TWorker) => void;

export interface ImapWorkerEmailSyncServiceOptions<TCredentials, TWorker extends WorkerLike, TSummary> {
	supportsEmails: () => boolean;
	canRunIncrementalSync: () => boolean;
	providerKey: () => string;
	resolveSyncCredentials: (accountId: number) => Promise<TCredentials>;
	createWorker: (credentials: TCredentials) => TWorker;
}

export class ImapWorkerEmailSyncService<TCredentials, TWorker extends WorkerLike, TSummary> {
	readonly #options: ImapWorkerEmailSyncServiceOptions<TCredentials, TWorker, TSummary>;

	constructor(options: ImapWorkerEmailSyncServiceOptions<TCredentials, TWorker, TSummary>) {
		this.#options = options;
	}

	async syncMailbox(accountId: number, onWorkerReady?: WorkerReadyCallback<TWorker>): Promise<TSummary> {
		if (!this.#options.supportsEmails() || !this.#options.canRunIncrementalSync()) {
			throw new Error(`Provider ${this.#options.providerKey()} does not support email sync for account ${accountId}`);
		}

		const credentials = await this.#options.resolveSyncCredentials(accountId);
		const worker = this.#options.createWorker(credentials);
		onWorkerReady?.(worker);

		return await new Promise<TSummary>((resolve, reject) => {
			let settled = false;
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				worker.removeAllListeners();
				fn();
			};

			worker.on('message', (payload: unknown) => {
				if (!payload || typeof payload !== 'object') return;
				const data = payload as {type?: string; summary?: TSummary; error?: string};
				const summary = data.summary;
				if (data.type === 'result' && summary !== undefined) {
					finish(() => resolve(summary));
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
