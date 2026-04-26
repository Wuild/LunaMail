import type {SyncModuleKey} from '@llamamail/app/ipcTypes';
import {t} from '@llamamail/app/i18n/renderer';

export function toErrorMessage(error: unknown, fallback?: string): string {
	if (error && typeof error === 'object' && 'message' in error) {
		const message = String((error as {message?: unknown}).message || '').trim();
		if (message.length > 0) return message;
	}
	const asString = String(error ?? '').trim();
	return asString.length > 0 ? asString : (fallback ?? t('status.error.unknown'));
}

export function statusNoAccountSelected(): string {
	return t('status.no_account_selected');
}

export function statusSyncing(): string {
	return t('status.syncing');
}

export function statusSyncingMailbox(): string {
	return t('status.syncing_mailbox');
}

export function statusSyncStarted(email: string): string {
	return t('status.sync_started_for', {email});
}

export function statusSyncFailed(error: unknown): string {
	return t('status.sync_failed', {error: toErrorMessage(error)});
}

export function statusAutoSyncFailed(error: unknown): string {
	return t('status.auto_sync_failed', {error: toErrorMessage(error)});
}

export function statusSyncedMessages(count: number): string {
	return t('status.synced_messages', {count: Math.max(0, Number(count) || 0)});
}

export function statusSyncedMailboxAndDav(contacts: number, events: number): string {
	return t('status.synced_mailbox_dav', {
		contacts: Math.max(0, Number(contacts) || 0),
		events: Math.max(0, Number(events) || 0),
	});
}

export function statusSyncCompleteMessages(count: number): string {
	return t('status.sync_complete_messages', {count: Math.max(0, Number(count) || 0)});
}

export function statusSyncCompleteDav(contacts: number, events: number): string {
	return t('status.sync_complete_dav', {
		contacts: Math.max(0, Number(contacts) || 0),
		events: Math.max(0, Number(events) || 0),
	});
}

function toModuleLabel(module: SyncModuleKey): string {
	if (module === 'emails') return t('status.module.mailbox');
	if (module === 'contacts') return t('status.module.contacts');
	if (module === 'calendar') return t('status.module.calendar');
	return t('status.module.files');
}

export function statusSyncPartial(count: number, failedModules: SyncModuleKey[] | undefined): string {
	const normalizedCount = Math.max(0, Number(count) || 0);
	const modules = Array.isArray(failedModules) ? failedModules : [];
	if (modules.length === 0) {
		return t('status.synced_partial', {count: normalizedCount});
	}
	const failed = modules.map(toModuleLabel).join(', ');
	return t('status.synced_partial_failed', {count: normalizedCount, failed});
}
