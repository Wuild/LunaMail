import React, {useEffect, useState} from 'react';
import {BookPlus, Download, Pencil, Plus, RefreshCw, Settings, Trash2, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {AddressBookItem, ContactItem, PublicAccount, SyncStatusEvent} from '@/preload';
import {
    getAccountAvatarColors,
    getAccountAvatarColorsForAccount,
    getAccountMonogram
} from '@renderer/lib/accountAvatar';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {Button} from '@renderer/components/ui/button';
import {FormInput, FormSelect, FormTextarea} from '@renderer/components/ui/FormControls';
import {Modal, ModalHeader, ModalTitle} from '@renderer/components/ui/Modal';
import {
    statusAutoSyncFailed,
    statusNoAccountSelected,
    statusSyncCompleteDav,
    statusSyncCompleteMessages,
    statusSyncFailed,
    statusSyncing,
    toErrorMessage,
} from '@renderer/lib/statusText';
import {cn} from '@renderer/lib/utils';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';

type ContactsPageProps = {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
};

type ContactMeta = {
    emails: string[];
    phones: string[];
};

const CONTACT_META_PREFIX = '[LUNAMAIL_CONTACT_META_V1]';

export default function ContactsPage({accountId, accounts, onSelectAccount}: ContactsPageProps) {
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
        const trimmedQuery = q.trim();
        const rows = await ipcClient.getContacts(targetAccountId, trimmedQuery || null, 600, bookId ?? null);
        if (!trimmedQuery || rows.length > 0) {
            setContacts(rows);
            return;
        }
        // Fallback for any backend search regression: filter locally from the same book/account scope.
        const unfilteredRows = await ipcClient.getContacts(targetAccountId, null, 600, bookId ?? null);
        const needle = trimmedQuery.toLowerCase();
        setContacts(unfilteredRows.filter((contact) => contactMatchesQuery(contact, needle)));
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
    }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <aside className="sidebar flex h-full min-h-0 shrink-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <p className="ui-text-muted px-2 pb-2 text-xs font-semibold uppercase tracking-wide">
                    Accounts
                </p>
                <div className="space-y-1">
                    {accounts.map((account) => {
                        const isSyncingAccount = syncing && syncingAccountId === account.id;
                        const avatarColors = getAccountAvatarColorsForAccount(account);
                        return (
                            <div
                                key={account.id}
                                className={cn(
                                    'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                                    accountId === account.id
                                        ? 'ui-surface-active ui-text-primary'
                                        : 'account-item',
                                )}
                            >
                                <Button
                                    type="button"
                                    onClick={() => onSelectAccount(account.id)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                    <span
                                        className="avatar-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
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
                                                className="ui-text-muted block truncate text-[11px] font-normal">
												{account.email}
											</span>
                                        )}
									</span>
                                </Button>
                                <div
                                    className={cn(
                                        'flex items-center gap-1 transition-opacity',
                                        isSyncingAccount ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                    )}
                                >
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
                                        onClick={() => void onManualSync(account.id)}
                                        title="Sync account"
                                        aria-label="Sync account"
                                        disabled={isSyncingAccount}
                                    >
                                        <RefreshCw size={13} className={cn(isSyncingAccount && 'animate-spin')}/>
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
                                        onClick={() => navigate(`/settings/account?accountId=${account.id}`)}
                                        title="Edit account"
                                        aria-label="Edit account"
                                    >
                                        <Settings size={13}/>
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                    {accounts.length === 0 && (
                        <p className="ui-text-muted px-2 py-2 text-sm">No accounts available.</p>
                    )}
                </div>
            </div>
        </aside>
    );
    const contactsToolbar = (
        <div className="flex h-10 min-w-0 items-center gap-2">
            <FormSelect
                value={selectedBookId ?? ''}
                onChange={(event) => setSelectedBookId(event.target.value ? Number(event.target.value) : null)}
                className="h-10 min-w-52 shrink-0 rounded-md px-3 text-sm disabled:opacity-60"
                disabled={!accountId}
            >
                <option value="">All address books</option>
                {addressBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                        {book.name}
                    </option>
                ))}
            </FormSelect>
            <Button
                type="button"
                variant="outline"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
                disabled={!accountId}
                onClick={() => setShowAddAddressBookModal(true)}
                title="Create address book"
                aria-label="Create address book"
            >
                <BookPlus size={14}/>
            </Button>
            <Button
                type="button"
                variant="outline"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
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
            </Button>
            <div className="ml-auto flex items-center gap-2">
                <Button
                    type="button"
                    variant="default"
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
                    onClick={() => setShowAddContactModal(true)}
                    disabled={!accountId}
                    title="Add contact"
                    aria-label="Add contact"
                >
                    <Plus size={14}/>
                    Add contact
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-60"
                    onClick={() => setShowExportContactsModal(true)}
                    disabled={!accountId}
                    title="Export contacts"
                    aria-label="Export contacts"
                >
                    <Download size={14}/>
                    Export
                </Button>
            </div>
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
                    <p className="ui-text-muted text-sm">{statusNoAccountSelected()}</p>
                )}
                {accountId && (
                    <>
                        {contactError && <p className="text-danger mb-3 text-sm">{contactError}</p>}
                        <div className="mb-3">
                            <FormInput
                                type="text"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search contacts..."
                                disabled={!accountId}
                            />
                        </div>
                        {loading && <p className="ui-text-muted text-sm">Loading contacts...</p>}
                        {!loading && contacts.length === 0 && (
                            <p className="ui-text-muted text-sm">No contacts found.</p>
                        )}
                        {!loading && contacts.length > 0 && (
                            <div className="panel mt-4 overflow-hidden rounded-lg">
                                <ul className="contacts-list">
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
                                                        className="avatar-ring mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
                                                        style={{
                                                            backgroundColor: avatarColors.background,
                                                            color: avatarColors.foreground,
                                                        }}
                                                        aria-hidden
                                                    >
                                                        {getContactInitials(contact.full_name, preview.primaryEmail)}
                                                    </span>
                                                            <div className="min-w-0">
                                                                <p className="ui-text-primary text-sm font-medium">
                                                                    {contact.full_name || '(No name)'}
                                                                </p>
                                                                <p className="ui-text-secondary mt-0.5 text-xs">
                                                                    {preview.primaryEmail}
                                                                    {preview.extraEmails > 0 ? ` (+${preview.extraEmails} more)` : ''}
                                                                </p>
                                                                {(preview.primaryPhone || contact.organization || contact.title) && (
                                                                    <p className="ui-text-muted mt-0.5 text-xs">
                                                                        {[preview.primaryPhone, contact.organization, contact.title]
                                                                            .filter(Boolean)
                                                                            .join(' • ')}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
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
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="danger"
                                                                className="rounded-md px-2 py-1 text-xs disabled:opacity-50"
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
                                                            </Button>
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
                <Modal
                    open
                    onClose={() => setShowAddContactModal(false)}
                    backdropClassName="z-50"
                    contentClassName="max-w-5xl"
                >
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void onAddContact();
                        }}
                    >
                        <ModalHeader className="ui-border-default border-b pb-3">
                            <div className="min-w-0 flex-1">
                                <ModalTitle className="text-base">Add Contact</ModalTitle>
                                <p className="ui-text-muted mt-1 text-xs">Create a contact for the selected account.</p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md"
                                onClick={() => setShowAddContactModal(false)}
                                title="Close"
                                aria-label="Close add contact modal"
                            >
                                <X size={14}/>
                            </Button>
                        </ModalHeader>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-3">
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Full name
									</span>
                                    <FormInput
                                        type="text"
                                        value={newContactName}
                                        onChange={(event) => setNewContactName(event.target.value)}
                                        placeholder="Jane Doe"
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
									<span className="ui-text-secondary mb-1 block font-medium">
										Organization
									</span>
                                    <FormInput
                                        type="text"
                                        value={newContactOrganization}
                                        onChange={(event) => setNewContactOrganization(event.target.value)}
                                        placeholder="Acme Inc."
                                    />
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Title
									</span>
                                    <FormInput
                                        type="text"
                                        value={newContactTitle}
                                        onChange={(event) => setNewContactTitle(event.target.value)}
                                        placeholder="Sales Manager"
                                    />
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Address book
									</span>
                                    <FormSelect
                                        value={selectedBookId ?? ''}
                                        onChange={(event) =>
                                            setSelectedBookId(event.target.value ? Number(event.target.value) : null)
                                        }
                                    >
                                        <option value="">No address book</option>
                                        {addressBooks.map((book) => (
                                            <option key={book.id} value={book.id}>
                                                {book.name}
                                            </option>
                                        ))}
                                    </FormSelect>
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Notes
									</span>
                                    <FormTextarea
                                        value={newContactNote}
                                        onChange={(event) => setNewContactNote(event.target.value)}
                                        rows={7}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-md px-3 py-2 text-sm"
                                onClick={() => setShowAddContactModal(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                disabled={!normalizeContactValues(newContactEmails).length}
                            >
                                Save Contact
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {editingContact && accountId && (
                <Modal
                    open
                    onClose={() => setEditingContact(null)}
                    backdropClassName="z-50"
                    contentClassName="max-w-5xl"
                >
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void onSaveEditedContact();
                        }}
                    >
                        <ModalHeader className="ui-border-default border-b pb-3">
                            <ModalTitle className="text-base">Edit Contact</ModalTitle>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md"
                                onClick={() => setEditingContact(null)}
                                title="Close"
                                aria-label="Close edit contact modal"
                            >
                                <X size={14}/>
                            </Button>
                        </ModalHeader>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-3">
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Full name
									</span>
                                    <FormInput
                                        type="text"
                                        value={editContactName}
                                        onChange={(event) => setEditContactName(event.target.value)}
                                        placeholder="Jane Doe"
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
									<span className="ui-text-secondary mb-1 block font-medium">
										Organization
									</span>
                                    <FormInput
                                        type="text"
                                        value={editContactOrganization}
                                        onChange={(event) => setEditContactOrganization(event.target.value)}
                                    />
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Title
									</span>
                                    <FormInput
                                        type="text"
                                        value={editContactTitle}
                                        onChange={(event) => setEditContactTitle(event.target.value)}
                                    />
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Address book
									</span>
                                    <FormSelect
                                        value={editContactBookId ?? ''}
                                        onChange={(event) =>
                                            setEditContactBookId(event.target.value ? Number(event.target.value) : null)
                                        }
                                        disabled={editingContact.source === 'carddav'}
                                    >
                                        <option value="">No address book</option>
                                        {addressBooks.map((book) => (
                                            <option key={book.id} value={book.id}>
                                                {book.name}
                                            </option>
                                        ))}
                                    </FormSelect>
                                </label>
                                <label className="block text-sm">
									<span className="ui-text-secondary mb-1 block font-medium">
										Notes
									</span>
                                    <FormTextarea
                                        value={editContactNote}
                                        onChange={(event) => setEditContactNote(event.target.value)}
                                        rows={7}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-md px-3 py-2 text-sm"
                                onClick={() => setEditingContact(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                disabled={savingEditContact || !normalizeContactValues(editContactEmails).length}
                            >
                                {savingEditContact ? 'Saving...' : 'Save changes'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {showAddAddressBookModal && accountId && (
                <Modal
                    open
                    onClose={() => setShowAddAddressBookModal(false)}
                    backdropClassName="z-50"
                    contentClassName="max-w-md"
                >
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void onAddAddressBook();
                        }}
                    >
                        <ModalHeader className="ui-border-default border-b pb-3">
                            <div className="min-w-0 flex-1">
                                <ModalTitle className="text-base">Create Address Book</ModalTitle>
                                <p className="ui-text-muted mt-1 text-xs">
                                    Local address books can be used to organize manual contacts.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md"
                                onClick={() => setShowAddAddressBookModal(false)}
                                title="Close"
                                aria-label="Close create address book modal"
                            >
                                <X size={14}/>
                            </Button>
                        </ModalHeader>
                        <label className="mt-4 block text-sm">
                            <span className="ui-text-secondary mb-1 block font-medium">Name</span>
                            <FormInput
                                type="text"
                                value={newAddressBookName}
                                onChange={(event) => setNewAddressBookName(event.target.value)}
                                placeholder="Personal"
                                required
                            />
                        </label>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-md px-3 py-2 text-sm"
                                onClick={() => setShowAddAddressBookModal(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                disabled={addingAddressBook || !newAddressBookName.trim()}
                            >
                                {addingAddressBook ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {showExportContactsModal && accountId && (
                <Modal
                    open
                    onClose={() => setShowExportContactsModal(false)}
                    backdropClassName="z-50"
                    contentClassName="max-w-md"
                >
                    <ModalHeader className="ui-border-default border-b pb-3">
                        <ModalTitle className="text-base">Export Contacts</ModalTitle>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md"
                            onClick={() => setShowExportContactsModal(false)}
                            title="Close"
                            aria-label="Close export contacts modal"
                        >
                            <X size={14}/>
                        </Button>
                    </ModalHeader>
                    <div className="mt-4 space-y-3">
                        <label className="block text-sm">
								<span className="ui-text-secondary mb-1 block font-medium">
									Format
								</span>
                            <FormSelect
                                value={exportFormat}
                                onChange={(event) => setExportFormat(event.target.value === 'vcf' ? 'vcf' : 'csv')}
                            >
                                <option value="csv">CSV (.csv)</option>
                                <option value="vcf">vCard (.vcf)</option>
                            </FormSelect>
                        </label>
                        <label className="block text-sm">
                            <span className="ui-text-secondary mb-1 block font-medium">Scope</span>
                            <FormSelect
                                value={exportBookMode}
                                onChange={(event) =>
                                    setExportBookMode(event.target.value === 'all' ? 'all' : 'selected')
                                }
                            >
                                <option value="selected">Current book</option>
                                <option value="all">All books</option>
                            </FormSelect>
                        </label>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-md px-3 py-2 text-sm"
                            onClick={() => setShowExportContactsModal(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                            onClick={() => void onExportContacts()}
                            disabled={exportingContacts}
                        >
                            <Download size={14}/>
                            {exportingContacts ? 'Exporting...' : 'Export'}
                        </Button>
                    </div>
                </Modal>
            )}
        </WorkspaceLayout>
    );
}

function contactMatchesQuery(contact: ContactItem, needle: string): boolean {
    if (!needle) return true;
    const haystacks = [
        contact.full_name || '',
        contact.email || '',
        contact.phone || '',
        contact.organization || '',
        contact.title || '',
        contact.note || '',
    ];
    return haystacks.some((value) => value.toLowerCase().includes(needle));
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
                <span className="ui-text-secondary text-sm font-medium">{label}</span>
                <Button
                    type="button"
                    variant="outline"
                    className="rounded-md px-2 py-1 text-xs"
                    onClick={() => onChange([...safeValues, ''])}
                >
                    Add {valueLabel.toLowerCase()}
                </Button>
            </div>
            <div className="space-y-2">
                {safeValues.map((value, index) => (
                    <div key={`${valueLabel}-${index}`} className="relative w-full">
                        <FormInput
                            type={type}
                            value={value}
                            onChange={(event) => {
                                const next = [...safeValues];
                                next[index] = event.target.value;
                                onChange(next);
                            }}
                            placeholder={placeholder}
                            required={requiredFirst && index === 0}
                            className="w-full pr-12"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 disabled:opacity-40"
                            disabled={safeValues.length === 1}
                            onClick={() => onChange(safeValues.filter((_, valueIndex) => valueIndex !== index))}
                            title={`Remove ${valueLabel.toLowerCase()}`}
                            aria-label={`Remove ${valueLabel.toLowerCase()}`}
                        >
                            <X size={14}/>
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
