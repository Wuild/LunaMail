import {BrowserWindow, dialog, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	parseOptionalLimit,
	parseOptionalPositiveInt,
	parseOptionalText,
	parsePositiveInt,
	parseRequiredObject,
	parseRequiredText,
} from './validation.js';

type ExportContactsPayload = {
	format: 'csv' | 'vcf';
	addressBookId?: number | null;
};

type DavIpcDeps = {
	discoverDav: (accountId: number) => any;
	discoverDavPreview: (payload: {email: string; user: string; password: string; imapHost: string}) => any;
	syncDav: (accountId: number) => any;
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

	ipcMain.handle('sync-dav', async (_event, accountId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		return deps.syncDav(safeAccountId);
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
		return deps.addAddressBook(safeAccountId, safeName);
	});

	ipcMain.handle('add-contact', async (_event, accountId: number, payload: any) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safePayload = parseRequiredObject(payload, 'payload');
		return deps.addContact(safeAccountId, safePayload);
	});

	ipcMain.handle('update-contact', async (_event, contactId: number, payload: any) => {
		const safeContactId = parsePositiveInt(contactId, 'contactId');
		const safePayload = parseRequiredObject(payload, 'payload');
		return deps.editContact(safeContactId, safePayload);
	});

	ipcMain.handle('delete-address-book', async (_event, accountId: number, addressBookId: number) => {
		const safeAccountId = parsePositiveInt(accountId, 'accountId');
		const safeAddressBookId = parsePositiveInt(addressBookId, 'addressBookId');
		return deps.removeAddressBook(safeAccountId, safeAddressBookId);
	});

	ipcMain.handle('delete-contact', async (_event, contactId: number) => {
		const safeContactId = parsePositiveInt(contactId, 'contactId');
		return deps.removeContact(safeContactId);
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
		return deps.addCalendarEvent(safeAccountId, safePayload);
	});

	ipcMain.handle('update-calendar-event', async (_event, eventId: number, payload: any) => {
		const safeEventId = parsePositiveInt(eventId, 'eventId');
		const safePayload = parseRequiredObject(payload, 'payload');
		return deps.editCalendarEvent(safeEventId, safePayload);
	});

	ipcMain.handle('delete-calendar-event', async (_event, eventId: number) => {
		const safeEventId = parsePositiveInt(eventId, 'eventId');
		return deps.removeCalendarEvent(safeEventId);
	});
}
