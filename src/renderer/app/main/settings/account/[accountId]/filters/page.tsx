import {useOutletContext} from 'react-router-dom';
import type {MailFilterActionType, MailFilterField, MailFilterMatchMode, MailFilterOperator} from '@/preload';
import {Button} from '@renderer/components/ui/button';
import {FormCheckbox, FormInput, FormSelect} from '@renderer/components/ui/FormControls';
import {Modal} from '@renderer/components/ui/Modal';
import {cn} from '@renderer/lib/utils';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';

export default function SettingsAccountFiltersPage() {
    const {
        editor,
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
    } = useOutletContext<UseAccountSettingsRouteResult>();

    if (!editor) return null;

    return (
        <>
            <section className="panel rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="ui-text-primary text-base font-semibold">Message Filters</h2>
                        <p className="mt-1 ui-text-muted text-sm">
                            Thunderbird-style account filters that can run on new incoming mail or manually.
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
                                    <div className="ui-text-primary text-sm font-semibold">{filter.name}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
										<span
                                            className={cn(
                                                'rounded px-2 py-0.5',
                                                filter.enabled ? 'chip-success' : 'ui-surface-hover ui-text-secondary',
                                            )}
                                        >
											{filter.enabled ? 'Enabled' : 'Disabled'}
										</span>
                                        <span className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
											{filter.run_on_incoming ? 'Runs on new mail' : 'Manual only'}
										</span>
                                        <span className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
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

            {mailFilterModal && (
                <Modal
                    open
                    onClose={() => setMailFilterModal(null)}
                    backdropClassName="z-[1200]"
                    contentClassName="max-w-4xl overflow-hidden p-0"
                >
                    <header className="ui-border-default flex items-start justify-between gap-3 border-b px-5 py-4">
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
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                                <label className="block text-sm">
                                    <span className="ui-text-secondary mb-1.5 block font-medium">Filter name</span>
                                    <FormInput
                                        value={mailFilterModal.draft.name}
                                        onChange={(e) =>
                                            updateMailFilterDraft((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
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
                                                enabled: e.target.checked,
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
                                    <span className="ui-text-secondary mb-1.5 block font-medium">Match mode</span>
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
                                                    {
                                                        field: 'subject',
                                                        operator: 'contains',
                                                        value: '',
                                                    },
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
                                                                    field: e.target.value as MailFilterField,
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
                                                                    operator: e.target.value as MailFilterOperator,
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
                                                            rowIndex === index
                                                                ? {
                                                                    ...row,
                                                                    value: e.target.value,
                                                                }
                                                                : row,
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
                                                                type: e.target.value as MailFilterActionType,
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
                                                            rowIndex === index
                                                                ? {
                                                                    ...row,
                                                                    value: e.target.value,
                                                                }
                                                                : row,
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
                    <footer className="ui-border-default flex items-center justify-end gap-2 border-t px-5 py-4">
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
    );
}
