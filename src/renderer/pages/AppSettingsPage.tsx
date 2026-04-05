import React, {useEffect, useMemo, useRef, useState} from 'react';
import type {AppSettings, AutoUpdateState, PublicAccount, UpdateAccountPayload} from '../../preload';
import {cn} from '../lib/utils';
import WindowTitleBar from '../components/WindowTitleBar';
import {useThemePreference} from '../hooks/useAppTheme';
import ServiceSettingsCard from '../components/settings/ServiceSettingsCard';
import DynamicSidebar, {type DynamicSidebarSection} from '../components/navigation/DynamicSidebar';
import WorkspaceLayout from '../layouts/WorkspaceLayout';

type AppSettingsPageProps = {
    embedded?: boolean;
    targetAccountId?: number | null;
};

type AccountEditor = UpdateAccountPayload & { id: number };

type SettingsPanel =
    | { kind: 'app' }
    | { kind: 'account'; id: number };

const defaultSettings: AppSettings = {
    language: 'system',
    theme: 'system',
    minimizeToTray: true,
    syncIntervalMinutes: 2,
    autoUpdateEnabled: true,
    developerMode: false,
};

const defaultAutoUpdateState: AutoUpdateState = {
    enabled: false,
    phase: 'disabled',
    currentVersion: 'unknown',
    latestVersion: null,
    downloadedVersion: null,
    percent: null,
    transferred: null,
    total: null,
    message: null,
};

