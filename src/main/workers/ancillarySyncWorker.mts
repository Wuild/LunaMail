import {parentPort, workerData} from 'node:worker_threads';
import {setSqlitePathOverride} from '../db/drizzle.js';
import {providerManager} from '../mail/providers/providerManager.js';
import type {DavSyncOptions} from '@/shared/ipcTypes.js';
import type {ProviderAncillarySyncResult} from '../mail/providers/contracts.js';

type WorkerInput = {
	dbPath: string;
	accountId: number;
	options?: DavSyncOptions | null;
};

type WorkerMessage = {type: 'result'; summary: ProviderAncillarySyncResult} | {type: 'error'; error: string};

async function run(): Promise<void> {
	const payload = workerData as WorkerInput;
	if (!payload?.dbPath) throw new Error('Missing worker dbPath');
	if (!payload?.accountId) throw new Error('Missing worker accountId');
	setSqlitePathOverride(payload.dbPath);

	const ancillarySyncService = await providerManager.resolveAncillarySyncServiceForAccount(payload.accountId);
	const summary = await ancillarySyncService.sync(payload.accountId, payload.options ?? null);
	const message: WorkerMessage = {type: 'result', summary};
	parentPort?.postMessage(message);
}

void run().catch((error: unknown) => {
	const message: WorkerMessage = {
		type: 'error',
		error: (error as any)?.message || String(error),
	};
	parentPort?.postMessage(message);
});
