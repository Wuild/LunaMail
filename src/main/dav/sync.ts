import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo';
import {
	createAddressBook,
	createCalendarEvent,
	createLocalCalendarEvent,
	createLocalContact,
	deleteAddressBook as deleteLocalAddressBook,
	deleteCalendarEventById,
	deleteContactById,
	deleteLocalCalendarEvent,
	deleteLocalContact,
	getCalendarEventById,
	getContactById,
	getDavSettings,
	listAddressBooks,
	listCalendarEvents,
	listContacts,
	syncCardDavAddressBooks,
	updateCalendarEventById,
	updateCardDavContact,
	updateExternalContact,
	updateLocalCalendarEvent,
	updateLocalContact,
	upsertCalendarEvents,
	upsertCardDavContact,
	upsertContacts,
	upsertDavSettings,
} from '@main/db/repositories/davRepo';
import {createMailDebugLogger} from '@main/debug/debugLog';
import {refreshMailOAuthSessionWithOptions} from '@main/auth/authServerClient';
import {getMicrosoftGraphOAuthScopes} from '@main/mail/oauth';
import {
	configureDavSyncDependencies,
	discoverDav,
	discoverDavPreview,
	syncDav,
	getContacts,
	getAddressBooks,
	addAddressBook,
	removeAddressBook,
	addContact,
	editContact,
	removeContact,
	getCalendarEvents,
	addCalendarEvent,
	editCalendarEvent,
	removeCalendarEvent,
	type DavDiscoveryPreviewPayload,
	type DavDiscoveryResult,
	type DavSyncSummary,
} from './davSyncRuntime';
import {configureOauthContactsDependencies} from './oauthContactsRuntime';
import type {DavSyncOptions} from '@llamamail/app/ipcTypes';

configureOauthContactsDependencies({
	getAccountSyncCredentials: async (accountId) => await getAccountSyncCredentials(accountId),
	refreshMailOAuthSessionWithOptions: async (session, options) =>
		await refreshMailOAuthSessionWithOptions(session, options),
	getMicrosoftGraphOAuthScopes: () => getMicrosoftGraphOAuthScopes(),
	listContacts: (accountId, query, limit) => listContacts(accountId, query, limit),
	upsertContacts: (accountId, rows, source) => upsertContacts(accountId, rows, source),
});

configureDavSyncDependencies({
	getAccountSyncCredentials: async (accountId) => await getAccountSyncCredentials(accountId),
	createAddressBook: (accountId, name) => createAddressBook(accountId, name),
	createCalendarEvent: (accountId, payload) => createCalendarEvent(accountId, payload),
	createLocalCalendarEvent: (accountId, payload) => createLocalCalendarEvent(accountId, payload),
	createLocalContact: (accountId, addressBookId, fullName, email, fields) =>
		createLocalContact(accountId, addressBookId, fullName, email, fields),
	deleteLocalAddressBook: (accountId, addressBookId) => deleteLocalAddressBook(accountId, addressBookId),
	deleteCalendarEventById: (eventId) => deleteCalendarEventById(eventId),
	deleteContactById: (contactId) => deleteContactById(contactId),
	deleteLocalCalendarEvent: (eventId) => deleteLocalCalendarEvent(eventId),
	deleteLocalContact: (contactId) => deleteLocalContact(contactId),
	getCalendarEventById: (eventId) => getCalendarEventById(eventId),
	getContactById: (contactId) => getContactById(contactId),
	getDavSettings: (accountId) => getDavSettings(accountId),
	listAddressBooks: (accountId) => listAddressBooks(accountId),
	listCalendarEvents: (accountId, startIso, endIso, limit) => listCalendarEvents(accountId, startIso, endIso, limit),
	listContacts: (accountId, query, limit, addressBookId) => listContacts(accountId, query, limit, addressBookId),
	syncCardDavAddressBooks: (accountId, rows) => syncCardDavAddressBooks(accountId, rows),
	updateCalendarEventById: (eventId, patch) => updateCalendarEventById(eventId, patch),
	updateCardDavContact: (accountId, sourceUid, email, payload) => updateCardDavContact(accountId, sourceUid, email, payload),
	updateExternalContact: (contactId, payload) => updateExternalContact(contactId, payload),
	updateLocalCalendarEvent: (eventId, payload) => updateLocalCalendarEvent(eventId, payload),
	updateLocalContact: (contactId, payload) => updateLocalContact(contactId, payload),
	upsertCalendarEvents: (accountId, rows, source, options) => upsertCalendarEvents(accountId, rows, source, options),
	upsertCardDavContact: (accountId, payload) => upsertCardDavContact(accountId, payload),
	upsertContacts: (accountId, rows, source) => upsertContacts(accountId, rows, source),
	upsertDavSettings: (accountId, carddavUrl, caldavUrl) => upsertDavSettings(accountId, carddavUrl, caldavUrl),
	createMailDebugLogger: (channel, context) => createMailDebugLogger(channel as any, context),
});

export {
	discoverDav,
	discoverDavPreview,
	syncDav,
	getContacts,
	getAddressBooks,
	addAddressBook,
	removeAddressBook,
	addContact,
	editContact,
	removeContact,
	getCalendarEvents,
	addCalendarEvent,
	editCalendarEvent,
	removeCalendarEvent,
};

export type {DavSyncOptions, DavDiscoveryPreviewPayload, DavDiscoveryResult, DavSyncSummary};
