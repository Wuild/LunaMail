import {BrowserWindow, dialog, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	parseOptionalLimit,
	parseOptionalBoolean,
	parseOptionalObject,
	parseOptionalPositiveInt,
	parseOptionalText,
	parsePositiveInt,
	parseRequiredObject,
	parseRequiredText,
} from './validation';
import type {DavSyncOptions} from '@llamamail/app/ipcTypes';
import {appEventHandler, AppEvent} from '@llamamail/app/appEventHandler';

type ExportContactsPayload = {
	format: 'csv' | 'vcf';
	addressBookId?: number | null;
};

type DavIpcDeps = {
	discoverDav: (accountId: number) => any;
	discoverDavPreview: (payload: {email: string; user: string; password: string; imapHost: string}) => any;
	syncDav: (accountId: number, options?: DavSyncOptions | null) => any;
	getContacts: (accountId: number, query?: string | null, limit?: number, addressBookId?: number | null) => any[];
	listRecentRecipients: (accountId: number, query?: string | null, limit?: number) => any[];
	getAddressBooks: (accountId: number) => any[];
	addAddressBook: (accountId: number, name: string) => any;
	addContact: (accountId: number, payload: any) => any;
	editContact: (contactId: number, payload: any) => any;
	removeAddressBook: (accountId: number, addressBookId: number) => any;
	removeContact: (contactId: number) => any;
	toVcf: (contacts: any[]) => string;
	toCsv: (contacts: any[]) => string;
	getCalendarEvents: (accountId: number, startIso?: string | null, endIso?: string | null, limit?: number) => any[];
	addCalendarEvent: (accountId: number, payload: any) => any;
	editCalendarEvent: (eventId: number, payload: any) => any;
	removeCalendarEvent: (eventId: number) => any;
};

