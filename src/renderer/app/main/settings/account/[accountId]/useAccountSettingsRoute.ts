import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import type {UpdateAccountPayload} from '@/preload';
import type {AccountEditor, AccountPanelSection} from '@renderer/app/main/settings/settingsTypes';
import {
    createDefaultMailFilterDraft,
    mapMailFilterToDraft,
    type MailFilterDraft,
    type MailFilterModalState,
} from '@renderer/app/main/settings/mailFilterHelpers';

export type UseAccountSettingsRouteResult = {
    editor: AccountEditor | null;
    setEditor: React.Dispatch<React.SetStateAction<AccountEditor | null>>;
    accountSection: AccountPanelSection;
    onAccountSectionNavigate: (section: AccountPanelSection) => void;
    accountSectionSidebarWidth: number;
    onAccountSectionResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
    accountStatus: string | null;
    deletingAccount: boolean;
    savingAccount: boolean;
    onDeleteAccount: () => Promise<void>;
    onSaveAccount: () => Promise<void>;
    mailFilters: any[];
    mailFilterBusy: boolean;
    runningFilterId: number | null;
    mailFilterModal: MailFilterModalState;
    setMailFilterModal: React.Dispatch<React.SetStateAction<MailFilterModalState>>;
    updateMailFilterDraft: (updater: (prev: MailFilterDraft) => MailFilterDraft) => void;
    onSaveMailFilterModal: () => Promise<void>;
    onOpenCreateMailFilter: () => void;
    onOpenEditMailFilter: (filter: any) => void;
    onRunMailFilter: (filterId?: number) => Promise<void>;
    onDeleteMailFilter: (filterId: number) => Promise<void>;
    accountFolders: any[];
};

export function useAccountSettingsRoute(
    accountId: number,
    section: AccountPanelSection,
): UseAccountSettingsRouteResult {
    const navigate = useNavigate();
    const {accounts} = useAccounts();
    const selectedAccount = accounts.find((account) => account.id === accountId) ?? null;
    const [editor, setEditor] = useState<AccountEditor | null>(null);
    const [accountSection, setAccountSection] = useState<AccountPanelSection>(section);
    const [savingAccount, setSavingAccount] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [accountStatus, setAccountStatus] = useState<string | null>(null);
    const [mailFilterBusy, setMailFilterBusy] = useState(false);
    const [runningFilterId, setRunningFilterId] = useState<number | null>(null);
    const [mailFilterModal, setMailFilterModal] = useState<MailFilterModalState>(null);
    const {sidebarWidth: accountSectionSidebarWidth, onResizeStart: onAccountSectionResizeStart} =
        useResizableSidebar({
            defaultWidth: 240,
            minWidth: 180,
            maxWidth: 420,
            storageKey: 'llamamail.settings.account.sections.width',
        });

    const accountFoldersQuery = useQuery({
        queryKey: ['folders', 'account-settings', selectedAccount?.id ?? null],
        queryFn: () => ipcClient.getFolders(selectedAccount!.id),
        enabled: Boolean(selectedAccount),
        initialData: [],
    });
    const mailFiltersQuery = useQuery({
        queryKey: ['mail-filters', selectedAccount?.id ?? null],
        queryFn: () => ipcClient.getMailFilters(selectedAccount!.id),
        enabled: Boolean(selectedAccount),
        initialData: [],
    });
    const accountFolders = accountFoldersQuery.data;
    const mailFilters = mailFiltersQuery.data;

    useEffect(() => {
        setAccountSection(section);
    }, [section]);

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

    useEffect(() => {
        if (!selectedAccount) {
            setMailFilterModal(null);
        }
    }, [selectedAccount]);

    const onAccountSectionNavigate = (nextSection: AccountPanelSection): void => {
        setAccountSection(nextSection);
        navigate(`/settings/account/${accountId}/${nextSection}`);
    };

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
            navigate('/settings/application', {replace: true});
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

    function onOpenEditMailFilter(filter: any) {
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
            await ipcClient.saveMailFilter(selectedAccount.id, {
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

    return {
        editor,
        setEditor,
        accountSection,
        onAccountSectionNavigate,
        accountSectionSidebarWidth,
        onAccountSectionResizeStart,
        accountStatus,
        deletingAccount,
        savingAccount,
        onDeleteAccount,
        onSaveAccount,
        mailFilters,
        mailFilterBusy,
        runningFilterId,
        mailFilterModal,
        setMailFilterModal,
        updateMailFilterDraft,
        onSaveMailFilterModal,
        onOpenCreateMailFilter,
        onOpenEditMailFilter,
        onRunMailFilter,
        onDeleteMailFilter,
        accountFolders,
    };
}
