import React from 'react';
import type {
    FolderItem,
    MailFilter,
    MailFilterActionType,
    MailFilterField,
    MailFilterMatchMode,
    MailFilterOperator,
} from '../../../../preload';
import {cn} from '../../../lib/utils';
import WorkspaceLayout from '../../../layouts/WorkspaceLayout';
import {Button} from '../../../components/ui/button';
import {FormCheckbox, FormInput, FormSelect} from '../../../components/ui/FormControls';
import {Modal} from '../../../components/ui/Modal';
import HtmlLexicalEditor from '../../../components/HtmlLexicalEditor';
import ServiceSettingsCard from '../../../components/settings/ServiceSettingsCard';
import {Field, Label} from '../../AppSettingsFormParts';
import type {AccountEditor, AccountPanelSection} from '../../AppSettingsPage';
import type {MailFilterDraft, MailFilterModalState} from '../../appSettingsMailFilterHelpers';

type AccountSettingsTabProps = {
    embedded: boolean;
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
    mailFilters: MailFilter[];
    mailFilterBusy: boolean;
    runningFilterId: number | null;
    mailFilterModal: MailFilterModalState;
    setMailFilterModal: React.Dispatch<React.SetStateAction<MailFilterModalState>>;
    updateMailFilterDraft: (updater: (prev: MailFilterDraft) => MailFilterDraft) => void;
    onSaveMailFilterModal: () => Promise<void>;
    onOpenCreateMailFilter: () => void;
    onOpenEditMailFilter: (filter: MailFilter) => void;
    onRunMailFilter: (filterId?: number) => Promise<void>;
    onDeleteMailFilter: (filterId: number) => Promise<void>;
    accountFolders: FolderItem[];
};

