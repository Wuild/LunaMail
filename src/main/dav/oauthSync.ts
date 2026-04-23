import {deleteCalendarEventsByUids, upsertCalendarEvents, upsertContacts} from '@main/db/repositories/davRepo';
import {
	configureOauthSyncDependencies,
	syncOauthProviderDav,
} from './oauthSyncRuntime';

configureOauthSyncDependencies({
	upsertContacts: (accountId, rows, source) => upsertContacts(accountId, rows, source),
	upsertCalendarEvents: (accountId, rows, source, options) =>
		upsertCalendarEvents(accountId, rows, source, options),
	deleteCalendarEventsByUids: (accountId, source, calendarUrl, uids) =>
		deleteCalendarEventsByUids(accountId, source, calendarUrl, uids),
});

export {syncOauthProviderDav};
