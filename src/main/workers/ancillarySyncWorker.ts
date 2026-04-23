import {parentPort, workerData} from 'node:worker_threads';
import {setSqlitePathOverride} from '../db/drizzle';
import {providerManager} from '../mail/providerManager';
import type {DavSyncOptions} from '@llamamail/app/ipcTypes';
import type {ProviderAncillarySyncResult as BaseProviderAncillarySyncResult} from '@llamamail/app/providerManager';
import type {DavSyncSummary} from '../dav/sync';
import {onDebugLog, type DebugLogEntry} from '../debug/debugLog';

type ProviderAncillarySyncResult = BaseProviderAncillarySyncResult<DavSyncSummary>;

type WorkerInput = {
	dbPath: string;
	accountId: number;
	options?: DavSyncOptions | null;
};

type WorkerMessage =
	| {type: 'result'; summary: ProviderAncillarySyncResult}
	| {type: 'error'; error: string}
	| {type: 'debug-log'; entry: DebugLogEntry};

async function run(): Promise<void> {
	const payload = workerData as WorkerInput;
	if (!payload?.dbPath) throw new Error('Missing worker dbPath');
	if (!payload?.accountId) throw new Error('Missing worker accountId');
	setSqlitePathOverride(payload.dbPath);
	const stopDebugForwarding = onDebugLog((entry) => {
		const message: WorkerMessage = {type: 'debug-log', entry};
		parentPort?.postMessage(message);
	});

	try {
		const ancillarySyncService = await providerManager.resolveAncillarySyncServiceForAccount(payload.accountId);
		const summary = await ancillarySyncService.sync(payload.accountId, payload.options ?? null);
		const message: WorkerMessage = {type: 'result', summary};
		parentPort?.postMessage(message);
	} finally {
		stopDebugForwarding();
	}
}

void run().catch((error: unknown) => {
	const message: WorkerMessage = {
		type: 'error',
		error: (error as any)?.message || String(error),
	};
	parentPort?.postMessage(message);
});
