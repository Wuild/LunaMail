import React from 'react';
import {Link} from 'react-router-dom';
import {Search, Star, X} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '../../../preload';
import {formatSystemDateTime} from '../../lib/dateTime';

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

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-start justify-center bg-slate-950/45 p-4 pt-20"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#25272c]"
                onClick={(event) => event.stopPropagation()}
            >
                <div
                    className="group flex h-11 items-center rounded-xl border border-slate-300 bg-white/90 px-3 shadow-sm transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 dark:border-[#40444b] dark:bg-[#1f2125] dark:focus-within:border-[#5865f2] dark:focus-within:ring-[#5865f2]/30">
                    <Search size={16} className="mr-2 shrink-0 text-slate-400 dark:text-slate-500"/>
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(event) => onSearchQueryChange(event.target.value)}
                        placeholder="Search sender, subject, or content across all accounts..."
                        className="h-full w-full border-0 bg-transparent px-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <select
                        value={accountFilter}
                        onChange={(event) => onAccountFilterChange(event.target.value)}
                        className="ml-2 h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-200 dark:focus:border-[#5865f2]"
                    >
                        <option value="all">All accounts</option>
                        {accounts.map((account) => (
                            <option key={account.id} value={String(account.id)}>
                                {formatAccountSearchLabel(account)}
                            </option>
                        ))}
                    </select>
                    {searchQuery.trim().length > 0 && (
                        <button
                            type="button"
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                            onClick={() => onSearchQueryChange('')}
                            aria-label="Clear search"
                            title="Clear search"
                        >
                            <X size={14}/>
                        </button>
                    )}
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
					<span>
						{accountFilter === 'all'
                            ? 'Searching all accounts and folders'
                            : `Searching ${formatAccountSearchLabel(accounts.find((account) => String(account.id) === accountFilter) ?? null)}`}
					</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                            onClick={onToggleAdvancedSearch}
                        >
                            {advancedSearchOpen ? 'Basic' : 'Advanced'}
                        </button>
                        <button
                            type="button"
                            className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                            onClick={onClose}
                        >
                            Esc
                        </button>
                    </div>
                </div>
                {advancedSearchOpen && (
                    <div
                        className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#1f2125] sm:grid-cols-3 lg:grid-cols-4">
                        <input
                            type="search"
                            value={fromFilter}
                            onChange={(event) => onFromFilterChange(event.target.value)}
                            placeholder="From address/name"
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        <input
                            type="search"
                            value={subjectFilter}
                            onChange={(event) => onSubjectFilterChange(event.target.value)}
                            placeholder="Subject"
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        <input
                            type="search"
                            value={toFilter}
                            onChange={(event) => onToFilterChange(event.target.value)}
                            placeholder="To address"
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        <select
                            value={folderFilter}
                            onChange={(event) => onFolderFilterChange(event.target.value)}
                            disabled={accountFilter === 'all'}
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        >
                            <option value="all">All folders</option>
                            {searchFoldersForSelectedAccount.map((folder) => (
                                <option key={folder.id} value={String(folder.id)}>
                                    {folder.custom_name || folder.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={readFilter}
                            onChange={(event) => onReadFilterChange(event.target.value as 'all' | 'read' | 'unread')}
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        >
                            <option value="all">Read status: all</option>
                            <option value="read">Read only</option>
                            <option value="unread">Unread only</option>
                        </select>
                        <select
                            value={starFilter}
                            onChange={(event) =>
                                onStarFilterChange(event.target.value as 'all' | 'starred' | 'unstarred')
                            }
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        >
                            <option value="all">Star: all</option>
                            <option value="starred">Starred only</option>
                            <option value="unstarred">Unstarred only</option>
                        </select>
                        <select
                            value={dateRangeFilter}
                            onChange={(event) =>
                                onDateRangeFilterChange(event.target.value as 'all' | '7d' | '30d' | '365d')
                            }
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        >
                            <option value="all">Any date</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                            <option value="365d">Last 12 months</option>
                        </select>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            value={minSizeKbFilter}
                            onChange={(event) => onMinSizeKbFilterChange(event.target.value)}
                            placeholder="Min size (KB)"
                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={0}
                                step={1}
                                value={maxSizeKbFilter}
                                onChange={(event) => onMaxSizeKbFilterChange(event.target.value)}
                                placeholder="Max size (KB)"
                                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                            />
                            <button
                                type="button"
                                className="h-9 shrink-0 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={onResetFilters}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                )}
                <div className="mt-3 max-h-[56vh] overflow-y-auto">
                    {!isGlobalSearchActive && (
                        <div
                            className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
                            Type to search emails across all accounts.
                        </div>
                    )}
                    {isGlobalSearchActive && searchLoading && (
                        <div
                            className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
                            Searching...
                        </div>
                    )}
                    {isGlobalSearchActive && !searchLoading && filteredSearchMessages.length === 0 && (
                        <div
                            className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
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
                                        className="block w-full rounded-lg border border-transparent px-3 py-2 text-left no-underline transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-[#3a3d44] dark:hover:bg-[#30333a]"
                                        style={{color: 'inherit'}}
                                        onClick={() => {
                                            onSelectMessage(message.id, idx);
                                            onClose();
                                        }}
                                    >
                                        <div
                                            className={`truncate text-sm ${message.is_read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-950 dark:text-white'}`}
                                        >
                                            {message.subject || '(No subject)'}
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-2">
											<span className="truncate text-xs text-slate-500 dark:text-slate-400">
												{formatMessageSender(message)}
											</span>
                                            <div className="ml-2 flex shrink-0 items-center gap-2">
                                                {Boolean(message.is_flagged) && (
                                                    <span
                                                        className="inline-flex items-center text-amber-500 dark:text-amber-300"
                                                        title="Starred"
                                                    >
														<Star size={12} className="fill-current"/>
													</span>
                                                )}
                                                <span className="text-xs text-slate-400 dark:text-slate-500">
													{formatSystemDateTime(message.date, dateLocale)}
												</span>
                                            </div>
                                        </div>
                                        <div
                                            className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-slate-500">
											<span className="truncate">
												{account?.display_name?.trim() ||
                                                    account?.email ||
                                                    `Account ${message.account_id}`}
											</span>
                                            <span
                                                className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#30333a] dark:text-slate-300">
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