export default function AccountSettingsTab({
                                               embedded,
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
                                           }: AccountSettingsTabProps) {
    return (
        <div className="h-full min-h-0 w-full">
            {!editor && <div className="ui-text-muted text-sm">Select an account.</div>}
            {editor && (
                <>
                    <div className="flex h-full min-h-[620px] flex-col">
                        <div className="min-h-0 flex-1">
                            <WorkspaceLayout
                                className="h-full bg-transparent"
                                showMenuBar={false}
                                showFooter={false}
                                showStatusBar={false}
                                sidebar={
                                    <aside className="sidebar h-full min-h-0 p-3">
                                        <p className="px-2 pb-2 ui-text-muted text-xs font-semibold uppercase tracking-wide">
                                            Account Sections
                                        </p>
                                        <div className="space-y-1">
                                            <Button
                                                type="button"
                                                className={cn(
                                                    'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                                    accountSection === 'identity'
                                                        ? 'ui-surface-active ui-text-primary'
                                                        : 'account-item',
                                                )}
                                                onClick={() => onAccountSectionNavigate('identity')}
                                            >
                                                Identity
                                                <span className="ui-text-muted block truncate text-[11px] font-normal">
                                                    Name, address, signature
                                                </span>
                                            </Button>
                                            <Button
                                                type="button"
                                                className={cn(
                                                    'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                                    accountSection === 'server'
                                                        ? 'ui-surface-active ui-text-primary'
                                                        : 'account-item',
                                                )}
                                                onClick={() => onAccountSectionNavigate('server')}
                                            >
                                                Server Settings
                                                <span className="ui-text-muted block truncate text-[11px] font-normal">
                                                    IMAP/SMTP and credentials
                                                </span>
                                            </Button>
                                            <Button
                                                type="button"
                                                className={cn(
                                                    'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                                    accountSection === 'filters'
                                                        ? 'ui-surface-active ui-text-primary'
                                                        : 'account-item',
                                                )}
                                                onClick={() => onAccountSectionNavigate('filters')}
                                            >
                                                Filters
                                                <span className="ui-text-muted block truncate text-[11px] font-normal">
                                                    Automatic message rules
                                                </span>
                                            </Button>
                                        </div>
                                    </aside>
                                }
                                sidebarWidth={accountSectionSidebarWidth}
                                onSidebarResizeStart={onAccountSectionResizeStart}
                                contentClassName="min-h-0 flex-1 overflow-y-auto bg-transparent p-5"
                            >
                                {accountSection === 'identity' && (
                                    <section className="panel rounded-xl p-4">
                                        <h2 className="ui-text-primary text-base font-semibold">Default Identity</h2>
                                        <p className="mt-1 ui-text-muted text-sm">
                                            Each account has an identity that recipients see when reading your messages.
                                        </p>
                                        <div
                                            className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] md:items-center">
                                            <Label>Your Name:</Label>
                                            <Field
                                                value={editor.display_name || ''}
                                                onChange={(v) =>
                                                    setEditor((p) => (p ? {...p, display_name: v} : p))
                                                }
                                            />
                                            <Label>Email Address:</Label>
                                            <Field
                                                value={editor.email}
                                                onChange={(v) => setEditor((p) => (p ? {...p, email: v} : p))}
                                            />
                                            <Label>Reply-to Address:</Label>
                                            <Field
                                                value={editor.reply_to || ''}
                                                onChange={(v) => setEditor((p) => (p ? {...p, reply_to: v} : p))}
                                                placeholder="Recipients will reply to this address"
                                            />
                                            <Label>Organization:</Label>
                                            <Field
                                                value={editor.organization || ''}
                                                onChange={(v) => setEditor((p) => (p ? {...p, organization: v} : p))}
                                            />
                                            <Label>Signature text:</Label>
                                            <div className="space-y-2">
                                                <div className="ui-text-muted text-xs">
                                                    Signature is HTML-enabled and will be appended to sent messages for
                                                    this account.
                                                </div>
                                                <div
                                                    className="ui-border-default h-56 min-h-56 overflow-hidden rounded-md border">
                                                    <HtmlLexicalEditor
                                                        key={`account-signature-${editor.id}`}
                                                        value={editor.signature_text || ''}
                                                        placeholder="Write your signature..."
                                                        appearance="embedded"
                                                        onChange={(html) =>
                                                            setEditor((p) =>
                                                                p ? {
                                                                    ...p,
                                                                    signature_text: html,
                                                                    signature_is_html: 1
                                                                } : p,
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <label
                                                    className="inline-flex items-center gap-2 ui-text-secondary text-sm">
                                                    <FormCheckbox
                                                        checked={!!editor.attach_vcard}
                                                        onChange={(e) =>
                                                            setEditor((p) =>
                                                                p ? {...p, attach_vcard: e.target.checked ? 1 : 0} : p,
                                                            )
                                                        }
                                                    />
                                                    Attach my vCard to messages
                                                </label>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {accountSection === 'server' && (
                                    <>
                                        <section className="panel rounded-xl p-4">
                                            <h2 className="ui-text-primary text-base font-semibold">Server Settings</h2>
                                            <div className="mt-4 flex flex-col gap-4">
                                                <Field
                                                    label="User"
                                                    value={editor.user}
                                                    onChange={(v) => setEditor((p) => (p ? {...p, user: v} : p))}
                                                />
                                                <Field
                                                    label="Provider"
                                                    value={editor.provider || ''}
                                                    onChange={(v) => setEditor((p) => (p ? {...p, provider: v} : p))}
                                                />
                                                <Field
                                                    type="password"
                                                    label="New password (optional)"
                                                    value={editor.password || ''}
                                                    onChange={(v) => setEditor((p) => (p ? {...p, password: v} : p))}
                                                />
                                            </div>
                                        </section>
                                        <div className="mt-4">
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
                                                onSecurityChange={(value) =>
                                                    setEditor((p) => (p ? {
                                                        ...p,
                                                        imap_secure: value === 'ssl' ? 1 : 0
                                                    } : p))
                                                }
                                                controlVariant="subtle"
                                                controlSize="lg"
                                            />
                                        </div>
                                        <div className="mt-4">
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
                                                onSecurityChange={(value) =>
                                                    setEditor((p) => (p ? {
                                                        ...p,
                                                        smtp_secure: value === 'ssl' ? 1 : 0
                                                    } : p))
                                                }
                                                controlVariant="subtle"
                                                controlSize="lg"
                                            />
                                        </div>
                                    </>
                                )}

                                {accountSection === 'filters' && (
                                    <section className="panel rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h2 className="ui-text-primary text-base font-semibold">Message
                                                    Filters</h2>
                                                <p className="mt-1 ui-text-muted text-sm">
                                                    Thunderbird-style account filters that can run on new incoming mail
                                                    or manually.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    onClick={() => void onRunMailFilter()}
                                                    disabled={runningFilterId !== null || mailFilterBusy || !!mailFilterModal}
                                                    className="button-secondary rounded-md px-3 py-2 text-xs disabled:opacity-50"
                                                >
                                                    {runningFilterId === -1 ? 'Running...' : 'Run All'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={onOpenCreateMailFilter}
                                                    disabled={mailFilterBusy || !!mailFilterModal}
                                                    className="button-primary rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
                                                >
                                                    Add Filter
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-4">
                                            {mailFilters.length === 0 && (
                                                <div
                                                    className="ui-border-default ui-text-muted rounded-md border border-dashed px-3 py-4 text-sm">
                                                    No filters yet.
                                                </div>
                                            )}
                                            {mailFilters.map((filter) => (
                                                <div key={filter.id} className="panel rounded-lg p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div
                                                                className="ui-text-primary text-sm font-semibold">{filter.name}</div>
                                                            <div
                                                                className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                                                <span
                                                                    className={cn(
                                                                        'rounded px-2 py-0.5',
                                                                        filter.enabled ? 'chip-success' : 'ui-surface-hover ui-text-secondary',
                                                                    )}
                                                                >
                                                                    {filter.enabled ? 'Enabled' : 'Disabled'}
                                                                </span>
                                                                <span
                                                                    className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
                                                                    {filter.run_on_incoming ? 'Runs on new mail' : 'Manual only'}
                                                                </span>
                                                                <span
                                                                    className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
                                                                    Match: {filter.match_mode.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 ui-text-muted text-xs">
                                                                {filter.match_mode === 'all_messages'
                                                                    ? 'Applies to all messages.'
                                                                    : `${filter.conditions.length} condition${filter.conditions.length === 1 ? '' : 's'}`}
                                                                {' · '}
                                                                {filter.actions.length} action{filter.actions.length === 1 ? '' : 's'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            onClick={() => onOpenEditMailFilter(filter)}
                                                            disabled={mailFilterBusy || !!mailFilterModal}
                                                            className="button-primary rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            onClick={() => void onRunMailFilter(filter.id)}
                                                            disabled={runningFilterId !== null || mailFilterBusy || !!mailFilterModal}
                                                            className="button-secondary rounded-md px-3 py-2 text-xs disabled:opacity-50"
                                                        >
                                                            {runningFilterId === filter.id ? 'Running...' : 'Run Filter'}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="danger"
                                                            onClick={() => void onDeleteMailFilter(filter.id)}
                                                            disabled={mailFilterBusy}
                                                            className="rounded-md px-3 py-2 text-xs disabled:opacity-50"
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </WorkspaceLayout>
                        </div>
                        <div className="app-footer shrink-0 px-5 py-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {Boolean((accountStatus || '').trim()) && (
                                        <span className="ui-text-muted text-xs">{accountStatus}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={() => void onDeleteAccount()}
                                        disabled={!editor || deletingAccount}
                                        className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                    >
                                        {deletingAccount ? 'Deleting...' : 'Delete Account'}
                                    </Button>
                                    {!embedded && (
                                        <Button
                                            type="button"
                                            className="button-secondary rounded-md px-3 py-2 text-sm"
                                            onClick={() => window.close()}
                                        >
                                            Close
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        onClick={() => void onSaveAccount()}
                                        disabled={!editor || savingAccount}
                                        className="button-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                    >
                                        {savingAccount ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {mailFilterModal && (
                        <Modal
                            open
                            onClose={() => setMailFilterModal(null)}
                            backdropClassName="z-[1200]"
                            contentClassName="max-w-4xl overflow-hidden p-0"
                        >
                            <header
                                className="ui-border-default flex items-start justify-between gap-3 border-b px-5 py-4">
                                <div className="min-w-0">
                                    <h3 className="ui-text-primary text-lg font-semibold">
                                        {mailFilterModal.mode === 'create' ? 'Create Filter' : 'Edit Filter'}
                                    </h3>
                                    <p className="ui-text-muted mt-1 text-sm">
                                        Configure matching rules and actions for this account.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-md px-2"
                                    onClick={() => setMailFilterModal(null)}
                                    disabled={mailFilterBusy}
                                >
                                    Close
                                </Button>
                            </header>

                            <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
                                <section className="panel rounded-xl p-4">
                                    <div
                                        className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                                        <label className="block text-sm">
                                            <span
                                                className="ui-text-secondary mb-1.5 block font-medium">Filter name</span>
                                            <FormInput
                                                value={mailFilterModal.draft.name}
                                                onChange={(e) =>
                                                    updateMailFilterDraft((prev) => ({...prev, name: e.target.value}))
                                                }
                                                placeholder="Example: Newsletters to folder"
                                            />
                                        </label>
                                        <label
                                            className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
                                            <FormCheckbox
                                                checked={mailFilterModal.draft.enabled}
                                                onChange={(e) =>
                                                    updateMailFilterDraft((prev) => ({
                                                        ...prev,
                                                        enabled: e.target.checked
                                                    }))
                                                }
                                            />
                                            Enabled
                                        </label>
                                        <label
                                            className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
                                            <FormCheckbox
                                                checked={mailFilterModal.draft.run_on_incoming}
                                                onChange={(e) =>
                                                    updateMailFilterDraft((prev) => ({
                                                        ...prev,
                                                        run_on_incoming: e.target.checked,
                                                    }))
                                                }
                                            />
                                            Getting new mail
                                        </label>
                                    </div>
                                </section>

                                <section className="panel rounded-xl p-4">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <label className="block text-sm">
                                            <span
                                                className="ui-text-secondary mb-1.5 block font-medium">Match mode</span>
                                            <FormSelect
                                                value={mailFilterModal.draft.match_mode}
                                                onChange={(e) =>
                                                    updateMailFilterDraft((prev) => ({
                                                        ...prev,
                                                        match_mode: e.target.value as MailFilterMatchMode,
                                                    }))
                                                }
                                            >
                                                <option value="all">Match all of the following</option>
                                                <option value="any">Match any of the following</option>
                                                <option value="all_messages">Match all messages</option>
                                            </FormSelect>
                                        </label>
                                        <label
                                            className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
                                            <FormCheckbox
                                                checked={mailFilterModal.draft.stop_processing}
                                                onChange={(e) =>
                                                    updateMailFilterDraft((prev) => ({
                                                        ...prev,
                                                        stop_processing: e.target.checked,
                                                    }))
                                                }
                                            />
                                            Stop processing after this filter
                                        </label>
                                    </div>
                                </section>

                                {mailFilterModal.draft.match_mode !== 'all_messages' && (
                                    <section className="panel rounded-xl p-4">
                                        <div className="mb-3 flex items-center justify-between gap-2">
                                            <p className="ui-text-primary text-sm font-semibold">Conditions</p>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                className="rounded-md px-2"
                                                onClick={() =>
                                                    updateMailFilterDraft((prev) => ({
                                                        ...prev,
                                                        conditions: [
                                                            ...prev.conditions,
                                                            {field: 'subject', operator: 'contains', value: ''},
                                                        ],
                                                    }))
                                                }
                                            >
                                                Add condition
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {mailFilterModal.draft.conditions.map((condition, index) => (
                                                <div
                                                    key={index}
                                                    className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,180px)_minmax(0,220px)_minmax(0,1fr)_auto]"
                                                >
                                                    <FormSelect
                                                        value={condition.field}
                                                        onChange={(e) =>
                                                            updateMailFilterDraft((prev) => ({
                                                                ...prev,
                                                                conditions: prev.conditions.map((row, rowIndex) =>
                                                                    rowIndex === index
                                                                        ? {
                                                                            ...row,
                                                                            field: e.target.value as MailFilterField
                                                                        }
                                                                        : row,
                                                                ),
                                                            }))
                                                        }
                                                    >
                                                        <option value="subject">Subject</option>
                                                        <option value="from">From</option>
                                                        <option value="to">To</option>
                                                        <option value="body">Body</option>
                                                    </FormSelect>
                                                    <FormSelect
                                                        value={condition.operator}
                                                        onChange={(e) =>
                                                            updateMailFilterDraft((prev) => ({
                                                                ...prev,
                                                                conditions: prev.conditions.map((row, rowIndex) =>
                                                                    rowIndex === index
                                                                        ? {
                                                                            ...row,
                                                                            operator: e.target.value as MailFilterOperator
                                                                        }
                                                                        : row,
                                                                ),
                                                            }))
                                                        }
                                                    >
                                                        <option value="contains">contains</option>
                                                        <option value="not_contains">does not contain</option>
                                                        <option value="equals">is</option>
                                                        <option value="starts_with">starts with</option>
                                                        <option value="ends_with">ends with</option>
                                                    </FormSelect>
                                                    <FormInput
                                                        type="text"
                                                        value={condition.value || ''}
                                                        onChange={(e) =>
                                                            updateMailFilterDraft((prev) => ({
                                                                ...prev,
                                                                conditions: prev.conditions.map((row, rowIndex) =>
                                                                    rowIndex === index ? {
                                                                        ...row,
                                                                        value: e.target.value
                                                                    } : row,
                                                                ),
                                                            }))
                                                        }
                                                        placeholder="Value"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="danger"
                                                        size="sm"
                                                        className="rounded-md px-2"
                                                        onClick={() =>
                                                            updateMailFilterDraft((prev) => ({
                                                                ...prev,
                                                                conditions: prev.conditions.filter(
                                                                    (_, rowIndex) => rowIndex !== index,
                                                                ),
                                                            }))
                                                        }
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className="panel rounded-xl p-4">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <p className="ui-text-primary text-sm font-semibold">Actions</p>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="rounded-md px-2"
                                            onClick={() =>
                                                updateMailFilterDraft((prev) => ({
                                                    ...prev,
                                                    actions: [...prev.actions, {type: 'move_to_folder', value: ''}],
                                                }))
                                            }
                                        >
                                            Add action
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {mailFilterModal.draft.actions.map((action, index) => (
                                            <div
                                                key={index}
                                                className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]"
                                            >
                                                <FormSelect
                                                    value={action.type}
                                                    onChange={(e) =>
                                                        updateMailFilterDraft((prev) => ({
                                                            ...prev,
                                                            actions: prev.actions.map((row, rowIndex) =>
                                                                rowIndex === index
                                                                    ? {
                                                                        ...row,
                                                                        type: e.target.value as MailFilterActionType
                                                                    }
                                                                    : row,
                                                            ),
                                                        }))
                                                    }
                                                >
                                                    <option value="move_to_folder">Move to folder</option>
                                                    <option value="mark_read">Mark read</option>
                                                    <option value="mark_unread">Mark unread</option>
                                                    <option value="star">Star</option>
                                                    <option value="unstar">Unstar</option>
                                                </FormSelect>
                                                {action.type === 'move_to_folder' ? (
                                                    <FormSelect
                                                        value={action.value || ''}
                                                        onChange={(e) =>
                                                            updateMailFilterDraft((prev) => ({
                                                                ...prev,
                                                                actions: prev.actions.map((row, rowIndex) =>
                                                                    rowIndex === index ? {
                                                                        ...row,
                                                                        value: e.target.value
                                                                    } : row,
                                                                ),
                                                            }))
                                                        }
                                                    >
                                                        <option value="">Choose folder...</option>
                                                        {accountFolders.map((folder) => (
                                                            <option key={folder.id} value={folder.path}>
                                                                {folder.name} ({folder.path})
                                                            </option>
                                                        ))}
                                                    </FormSelect>
                                                ) : (
                                                    <FormInput
                                                        type="text"
                                                        disabled
                                                        value=""
                                                        variant="subtle"
                                                        size="lg"
                                                        className="ui-text-muted"
                                                    />
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="danger"
                                                    size="sm"
                                                    className="rounded-md px-2"
                                                    onClick={() =>
                                                        updateMailFilterDraft((prev) => ({
                                                            ...prev,
                                                            actions: prev.actions.filter((_, rowIndex) => rowIndex !== index),
                                                        }))
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                            <footer
                                className="ui-border-default flex items-center justify-end gap-2 border-t px-5 py-4">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="default"
                                    className="rounded-md px-4"
                                    onClick={() => setMailFilterModal(null)}
                                    disabled={mailFilterBusy}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="default"
                                    size="default"
                                    onClick={() => void onSaveMailFilterModal()}
                                    disabled={mailFilterBusy}
                                    className="rounded-md px-4 font-medium disabled:opacity-50"
                                >
                                    {mailFilterBusy
                                        ? 'Saving...'
                                        : mailFilterModal.mode === 'create'
                                            ? 'Create Filter'
                                            : 'Save Filter'}
                                </Button>
                            </footer>
                        </Modal>
                    )}
                </>
            )}
        </div>
    );
}
