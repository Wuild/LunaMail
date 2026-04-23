import {createMailDebugLogger} from '@main/debug/debugLog';
import {type CloudAccountCredentials, cloudAccountToDavAccountId} from '@main/db/repositories/cloudRepo';
import {
	getDavSettings,
	upsertCalendarEvents,
	upsertContacts,
	upsertDavSettings,
} from '@main/db/repositories/davRepo';
import {
	configureCloudDavDependencies,
	syncCloudDav,
	type CloudDavSyncSummary,
} from './cloudDavSyncRuntime';

configureCloudDavDependencies({
	cloudAccountToDavAccountId: (accountId) => cloudAccountToDavAccountId(accountId),
	getDavSettings: (accountId) => getDavSettings(accountId),
	upsertDavSettings: (accountId, carddavUrl, caldavUrl) => upsertDavSettings(accountId, carddavUrl, caldavUrl),
	upsertContacts: (accountId, rows, source) => upsertContacts(accountId, rows, source),
	upsertCalendarEvents: (accountId, rows, source) => upsertCalendarEvents(accountId, rows, source),
	createLogger: (channel, context) => createMailDebugLogger(channel, context),
});

export {syncCloudDav};
export type {CloudDavSyncSummary, CloudAccountCredentials};
