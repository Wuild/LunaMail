import React, {useEffect, useState} from 'react';
import {BookPlus, Download, Pencil, Plus, RefreshCw, Settings, Trash2, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {AddressBookItem, ContactItem, PublicAccount, SyncStatusEvent} from '../../preload';
import {getAccountAvatarColors, getAccountMonogram} from '../lib/accountAvatar';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {useResizableSidebar} from '../hooks/useResizableSidebar';
import {ipcClient} from '../lib/ipcClient';
import {
    statusAutoSyncFailed,
    statusNoAccountSelected,
    statusSyncCompleteDav,
    statusSyncCompleteMessages,
    statusSyncFailed,
    statusSyncing,
    toErrorMessage,
} from '../lib/statusText';
import {cn} from '../lib/utils';
import WorkspaceLayout from '../layouts/WorkspaceLayout';

type ContactsRouteProps = {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
};

type ContactMeta = {
    emails: string[];
    phones: string[];
};

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

export default function ContactsRoute({accountId, accounts, onSelectAccount}: ContactsRouteProps) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [addressBooks, setAddressBooks] = useState<AddressBookItem[]>([]);
    const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmails, setNewContactEmails] = useState<string[]>(['']);
    const [newContactPhones, setNewContactPhones] = useState<string[]>(['']);
    const [newContactOrganization, setNewContactOrganization] = useState('');
    const [newContactTitle, setNewContactTitle] = useState('');
    const [newContactNote, setNewContactNote] = useState('');
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showAddAddressBookModal, setShowAddAddressBookModal] = useState(false);
    const [newAddressBookName, setNewAddressBookName] = useState('');
    const [addingAddressBook, setAddingAddressBook] = useState(false);
    const [showExportContactsModal, setShowExportContactsModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'csv' | 'vcf'>('csv');
    const [exportBookMode, setExportBookMode] = useState<'all' | 'selected'>('selected');
    const [exportingContacts, setExportingContacts] = useState(false);
    const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
    const [editContactName, setEditContactName] = useState('');
    const [editContactEmails, setEditContactEmails] = useState<string[]>(['']);
    const [editContactPhones, setEditContactPhones] = useState<string[]>(['']);
    const [editContactOrganization, setEditContactOrganization] = useState('');
    const [editContactTitle, setEditContactTitle] = useState('');
    const [editContactNote, setEditContactNote] = useState('');
    const [editContactBookId, setEditContactBookId] = useState<number | null>(null);
    const [savingEditContact, setSavingEditContact] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null);
    const [syncStatusText, setSyncStatusText] = useState<string>('Contacts ready');
    const [contactError, setContactError] = useState<string | null>(null);
    const {sidebarWidth, onResizeStart} = useResizableSidebar();

    const loadContacts = React.useCallback(async (targetAccountId: number, q: string, bookId: number | null) => {
        const rows = await ipcClient.getContacts(targetAccountId, q.trim() || null, 600, bookId ?? null);
        setContacts(rows);
    }, []);

    useEffect(() => {
        if (!accountId) {
            setContacts([]);
            setAddressBooks([]);
            setSelectedBookId(null);
            setShowAddContactModal(false);
            setShowAddAddressBookModal(false);
            setShowExportContactsModal(false);
            setEditingContact(null);
            setSyncing(false);
            setSyncingAccountId(null);
            setSyncStatusText(statusNoAccountSelected());
            setLoading(false);
            return;
        }
        setSyncStatusText('Contacts ready');
        let active = true;
        const load = async () => {
            setLoading(true);
            setContactError(null);
            try {
                const books = await ipcClient.getAddressBooks(accountId);
                if (!active) return;
                setAddressBooks(books);
                const effectiveBookId =
                    selectedBookId && books.some((book) => book.id === selectedBookId)
                        ? selectedBookId
                        : null;
                setSelectedBookId(effectiveBookId);
                const rows = await ipcClient.getContacts(accountId, query.trim() || null, 600, effectiveBookId);
                if (!active) return;
                setContacts(rows);
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [accountId, query, selectedBookId]);

    useIpcEvent(ipcClient.onAccountSyncStatus, (evt: SyncStatusEvent) => {
        if (!accountId || evt.accountId !== accountId) return;
        if (evt.status === 'syncing') {
            setSyncing(true);
            setSyncStatusText(statusSyncing());
            return;
        }
        if (evt.status === 'error') {
            setSyncing(false);
            setSyncStatusText(statusSyncFailed(evt.error));
            return;
        }
        setSyncing(false);
        const davSummary = evt.summary?.dav;
        if (davSummary) {
            setSyncStatusText(statusSyncCompleteDav(davSummary.contacts.upserted, davSummary.events.upserted));
            return;
        }
        setSyncStatusText(statusSyncCompleteMessages(evt.summary?.messages ?? 0));
    });

    useEffect(() => {
        if (!accountId) return;
        let active = true;
        setSyncing(true);
        setSyncingAccountId(accountId);
        setSyncStatusText(statusSyncing());
        setContactError(null);
        void ipcClient
            .syncDav(accountId)
            .then(async () => {
                if (!active) return;
                const books = await ipcClient.getAddressBooks(accountId);
                if (!active) return;
                setAddressBooks(books);
                const effectiveBookId =
                    selectedBookId && books.some((book) => book.id === selectedBookId)
                        ? selectedBookId
                        : null;
                setSelectedBookId(effectiveBookId);
                await loadContacts(accountId, query, effectiveBookId);
                if (!active) return;
                setSyncing(false);
                setSyncingAccountId(null);
                setSyncStatusText('Contacts synced');
            })
            .catch((error: any) => {
                if (!active) return;
                setSyncing(false);
                setSyncingAccountId(null);
                setContactError(toErrorMessage(error));
                setSyncStatusText(statusAutoSyncFailed(error));
            });
        return () => {
            active = false;
        };
    }, [accountId]);

    async function onAddContact() {
        if (!accountId) return;
        const emails = normalizeContactValues(newContactEmails);
        const phones = normalizeContactValues(newContactPhones);
        const email = emails[0] || '';
        if (!email) return;
        setContactError(null);
        try {
            await ipcClient.addContact(accountId, {
                addressBookId: selectedBookId,
                fullName: newContactName.trim() || null,
                email,
                phone: phones[0] || null,
                organization: newContactOrganization.trim() || null,
                title: newContactTitle.trim() || null,
                note: composeContactNote(newContactNote, emails, phones),
            });
            setNewContactName('');
            setNewContactEmails(['']);
            setNewContactPhones(['']);
            setNewContactOrganization('');
            setNewContactTitle('');
            setNewContactNote('');
            setShowAddContactModal(false);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        }
    }

    async function onDeleteContact(contactId: number) {
        if (!accountId) return;
        const target = contacts.find((row) => row.id === contactId);
        const label = target?.full_name?.trim() || target?.email || `#${contactId}`;
        const confirmed = window.confirm(`Delete contact "${label}"?`);
        if (!confirmed) return;
        setContactError(null);
        try {
            await ipcClient.deleteContact(contactId);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        }
    }

    function openEditContact(contact: ContactItem) {
        const parsedNote = parseContactNote(contact.note);
        setEditingContact(contact);
        setEditContactName(contact.full_name || '');
        setEditContactEmails(parsedNote.emails.length ? parsedNote.emails : [contact.email || '']);
        setEditContactPhones(parsedNote.phones.length ? parsedNote.phones : [contact.phone || '']);
        setEditContactOrganization(contact.organization || '');
        setEditContactTitle(contact.title || '');
        setEditContactNote(parsedNote.noteText);
        setEditContactBookId(contact.address_book_id ?? selectedBookId ?? null);
        setContactError(null);
    }

    async function onSaveEditedContact() {
        if (!accountId || !editingContact) return;
        const emails = normalizeContactValues(editContactEmails);
        const phones = normalizeContactValues(editContactPhones);
        const email = emails[0] || '';
        if (!email) return;
        setSavingEditContact(true);
        setContactError(null);
        try {
            await ipcClient.updateContact(editingContact.id, {
                addressBookId: editContactBookId,
                fullName: editContactName.trim() || null,
                email,
                phone: phones[0] || null,
                organization: editContactOrganization.trim() || null,
                title: editContactTitle.trim() || null,
                note: composeContactNote(editContactNote, emails, phones),
            });
            setEditingContact(null);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        } finally {
            setSavingEditContact(false);
        }
    }

    async function onAddAddressBook() {
        if (!accountId || addingAddressBook) return;
        const name = newAddressBookName.trim();
        if (!name) return;
        setAddingAddressBook(true);
        setContactError(null);
        try {
            const added = await ipcClient.addAddressBook(accountId, name);
            const books = await ipcClient.getAddressBooks(accountId);
            setAddressBooks(books);
            setSelectedBookId(added.id);
            setShowAddAddressBookModal(false);
            setNewAddressBookName('');
            await loadContacts(accountId, query, added.id);
            setSyncStatusText(`Address book "${added.name}" created`);
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        } finally {
            setAddingAddressBook(false);
        }
    }

    async function onExportContacts() {
        if (!accountId || exportingContacts) return;
        setExportingContacts(true);
        setContactError(null);
        try {
            const result = await ipcClient.exportContacts(accountId, {
                format: exportFormat,
                addressBookId: exportBookMode === 'selected' ? selectedBookId : null,
            });
            if (result.canceled) {
                setSyncStatusText('Export cancelled');
            } else {
                setSyncStatusText(`Exported ${result.count} contacts`);
                setShowExportContactsModal(false);
            }
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        } finally {
            setExportingContacts(false);
        }
    }

    async function onDeleteSelectedAddressBook() {
        if (!accountId || !selectedBookId) return;
        const targetBook = addressBooks.find((book) => book.id === selectedBookId);
        if (!targetBook) return;
        if (targetBook.source !== 'local') {
            setContactError('Only local address books can be deleted.');
            return;
        }
        const shouldDelete = window.confirm(`Delete address book "${targetBook.name}"?`);
        if (!shouldDelete) return;
        setContactError(null);
        try {
            await ipcClient.deleteAddressBook(accountId, selectedBookId);
            const books = await ipcClient.getAddressBooks(accountId);
            setAddressBooks(books);
            const nextBookId = null;
            setSelectedBookId(nextBookId);
            await loadContacts(accountId, query, nextBookId);
        } catch (error: any) {
            setContactError(toErrorMessage(error));
        }
    }

    async function onManualSync(targetAccountId?: number) {
        const effectiveAccountId = targetAccountId ?? accountId;
        if (!effectiveAccountId || syncing) return;
        setContactError(null);
        setSyncing(true);
        setSyncingAccountId(effectiveAccountId);
        setSyncStatusText(statusSyncing());
        try {
            await ipcClient.syncAccount(effectiveAccountId);
            if (accountId === effectiveAccountId) {
                const books = await ipcClient.getAddressBooks(effectiveAccountId);
                setAddressBooks(books);
                const effectiveBookId =
                    selectedBookId && books.some((book) => book.id === selectedBookId)
                        ? selectedBookId
                        : null;
                setSelectedBookId(effectiveBookId);
                await loadContacts(effectiveAccountId, query, effectiveBookId);
            }
            setSyncStatusText('Contacts synced');
        } catch (error: any) {
            const message = toErrorMessage(error);
            setSyncStatusText(statusSyncFailed(message));
            setContactError(message);
        } finally {
            setSyncing(false);
            setSyncingAccountId(null);
        }
    }

    const accountSidebar = (
        <aside className="flex h-full min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Accounts
                </p>
                <div className="space-y-1">
                    {accounts.map((account) => {
                        const isSyncingAccount = syncing && syncingAccountId === account.id;
                        const avatarColors = getAccountAvatarColors(
                            account.email || account.display_name || String(account.id),
                        );
                        return (
                            <div
                                key={account.id}
                                className={cn(
                                    'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                                    accountId === account.id
                                        ? 'bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100'
                                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => onSelectAccount(account.id)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
									<span
                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-black/10 dark:ring-white/10"
                                        style={{
                                            backgroundColor: avatarColors.background,
                                            color: avatarColors.foreground,
                                        }}
                                    >
										{getAccountMonogram(account)}
									</span>
                                    <span className="min-w-0 flex-1">
										<span className="block truncate">
											{account.display_name?.trim() || account.email}
										</span>
                                        {account.display_name?.trim() && (
                                            <span
                                                className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
												{account.email}
											</span>
                                        )}
									</span>
                                </button>
                                <div
                                    className={cn(
                                        'flex items-center gap-1 transition-opacity',
                                        isSyncingAccount ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                    )}
                                >
                                    <button
                                        type="button"
                                        className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                        onClick={() => void onManualSync(account.id)}
                                        title="Sync account"
                                        aria-label="Sync account"
                                        disabled={isSyncingAccount}
                                    >
                                        <RefreshCw size={13} className={cn(isSyncingAccount && 'animate-spin')}/>
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                        onClick={() => navigate(`/settings/account?accountId=${account.id}`)}
                                        title="Edit account"
                                        aria-label="Edit account"
                                    >
                                        <Settings size={13}/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {accounts.length === 0 && (
                        <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No accounts available.</p>
                    )}
                </div>
            </div>
        </aside>
    );
    const contactsToolbar = (
        <div className="flex h-10 min-w-0 items-center gap-2">
            <select
                value={selectedBookId ?? ''}
                onChange={(event) => setSelectedBookId(event.target.value ? Number(event.target.value) : null)}
                className="h-10 min-w-52 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                disabled={!accountId}
            >
                <option value="">All address books</option>
                {addressBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                        {book.name}
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                disabled={!accountId}
                onClick={() => setShowAddAddressBookModal(true)}
                title="Create address book"
                aria-label="Create address book"
            >
                <BookPlus size={14}/>
            </button>
            <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                disabled={
                    !accountId ||
                    !selectedBookId ||
                    addressBooks.find((book) => book.id === selectedBookId)?.source !== 'local'
                }
                onClick={() => void onDeleteSelectedAddressBook()}
                title="Delete address book"
                aria-label="Delete address book"
            >
                <Trash2 size={14}/>
            </button>
            <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts..."
                className="h-10 min-w-[10rem] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                disabled={!accountId}
            />
            <button
                type="button"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                onClick={() => setShowAddContactModal(true)}
                disabled={!accountId}
                title="Add contact"
                aria-label="Add contact"
            >
                <Plus size={14}/>
                Add contact
            </button>
            <button
                type="button"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                onClick={() => setShowExportContactsModal(true)}
                disabled={!accountId}
                title="Export contacts"
                aria-label="Export contacts"
            >
                <Download size={14}/>
                Export
            </button>
        </div>
    );

    return (
        <WorkspaceLayout
            sidebar={accountSidebar}
            sidebarWidth={sidebarWidth}
            onSidebarResizeStart={onResizeStart}
            menubar={contactsToolbar}
            showMenuBar
            statusText={syncing && syncStatusText.toLowerCase().includes('ready') ? statusSyncing() : syncStatusText}
            statusBusy={syncing}
        >
            <div className="mx-auto max-w-5xl">
                {!accountId && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{statusNoAccountSelected()}</p>
                )}
                {accountId && (
                    <>
                        {contactError && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{contactError}</p>}
                        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading contacts...</p>}
                        {!loading && contacts.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No contacts found.</p>
                        )}
                        {!loading && contacts.length > 0 && (
                            <div
                                className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                    {contacts.map((contact) => (
                                        <li key={contact.id} className="px-4 py-3">
                                            {(() => {
                                                const preview = getContactPreview(contact);
                                                const avatarSeed = preview.primaryEmail || String(contact.id);
                                                const avatarColors = getAccountAvatarColors(avatarSeed);
                                                return (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-start gap-3">
                                                    <span
                                                        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 ring-black/10 dark:ring-white/10"
                                                        style={{
                                                            backgroundColor: avatarColors.background,
                                                            color: avatarColors.foreground,
                                                        }}
                                                        aria-hidden
                                                    >
                                                        {getContactInitials(contact.full_name, preview.primaryEmail)}
                                                    </span>
                                                    <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                        {contact.full_name || '(No name)'}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                                        {preview.primaryEmail}
                                                        {preview.extraEmails > 0 ? ` (+${preview.extraEmails} more)` : ''}
                                                    </p>
                                                    {(preview.primaryPhone || contact.organization || contact.title) && (
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                            {[preview.primaryPhone, contact.organization, contact.title]
                                                                .filter(Boolean)
                                                                .join(' • ')}
                                                        </p>
                                                    )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                        onClick={() => openEditContact(contact)}
                                                        disabled={
                                                            !contact.source.startsWith('local:') &&
                                                            contact.source !== 'carddav'
                                                        }
                                                        title={
                                                            contact.source.startsWith('local:') ||
                                                            contact.source === 'carddav'
                                                                ? 'Edit contact'
                                                                : 'This contact source is read-only'
                                                        }
                                                    >
                                                        <Pencil size={12} className="mr-1 inline-block"/>
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/30"
                                                        onClick={() => void onDeleteContact(contact.id)}
                                                        disabled={
                                                            !contact.source.startsWith('local:') &&
                                                            contact.source !== 'carddav'
                                                        }
                                                        title={
                                                            contact.source.startsWith('local:') ||
                                                            contact.source === 'carddav'
                                                                ? 'Delete contact'
                                                                : 'This contact source is read-only'
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                                );
                                            })()}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showAddContactModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowAddContactModal(false)}
                >
                    <div
                        className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onAddContact();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Contact</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Create a contact for the selected account.
                            </p>
                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-3">
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Full name
									</span>
                                        <input
                                            type="text"
                                            value={newContactName}
                                            onChange={(event) => setNewContactName(event.target.value)}
                                            placeholder="Jane Doe"
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <DynamicContactFieldList
                                        label="Emails"
                                        valueLabel="Email"
                                        type="email"
                                        placeholder="jane@domain.com"
                                        values={newContactEmails}
                                        onChange={setNewContactEmails}
                                        requiredFirst
                                    />
                                    <DynamicContactFieldList
                                        label="Phone numbers"
                                        valueLabel="Phone"
                                        type="text"
                                        placeholder="+46 70 123 45 67"
                                        values={newContactPhones}
                                        onChange={setNewContactPhones}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Organization
									</span>
                                        <input
                                            type="text"
                                            value={newContactOrganization}
                                            onChange={(event) => setNewContactOrganization(event.target.value)}
                                            placeholder="Acme Inc."
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Title
									</span>
                                        <input
                                            type="text"
                                            value={newContactTitle}
                                            onChange={(event) => setNewContactTitle(event.target.value)}
                                            placeholder="Sales Manager"
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Address book
									</span>
                                        <select
                                            value={selectedBookId ?? ''}
                                            onChange={(event) =>
                                                setSelectedBookId(event.target.value ? Number(event.target.value) : null)
                                            }
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        >
                                            <option value="">No address book</option>
                                            {addressBooks.map((book) => (
                                                <option key={book.id} value={book.id}>
                                                    {book.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Notes
									</span>
                                        <textarea
                                            value={newContactNote}
                                            onChange={(event) => setNewContactNote(event.target.value)}
                                            rows={7}
                                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setShowAddContactModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={!normalizeContactValues(newContactEmails).length}
                                >
                                    Save Contact
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingContact && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setEditingContact(null)}
                >
                    <div
                        className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onSaveEditedContact();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit Contact</h3>
                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-3">
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Full name
									</span>
                                        <input
                                            type="text"
                                            value={editContactName}
                                            onChange={(event) => setEditContactName(event.target.value)}
                                            placeholder="Jane Doe"
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <DynamicContactFieldList
                                        label="Emails"
                                        valueLabel="Email"
                                        type="email"
                                        placeholder="jane@domain.com"
                                        values={editContactEmails}
                                        onChange={setEditContactEmails}
                                        requiredFirst
                                    />
                                    <DynamicContactFieldList
                                        label="Phone numbers"
                                        valueLabel="Phone"
                                        type="text"
                                        values={editContactPhones}
                                        onChange={setEditContactPhones}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Organization
									</span>
                                        <input
                                            type="text"
                                            value={editContactOrganization}
                                            onChange={(event) => setEditContactOrganization(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Title
									</span>
                                        <input
                                            type="text"
                                            value={editContactTitle}
                                            onChange={(event) => setEditContactTitle(event.target.value)}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Address book
									</span>
                                        <select
                                            value={editContactBookId ?? ''}
                                            onChange={(event) =>
                                                setEditContactBookId(event.target.value ? Number(event.target.value) : null)
                                            }
                                            disabled={editingContact.source === 'carddav'}
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        >
                                            <option value="">No address book</option>
                                            {addressBooks.map((book) => (
                                                <option key={book.id} value={book.id}>
                                                    {book.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block text-sm">
									<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
										Notes
									</span>
                                        <textarea
                                            value={editContactNote}
                                            onChange={(event) => setEditContactNote(event.target.value)}
                                            rows={7}
                                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setEditingContact(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={savingEditContact || !normalizeContactValues(editContactEmails).length}
                                >
                                    {savingEditContact ? 'Saving...' : 'Save changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAddAddressBookModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowAddAddressBookModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onAddAddressBook();
                            }}
                        >
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                Create Address Book
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Local address books can be used to organize manual contacts.
                            </p>
                            <label className="mt-4 block text-sm">
								<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Name</span>
                                <input
                                    type="text"
                                    value={newAddressBookName}
                                    onChange={(event) => setNewAddressBookName(event.target.value)}
                                    placeholder="Personal"
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    required
                                />
                            </label>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => setShowAddAddressBookModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    disabled={addingAddressBook || !newAddressBookName.trim()}
                                >
                                    {addingAddressBook ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showExportContactsModal && accountId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setShowExportContactsModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Export Contacts</h3>
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
								<span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
									Format
								</span>
                                <select
                                    value={exportFormat}
                                    onChange={(event) => setExportFormat(event.target.value === 'vcf' ? 'vcf' : 'csv')}
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="csv">CSV (.csv)</option>
                                    <option value="vcf">vCard (.vcf)</option>
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Scope</span>
                                <select
                                    value={exportBookMode}
                                    onChange={(event) =>
                                        setExportBookMode(event.target.value === 'all' ? 'all' : 'selected')
                                    }
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="selected">Current book</option>
                                    <option value="all">All books</option>
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setShowExportContactsModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                onClick={() => void onExportContacts()}
                                disabled={exportingContacts}
                            >
                                <Download size={14}/>
                                {exportingContacts ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </WorkspaceLayout>
    );
}

function normalizeContactValues(values: string[]): string[] {
    return values.map((value) => value.trim()).filter(Boolean);
}

function parseContactNote(note: string | null | undefined): { noteText: string; emails: string[]; phones: string[] } {
    const raw = String(note || '');
    const markerIndex = raw.lastIndexOf(CONTACT_META_PREFIX);
    if (markerIndex < 0) {
        return {noteText: raw.trim(), emails: [], phones: []};
    }
    const noteText = raw.slice(0, markerIndex).trimEnd();
    const metaRaw = raw.slice(markerIndex + CONTACT_META_PREFIX.length).trim();
    try {
        const parsed = JSON.parse(metaRaw) as ContactMeta;
        return {
            noteText: noteText.trim(),
            emails: Array.isArray(parsed.emails) ? normalizeContactValues(parsed.emails) : [],
            phones: Array.isArray(parsed.phones) ? normalizeContactValues(parsed.phones) : [],
        };
    } catch {
        return {noteText: raw.trim(), emails: [], phones: []};
    }
}

function composeContactNote(noteText: string, emails: string[], phones: string[]): string | null {
    const normalizedNote = noteText.trim();
    const normalizedEmails = normalizeContactValues(emails);
    const normalizedPhones = normalizeContactValues(phones);
    const meta: ContactMeta = {emails: normalizedEmails, phones: normalizedPhones};
    const hasMeta = normalizedEmails.length > 1 || normalizedPhones.length > 1;
    if (!hasMeta) {
        return normalizedNote || null;
    }
    const serializedMeta = `${CONTACT_META_PREFIX}\n${JSON.stringify(meta)}`;
    if (!normalizedNote) return serializedMeta;
    return `${normalizedNote}\n\n${serializedMeta}`;
}

function getContactPreview(contact: ContactItem): {
    primaryEmail: string;
    extraEmails: number;
    primaryPhone: string;
} {
    const parsedNote = parseContactNote(contact.note);
    const emailList = parsedNote.emails.length ? parsedNote.emails : [contact.email].filter(Boolean);
    const phoneList = parsedNote.phones.length ? parsedNote.phones : [contact.phone].filter(Boolean);
    return {
        primaryEmail: emailList[0] || contact.email || '',
        extraEmails: Math.max(0, emailList.length - 1),
        primaryPhone: phoneList[0] || contact.phone || '',
    };
}

function getContactInitials(fullName: string | null, email: string | null): string {
    const name = String(fullName || '').trim();
    if (name) {
        const parts = name.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
        }
        return (parts[0].slice(0, 2) || '?').toUpperCase();
    }
    const emailValue = String(email || '').trim();
    if (emailValue) {
        const local = emailValue.split('@')[0] || '';
        return (local.slice(0, 2) || '?').toUpperCase();
    }
    return '?';
}

function DynamicContactFieldList({
    label,
    valueLabel,
    values,
    onChange,
    type,
    placeholder,
    requiredFirst = false,
}: {
    label: string;
    valueLabel: string;
    values: string[];
    onChange: (next: string[]) => void;
    type: 'text' | 'email';
    placeholder?: string;
    requiredFirst?: boolean;
}) {
    const safeValues = values.length ? values : [''];
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                    onClick={() => onChange([...safeValues, ''])}
                >
                    Add {valueLabel.toLowerCase()}
                </button>
            </div>
            <div className="space-y-2">
                {safeValues.map((value, index) => (
                    <div key={`${valueLabel}-${index}`} className="flex items-center gap-2">
                        <input
                            type={type}
                            value={value}
                            onChange={(event) => {
                                const next = [...safeValues];
                                next[index] = event.target.value;
                                onChange(next);
                            }}
                            placeholder={placeholder}
                            required={requiredFirst && index === 0}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#35373c]"
                            disabled={safeValues.length === 1}
                            onClick={() => onChange(safeValues.filter((_, valueIndex) => valueIndex !== index))}
                            title={`Remove ${valueLabel.toLowerCase()}`}
                            aria-label={`Remove ${valueLabel.toLowerCase()}`}
                        >
                            <X size={14}/>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
