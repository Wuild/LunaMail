import {ipcMain} from 'electron';
import {parseOptionalPositiveInt, parsePositiveInt, parseRequiredObject} from './validation';

type ComposeIpcDeps = {
	appLogger: {debug: (...args: any[]) => void; info: (...args: any[]) => void};
	sendEmail: (payload: any) => Promise<any>;
	saveDraftEmail: (payload: any) => Promise<any>;
	runSyncAndBroadcast: (accountId: number, source: string) => Promise<any>;
	broadcastAccountSyncStatus: (payload: {
		accountId: number;
		status: 'syncing' | 'done' | 'error';
		error?: string;
		summary?: any;
	}) => void;
	broadcastSendEmailBackgroundStatus: (payload: {
		jobId: string;
		accountId: number;
		phase: 'queued' | 'sending' | 'sent' | 'failed';
		progress: number;
		message: string;
		error?: string | null;
		timestamp: string;
	}) => void;
};

export function registerComposeIpc(deps: ComposeIpcDeps): void {
	ipcMain.handle('send-email', async (_event, payload: any) => {
		const safePayload = parseRequiredObject(payload, 'payload');
		const accountId = parsePositiveInt(safePayload.accountId, 'payload.accountId');
		deps.appLogger.info('IPC send-email accountId=%d toLen=%d', accountId, String(safePayload.to || '').length);
		const result = await deps.sendEmail(safePayload);
		void deps.runSyncAndBroadcast(accountId, 'send').catch((error) => {
			console.warn('Post-send sync failed:', (error as any)?.message || String(error));
		});
		return result;
	});

	ipcMain.handle('save-draft', async (_event, payload: any) => {
		const safePayload = parseRequiredObject(payload, 'payload');
		const accountId = parseOptionalPositiveInt(safePayload.accountId, 'payload.accountId');
		deps.appLogger.debug('IPC save-draft accountId=%s', accountId ?? '');
		const result = await deps.saveDraftEmail(safePayload);
		if (accountId) {
			deps.broadcastAccountSyncStatus({
				accountId,
				status: 'done',
				summary: {
					accountId,
					folders: 0,
					messages: 0,
					newMessages: 0,
					newMessageIds: [],
					newestMessageTarget: null,
				},
			});
		}
		return result;
	});

	ipcMain.handle('send-email-background', async (_event, payload: any) => {
		const safePayload = parseRequiredObject(payload, 'payload');
		const accountId = parsePositiveInt(safePayload.accountId, 'payload.accountId');
		const queuedAt = Date.now();
		const jobId = `send-${queuedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		deps.appLogger.info('IPC send-email-background queued accountId=%d jobId=%s', accountId, jobId);
		deps.broadcastSendEmailBackgroundStatus({
			jobId,
			accountId,
			phase: 'queued',
			progress: 10,
			message: 'Queued email for background send...',
			error: null,
			timestamp: new Date().toISOString(),
		});

		void deps
			.sendEmail(safePayload)
			.then(async () => {
				deps.broadcastSendEmailBackgroundStatus({
					jobId,
					accountId,
					phase: 'sending',
					progress: 70,
					message: 'Sending email...',
					error: null,
					timestamp: new Date().toISOString(),
				});
				await deps.runSyncAndBroadcast(accountId, 'send');
				deps.broadcastSendEmailBackgroundStatus({
					jobId,
					accountId,
					phase: 'sent',
					progress: 100,
					message: 'Email sent successfully.',
					error: null,
					timestamp: new Date().toISOString(),
				});
			})
			.catch((error) => {
				const errorMessage = (error as any)?.message || String(error);
				console.warn('Background send failed:', errorMessage, 'accountId=', accountId, 'jobId=', jobId);
				deps.broadcastSendEmailBackgroundStatus({
					jobId,
					accountId,
					phase: 'failed',
					progress: 100,
					message: 'Background send failed.',
					error: errorMessage,
					timestamp: new Date().toISOString(),
				});
			});

		return {
			ok: true as const,
			queued: true as const,
			jobId,
			queuedAt,
		};
	});
}
