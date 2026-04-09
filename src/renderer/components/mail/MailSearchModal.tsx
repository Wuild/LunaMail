import {FormControlGroup, FormInput, FormSelect} from '../ui/FormControls';
import {Button} from '../ui/button';
import React, {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {Search, Star, X} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '../../../preload';
import {formatSystemDateTime} from '../../lib/dateTime';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '../../lib/accountAvatar';

type MailSearchModalProps = {
    open: boolean;
    onClose: () => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    accountFilter: string;
    onAccountFilterChange: (value: string) => void;
    accounts: PublicAccount[];
    advancedSearchOpen: boolean;
    onToggleAdvancedSearch: () => void;
    fromFilter: string;
    onFromFilterChange: (value: string) => void;
    subjectFilter: string;
    onSubjectFilterChange: (value: string) => void;
    toFilter: string;
    onToFilterChange: (value: string) => void;
    folderFilter: string;
    onFolderFilterChange: (value: string) => void;
    searchFoldersForSelectedAccount: FolderItem[];
    readFilter: 'all' | 'read' | 'unread';
    onReadFilterChange: (value: 'all' | 'read' | 'unread') => void;
    starFilter: 'all' | 'starred' | 'unstarred';
    onStarFilterChange: (value: 'all' | 'starred' | 'unstarred') => void;
    dateRangeFilter: 'all' | '7d' | '30d' | '365d';
    onDateRangeFilterChange: (value: 'all' | '7d' | '30d' | '365d') => void;
    minSizeKbFilter: string;
    onMinSizeKbFilterChange: (value: string) => void;
    maxSizeKbFilter: string;
    onMaxSizeKbFilterChange: (value: string) => void;
    onResetFilters: () => void;
    isGlobalSearchActive: boolean;
    searchLoading: boolean;
    filteredSearchMessages: MessageItem[];
    accountFoldersById: Record<number, FolderItem[]>;
    onSelectMessage: (
        id: number,
        index: number,
        modifiers?: {
            shiftKey?: boolean;
            ctrlKey?: boolean;
            metaKey?: boolean;
        },
    ) => void;
    dateLocale?: string;
    formatAccountSearchLabel: (account: PublicAccount | null) => string;
    formatMessageSender: (message: MessageItem) => string;
};

export default function MailSearchModal({
                                            open,
                                            onClose,
                                            inputRef,
                                            searchQuery,
                                            onSearchQueryChange,
                                            accountFilter,
                                            onAccountFilterChange,
                                            accounts,
                                            advancedSearchOpen,
                                            onToggleAdvancedSearch,
                                            fromFilter,
                                            onFromFilterChange,
                                            subjectFilter,
                                            onSubjectFilterChange,
                                            toFilter,
                                            onToFilterChange,
                                            folderFilter,
                                            onFolderFilterChange,
                                            searchFoldersForSelectedAccount,
                                            readFilter,
                                            onReadFilterChange,
                                            starFilter,
                                            onStarFilterChange,
                                            dateRangeFilter,
                                            onDateRangeFilterChange,
                                            minSizeKbFilter,
                                            onMinSizeKbFilterChange,
                                            maxSizeKbFilter,
                                            onMaxSizeKbFilterChange,
                                            onResetFilters,
                                            isGlobalSearchActive,
                                            searchLoading,
                                            filteredSearchMessages,
                                            accountFoldersById,
                                            onSelectMessage,
                                            dateLocale,
                                            formatAccountSearchLabel,
                                            formatMessageSender,
                                        }: MailSearchModalProps) {
    if (!open) return null;
    const accountOptions = useMemo(
        () => [
            {value: 'all', label: 'All accounts', description: null as string | null, icon: null as React.ReactNode},
            ...accounts.map((account) => {
                const label = account.display_name?.trim() || account.email;
                const description = account.display_name?.trim() ? account.email : null;
                const monogram = getAccountMonogram(account);
                const colors = getAccountAvatarColorsForAccount(account);
                return {
                    value: String(account.id),
                    label,
                    description,
                    icon: (
                        <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold"
                            style={{backgroundColor: colors.background, color: colors.foreground}}
                        >
                            {monogram}
                        </span>
                    ),
                };
            }),
        ],
        [accounts],
    );

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-start justify-center bg-slate-950/45 p-4 pt-20"
            onClick={onClose}
        >
            <div
                className="lm-overlay w-full max-w-4xl rounded-2xl p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center gap-2">
                    <FormControlGroup className="flex min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                            <FormInput
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(event) => onSearchQueryChange(event.target.value)}
                                placeholder="Search sender, subject, or content across all accounts..."
                                leftIcon={<Search size={16}/>}
                                groupPosition="first"
                                className="rounded-r-none"
                            />
                        </div>
                        <div className="-ml-px w-[11rem] shrink-0">
                            <FormSelect
                                value={accountFilter}
                                onChange={(event) => onAccountFilterChange(event.target.value)}
                                groupPosition="last"
                                className="rounded-l-none text-xs"
                                dropdownClassName="right-0 left-auto w-[18rem]"
                                options={accountOptions}
                                renderSelectedOption={(option) => {
                                    if (!option) return <span className="truncate text-xs">All accounts</span>;
                                    return (
                                        <span className="flex min-w-0 items-center gap-2">
                                            {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                                            <span className="block min-w-0 truncate text-xs">{option.label}</span>
                                        </span>
                                    );
                                }}
                                renderOption={(option) => (
                                    <div className="flex min-w-0 items-center gap-2">
                                        {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                                            <span className="min-w-0 flex-1">
                                            <span className="block truncate">{option.label}</span>
                                            {option.description ? (
                                                <span className="lm-text-muted block truncate text-[11px]">
                                                    {option.description}
                                                </span>
                                            ) : null}
                                        </span>
                                    </div>
                                )}
                            />
                        </div>
                    </FormControlGroup>
                    {searchQuery.trim().length > 0 && (
                        <Button
                            type="button"
                            className="lm-btn-ghost inline-flex h-8 w-8 items-center justify-center rounded transition-colors"
                            onClick={() => onSearchQueryChange('')}
                            aria-label="Clear search"
                            title="Clear search"
                        >
                            <X size={14}/>
                        </Button>
                    )}
                </div>
                <div className="lm-text-muted mt-2 flex items-center justify-between px-1 text-xs">
					<span>
						{accountFilter === 'all'
                            ? 'Searching all accounts and folders'
                            : `Searching ${formatAccountSearchLabel(accounts.find((account) => String(account.id) === accountFilter) ?? null)}`}
					</span>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            className="lm-btn-ghost rounded px-2 py-1 transition-colors"
                            onClick={onToggleAdvancedSearch}
                        >
                            {advancedSearchOpen ? 'Basic' : 'Advanced'}
                        </Button>
                        <Button
                            type="button"
                            className="lm-btn-ghost rounded px-2 py-1 transition-colors"
                            onClick={onClose}
                        >
                            Esc
                        </Button>
                    </div>
                </div>
                {advancedSearchOpen && (
                    <div
                        className="lm-card mt-2 grid grid-cols-1 gap-2 rounded-xl p-2 sm:grid-cols-3 lg:grid-cols-4">
                        <FormInput
                            type="search"
                            value={fromFilter}
                            onChange={(event) => onFromFilterChange(event.target.value)}
                            placeholder="From address/name"
                            className="lm-input h-9 rounded-md px-2 text-xs"
                        />
                        <FormInput
                            type="search"
                            value={subjectFilter}
                            onChange={(event) => onSubjectFilterChange(event.target.value)}
                            placeholder="Subject"
                            className="lm-input h-9 rounded-md px-2 text-xs"
                        />
                        <FormInput
                            type="search"
                            value={toFilter}
                            onChange={(event) => onToFilterChange(event.target.value)}
                            placeholder="To address"
                            className="lm-input h-9 rounded-md px-2 text-xs"
                        />
                        <FormSelect
                            value={folderFilter}
                            onChange={(event) => onFolderFilterChange(event.target.value)}
                            disabled={accountFilter === 'all'}
                            className="lm-select h-9 rounded-md px-2 text-xs disabled:opacity-60"
                        >
                            <option value="all">All folders</option>
                            {searchFoldersForSelectedAccount.map((folder) => (
                                <option key={folder.id} value={String(folder.id)}>
                                    {folder.custom_name || folder.name}
                                </option>
                            ))}
                        </FormSelect>
                        <FormSelect
                            value={readFilter}
                            onChange={(event) => onReadFilterChange(event.target.value as 'all' | 'read' | 'unread')}
                            className="lm-select h-9 rounded-md px-2 text-xs"
                        >
                            <option value="all">Read status: all</option>
                            <option value="read">Read only</option>
                            <option value="unread">Unread only</option>
                        </FormSelect>
                        <FormSelect
                            value={starFilter}
                            onChange={(event) =>
                                onStarFilterChange(event.target.value as 'all' | 'starred' | 'unstarred')
                            }
                            className="lm-select h-9 rounded-md px-2 text-xs"
                        >
                            <option value="all">Star: all</option>
                            <option value="starred">Starred only</option>
                            <option value="unstarred">Unstarred only</option>
                        </FormSelect>
                        <FormSelect
                            value={dateRangeFilter}
                            onChange={(event) =>
                                onDateRangeFilterChange(event.target.value as 'all' | '7d' | '30d' | '365d')
                            }
                            className="lm-select h-9 rounded-md px-2 text-xs"
                        >
                            <option value="all">Any date</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="365d">Last 12 months</option>
                        </FormSelect>
                        <FormInput
                            type="number"
                            min={0}
                            step={1}
                            value={minSizeKbFilter}
                            onChange={(event) => onMinSizeKbFilterChange(event.target.value)}
                            placeholder="Min size (KB)"
                            className="lm-input h-9 rounded-md px-2 text-xs"
                        />
                        <div className="flex items-center gap-2">
                            <FormInput
                                type="number"
                                min={0}
                                step={1}
                                value={maxSizeKbFilter}
                                onChange={(event) => onMaxSizeKbFilterChange(event.target.value)}
                                placeholder="Max size (KB)"
                                className="lm-input h-9 min-w-0 flex-1 rounded-md px-2 text-xs"
                            />
                            <Button
                                type="button"
                                className="lm-btn-secondary h-9 shrink-0 rounded-md px-2 text-xs"
                                onClick={onResetFilters}
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                )}
                <div className="mt-3 max-h-[56vh] overflow-y-auto">
                    {!isGlobalSearchActive && (
                        <div
                            className="lm-border-default lm-text-muted rounded-lg border border-dashed px-3 py-6 text-center text-sm">
                            Type to search emails across all accounts.
                        </div>
                    )}
                    {isGlobalSearchActive && searchLoading && (
                        <div
                            className="lm-border-default lm-text-muted rounded-lg border border-dashed px-3 py-6 text-center text-sm">
                            Searching...
                        </div>
                    )}
                    {isGlobalSearchActive && !searchLoading && filteredSearchMessages.length === 0 && (
                        <div
                            className="lm-border-default lm-text-muted rounded-lg border border-dashed px-3 py-6 text-center text-sm">
                            No matching emails found.
                        </div>
                    )}
                    {isGlobalSearchActive && !searchLoading && filteredSearchMessages.length > 0 && (
                        <div className="space-y-1">
                            {filteredSearchMessages.map((message, idx) => {
                                const account = accounts.find((item) => item.id === message.account_id);
                                const folder = (accountFoldersById[message.account_id] ?? []).find(
                                    (item) => item.id === message.folder_id,
                                );
                                return (
                                    <Link
                                        key={message.id}
                                        to={`/email/${message.account_id}/${message.folder_id}/${message.id}`}
                                        className="lm-list-row block w-full rounded-lg border border-transparent px-3 py-2 text-left no-underline transition-colors hover:border-[var(--border-default)]"
                                        style={{color: 'inherit'}}
                                        onClick={() => {
                                            onSelectMessage(message.id, idx);
                                            onClose();
                                        }}
                                    >
                                        <div
                                            className={`truncate text-sm ${message.is_read ? 'lm-text-secondary font-medium' : 'lm-text-primary font-semibold'}`}
                                        >
                                            {message.subject || '(No subject)'}
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-2">
											<span className="lm-text-muted truncate text-xs">
												{formatMessageSender(message)}
											</span>
                                            <div className="ml-2 flex shrink-0 items-center gap-2">
                                                {Boolean(message.is_flagged) && (
                                                    <span
                                                        className="inline-flex items-center text-amber-500"
                                                        title="Starred"
                                                    >
														<Star size={12} className="fill-current"/>
													</span>
                                                )}
                                                <span className="lm-text-muted text-xs">
													{formatSystemDateTime(message.date, dateLocale)}
												</span>
                                            </div>
                                        </div>
                                        <div
                                            className="lm-text-muted mt-1 flex items-center justify-between gap-2 text-[11px]">
											<span className="truncate">
												{account?.display_name?.trim() ||
                                                    account?.email ||
                                                    `Account ${message.account_id}`}
											</span>
                                            <span
                                                className="lm-bg-hover lm-text-secondary shrink-0 rounded px-1.5 py-0.5 text-[10px]">
												{folder?.custom_name ||
                                                    folder?.name ||
                                                    folder?.path ||
                                                    'Unknown folder'}
											</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
