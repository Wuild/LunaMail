import {BrowserWindow, dialog, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type ExportContactsPayload = {
    format: 'csv' | 'vcf';
    addressBookId?: number | null;
};

type DavIpcDeps = {
    discoverDav: (accountId: number) => any;
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
};

export function registerDavIpc(deps: DavIpcDeps): void {
    ipcMain.handle('discover-dav', async (_event, accountId: number) => {
        return deps.discoverDav(accountId);
    });

    ipcMain.handle('sync-dav', async (_event, accountId: number) => {
        return deps.syncDav(accountId);
    });

    ipcMain.handle(
        'get-contacts',
        async (_event, accountId: number, query?: string | null, limit?: number, addressBookId?: number | null) => {
            return deps.getContacts(accountId, query ?? null, limit ?? 200, addressBookId ?? null);
        },
    );

    ipcMain.handle(
        'get-recent-recipients',
        async (_event, accountId: number, query?: string | null, limit?: number) => {
            return deps.listRecentRecipients(accountId, query ?? null, limit ?? 20);
        },
    );

    ipcMain.handle('get-address-books', async (_event, accountId: number) => {
        return deps.getAddressBooks(accountId);
    });

    ipcMain.handle('add-address-book', async (_event, accountId: number, name: string) => {
        return deps.addAddressBook(accountId, name);
    });

    ipcMain.handle('add-contact', async (_event, accountId: number, payload: any) => {
        return deps.addContact(accountId, payload);
    });

    ipcMain.handle('update-contact', async (_event, contactId: number, payload: any) => {
        return deps.editContact(contactId, payload);
    });

    ipcMain.handle('delete-address-book', async (_event, accountId: number, addressBookId: number) => {
        return deps.removeAddressBook(accountId, addressBookId);
    });

    ipcMain.handle('delete-contact', async (_event, contactId: number) => {
        return deps.removeContact(contactId);
    });

    ipcMain.handle('export-contacts', async (event, accountId: number, payload: ExportContactsPayload) => {
        const format = payload?.format === 'vcf' ? 'vcf' : 'csv';
        const addressBookId = payload?.addressBookId ?? null;
        const contacts = deps.getContacts(accountId, null, 100000, addressBookId);
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
            return deps.getCalendarEvents(accountId, startIso ?? null, endIso ?? null, limit ?? 500);
        },
    );

    ipcMain.handle('add-calendar-event', async (_event, accountId: number, payload: any) => {
        return deps.addCalendarEvent(accountId, payload);
    });
}