export default function AppSettingsPage({embedded = false, targetAccountId = null}: AppSettingsPageProps) {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState>(defaultAutoUpdateState);
    const [updateActionBusy, setUpdateActionBusy] = useState(false);
    const [appStatus, setAppStatus] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [panel, setPanel] = useState<SettingsPanel>(
        typeof targetAccountId === 'number' ? {kind: 'account', id: targetAccountId} : {kind: 'app'},
    );
    const [editor, setEditor] = useState<AccountEditor | null>(null);
    const [savingAccount, setSavingAccount] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [accountStatus, setAccountStatus] = useState<string | null>(null);

    const saveRequestSeqRef = useRef(0);

    useEffect(() => {
        window.electronAPI.getAppSettings().then((next) => {
            setSettings(next);
        }).catch(() => undefined);
        window.electronAPI.getAutoUpdateState?.().then((next) => {
            setAutoUpdateState(next);
        }).catch(() => undefined);
        const off = window.electronAPI.onAppSettingsUpdated?.((next) => {
            setSettings(next);
        });
        const offUpdate = window.electronAPI.onAutoUpdateStatus?.((next) => {
            setAutoUpdateState(next);
        });
        return () => {
            if (typeof off === 'function') off();
            if (typeof offUpdate === 'function') offUpdate();
        };
    }, []);

    useEffect(() => {
        let active = true;
        const loadAccounts = async () => {
            const list = await window.electronAPI.getAccounts();
            if (!active) return;
            setAccounts(list);
            setPanel((prev) => {
                if (prev.kind === 'account' && list.some((account) => account.id === prev.id)) return prev;
                if (typeof targetAccountId === 'number' && list.some((account) => account.id === targetAccountId)) {
                    return {kind: 'account', id: targetAccountId};
                }
                return prev.kind === 'account' ? {kind: 'app'} : prev;
            });
        };
        void loadAccounts();

        const offAdded = window.electronAPI.onAccountAdded?.(() => {
            void loadAccounts();
        });
        const offUpdated = window.electronAPI.onAccountUpdated?.((updated) => {
            setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
        });
        const offDeleted = window.electronAPI.onAccountDeleted?.((deleted) => {
            setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
            setPanel((prev) => (prev.kind === 'account' && prev.id === deleted.id ? {kind: 'app'} : prev));
        });

        return () => {
            active = false;
            if (typeof offAdded === 'function') offAdded();
            if (typeof offUpdated === 'function') offUpdated();
            if (typeof offDeleted === 'function') offDeleted();
        };
    }, [targetAccountId]);

    useEffect(() => {
        if (typeof targetAccountId !== 'number') return;
        if (!accounts.some((account) => account.id === targetAccountId)) return;
        setPanel({kind: 'account', id: targetAccountId});
    }, [accounts, targetAccountId]);

    const selectedAccount = useMemo(
        () => (panel.kind === 'account' ? accounts.find((account) => account.id === panel.id) ?? null : null),
        [accounts, panel],
    );

    useEffect(() => {
        if (!selectedAccount) {
            setEditor(null);
            return;
        }
        setEditor({
            id: selectedAccount.id,
            email: selectedAccount.email,
            provider: selectedAccount.provider,
            display_name: selectedAccount.display_name,
            reply_to: selectedAccount.reply_to,
            organization: selectedAccount.organization,
            signature_text: selectedAccount.signature_text,
            signature_is_html: selectedAccount.signature_is_html,
            signature_file_path: selectedAccount.signature_file_path,
            attach_vcard: selectedAccount.attach_vcard,
            user: selectedAccount.user,
            imap_host: selectedAccount.imap_host,
            imap_port: selectedAccount.imap_port,
            imap_secure: selectedAccount.imap_secure,
            pop3_host: selectedAccount.pop3_host,
            pop3_port: selectedAccount.pop3_port,
            pop3_secure: selectedAccount.pop3_secure,
            smtp_host: selectedAccount.smtp_host,
            smtp_port: selectedAccount.smtp_port,
            smtp_secure: selectedAccount.smtp_secure,
            password: '',
        });
    }, [selectedAccount]);

    useThemePreference(settings.theme);

    async function applySettingsPatch(patch: Partial<AppSettings>) {
        setSettings((prev) => ({...prev, ...patch}));
        setAppStatus('Saving...');
        const requestSeq = ++saveRequestSeqRef.current;
        try {
            const saved = await window.electronAPI.updateAppSettings(patch);
            if (requestSeq !== saveRequestSeqRef.current) return;
            setSettings(saved);
            setAppStatus('Settings saved.');
        } catch (e: any) {
            if (requestSeq !== saveRequestSeqRef.current) return;
            setAppStatus(`Save failed: ${e?.message || String(e)}`);
        }
    }

    async function onSaveAccount() {
        if (!editor || savingAccount) return;
        setSavingAccount(true);
        setAccountStatus('Saving account...');
        try {
            const normalized: UpdateAccountPayload = {
                ...editor,
                email: editor.email.trim(),
                user: editor.user.trim(),
                provider: editor.provider?.trim() || null,
                display_name: editor.display_name?.trim() || null,
                reply_to: editor.reply_to?.trim() || null,
                organization: editor.organization?.trim() || null,
                signature_text: editor.signature_text ?? null,
                signature_is_html: editor.signature_is_html ? 1 : 0,
                signature_file_path: editor.signature_file_path?.trim() || null,
                attach_vcard: editor.attach_vcard ? 1 : 0,
                imap_host: editor.imap_host.trim(),
                smtp_host: editor.smtp_host.trim(),
                pop3_host: editor.pop3_host?.trim() || null,
                password: editor.password?.trim() || null,
            };
            await window.electronAPI.updateAccount(editor.id, normalized);
            setAccountStatus('Account settings saved.');
            setEditor((prev) => (prev ? {...prev, password: ''} : prev));
        } catch (e: any) {
            setAccountStatus(`Save failed: ${e?.message || String(e)}`);
        } finally {
            setSavingAccount(false);
        }
    }

    async function onDeleteAccount() {
        if (!editor || deletingAccount) return;
        const confirmed = window.confirm(`Delete account "${editor.email}"?\n\nThis removes all synced local data for this account.`);
        if (!confirmed) return;
        setDeletingAccount(true);
        setAccountStatus('Deleting account...');
        try {
            await window.electronAPI.deleteAccount(editor.id);
            setAccountStatus('Account deleted.');
            setPanel({kind: 'app'});
        } catch (e: any) {
            setAccountStatus(`Delete failed: ${e?.message || String(e)}`);
        } finally {
            setDeletingAccount(false);
        }
    }

    async function onCheckForUpdates() {
        if (updateActionBusy) return;
        setUpdateActionBusy(true);
        try {
            const next = await window.electronAPI.checkForUpdates();
            setAutoUpdateState(next);
        } finally {
            setUpdateActionBusy(false);
        }
    }

    async function onDownloadUpdate() {
        if (updateActionBusy) return;
        setUpdateActionBusy(true);
        try {
            const next = await window.electronAPI.downloadUpdate();
            setAutoUpdateState(next);
        } finally {
            setUpdateActionBusy(false);
        }
    }

    async function onInstallUpdate() {
        await window.electronAPI.quitAndInstallUpdate();
    }

    const isAccountPanel = panel.kind === 'account';
    const activeStatus = isAccountPanel ? accountStatus : appStatus;
    const hasStatusText = Boolean((activeStatus || '').trim());
    const shouldShowFooter = isAccountPanel || !embedded || hasStatusText;
    const selectedSidebarItemId = panel.kind === 'account' ? `account:${panel.id}` : 'app';
    const sidebarSections: DynamicSidebarSection[] = useMemo(
        () => [
            {
                id: 'primary',
                items: [{id: 'app', label: 'Application'}],
            },
            {
                id: 'accounts',
                title: 'Accounts',
                emptyLabel: 'No accounts available.',
                items: [
                    ...accounts.map((account) => ({
                        id: `account:${account.id}`,
                        label: account.display_name?.trim() || account.email,
                        description: account.display_name?.trim() ? account.email : null,
                    })),
                    {
                        id: 'account:add',
                        label: '+ Add account',
                        description: 'Open account setup',
                    },
                ],
            },
        ],
        [accounts],
    );

    function onSidebarSelect(itemId: string): void {
        if (itemId === 'app') {
            setPanel({kind: 'app'});
            return;
        }
        if (itemId === 'account:add') {
            void window.electronAPI.openAddAccountWindow();
            return;
        }
        if (!itemId.startsWith('account:')) return;
        const accountId = Number(itemId.slice('account:'.length));
        if (!Number.isFinite(accountId)) return;
        setPanel({kind: 'account', id: accountId});
    }

    const footerActions = (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                {isAccountPanel && (
                    <button
                        type="button"
                        onClick={() => void onDeleteAccount()}
                        disabled={!editor || deletingAccount}
                        className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                        {deletingAccount ? 'Deleting...' : 'Delete Account'}
                    </button>
                )}
                {hasStatusText && <span className="text-xs text-slate-500 dark:text-slate-400">{activeStatus}</span>}
            </div>
            <div className="flex items-center gap-2">
                {!embedded && (
                    <button
                        type="button"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                        onClick={() => window.close()}
                    >
                        Close
                    </button>
                )}
                {isAccountPanel && (
                    <button
                        type="button"
                        onClick={() => void onSaveAccount()}
                        disabled={!editor || savingAccount}
                        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                    >
                        {savingAccount ? 'Saving...' : 'Save'}
                    </button>
                )}
            </div>
        </div>
    );

    const menubar = (
        <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">App Settings</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAccountPanel ? 'Manage account configuration and credentials' : 'Application preferences and updates'}
            </p>
        </div>
    );

    return (
        <div className="h-full w-full overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                {!embedded && <WindowTitleBar title="App Settings"/>}
                <WorkspaceLayout
                    className="bg-slate-100 dark:bg-[#2f3136]"
                    menubar={menubar}
                    showMenuBar
                    sidebar={(
                        <DynamicSidebar
                            sections={sidebarSections}
                            selectedItemId={selectedSidebarItemId}
                            onSelectItem={onSidebarSelect}
                        />
                    )}
                    showFooter={shouldShowFooter}
                    footer={footerActions}
                    showStatusBar={false}
                    contentClassName="min-h-0 flex-1 overflow-auto p-5"
                >
                    {!isAccountPanel && (
                        <div
                            className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]/70">
                            <div
                                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                <div className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Theme</span>
                                    <div
                                        className="inline-flex w-full overflow-hidden rounded-md border border-slate-300 dark:border-[#3a3d44]">
                                        {[
                                            {value: 'light', label: 'Light'},
                                            {value: 'dark', label: 'Dark'},
                                            {value: 'system', label: 'System'},
                                        ].map((option) => {
                                            const active = settings.theme === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={cn(
                                                        'h-10 flex-1 border-r border-slate-300 text-sm transition-colors last:border-r-0 dark:border-[#3a3d44]',
                                                        active
                                                            ? 'bg-sky-600 text-white dark:bg-[#5865f2]'
                                                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]',
                                                    )}
                                                    onClick={() => void applySettingsPatch({
                                                        theme: option.value as AppSettings['theme'],
                                                    })}
                                                >
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className="block text-sm">
                                    <span
                                        className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Language</span>
                                    <select
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                        value={settings.language}
                                        onChange={(e) => void applySettingsPatch({
                                            language: e.target.value as AppSettings['language'],
                                        })}
                                    >
                                        <option value="system">System default</option>
                                        <option value="en-US">English (US)</option>
                                        <option value="sv-SE">Swedish</option>
                                    </select>
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Auto sync interval (minutes)</span>
                                    <select
                                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                        value={settings.syncIntervalMinutes}
                                        onChange={(e) => void applySettingsPatch({
                                            syncIntervalMinutes: Number(e.target.value || 2),
                                        })}
                                    >
                                        {[1, 2, 5, 10, 15, 30, 60].map((m) => (
                                            <option key={m} value={m}>
                                                Every {m} minute{m > 1 ? 's' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label
                                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm dark:border-[#3a3d44]">
                                    <span className="text-slate-700 dark:text-slate-200">Minimize to tray</span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-sky-600 dark:accent-[#5865f2]"
                                        checked={settings.minimizeToTray}
                                        onChange={(e) => void applySettingsPatch({minimizeToTray: e.target.checked})}
                                    />
                                </label>

                                <label
                                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm dark:border-[#3a3d44]">
                                    <span className="text-slate-700 dark:text-slate-200">Auto update</span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-sky-600 dark:accent-[#5865f2]"
                                        checked={settings.autoUpdateEnabled}
                                        onChange={(e) => void applySettingsPatch({autoUpdateEnabled: e.target.checked})}
                                    />
                                </label>

                                <label
                                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm dark:border-[#3a3d44]">
                                    <span className="text-slate-700 dark:text-slate-200">Developer mode</span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-sky-600 dark:accent-[#5865f2]"
                                        checked={settings.developerMode}
                                        onChange={(e) => void applySettingsPatch({developerMode: e.target.checked})}
                                    />
                                </label>

                                <section className="rounded-md border border-slate-200 p-3 dark:border-[#3a3d44]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Updates</p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                Current version: {autoUpdateState.currentVersion}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                {autoUpdateState.message || describeUpdatePhase(autoUpdateState)}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {autoUpdateState.phase === 'downloaded' ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                                                    onClick={() => void onInstallUpdate()}
                                                >
                                                    Restart to Update
                                                </button>
                                            ) : autoUpdateState.phase === 'available' || autoUpdateState.phase === 'downloading' ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                                    onClick={() => void onDownloadUpdate()}
                                                    disabled={updateActionBusy || autoUpdateState.phase === 'downloading'}
                                                >
                                                    {autoUpdateState.phase === 'downloading'
                                                        ? `Downloading${autoUpdateState.percent !== null ? ` ${Math.round(autoUpdateState.percent)}%` : '...'}`
                                                        : 'Download Update'}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                    onClick={() => void onCheckForUpdates()}
                                                    disabled={updateActionBusy || !autoUpdateState.enabled}
                                                >
                                                    Check for Updates
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-md border border-slate-200 p-3 dark:border-[#3a3d44]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Developer
                                                Tools</p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                Open Chromium DevTools. Shortcut: Ctrl+Shift+I
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                            onClick={() => void window.electronAPI.openDevTools()}
                                        >
                                            Open DevTools
                                        </button>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    {isAccountPanel && (
                        <div className="mx-auto w-full max-w-5xl space-y-6">
                            {!editor && (
                                <div className="text-sm text-slate-500 dark:text-slate-400">Select an account.</div>
                            )}
                            {editor && (
                                <>
                                    <section
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Default
                                            Identity</h2>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            Each account has an identity that recipients see when reading your messages.
                                        </p>

                                        <div className="mt-4 grid grid-cols-[180px_1fr] items-center gap-3">
                                            <Label>Your Name:</Label>
                                            <Field value={editor.display_name || ''}
                                                   onChange={(v) => setEditor((p) => (p ? {
                                                       ...p,
                                                       display_name: v
                                                   } : p))}/>
                                            <Label>Email Address:</Label>
                                            <Field value={editor.email}
                                                   onChange={(v) => setEditor((p) => (p ? {...p, email: v} : p))}/>
                                            <Label>Reply-to Address:</Label>
                                            <Field value={editor.reply_to || ''}
                                                   onChange={(v) => setEditor((p) => (p ? {...p, reply_to: v} : p))}
                                                   placeholder="Recipients will reply to this address"/>
                                            <Label>Organization:</Label>
                                            <Field value={editor.organization || ''}
                                                   onChange={(v) => setEditor((p) => (p ? {
                                                       ...p,
                                                       organization: v
                                                   } : p))}/>
                                            <Label>Signature text:</Label>
                                            <div className="space-y-2">
                                                <label
                                                    className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!editor.signature_is_html}
                                                        onChange={(e) => setEditor((p) => (p ? {
                                                            ...p,
                                                            signature_is_html: e.target.checked ? 1 : 0,
                                                        } : p))}
                                                    />
                                                    Use HTML (e.g., &lt;b&gt;bold&lt;/b&gt;)
                                                </label>
                                                <textarea
                                                    value={editor.signature_text || ''}
                                                    onChange={(e) => setEditor((p) => (p ? {
                                                        ...p,
                                                        signature_text: e.target.value,
                                                    } : p))}
                                                    className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                                />
                                                <label
                                                    className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!editor.attach_vcard}
                                                        onChange={(e) => setEditor((p) => (p ? {
                                                            ...p,
                                                            attach_vcard: e.target.checked ? 1 : 0,
                                                        } : p))}
                                                    />
                                                    Attach my vCard to messages
                                                </label>
                                            </div>
                                        </div>
                                    </section>

                                    <section
                                        className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Server
                                            Settings</h2>
                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                            <Field label="User" value={editor.user}
                                                   onChange={(v) => setEditor((p) => (p ? {...p, user: v} : p))}/>
                                            <Field label="Provider" value={editor.provider || ''}
                                                   onChange={(v) => setEditor((p) => (p ? {...p, provider: v} : p))}/>
                                            <Field type="password" label="New password (optional)"
                                                   value={editor.password || ''}
                                                   onChange={(v) => setEditor((p) => (p ? {...p, password: v} : p))}/>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <ServiceSettingsCard
                                                title="IMAP Incoming"
                                                host={editor.imap_host}
                                                port={editor.imap_port}
                                                security={editor.imap_secure ? 'ssl' : 'starttls'}
                                                onHostChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    imap_host: value
                                                } : p))}
                                                onPortChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    imap_port: value
                                                } : p))}
                                                onSecurityChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    imap_secure: value === 'ssl' ? 1 : 0,
                                                } : p))}
                                            />
                                            <ServiceSettingsCard
                                                title="SMTP Outgoing"
                                                host={editor.smtp_host}
                                                port={editor.smtp_port}
                                                security={editor.smtp_secure ? 'ssl' : 'starttls'}
                                                onHostChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    smtp_host: value
                                                } : p))}
                                                onPortChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    smtp_port: value
                                                } : p))}
                                                onSecurityChange={(value) => setEditor((p) => (p ? {
                                                    ...p,
                                                    smtp_secure: value === 'ssl' ? 1 : 0,
                                                } : p))}
                                            />
                                        </div>
                                    </section>
                                </>
                            )}
                        </div>
                    )}
                </WorkspaceLayout>
            </div>
        </div>
    );
}

function describeUpdatePhase(state: AutoUpdateState): string {
    if (!state.enabled) return 'Auto-update disabled for this build.';
    if (state.phase === 'available') return `Update ${state.latestVersion ?? ''} is available.`;
    if (state.phase === 'not-available') return 'You are up to date.';
    if (state.phase === 'checking') return 'Checking for updates...';
    if (state.phase === 'downloading') return 'Downloading update...';
    if (state.phase === 'downloaded') return `Update ${state.downloadedVersion ?? state.latestVersion ?? ''} is ready to install.`;
    if (state.phase === 'error') return 'Update check failed.';
    return 'Ready to check for updates.';
}

function Field({
                   label,
                   value,
                   onChange,
                   type = 'text',
                   placeholder,
               }: {
    label?: string;
    value: string;
    onChange: (next: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <label className="block text-sm">
            {label && <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
            />
        </label>
    );
}

function Label({children}: { children: React.ReactNode }) {
    return <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{children}</div>;
}
