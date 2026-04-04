import React, {useEffect, useMemo, useState} from 'react';
import {Bug, CalendarDays, CircleHelp, Copy, Mail, Minus, RefreshCw, Settings, Square, Users, X} from 'lucide-react';
import {HashRouter, Navigate, NavLink, Route, Routes, useLocation} from 'react-router-dom';
import MailPage from './pages/MailPage';
import AppSettingsPage from './pages/AppSettingsPage';
import DebugConsolePage from './pages/DebugConsolePage';
import SupportPage from './pages/SupportPage';
import WorkspaceLayout from './layouts/WorkspaceLayout';
import lunaLogo from '../resources/luna.png';
import type {AddressBookItem, CalendarEventItem, ContactItem, PublicAccount, SyncStatusEvent} from '../preload';
import {getAccountAvatarColors, getAccountMonogram} from './lib/accountAvatar';
import {formatSystemDateTime} from './lib/dateTime';
import {cn} from './lib/utils';

export default function MainWindowApp() {
    return (
        <HashRouter>
            <MainWindowShell/>
        </HashRouter>
    );
}

function MainWindowShell() {
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [isMaximized, setIsMaximized] = useState(false);
    const [appVersion, setAppVersion] = useState('unknown');

    useEffect(() => {
        let active = true;
        const loadAccounts = async () => {
            const rows = await window.electronAPI.getAccounts();
            if (!active) return;
            setAccounts(rows);
            setSelectedAccountId((prev) => {
                if (prev && rows.some((account) => account.id === prev)) return prev;
                return rows[0]?.id ?? null;
            });
        };
        void loadAccounts();
        void window.electronAPI.getUnreadCount().then((count) => {
            if (!active) return;
            setTotalUnreadCount(Math.max(0, Number(count) || 0));
        }).catch(() => undefined);
        const offAdded = window.electronAPI.onAccountAdded?.(() => {
            void loadAccounts();
        });
        const offUpdated = window.electronAPI.onAccountUpdated?.((updated) => {
            setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
        });
        const offDeleted = window.electronAPI.onAccountDeleted?.((deleted) => {
            setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
            setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
        });
        const offUnread = window.electronAPI.onUnreadCountUpdated?.((count) => {
            setTotalUnreadCount(Math.max(0, Number(count) || 0));
        });
        return () => {
            active = false;
            if (typeof offAdded === 'function') offAdded();
            if (typeof offUpdated === 'function') offUpdated();
            if (typeof offDeleted === 'function') offDeleted();
            if (typeof offUnread === 'function') offUnread();
        };
    }, []);

    useEffect(() => {
        let active = true;
        void window.electronAPI.isWindowMaximized().then((value) => {
            if (!active) return;
            setIsMaximized(Boolean(value));
        }).catch(() => undefined);
        const onResize = () => {
            void window.electronAPI.isWindowMaximized().then((value) => {
                if (!active) return;
                setIsMaximized(Boolean(value));
            }).catch(() => undefined);
        };
        window.addEventListener('resize', onResize);
        return () => {
            active = false;
            window.removeEventListener('resize', onResize);
        };
    }, []);

    useEffect(() => {
        let active = true;
        void window.electronAPI.getAutoUpdateState().then((state) => {
            if (!active) return;
            setAppVersion(state.currentVersion || 'unknown');
        }).catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <header
                className="relative flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-2 text-slate-100 dark:border-[#08090c] dark:bg-[#0b0c10]"
                style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
                onDoubleClick={() => {
                    void window.electronAPI.toggleMaximizeWindow().then((res) => setIsMaximized(!!res?.isMaximized)).catch(() => undefined);
                }}
            >
                <div className="w-48 shrink-0"/>
                <div
                    className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/80">
                        <img src={lunaLogo} alt="" className="h-4 w-4 rounded-sm object-contain" draggable={false}/>
                        <span>LunaMail</span>
                        <span
                            className="text-[10px] font-semibold uppercase tracking-wide text-white/55">v{appVersion}</span>
                    </div>
                </div>
                <div
                    className="flex w-24 shrink-0 items-center justify-end gap-1"
                    style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
                >
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                        onClick={() => void window.electronAPI.minimizeWindow()}
                        title="Minimize"
                        aria-label="Minimize"
                    >
                        <Minus size={14}/>
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                        onClick={() =>
                            void window.electronAPI.toggleMaximizeWindow().then((res) => setIsMaximized(!!res?.isMaximized)).catch(() => undefined)
                        }
                        title={isMaximized ? 'Restore' : 'Maximize'}
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        {isMaximized ? <Copy size={13}/> : <Square size={13}/>}
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-red-600 hover:text-white"
                        onClick={() => void window.electronAPI.closeWindow()}
                        title="Close"
                        aria-label="Close"
                    >
                        <X size={14}/>
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside
                    className="flex h-full w-16 shrink-0 flex-col items-center justify-between bg-slate-800 py-3 dark:bg-[#111216]">
                    <div className="flex flex-col items-center gap-2">
                        <NavRailItem to="/mail" icon={<Mail size={18}/>} label="Mail" badgeCount={totalUnreadCount}/>
                        <NavRailItem to="/contacts" icon={<Users size={18}/>} label="Contacts"/>
                        <NavRailItem to="/calendar" icon={<CalendarDays size={18}/>} label="Calendar"/>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <NavRailItem to="/settings" icon={<Settings size={16}/>} label="Settings"/>
                        <NavRailItem to="/debug" icon={<Bug size={16}/>} label="Debug"/>
                        <NavRailItem to="/help" icon={<CircleHelp size={16}/>} label="Help"/>
                    </div>
                </aside>

                <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    <Routes>
                        <Route path="/" element={<Navigate to="/mail" replace/>}/>
                        <Route path="/mail" element={<MailPage/>}/>
                        <Route
                            path="/contacts"
                            element={(
                                <ContactsRoute
                                    accountId={selectedAccountId}
                                    accounts={accounts}
                                    onSelectAccount={setSelectedAccountId}
                                />
                            )}
                        />
                        <Route path="/calendar" element={<CalendarRoute accountId={selectedAccountId}/>}/>
                        <Route path="/settings" element={<SettingsRoute/>}/>
                        <Route path="/debug" element={<DebugConsolePage embedded/>}/>
                        <Route path="/help" element={<SupportPage embedded/>}/>
                    </Routes>
                </main>
            </div>
        </div>
    );
}

function SettingsRoute() {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const rawTarget = Number(query.get('accountId'));
    const targetAccountId = Number.isFinite(rawTarget) ? rawTarget : null;
    return <AppSettingsPage embedded targetAccountId={targetAccountId}/>;
}

function NavRailItem({to, icon, label, badgeCount = 0}: {
    to: string;
    icon: React.ReactNode;
    label: string;
    badgeCount?: number
}) {
    return (
        <NavLink
            to={to}
            title={label}
            aria-label={label}
            className={({isActive}) =>
                cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
                    isActive && 'bg-white/15 text-white',
                )
            }
        >
            <span className="relative inline-flex">
                {icon}
                {badgeCount > 0 && (
                    <span
                        className="absolute -right-2.5 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-5 text-white">
                        {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                )}
            </span>
        </NavLink>
    );
}

function ContactsRoute({
                           accountId,
                           accounts,
                           onSelectAccount,
                       }: {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
}) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [addressBooks, setAddressBooks] = useState<AddressBookItem[]>([]);
    const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
    const [newBookName, setNewBookName] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatusText, setSyncStatusText] = useState<string>('Ready');
    const [contactError, setContactError] = useState<string | null>(null);

    const loadContacts = React.useCallback(async (targetAccountId: number, q: string, bookId: number | null) => {
        const rows = await window.electronAPI.getContacts(targetAccountId, q.trim() || null, 600, bookId ?? null);
        setContacts(rows);
    }, []);

    useEffect(() => {
        if (!accountId) {
            setContacts([]);
            setAddressBooks([]);
            setSelectedBookId(null);
            setShowAddContactModal(false);
            setSyncing(false);
            setSyncStatusText('No account selected.');
            setLoading(false);
            return;
        }
        setSyncStatusText('Ready');
        let active = true;
        const load = async () => {
            setLoading(true);
            setContactError(null);
            try {
                const books = await window.electronAPI.getAddressBooks(accountId);
                if (!active) return;
                setAddressBooks(books);
                const effectiveBookId = selectedBookId && books.some((book) => book.id === selectedBookId)
                    ? selectedBookId
                    : (books[0]?.id ?? null);
                setSelectedBookId(effectiveBookId);
                const rows = await window.electronAPI.getContacts(accountId, query.trim() || null, 600, effectiveBookId);
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

    useEffect(() => {
        const offSync = window.electronAPI.onAccountSyncStatus?.((evt: SyncStatusEvent) => {
            if (!accountId || evt.accountId !== accountId) return;
            if (evt.status === 'syncing') {
                setSyncing(true);
                setSyncStatusText('Syncing mailbox + CardDAV/CalDAV...');
                return;
            }
            if (evt.status === 'error') {
                setSyncing(false);
                setSyncStatusText(`Sync failed: ${evt.error ?? 'unknown error'}`);
                return;
            }
            setSyncing(false);
            const davSummary = evt.summary?.dav;
            if (davSummary) {
                setSyncStatusText(
                    `Sync complete: ${davSummary.contacts.upserted} contacts, ${davSummary.events.upserted} events`,
                );
                return;
            }
            setSyncStatusText(`Sync complete: ${evt.summary?.messages ?? 0} messages`);
        });
        return () => {
            if (typeof offSync === 'function') offSync();
        };
    }, [accountId]);

    async function onCreateAddressBook() {
        if (!accountId) return;
        const name = newBookName.trim();
        if (!name) return;
        setContactError(null);
        try {
            const created = await window.electronAPI.addAddressBook(accountId, name);
            setAddressBooks((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedBookId(created.id);
            setNewBookName('');
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    async function onAddContact() {
        if (!accountId) return;
        const email = newContactEmail.trim();
        if (!email) return;
        setContactError(null);
        try {
            await window.electronAPI.addContact(accountId, {
                addressBookId: selectedBookId,
                fullName: newContactName.trim() || null,
                email,
            });
            setNewContactName('');
            setNewContactEmail('');
            setShowAddContactModal(false);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    async function onDeleteContact(contactId: number) {
        if (!accountId) return;
        setContactError(null);
        try {
            await window.electronAPI.deleteContact(contactId);
            await loadContacts(accountId, query, selectedBookId);
        } catch (error: any) {
            setContactError(error?.message || String(error));
        }
    }

    async function onManualSync() {
        if (!accountId || syncing) return;
        setContactError(null);
        setSyncing(true);
        setSyncStatusText('Syncing mailbox + CardDAV/CalDAV...');
        try {
            await window.electronAPI.syncAccount(accountId);
            const books = await window.electronAPI.getAddressBooks(accountId);
            setAddressBooks(books);
            const effectiveBookId = selectedBookId && books.some((book) => book.id === selectedBookId)
                ? selectedBookId
                : (books[0]?.id ?? null);
            setSelectedBookId(effectiveBookId);
            await loadContacts(accountId, query, effectiveBookId);
        } catch (error: any) {
            setSyncing(false);
            const message = error?.message || String(error);
            setSyncStatusText(`Sync failed: ${message}`);
            setContactError(message);
        }
    }

    const accountSidebar = (
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Accounts</p>
            <div className="space-y-1">
                {accounts.map((account) => {
                    const avatarColors = getAccountAvatarColors(account.email || account.display_name || String(account.id));
                    return (
                        <button
                            key={account.id}
                            type="button"
                            onClick={() => onSelectAccount(account.id)}
                            className={cn(
                                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                accountId === account.id
                                    ? 'bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
                            )}
                        >
                            <div className="flex min-w-0 items-center gap-2">
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
                                    <span
                                        className="block truncate">{account.display_name?.trim() || account.email}</span>
                                    {account.display_name?.trim() && (
                                        <span
                                            className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">{account.email}</span>
                                    )}
                                </span>
                            </div>
                        </button>
                    );
                })}
                {accounts.length === 0 && (
                    <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No accounts available.</p>
                )}
            </div>
        </aside>
    );

    const contactsToolbar = (
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]">
            <select
                value={selectedBookId ?? ''}
                onChange={(event) => setSelectedBookId(event.target.value ? Number(event.target.value) : null)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
            >
                {addressBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                        {book.name}
                    </option>
                ))}
            </select>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newBookName}
                    onChange={(event) => setNewBookName(event.target.value)}
                    placeholder="New address book name"
                    className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                />
                <button
                    type="button"
                    className="h-10 rounded-md bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                    onClick={() => void onCreateAddressBook()}
                >
                    Add Book
                </button>
            </div>
            <button
                type="button"
                disabled={syncing}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                onClick={() => void onManualSync()}
            >
                <RefreshCw size={14} className={cn(syncing && 'animate-spin')}/>
                Sync now
            </button>
            <button
                type="button"
                className="h-10 rounded-md bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                onClick={() => setShowAddContactModal(true)}
            >
                Add Contact
            </button>
        </div>
    );

    return (
        <WorkspaceLayout
            sidebar={accountSidebar}
            menubar={contactsToolbar}
            showMenuBar
            statusText={syncStatusText}
            statusBusy={syncing}
        >
            <div className="mx-auto max-w-5xl">
                {!accountId && <p className="text-sm text-slate-500 dark:text-slate-400">No account selected.</p>}
                {accountId && (
                    <>
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search contacts..."
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        {contactError && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{contactError}</p>}
                        {loading &&
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading contacts...</p>}
                        {!loading && contacts.length === 0 && (
                            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No contacts found.</p>
                        )}
                        {!loading && contacts.length > 0 && (
                            <div
                                className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                    {contacts.map((contact) => (
                                        <li key={contact.id} className="px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{contact.full_name || '(No name)'}</p>
                                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{contact.email}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/30"
                                                    onClick={() => void onDeleteContact(contact.id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
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
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Contact</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create a contact for the selected
                            account.</p>
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Full name</span>
                                <input
                                    type="text"
                                    value={newContactName}
                                    onChange={(event) => setNewContactName(event.target.value)}
                                    placeholder="Jane Doe"
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Email</span>
                                <input
                                    type="email"
                                    value={newContactEmail}
                                    onChange={(event) => setNewContactEmail(event.target.value)}
                                    placeholder="jane@domain.com"
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                            </label>
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
                                type="button"
                                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                onClick={() => void onAddContact()}
                                disabled={!newContactEmail.trim()}
                            >
                                Save Contact
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </WorkspaceLayout>
    );
}

function CalendarRoute({accountId}: { accountId: number | null }) {
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState<CalendarEventItem[]>([]);
    const [systemLocale, setSystemLocale] = useState<string>('en-US');

    useEffect(() => {
        void window.electronAPI.getSystemLocale().then((locale) => {
            setSystemLocale(locale || 'en-US');
        }).catch(() => {
            setSystemLocale('en-US');
        });
    }, []);

    useEffect(() => {
        if (!accountId) {
            setEvents([]);
            setLoading(false);
            return;
        }
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const start = new Date(now);
                start.setDate(start.getDate() - 30);
                const end = new Date(now);
                end.setDate(end.getDate() + 365);
                const rows = await window.electronAPI.getCalendarEvents(accountId, start.toISOString(), end.toISOString(), 1000);
                if (!active) return;
                setEvents(rows);
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => {
            active = false;
        };
    }, [accountId]);

    const sortedEvents = useMemo(
        () => [...events].sort((a, b) => (Date.parse(a.starts_at || '') || 0) - (Date.parse(b.starts_at || '') || 0)),
        [events],
    );

    return (
        <section className="h-full overflow-auto bg-slate-50 p-5 dark:bg-[#26292f]">
            <div className="mx-auto max-w-5xl">
                {!accountId && <p className="text-sm text-slate-500 dark:text-slate-400">No account selected.</p>}
                {accountId && (
                    <>
                        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading events...</p>}
                        {!loading && sortedEvents.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No events found.</p>
                        )}
                        {!loading && sortedEvents.length > 0 && (
                            <div
                                className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                <ul className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
                                    {sortedEvents.map((event) => (
                                        <li key={event.id} className="px-4 py-3">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.summary || '(No title)'}</p>
                                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                                {formatSystemDateTime(event.starts_at, systemLocale)} - {formatSystemDateTime(event.ends_at, systemLocale)}
                                            </p>
                                            {event.location && (
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.location}</p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
