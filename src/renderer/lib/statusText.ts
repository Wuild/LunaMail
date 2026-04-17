import type {SyncModuleKey} from '@/shared/ipcTypes';

export function toErrorMessage(error: unknown, fallback = 'unknown error'): string {
	if (error && typeof error === 'object' && 'message' in error) {
		const message = String((error as {message?: unknown}).message || '').trim();
		if (message.length > 0) return message;
	}
	const asString = String(error ?? '').trim();
	return asString.length > 0 ? asString : fallback;
}

export function statusNoAccountSelected(): string {
	return 'No account selected.';
}

export function statusSyncing(): string {
	return 'Syncing...';
}

export function statusSyncingMailbox(): string {
	return 'Syncing mailbox...';
}

export function statusSyncStarted(email: string): string {
	return `Sync started for ${email}...`;
}

export function statusSyncFailed(error: unknown): string {
	return `Sync failed: ${toErrorMessage(error)}`;
}

export function statusAutoSyncFailed(error: unknown): string {
	return `Auto-sync failed: ${toErrorMessage(error)}`;
}

export function statusSyncedMessages(count: number): string {
	return `Synced ${Math.max(0, Number(count) || 0)} messages`;
}

export function statusSyncedMailboxAndDav(contacts: number, events: number): string {
	return `Synced mailbox + DAV (${Math.max(0, Number(contacts) || 0)} contacts, ${Math.max(0, Number(events) || 0)} events)`;
}

export function statusSyncCompleteMessages(count: number): string {
	return `Sync complete: ${Math.max(0, Number(count) || 0)} messages`;
}

export function statusSyncCompleteDav(contacts: number, events: number): string {
	return `Sync complete: ${Math.max(0, Number(contacts) || 0)} contacts, ${Math.max(0, Number(events) || 0)} events`;
}

function toModuleLabel(module: SyncModuleKey): string {
	if (module === 'emails') return 'mailbox';
	if (module === 'contacts') return 'contacts';
	if (module === 'calendar') return 'calendar';
	return 'files';
}

export function statusSyncPartial(count: number, failedModules: SyncModuleKey[] | undefined): string {
	const normalizedCount = Math.max(0, Number(count) || 0);
	const modules = Array.isArray(failedModules) ? failedModules : [];
	if (modules.length === 0) {
		return `Synced ${normalizedCount} messages (partial)`;
	}
	const failed = modules.map(toModuleLabel).join(', ');
	return `Synced ${normalizedCount} messages (partial: ${failed} failed)`;
}
