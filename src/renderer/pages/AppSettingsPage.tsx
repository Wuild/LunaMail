import React, {useEffect, useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AppWindow, Palette, Plus, ShieldCheck, Wrench} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import type {
    AppSettings,
    FolderItem,
    MailFilter,
    UpdateAccountPayload,
} from '../../preload';
import {cn} from '../lib/utils';
import WindowTitleBar from '../components/WindowTitleBar';
import {useThemePreference} from '../hooks/useAppTheme';
import {Button} from '../components/ui/button';
import DynamicSidebar, {type DynamicSidebarSection} from '../components/navigation/DynamicSidebar';
import WorkspaceLayout from '../layouts/WorkspaceLayout';
import {useResizableSidebar} from '../hooks/useResizableSidebar';
import {normalizeAllowlistEntry} from '../features/mail/remoteContent';
import {useAccounts} from '../hooks/ipc/useAccounts';
import {useAppSettings as useIpcAppSettings} from '../hooks/ipc/useAppSettings';
import {useAutoUpdateState} from '../hooks/ipc/useAutoUpdateState';
import {ipcClient} from '../lib/ipcClient';
import AppSettingsGeneralPanel from './AppSettingsGeneralPanel';
import {DEFAULT_APP_SETTINGS} from '../../shared/defaults';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '../lib/accountAvatar';
import AllowlistSettingsTab from './settings/tabs/AllowlistSettingsTab';
import LayoutSettingsTab from './settings/tabs/LayoutSettingsTab';
import DeveloperSettingsTab from './settings/tabs/DeveloperSettingsTab';
import AccountSettingsTab from './settings/tabs/AccountSettingsTab';
import {
    createDefaultMailFilterDraft,
    describeUpdatePhase,
    mapMailFilterToDraft,
    type MailFilterDraft,
    type MailFilterModalState,
} from './appSettingsMailFilterHelpers';
type AppSettingsPageProps = {
    embedded?: boolean;
    targetAccountId?: number | null;
    initialPanel?: 'app' | 'layout' | 'allowlist' | 'developer';
    initialAccountSection?: AccountPanelSection;
    openUpdaterToken?: string | null;
};
export type AccountEditor = UpdateAccountPayload & { id: number };
export type AccountPanelSection = 'identity' | 'server' | 'filters';
type SettingsPanel = { kind: 'app' } | { kind: 'layout' } | { kind: 'allowlist' } | { kind: 'developer' } | {
    kind: 'account';
    id: number
};
export default function AppSettingsPage({
                                            embedded = false,
                                            targetAccountId = null,
                                            initialPanel = 'app',
                                            initialAccountSection = 'identity',
                                            openUpdaterToken = null,
                                        }: AppSettingsPageProps) {
    const navigate = useNavigate();
    const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
    const {state: autoUpdateState, setState: setAutoUpdateState} = useAutoUpdateState();
    const {accounts} = useAccounts();
    const [updateActionBusy, setUpdateActionBusy] = useState(false);
    const [appStatus, setAppStatus] = useState<string | null>(null);
    const [panel, setPanel] = useState<SettingsPanel>(
        typeof targetAccountId === 'number'
            ? {kind: 'account', id: targetAccountId}
            : initialPanel === 'developer'
                ? {kind: 'developer'}
                : initialPanel === 'allowlist'
                    ? {kind: 'allowlist'}
                    : initialPanel === 'layout'
                        ? {kind: 'layout'}
                        : {kind: 'app'},
    );
    const [editor, setEditor] = useState<AccountEditor | null>(null);
    const [accountSection, setAccountSection] = useState<AccountPanelSection>(initialAccountSection);
    const [savingAccount, setSavingAccount] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [accountStatus, setAccountStatus] = useState<string | null>(null);
    const [mailFilterBusy, setMailFilterBusy] = useState(false);
    const [runningFilterId, setRunningFilterId] = useState<number | null>(null);
    const [developerStatus, setDeveloperStatus] = useState<string | null>(null);
    const [showUpdaterModal, setShowUpdaterModal] = useState(false);
    const [mailFilterModal, setMailFilterModal] = useState<MailFilterModalState>(null);
    const [remoteAllowlistInput, setRemoteAllowlistInput] = useState('');
    const [isDefaultEmailClient, setIsDefaultEmailClient] = useState<boolean | null>(null);
    const [defaultEmailClientBusy, setDefaultEmailClientBusy] = useState(false);
    const {sidebarWidth: settingsSidebarWidth, onResizeStart: onSettingsSidebarResizeStart} = useResizableSidebar({
        defaultWidth: 320,
        minWidth: 240,
        maxWidth: 460,
        storageKey: 'llamamail.settings.sidebar.width',
    });
    const {sidebarWidth: accountSectionSidebarWidth, onResizeStart: onAccountSectionResizeStart} =
        useResizableSidebar({
            defaultWidth: 240,
            minWidth: 180,
            maxWidth: 420,
            storageKey: 'llamamail.settings.account.sections.width',
        });
    useEffect(() => {
        setPanel((prev) => {
            if (prev.kind === 'account' && accounts.some((account) => account.id === prev.id)) return prev;
            if (typeof targetAccountId === 'number' && accounts.some((account) => account.id === targetAccountId)) {
                return {kind: 'account', id: targetAccountId};
            }
            return prev.kind === 'account' ? {kind: 'app'} : prev;
        });
    }, [accounts, targetAccountId]);
    useEffect(() => {
        if (typeof targetAccountId === 'number') return;
        if (initialPanel === 'developer') {
            setPanel({kind: 'developer'});
            return;
        }
        if (initialPanel === 'layout') {
            setPanel({kind: 'layout'});
            return;
        }
        if (initialPanel === 'allowlist') {
            setPanel({kind: 'allowlist'});
            return;
        }
        if (embedded) {
            setPanel({kind: 'app'});
            return;
        }
        setPanel((prev) =>
            prev.kind === 'account' || prev.kind === 'layout' || prev.kind === 'allowlist' ? prev : {kind: 'app'},
        );
    }, [embedded, initialPanel, targetAccountId]);
    useEffect(() => {
        if (!openUpdaterToken) return;
        setPanel({kind: 'developer'});
        setShowUpdaterModal(true);
    }, [openUpdaterToken]);
    useEffect(() => {
        if (panel.kind !== 'app') return;
        let cancelled = false;
        void (async () => {
            try {
                const result = await ipcClient.getDefaultEmailClientStatus();
                if (cancelled) return;
                setIsDefaultEmailClient(result.isDefault);
            } catch {
                if (cancelled) return;
                setIsDefaultEmailClient(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [panel.kind]);
    const selectedAccount = useMemo(
        () => (panel.kind === 'account' ? (accounts.find((account) => account.id === panel.id) ?? null) : null),
        [accounts, panel],
    );
    const accountFoldersQuery = useQuery({
        queryKey: ['folders', 'account-settings', selectedAccount?.id ?? null],
        queryFn: () => ipcClient.getFolders(selectedAccount!.id),
        enabled: Boolean(selectedAccount),
        initialData: [] as FolderItem[],
    });
    const accountFolders = accountFoldersQuery.data;
    const mailFiltersQuery = useQuery({
        queryKey: ['mail-filters', selectedAccount?.id ?? null],
        queryFn: () => ipcClient.getMailFilters(selectedAccount!.id),
        enabled: Boolean(selectedAccount),
        initialData: [] as MailFilter[],
    });
    const mailFilters = mailFiltersQuery.data;
    useEffect(() => {
        if (!selectedAccount) {
            setEditor(null);
            return;
        }
        setAccountSection(initialAccountSection);
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
    }, [initialAccountSection, selectedAccount]);
    useEffect(() => {
        setAccountSection(initialAccountSection);
    }, [initialAccountSection]);
    useEffect(() => {
        if (!selectedAccount) {
            setMailFilterModal(null);
        }
    }, [selectedAccount]);

    useThemePreference(settings.theme);

    async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
        setSettings((prev) => ({...prev, ...patch}));
        setAppStatus('Saving...');
        try {
            const saved = await ipcClient.updateAppSettings(patch);
            setSettings(saved);
            setAppStatus('Settings saved.');
            return true;
        } catch (e: any) {
            const latest = await ipcClient.getAppSettings().catch(() => null);
            if (latest) setSettings(latest);
            setAppStatus(`Save failed: ${e?.message || String(e)}`);
            return false;
        }
    }

    async function onTitlebarModeChange(useNativeTitleBar: boolean): Promise<void> {
        const pendingValue = useNativeTitleBar === settings.useNativeTitleBar ? null : useNativeTitleBar;
        const saved = await applySettingsPatch({pendingUseNativeTitleBar: pendingValue});
        if (!saved) return;
        setAppStatus(
            pendingValue === null
                ? 'Titlebar restart change cleared.'
                : 'Titlebar change queued. Restart required to apply.',
        );
    }

    async function onHardwareAccelerationChange(enabled: boolean): Promise<void> {
        const pendingValue = enabled === settings.hardwareAcceleration ? null : enabled;
        const saved = await applySettingsPatch({pendingHardwareAcceleration: pendingValue});
        if (!saved) return;
        setAppStatus(
            pendingValue === null
                ? 'Hardware acceleration restart change cleared.'
                : 'Hardware acceleration change queued. Restart required to apply.',
        );
    }

    async function onSetDefaultEmailClient(): Promise<void> {
        setDefaultEmailClientBusy(true);
        setAppStatus('Requesting default email app...');
        try {
            const result = await ipcClient.setDefaultEmailClient();
            setIsDefaultEmailClient(result.isDefault);
            if (result.isDefault) {
                setAppStatus('LlamaMail is now the default email app for mailto links.');
                return;
            }
            if (result.ok) {
                setAppStatus('Default email app request sent. Confirm the change in your system settings if prompted.');
                return;
            }
            setAppStatus(result.error || 'Could not set LlamaMail as default email app.');
        } catch (e: any) {
            setAppStatus(`Default app change failed: ${e?.message || String(e)}`);
        } finally {
            setDefaultEmailClientBusy(false);
        }
    }

    async function addRemoteAllowlistEntry(): Promise<void> {
        const normalized = normalizeAllowlistEntry(remoteAllowlistInput);
        if (!normalized) {
            setAppStatus('Enter a valid sender email or domain.');
            return;
        }
        const merged = [...new Set([...(settings.remoteContentAllowlist || []), normalized])];
        setRemoteAllowlistInput('');
        await applySettingsPatch({remoteContentAllowlist: merged});
    }

    async function removeRemoteAllowlistEntry(entry: string): Promise<void> {
        const next = (settings.remoteContentAllowlist || []).filter((item) => item !== entry);
        await applySettingsPatch({remoteContentAllowlist: next});
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
                signature_is_html: 1,
                signature_file_path: editor.signature_file_path?.trim() || null,
                attach_vcard: editor.attach_vcard ? 1 : 0,
                imap_host: editor.imap_host.trim(),
                smtp_host: editor.smtp_host.trim(),
                pop3_host: editor.pop3_host?.trim() || null,
                password: editor.password?.trim() || null,
            };
            await ipcClient.updateAccount(editor.id, normalized);
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
        const confirmed = window.confirm(
            `Delete account "${editor.email}"?\n\nThis removes all synced local data for this account.`,
        );
        if (!confirmed) return;
        setDeletingAccount(true);
        setAccountStatus('Deleting account...');
        try {
            await ipcClient.deleteAccount(editor.id);
            setAccountStatus('Account deleted.');
            setPanel({kind: 'app'});
        } catch (e: any) {
            setAccountStatus(`Delete failed: ${e?.message || String(e)}`);
        } finally {
            setDeletingAccount(false);
        }
    }

    function onOpenCreateMailFilter() {
        setMailFilterModal({
            mode: 'create',
            draft: createDefaultMailFilterDraft(mailFilters.length + 1),
        });
    }

    function onOpenEditMailFilter(filter: MailFilter) {
        setMailFilterModal({
            mode: 'edit',
            draft: mapMailFilterToDraft(filter),
        });
    }

    function updateMailFilterDraft(updater: (prev: MailFilterDraft) => MailFilterDraft) {
        setMailFilterModal((prev) => {
            if (!prev) return prev;
            return {...prev, draft: updater(prev.draft)};
        });
    }

    async function onSaveMailFilterModal() {
        if (!selectedAccount || !mailFilterModal || mailFilterBusy) return;
        const {mode, draft} = mailFilterModal;
        const name = draft.name.trim();
        if (!name) {
            setAccountStatus('Filter name is required.');
            return;
        }
        if (draft.match_mode !== 'all_messages' && draft.conditions.length === 0) {
            setAccountStatus('Add at least one condition, or use "Match all messages".');
            return;
        }
        if (draft.actions.length === 0) {
            setAccountStatus('Add at least one action.');
            return;
        }
        const invalidMoveAction = draft.actions.some(
            (action) => action.type === 'move_to_folder' && !action.value.trim(),
        );
        if (invalidMoveAction) {
            setAccountStatus('Select a folder for every "Move to folder" action.');
            return;
        }

        setMailFilterBusy(true);
        setAccountStatus(mode === 'create' ? 'Creating filter...' : 'Saving filter...');
        try {
            const saved = await ipcClient.saveMailFilter(selectedAccount.id, {
                id: draft.id ?? undefined,
                name,
                enabled: draft.enabled ? 1 : 0,
                run_on_incoming: draft.run_on_incoming ? 1 : 0,
                match_mode: draft.match_mode,
                stop_processing: draft.stop_processing ? 1 : 0,
                conditions: draft.conditions.map((condition) => ({
                    field: condition.field,
                    operator: condition.operator,
                    value: condition.value,
                })),
                actions: draft.actions.map((action) => ({
                    type: action.type,
                    value: action.value,
                })),
            });
            await mailFiltersQuery.refetch();
            setMailFilterModal(null);
            setAccountStatus(mode === 'create' ? 'Filter created.' : 'Filter saved.');
        } catch (e: any) {
            setAccountStatus(`Filter save failed: ${e?.message || String(e)}`);
        } finally {
            setMailFilterBusy(false);
        }
    }

    async function onDeleteMailFilter(filterId: number) {
        if (!selectedAccount || mailFilterBusy) return;
        setMailFilterBusy(true);
        setAccountStatus('Deleting filter...');
        try {
            const result = await ipcClient.deleteMailFilter(selectedAccount.id, filterId);
            if (result.removed) {
                await mailFiltersQuery.refetch();
                setAccountStatus('Filter deleted.');
            } else {
                setAccountStatus('Filter was already removed.');
            }
        } catch (e: any) {
            setAccountStatus(`Filter delete failed: ${e?.message || String(e)}`);
        } finally {
            setMailFilterBusy(false);
        }
    }

    async function onRunMailFilter(filterId?: number) {
        if (!selectedAccount) return;
        if (mailFilterModal) {
            setAccountStatus('Save the open filter first before running filters.');
            return;
        }
        if (typeof filterId === 'number' && (!Number.isFinite(filterId) || filterId <= 0)) {
            setAccountStatus('Save this filter before running it.');
            return;
        }
        setRunningFilterId(filterId ?? -1);
        setAccountStatus('Running filter...');
        try {
            const result = await ipcClient.runMailFilters(selectedAccount.id, {filterId});
            setAccountStatus(
                `Run complete. Processed ${result.processed}, matched ${result.matched}, actions ${result.actionsApplied}, errors ${result.errors}.`,
            );
        } catch (e: any) {
            setAccountStatus(`Filter run failed: ${e?.message || String(e)}`);
        } finally {
            setRunningFilterId(null);
        }
    }

    async function onCheckForUpdates() {
        if (updateActionBusy) return;
        setUpdateActionBusy(true);
        try {
            const next = await ipcClient.checkForUpdates();
            setAutoUpdateState(next);
        } finally {
            setUpdateActionBusy(false);
        }
    }

    async function onDownloadUpdate() {
        if (updateActionBusy) return;
        setUpdateActionBusy(true);
        try {
            const next = await ipcClient.downloadUpdate();
            setAutoUpdateState(next);
        } finally {
            setUpdateActionBusy(false);
        }
    }

    async function onInstallUpdate() {
        await ipcClient.quitAndInstallUpdate();
    }

    async function onTriggerTestNotification() {
        setDeveloperStatus('Sending test notification...');
        try {
            const result = await ipcClient.devShowNotification();
            if (!result.supported) {
                setDeveloperStatus('System notifications are not supported in this environment.');
                return;
            }
            setDeveloperStatus(
                result.hasTarget
                    ? 'Test notification sent for first account/folder/message.'
                    : 'Notification sent, but no message exists in first account/folder.',
            );
        } catch (e: any) {
            setDeveloperStatus(`Notification failed: ${e?.message || String(e)}`);
        }
    }

    async function onPlayNotificationSound() {
        setDeveloperStatus('Playing notification sound...');
        try {
            const result = await ipcClient.devPlayNotificationSound();
            setDeveloperStatus(result.played ? 'Notification sound played.' : 'Could not play notification sound.');
        } catch (e: any) {
            setDeveloperStatus(`Sound failed: ${e?.message || String(e)}`);
        }
    }

    async function onShowUpdaterWindow() {
        setDeveloperStatus('Opening updater window in first app window...');
        try {
            const result = await ipcClient.devOpenUpdaterWindow();
            if (result.opened) {
                setDeveloperStatus('Updater window opened in first app window.');
                return;
            }
            setDeveloperStatus('No app window available to open updater window.');
        } catch (e: any) {
            setDeveloperStatus(`Failed to open updater window: ${e?.message || String(e)}`);
        }
    }

    const isAccountPanel = panel.kind === 'account';
    const isLayoutPanel = panel.kind === 'layout';
    const isAllowlistPanel = panel.kind === 'allowlist';
    const isDeveloperPanel = panel.kind === 'developer';
    const effectiveHardwareAcceleration =
        typeof settings.pendingHardwareAcceleration === 'boolean'
            ? settings.pendingHardwareAcceleration
            : settings.hardwareAcceleration;
    const effectiveUseNativeTitleBar =
        typeof settings.pendingUseNativeTitleBar === 'boolean'
            ? settings.pendingUseNativeTitleBar
            : settings.useNativeTitleBar;
    const activeStatus = isDeveloperPanel ? developerStatus : appStatus;
    const hasStatusText = Boolean((activeStatus || '').trim());
    const shouldShowFooter = !isAccountPanel && (!embedded || hasStatusText);
    const selectedSidebarItemId = panel.kind === 'account' ? `account:${panel.id}` : panel.kind;
    const sidebarSections: DynamicSidebarSection[] = useMemo(
        () => [
            {
                id: 'primary',
                items: [
                    {id: 'app', label: 'Application', to: '/settings/application', icon: <AppWindow size={15}/>},
                    {id: 'layout', label: 'Appearance', to: '/settings/layout', icon: <Palette size={15}/>},
                    {id: 'allowlist', label: 'Whitelist', to: '/settings/whitelist', icon: <ShieldCheck size={15}/>},
                    {id: 'developer', label: 'Developer', to: '/settings/developer', icon: <Wrench size={15}/>},
                ],
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
                        to: `/settings/account/${account.id}`,
                        avatar: (() => {
                            const colors = getAccountAvatarColorsForAccount(account);
                            return (
                                <span
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold"
                                    style={{backgroundColor: colors.background, color: colors.foreground}}
                                    aria-hidden
                                >
									{getAccountMonogram(account)}
								</span>
                            );
                        })(),
                    })),
                    {
                        id: 'account:add',
                        label: 'Add account',
                        description: 'Open account setup',
                        icon: <Plus size={15}/>,
                    },
                ],
            },
        ],
        [accounts],
    );

    function onSidebarSelect(itemId: string): void {
        if (itemId === 'account:add') {
            navigate('/add-account');
            return;
        }
        if (itemId === 'app') {
            navigate('/settings/application');
            return;
        }
        if (itemId === 'layout') {
            navigate('/settings/layout');
            return;
        }
        if (itemId === 'developer') {
            navigate('/settings/developer');
            return;
        }
        if (itemId === 'allowlist') {
            navigate('/settings/whitelist');
            return;
        }
        if (itemId.startsWith('account:')) {
            const accountId = Number(itemId.slice('account:'.length));
            if (Number.isFinite(accountId) && accountId > 0) {
                navigate(`/settings/account/${accountId}/${accountSection}`);
            }
        }
    }

    function onAccountSectionNavigate(nextSection: AccountPanelSection): void {
        setAccountSection(nextSection);
        if (panel.kind !== 'account') return;
        navigate(`/settings/account/${panel.id}/${nextSection}`);
    }

    const footerActions = (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                {hasStatusText && <span className="ui-text-muted text-xs">{activeStatus}</span>}
            </div>
            <div className="flex items-center gap-2">
                {!embedded && (
                    <Button
                        type="button"
                        variant="outline"
                        className="rounded-md px-3 py-2 text-sm"
                        onClick={() => window.close()}
                    >
                        Close
                    </Button>
                )}
            </div>
        </div>
    );

    const menubar = (
        <div className="flex items-start gap-3">
            <div>
                <h1 className="ui-text-primary text-lg font-semibold">App Settings</h1>
                <p className="ui-text-muted text-xs">
                    {isAccountPanel
                        ? 'Manage account configuration and credentials'
                        : isLayoutPanel
                            ? 'Theme and visual preferences'
                            : isAllowlistPanel
                                ? 'Remote content allowlist and privacy controls'
                                : isDeveloperPanel
                                    ? 'Developer testing tools and diagnostics'
                                    : 'Application preferences and updates'}
                </p>
            </div>
        </div>
    );

    return (
        <div className="ui-surface-content h-full w-full overflow-hidden">
            <div className="flex h-full flex-col">
                {!embedded && <WindowTitleBar title="App Settings"/>}
                <WorkspaceLayout
                    className="ui-surface-content"
                    menubar={menubar}
                    showMenuBar
                    sidebar={
                        <DynamicSidebar
                            sections={sidebarSections}
                            selectedItemId={selectedSidebarItemId}
                            onSelectItem={onSidebarSelect}
                        />
                    }
                    showFooter={shouldShowFooter}
                    footer={footerActions}
                    showStatusBar={false}
                    sidebarWidth={settingsSidebarWidth}
                    onSidebarResizeStart={onSettingsSidebarResizeStart}
                    contentClassName={cn(
                        'min-h-0 flex-1',
                        isAccountPanel ? 'overflow-hidden p-0' : 'overflow-auto p-5',
                    )}
                >
                    {panel.kind === 'app' && (
                        <AppSettingsGeneralPanel
                            settings={settings}
                            autoUpdateState={autoUpdateState}
                            updateActionBusy={updateActionBusy}
                            isDefaultEmailClient={isDefaultEmailClient}
                            defaultEmailClientBusy={defaultEmailClientBusy}
                            effectiveHardwareAcceleration={effectiveHardwareAcceleration}
                            describeUpdatePhase={describeUpdatePhase}
                            onInstallUpdate={onInstallUpdate}
                            onDownloadUpdate={onDownloadUpdate}
                            onCheckForUpdates={onCheckForUpdates}
                            onSetDefaultEmailClient={onSetDefaultEmailClient}
                            onHardwareAccelerationChange={onHardwareAccelerationChange}
                            applySettingsPatch={applySettingsPatch}
                        />
                    )}

                    {panel.kind === 'allowlist' && (
                        <AllowlistSettingsTab
                            settings={settings}
                            remoteAllowlistInput={remoteAllowlistInput}
                            onRemoteAllowlistInputChange={setRemoteAllowlistInput}
                            onAddRemoteAllowlistEntry={addRemoteAllowlistEntry}
                            onRemoveRemoteAllowlistEntry={removeRemoteAllowlistEntry}
                            applySettingsPatch={applySettingsPatch}
                        />
                    )}

                    {panel.kind === 'layout' && (
                        <LayoutSettingsTab
                            settings={settings}
                            effectiveUseNativeTitleBar={effectiveUseNativeTitleBar}
                            onTitlebarModeChange={onTitlebarModeChange}
                            applySettingsPatch={applySettingsPatch}
                        />
                    )}

                    {panel.kind === 'developer' && (
                        <DeveloperSettingsTab
                            settings={settings}
                            applySettingsPatch={applySettingsPatch}
                            setDeveloperStatus={(status) => setDeveloperStatus(status)}
                            onTriggerTestNotification={onTriggerTestNotification}
                            onPlayNotificationSound={onPlayNotificationSound}
                            onShowUpdaterWindow={onShowUpdaterWindow}
                            showUpdaterModal={showUpdaterModal}
                            setShowUpdaterModal={setShowUpdaterModal}
                            autoUpdateState={autoUpdateState}
                            describeUpdatePhase={describeUpdatePhase}
                            updateActionBusy={updateActionBusy}
                            onInstallUpdate={onInstallUpdate}
                            onDownloadUpdate={onDownloadUpdate}
                            onCheckForUpdates={onCheckForUpdates}
                        />
                    )}

                    {isAccountPanel && (
                        <AccountSettingsTab
                            embedded={embedded}
                            editor={editor}
                            setEditor={setEditor}
                            accountSection={accountSection}
                            onAccountSectionNavigate={onAccountSectionNavigate}
                            accountSectionSidebarWidth={accountSectionSidebarWidth}
                            onAccountSectionResizeStart={onAccountSectionResizeStart}
                            accountStatus={accountStatus}
                            deletingAccount={deletingAccount}
                            savingAccount={savingAccount}
                            onDeleteAccount={onDeleteAccount}
                            onSaveAccount={onSaveAccount}
                            mailFilters={mailFilters}
                            mailFilterBusy={mailFilterBusy}
                            runningFilterId={runningFilterId}
                            mailFilterModal={mailFilterModal}
                            setMailFilterModal={setMailFilterModal}
                            updateMailFilterDraft={updateMailFilterDraft}
                            onSaveMailFilterModal={onSaveMailFilterModal}
                            onOpenCreateMailFilter={onOpenCreateMailFilter}
                            onOpenEditMailFilter={onOpenEditMailFilter}
                            onRunMailFilter={onRunMailFilter}
                            onDeleteMailFilter={onDeleteMailFilter}
                            accountFolders={accountFolders}
                        />
                    )}
                </WorkspaceLayout>
            </div>
        </div>
    );
}