export function registerDavIpc(deps: DavIpcDeps): void {
	ipcMain.handle('discover-dav', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		return deps.discoverDav(safeAccountId);
	});

	ipcMain.handle(
		'discover-dav-preview',
		async (
			_event,
			payload: {
				email: string;
				user: string;
				password: string;
				imapHost: string;
			},
		) => {
			const safePayload = parseRequiredObject(payload, 'payload');
			return deps.discoverDavPreview({
				email: parseRequiredText(safePayload.email, 'payload.email', 320),
				user: parseRequiredText(safePayload.user, 'payload.user', 320),
				password: parseRequiredText(safePayload.password, 'payload.password', 1024),
				imapHost: parseRequiredText(safePayload.imapHost, 'payload.imapHost', 255),
			});
		},
	);

	ipcMain.handle('sync-dav', async (_event, accountId: number, options?: DavSyncOptions | null) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safeOptions = parseOptionalObject(options, 'options');
		const safeCalendarRange = parseOptionalObject(safeOptions?.calendarRange, 'options.calendarRange');
		const safeModules = parseOptionalObject(safeOptions?.modules, 'options.modules');
		const safeStartIso = parseOptionalText(safeCalendarRange?.startIso, 'options.calendarRange.startIso', 64);
		const safeEndIso = parseOptionalText(safeCalendarRange?.endIso, 'options.calendarRange.endIso', 64);
		const safeSyncContacts = parseOptionalBoolean(safeModules?.contacts, 'options.modules.contacts');
		const safeSyncCalendar = parseOptionalBoolean(safeModules?.calendar, 'options.modules.calendar');
		const result = await deps.syncDav(safeAccountId, {
			calendarRange: safeCalendarRange
				? {
						startIso: safeStartIso,
						endIso: safeEndIso,
					}
				: null,
			modules: safeModules
				? {
						contacts: safeSyncContacts,
						calendar: safeSyncCalendar,
					}
				: null,
		});
		appEventHandler.emit(AppEvent.DavSyncCompleted, {
			accountId: safeAccountId,
			contactsState: result?.moduleStatus?.contacts?.state ?? null,
			calendarState: result?.moduleStatus?.calendar?.state ?? null,
		});
		return result;
	});

	ipcMain.handle(
		'get-contacts',
		async (_event, accountId: number, query?: string | null, limit?: number, addressBookId?: number | null) => {
			const safeAccountId = parsePositiveInt(accountId, 'accountId');
			const safeQuery = parseOptionalText(query, 'query', 1024);
			const safeLimit = parseOptionalLimit(limit, 200, 1, 5000);
			const safeAddressBookId = parseOptionalPositiveInt(addressBookId, 'addressBookId');
			return deps.getContacts(safeAccountId, safeQuery, safeLimit, safeAddressBookId);
		},
	);

	ipcMain.handle(
		'get-recent-recipients',
		async (_event, accountId: number, query?: string | null, limit?: number) => {
			const safeAccountId = parsePositiveInt(accountId, 'accountId');
			const safeQuery = parseOptionalText(query, 'query', 1024);
			const safeLimit = parseOptionalLimit(limit, 20, 1, 500);
			return deps.listRecentRecipients(safeAccountId, safeQuery, safeLimit);
		},
	);

	ipcMain.handle('get-address-books', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		return deps.getAddressBooks(safeAccountId);
	});

	ipcMain.handle('add-address-book', async (_event, accountId: number, name: string) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safeName = parseRequiredText(name, 'name', 200);
		const created = await deps.addAddressBook(safeAccountId, safeName);
		appEventHandler.emit(AppEvent.AddressBookAdded, {
			accountId: safeAccountId,
			addressBookId: Number(created?.id ?? created?.addressBookId ?? 0),
			name: String(created?.name || safeName),
		});
		return created;
	});

	ipcMain.handle('add-contact', async (_event, accountId: number, payload: any) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safePayload = parseRequiredObject(payload, 'payload');
		const created = await deps.addContact(safeAccountId, safePayload);
		appEventHandler.emit(AppEvent.ContactAdded, {
			accountId: safeAccountId,
			contactId: Number(created?.id ?? created?.contactId ?? 0),
			email: String(created?.email || safePayload?.email || '').trim() || null,
		});
		return created;
	});

	ipcMain.handle('update-contact', async (_event, contactId: number, payload: any) => {
		const safeContactId = parsePositiveInt(contactId, 'contactId');
		const safePayload = parseRequiredObject(payload, 'payload');
		const updated = await deps.editContact(safeContactId, safePayload);
		appEventHandler.emit(AppEvent.ContactUpdated, {
			contactId: safeContactId,
			email: String(updated?.email || safePayload?.email || '').trim() || null,
		});
		return updated;
	});

	ipcMain.handle('delete-address-book', async (_event, accountId: number, addressBookId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safeAddressBookId = parsePositiveInt(addressBookId, 'addressBookId');
		const result = await deps.removeAddressBook(safeAccountId, safeAddressBookId);
		appEventHandler.emit(AppEvent.AddressBookDeleted, {
			accountId: safeAccountId,
			addressBookId: safeAddressBookId,
		});
		return result;
	});

	ipcMain.handle('delete-contact', async (_event, contactId: number) => {
		const safeContactId = parsePositiveInt(contactId, 'contactId');
		const result = await deps.removeContact(safeContactId);
		appEventHandler.emit(AppEvent.ContactDeleted, {
			contactId: safeContactId,
		});
		return result;
	});

	ipcMain.handle('export-contacts', async (event, accountId: number, payload: ExportContactsPayload) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const format = payload?.format === 'vcf' ? 'vcf' : 'csv';
		const addressBookId = parseOptionalPositiveInt(payload?.addressBookId, 'addressBookId');
		const contacts = deps.getContacts(safeAccountId, null, 100000, addressBookId);
		const content = format === 'vcf' ? deps.toVcf(contacts) : deps.toCsv(contacts);
		const defaultName = `contacts-${new Date().toISOString().slice(0, 10)}.${format}`;
		const parentWindow = BrowserWindow.fromWebContents(event.sender);
		const dialogOptions = {
			title: 'Export Contacts',
			defaultPath: path.join(os.homedir(), defaultName),
			filters: format === 'vcf' ? [{name: 'vCard', extensions: ['vcf']}] : [{name: 'CSV', extensions: ['csv']}],
		};
		const save = parentWindow
			? await dialog.showSaveDialog(parentWindow, dialogOptions)
			: await dialog.showSaveDialog(dialogOptions);
		if (save.canceled || !save.filePath) {
			return {
				canceled: true,
				count: contacts.length,
				path: null,
				format,
			};
		}
		await fs.writeFile(save.filePath, content, 'utf8');
		return {
			canceled: false,
			count: contacts.length,
			path: save.filePath,
			format,
		};
	});

	ipcMain.handle(
		'get-calendar-events',
		async (_event, accountId: number, startIso?: string | null, endIso?: string | null, limit?: number) => {
			const safeAccountId = parsePositiveInt(accountId, 'accountId');
			const safeStartIso = parseOptionalText(startIso, 'startIso', 64);
			const safeEndIso = parseOptionalText(endIso, 'endIso', 64);
			const safeLimit = parseOptionalLimit(limit, 500, 1, 5000);
			return deps.getCalendarEvents(safeAccountId, safeStartIso, safeEndIso, safeLimit);
		},
	);

	ipcMain.handle('add-calendar-event', async (_event, accountId: number, payload: any) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safePayload = parseRequiredObject(payload, 'payload');
		const created = await deps.addCalendarEvent(safeAccountId, safePayload);
		appEventHandler.emit(AppEvent.CalendarEventAdded, {
			accountId: safeAccountId,
			eventId: Number(created?.id ?? created?.eventId ?? 0),
			startIso: String(created?.startIso || safePayload?.startIso || '').trim() || null,
		});
		return created;
	});

	ipcMain.handle('update-calendar-event', async (_event, eventId: number, payload: any) => {
		const safeEventId = parsePositiveInt(eventId, 'eventId');
		const safePayload = parseRequiredObject(payload, 'payload');
		const updated = await deps.editCalendarEvent(safeEventId, safePayload);
		appEventHandler.emit(AppEvent.CalendarEventUpdated, {
			eventId: safeEventId,
			startIso: String(updated?.startIso || safePayload?.startIso || '').trim() || null,
		});
		return updated;
	});

	ipcMain.handle('delete-calendar-event', async (_event, eventId: number) => {
		const safeEventId = parsePositiveInt(eventId, 'eventId');
		const result = await deps.removeCalendarEvent(safeEventId);
		appEventHandler.emit(AppEvent.CalendarEventDeleted, {
			eventId: safeEventId,
		});
		return result;
	});
}
