import React from 'react';
import {
    Archive,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    FileText,
    Folder,
    FolderPlus,
    Inbox,
    Mail,
    PenSquare,
    RefreshCw,
    Search,
    Send,
    Settings,
    ShieldAlert,
    Trash2,
    X
} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '../../preload/index';
import {Badge} from '../components/ui/badge';
import {Button} from '../components/ui/button';
import {ScrollArea} from '../components/ui/scroll-area';
import {formatSystemDate} from '../lib/dateTime';
import {cn} from '../lib/utils';

interface MainLayoutProps {
    children: React.ReactNode;
    accounts: PublicAccount[];
    selectedAccountId: number | null;
    accountFoldersById: Record<number, FolderItem[]>;
    onSelectAccount: (id: number) => void;
    folders: FolderItem[];
    selectedFolderPath: string | null;
    onSelectFolder: (path: string, accountId?: number) => void;
    messages: MessageItem[];
    selectedMessageId: number | null;
    selectedMessageIds: number[];
    onSelectMessage: (id: number, index: number, modifiers?: {
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean
    }) => void;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    onLoadMoreMessages: () => void;
    hasMoreMessages: boolean;
    loadingMoreMessages: boolean;
    onRefresh: () => void;
    syncStatusText?: string | null;
    syncInProgress?: boolean;
    syncingAccountIds?: ReadonlySet<number>;
    onMessageMarkReadToggle: (message: MessageItem) => void;
    onBulkMarkRead: (messageIds: number[], nextRead: number) => void;
    onBulkDelete: (messageIds: number[]) => void;
    onClearMessageSelection: () => void;
    onMessageFlagToggle: (message: MessageItem) => void;
    onMessageDelete: (message: MessageItem) => void;
    onMessageMove: (message: MessageItem, targetFolderPath: string) => void;
    onFolderSync: () => void;
    onCreateFolder: () => void;
    onDeleteFolder: (folder: FolderItem) => void;
    onUpdateFolderSettings: (
        folder: FolderItem,
        payload: { customName?: string | null; color?: string | null; type?: string | null },
    ) => Promise<void>;
    dateLocale?: string;
}

const FOLDER_COLOR_OPTIONS = [
    {value: '', label: 'Default'},
    {value: 'sky', label: 'Sky'},
    {value: 'emerald', label: 'Emerald'},
    {value: 'amber', label: 'Amber'},
    {value: 'rose', label: 'Rose'},
    {value: 'violet', label: 'Violet'},
    {value: 'slate', label: 'Slate'},
] as const;

const FOLDER_TYPE_OPTIONS = [
    {value: '', label: 'Auto detect'},
    {value: 'inbox', label: 'Inbox'},
    {value: 'sent', label: 'Sent'},
    {value: 'drafts', label: 'Drafts'},
    {value: 'archive', label: 'Archive'},
    {value: 'junk', label: 'Junk'},
    {value: 'trash', label: 'Trash'},
] as const;

const MainLayout: React.FC<MainLayoutProps> = ({
                                                   children,
                                                   accounts,
                                                   selectedAccountId,
                                                   accountFoldersById,
                                                   onSelectAccount,
                                                   folders,
                                                   selectedFolderPath,
                                                   onSelectFolder,
                                                   messages,
                                                   selectedMessageId,
                                                   selectedMessageIds,
                                                   onSelectMessage,
                                                   searchQuery,
                                                   onSearchQueryChange,
                                                   onLoadMoreMessages,
                                                   hasMoreMessages,
                                                   loadingMoreMessages,
                                                   onRefresh,
                                                   syncStatusText,
                                                   syncInProgress,
                                                   syncingAccountIds,
                                                   onMessageMarkReadToggle,
                                                   onBulkMarkRead,
                                                   onBulkDelete,
                                                   onClearMessageSelection,
                                                   onMessageFlagToggle,
                                                   onMessageDelete,
                                                   onMessageMove,
                                                   onFolderSync,
                                                   onCreateFolder,
                                                   onDeleteFolder,
                                                   onUpdateFolderSettings,
                                                   dateLocale,
                                               }) => {
    const [menu, setMenu] = React.useState<
        | { kind: 'message'; x: number; y: number; message: MessageItem }
        | { kind: 'folder'; x: number; y: number; folder: FolderItem }
        | null
    >(null);
    const [accountMenu, setAccountMenu] = React.useState<{ x: number; y: number; account: PublicAccount } | null>(null);
    const [expandedAccountIds, setExpandedAccountIds] = React.useState<Set<number>>(
        () => new Set(accounts.map((account) => account.id)),
    );
    const [draggingMessageId, setDraggingMessageId] = React.useState<number | null>(null);
    const [dragTargetFolderPath, setDragTargetFolderPath] = React.useState<string | null>(null);
    const [localSyncingAccountIds, setLocalSyncingAccountIds] = React.useState<Set<number>>(new Set());
    const [folderEditor, setFolderEditor] = React.useState<
        | {
        folder: FolderItem;
        customName: string;
        type: string;
        color: string;
    }
        | null
    >(null);
    const [folderEditorSaving, setFolderEditorSaving] = React.useState(false);
    const [folderEditorError, setFolderEditorError] = React.useState<string | null>(null);
    const selectedFolder = React.useMemo(
        () => folders.find((folder) => folder.path === selectedFolderPath) ?? null,
        [folders, selectedFolderPath],
    );
    const protectedFolders = React.useMemo(
        () => folders.filter((folder) => isProtectedFolder(folder)),
        [folders],
    );
    const customFolders = React.useMemo(
        () => folders.filter((folder) => !isProtectedFolder(folder)),
        [folders],
    );
    const headerLightTint = getHeaderLightTint(selectedFolder?.color);

    React.useEffect(() => {
        if (accounts.length === 0) {
            setExpandedAccountIds(new Set());
            return;
        }
        setExpandedAccountIds((prev) => {
            const next = new Set(prev);
            for (const account of accounts) next.add(account.id);
            if (typeof selectedAccountId === 'number') next.add(selectedAccountId);
            return next;
        });
    }, [accounts, selectedAccountId]);

    React.useEffect(() => {
        const close = () => {
            setMenu(null);
            setAccountMenu(null);
        };
        window.addEventListener('click', close);
        window.addEventListener('keydown', close);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('keydown', close);
        };
    }, []);

    async function saveFolderSettings() {
        if (!folderEditor || folderEditorSaving) return;
        setFolderEditorSaving(true);
        setFolderEditorError(null);
        try {
            await onUpdateFolderSettings(folderEditor.folder, {
                customName: folderEditor.customName.trim() || null,
                color: folderEditor.color || null,
                type: folderEditor.type || null,
            });
            setFolderEditor(null);
        } catch (e: any) {
            setFolderEditorError(e?.message || String(e));
        } finally {
            setFolderEditorSaving(false);
        }
    }

    function syncAccountNow(accountId: number): void {
        setLocalSyncingAccountIds((prev) => {
            if (prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.add(accountId);
            return next;
        });
        void window.electronAPI
            .syncAccount(accountId)
            .catch((error) => {
                console.error('Failed to sync account', accountId, error);
            })
            .finally(() => {
                setLocalSyncingAccountIds((prev) => {
                    if (!prev.has(accountId)) return prev;
                    const next = new Set(prev);
                    next.delete(accountId);
                    return next;
                });
            });
    }

    function toggleAccountExpanded(accountId: number): void {
        setExpandedAccountIds((prev) => {
            const next = new Set(prev);
            if (next.has(accountId)) next.delete(accountId);
            else next.add(accountId);
            return next;
        });
    }

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <header className={cn('h-14 shrink-0 text-white dark:bg-[#15161a]', headerLightTint)}>
                <div className="flex h-full items-center justify-between px-4">
                    <div className="min-w-0 flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Mail size={18} className="opacity-90"/>
                            <p className="truncate text-base font-semibold tracking-tight text-white">LunaMail</p>
                        </div>
                        <Button
                            variant="ghost"
                            className="h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white"
                            onClick={() => window.electronAPI.openComposeWindow()}
                            title="Compose"
                            aria-label="Compose"
                        >
                            <PenSquare size={16} className="mr-2"/>
                            <span className="text-sm font-medium">Compose</span>
                        </Button>
                    </div>
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            className="mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                            onClick={() => void window.electronAPI.openAppSettingsWindow()}
                            title="App settings"
                            aria-label="App settings"
                        >
                            <Settings size={17}/>
                        </Button>
                        <Button
                            variant="ghost"
                            className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                            onClick={() => void window.electronAPI.openSupportWindow()}
                            title="Support"
                            aria-label="Support"
                        >
                            <CircleHelp size={17}/>
                        </Button>
                    </div>
                </div>
            </header>

            <div className="min-h-0 flex flex-1 overflow-hidden">
                <aside
                    className="flex min-h-0 w-16 shrink-0 flex-col border-r border-slate-200 bg-gradient-to-b from-slate-100 via-slate-100 to-slate-50 text-slate-800 dark:border-[#1b1c20] dark:bg-gradient-to-b dark:from-[#1f2125] dark:via-[#1f2125] dark:to-[#22242a] dark:text-slate-100 lg:w-80">
                    <ScrollArea className="min-h-0 flex-1 px-2 py-3">
                        <nav className="space-y-1.5">
                            <div className="mb-2 flex items-center justify-between px-3">
                                <span
                                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Accounts</span>
                                <button
                                    className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#3a3d44] dark:hover:text-white"
                                    onClick={() => window.electronAPI.openAddAccountWindow()}
                                    title="Add account"
                                    aria-label="Add account"
                                >
                                    <FolderPlus size={14}/>
                                </button>
                            </div>

                            {accounts.length === 0 && (
                                <div
                                    className="hidden rounded-lg px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 lg:block">No
                                    accounts yet</div>
                            )}

                            {accounts.map((account) => {
                                const isSelectedAccount = account.id === selectedAccountId;
                                const isSyncingAccount = (syncingAccountIds?.has(account.id) ?? false) || localSyncingAccountIds.has(account.id);
                                const isExpanded = expandedAccountIds.has(account.id);
                                const accountFolders = isSelectedAccount
                                    ? folders
                                    : (accountFoldersById[account.id] ?? []);
                                const accountProtectedFolders = accountFolders.filter((folder) => isProtectedFolder(folder));
                                const accountCustomFolders = accountFolders.filter((folder) => !isProtectedFolder(folder));
                                return (
                                    <div key={account.id} className="space-y-1">
                                        <div
                                            className={cn('group flex items-center gap-1 rounded-lg px-1 py-0.5', isSelectedAccount && 'bg-slate-200/70 dark:bg-[#3a3d44]')}>
                                            <button
                                                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleAccountExpanded(account.id);
                                                }}
                                                title={isExpanded ? 'Collapse account' : 'Expand account'}
                                                aria-label={isExpanded ? 'Collapse account' : 'Expand account'}
                                            >
                                                {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                            </button>
                                            <button
                                                className={cn(
                                                    'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                                                    isSelectedAccount
                                                        ? 'font-semibold text-slate-900 dark:text-white'
                                                        : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-[#3a3d44]',
                                                )}
                                                onClick={() => onSelectAccount(account.id)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setAccountMenu({x: e.clientX, y: e.clientY, account});
                                                }}
                                            >
                                                <Mail size={14} className="shrink-0 opacity-75"/>
                                                <span
                                                    className="truncate">{account.display_name?.trim() || account.email}</span>
                                            </button>
                                            <div
                                                className={cn('flex items-center gap-1 pr-1 transition-opacity', isSyncingAccount ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                                <button
                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        syncAccountNow(account.id);
                                                    }}
                                                    title="Sync account"
                                                    aria-label="Sync account"
                                                    disabled={isSyncingAccount}
                                                >
                                                    <RefreshCw size={13}
                                                               className={cn(isSyncingAccount && 'animate-spin')}/>
                                                </button>
                                                <button
                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void window.electronAPI.openAccountSettingsWindow(account.id);
                                                    }}
                                                    title="Edit account"
                                                    aria-label="Edit account"
                                                >
                                                    <Settings size={13}/>
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div
                                                className="relative space-y-1 pl-7 before:absolute before:bottom-2 before:left-3 before:top-1 before:w-px before:bg-slate-300/80 before:content-[''] dark:before:bg-[#4a4d55]">
                                                {accountFolders.length === 0 ? (
                                                    <div
                                                        className="hidden rounded-md px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 lg:block">
                                                        No folders yet
                                                    </div>
                                                ) : (
                                                    <>
                                                        {accountProtectedFolders.map((folder) => (
                                                            <FolderItemRow
                                                                key={folder.id}
                                                                icon={getFolderIcon(folder)}
                                                                label={folder.custom_name || folder.name}
                                                                count={folder.unread_count}
                                                                active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                dropActive={dragTargetFolderPath === folder.path}
                                                                onClick={() => {
                                                                    if (!isSelectedAccount) onSelectAccount(account.id);
                                                                    onSelectFolder(folder.path, account.id);
                                                                }}
                                                                onDragEnter={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    setDragTargetFolderPath(folder.path);
                                                                }}
                                                                onDragOver={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    e.dataTransfer.dropEffect = 'move';
                                                                    if (dragTargetFolderPath !== folder.path) {
                                                                        setDragTargetFolderPath(folder.path);
                                                                    }
                                                                }}
                                                                onDragLeave={(e) => {
                                                                    const related = e.relatedTarget as Node | null;
                                                                    if (related && e.currentTarget.contains(related)) return;
                                                                    if (dragTargetFolderPath === folder.path) {
                                                                        setDragTargetFolderPath(null);
                                                                    }
                                                                }}
                                                                onDrop={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    const idRaw =
                                                                        e.dataTransfer.getData('application/x-lunamail-message-id') ||
                                                                        e.dataTransfer.getData('text/plain');
                                                                    const droppedMessageId = Number(idRaw);
                                                                    const droppedMessage = messages.find((m) => m.id === droppedMessageId);
                                                                    if (droppedMessage) {
                                                                        onMessageMove(droppedMessage, folder.path);
                                                                    }
                                                                    setDragTargetFolderPath(null);
                                                                    setDraggingMessageId(null);
                                                                }}
                                                                onContextMenu={(e) => {
                                                                    e.preventDefault();
                                                                    if (!isSelectedAccount) onSelectAccount(account.id);
                                                                    setMenu({
                                                                        kind: 'folder',
                                                                        x: e.clientX,
                                                                        y: e.clientY,
                                                                        folder
                                                                    });
                                                                }}
                                                            />
                                                        ))}
                                                        {accountProtectedFolders.length > 0 && accountCustomFolders.length > 0 && (
                                                            <div
                                                                className="my-1 h-px bg-slate-200/80 dark:bg-[#3a3d44]"/>
                                                        )}
                                                        {accountCustomFolders.map((folder) => (
                                                            <FolderItemRow
                                                                key={folder.id}
                                                                icon={getFolderIcon(folder)}
                                                                label={folder.custom_name || folder.name}
                                                                count={folder.unread_count}
                                                                active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                dropActive={dragTargetFolderPath === folder.path}
                                                                onClick={() => {
                                                                    if (!isSelectedAccount) onSelectAccount(account.id);
                                                                    onSelectFolder(folder.path, account.id);
                                                                }}
                                                                onDragEnter={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    setDragTargetFolderPath(folder.path);
                                                                }}
                                                                onDragOver={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    e.dataTransfer.dropEffect = 'move';
                                                                    if (dragTargetFolderPath !== folder.path) {
                                                                        setDragTargetFolderPath(folder.path);
                                                                    }
                                                                }}
                                                                onDragLeave={(e) => {
                                                                    const related = e.relatedTarget as Node | null;
                                                                    if (related && e.currentTarget.contains(related)) return;
                                                                    if (dragTargetFolderPath === folder.path) {
                                                                        setDragTargetFolderPath(null);
                                                                    }
                                                                }}
                                                                onDrop={(e) => {
                                                                    if (!isSelectedAccount) return;
                                                                    if (draggingMessageId === null) return;
                                                                    if (folder.path === selectedFolderPath) return;
                                                                    e.preventDefault();
                                                                    const idRaw =
                                                                        e.dataTransfer.getData('application/x-lunamail-message-id') ||
                                                                        e.dataTransfer.getData('text/plain');
                                                                    const droppedMessageId = Number(idRaw);
                                                                    const droppedMessage = messages.find((m) => m.id === droppedMessageId);
                                                                    if (droppedMessage) {
                                                                        onMessageMove(droppedMessage, folder.path);
                                                                    }
                                                                    setDragTargetFolderPath(null);
                                                                    setDraggingMessageId(null);
                                                                }}
                                                                onContextMenu={(e) => {
                                                                    e.preventDefault();
                                                                    if (!isSelectedAccount) onSelectAccount(account.id);
                                                                    setMenu({
                                                                        kind: 'folder',
                                                                        x: e.clientX,
                                                                        y: e.clientY,
                                                                        folder
                                                                    });
                                                                }}
                                                            />
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </nav>
                    </ScrollArea>

                </aside>

                <main
                    className="relative flex min-h-0 w-[38vw] min-w-[15rem] max-w-[26rem] flex-col border-r border-slate-200 bg-white dark:border-[#2a2d31] dark:bg-[#2b2d31]">
                    <div className="border-b border-slate-200 p-4 dark:border-[#393c41]">
                        <div
                            className="group flex h-10 items-center rounded-lg border border-slate-300 bg-white/90 px-2.5 shadow-sm transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 dark:border-[#40444b] dark:bg-[#1f2125] dark:focus-within:border-[#5865f2] dark:focus-within:ring-[#5865f2]/30">
                            <Search size={15} className="mr-2 shrink-0 text-slate-400 dark:text-slate-500"/>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => onSearchQueryChange(e.target.value)}
                                placeholder="Search sender, subject, or content..."
                                className="h-full w-full border-0 bg-transparent px-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
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
                    </div>
                    {selectedMessageIds.length > 1 && (
                        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20">
                            <div
                                className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-[#3a3d44] dark:bg-[#1f2125]/95">
                                <span
                                    className="text-xs font-medium text-slate-600 dark:text-slate-300">{selectedMessageIds.length} selected</span>
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                                >
                                    Mark read
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                                >
                                    Mark unread
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/25"
                                    onClick={() => onBulkDelete(selectedMessageIds)}
                                >
                                    Delete
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={onClearMessageSelection}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}
                    <ScrollArea
                        className="min-h-0 flex-1"
                        onScroll={(e) => {
                            if (!hasMoreMessages || loadingMoreMessages) return;
                            const el = e.currentTarget;
                            const threshold = 220;
                            if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
                                onLoadMoreMessages();
                            }
                        }}
                    >
                        {messages.length === 0 && (
                            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">No messages in this folder
                                yet.</div>
                        )}
                        {messages.map((message, messageIndex) => (
                            <button
                                key={message.id}
                                className={cn(
                                    'w-full border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]',
                                    draggingMessageId === message.id && 'opacity-60',
                                    selectedMessageIds.includes(message.id) && 'bg-sky-50/70 dark:bg-[#3a3e52]',
                                    selectedMessageId === message.id && 'border-l-4 border-l-sky-600 dark:border-l-[#5865f2]',
                                )}
                                onClick={(e) =>
                                    onSelectMessage(message.id, messageIndex, {
                                        shiftKey: e.shiftKey,
                                        ctrlKey: e.ctrlKey,
                                        metaKey: e.metaKey,
                                    })}
                                draggable
                                onDragStart={(e) => {
                                    setDraggingMessageId(message.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('application/x-lunamail-message-id', String(message.id));
                                    e.dataTransfer.setData('text/plain', String(message.id));

                                    const ghost = document.createElement('div');
                                    ghost.textContent = `Move: ${message.subject || '(No subject)'}`;
                                    ghost.style.position = 'fixed';
                                    ghost.style.top = '-1000px';
                                    ghost.style.left = '-1000px';
                                    ghost.style.padding = '6px 10px';
                                    ghost.style.maxWidth = '280px';
                                    ghost.style.borderRadius = '8px';
                                    ghost.style.background = 'rgba(3, 105, 161, 0.92)';
                                    ghost.style.color = '#fff';
                                    ghost.style.fontSize = '12px';
                                    ghost.style.fontWeight = '600';
                                    ghost.style.whiteSpace = 'nowrap';
                                    ghost.style.overflow = 'hidden';
                                    ghost.style.textOverflow = 'ellipsis';
                                    ghost.style.pointerEvents = 'none';
                                    ghost.style.zIndex = '9999';
                                    document.body.appendChild(ghost);
                                    e.dataTransfer.setDragImage(ghost, 12, 12);
                                    setTimeout(() => {
                                        ghost.remove();
                                    }, 0);
                                }}
                                onDragEnd={() => {
                                    setDraggingMessageId(null);
                                    setDragTargetFolderPath(null);
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setMenu({kind: 'message', x: e.clientX, y: e.clientY, message});
                                }}
                            >
                                <div
                                    className={`truncate text-sm ${message.is_read ? 'font-medium text-slate-800 dark:text-slate-200' : 'font-semibold text-slate-950 dark:text-white'}`}>
                                    {message.subject || '(No subject)'}
                                </div>
                                <div className="mt-1.5 flex justify-between">
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{formatMessageSender(message)}</p>
                                    <span
                                        className="ml-3 inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {!message.is_read &&
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-600 dark:bg-[#8ea1ff]"/>}
                                        <span>{formatSystemDate(message.date, dateLocale)}</span>
                  </span>
                                </div>
                            </button>
                        ))}
                        {loadingMoreMessages && messages.length > 0 && (
                            <div className="px-5 py-3 text-center text-xs text-slate-500 dark:text-slate-400">Loading
                                more messages...</div>
                        )}
                        {!hasMoreMessages && messages.length > 0 && (
                            <div className="px-5 py-3 text-center text-xs text-slate-400 dark:text-slate-500">End of
                                list</div>
                        )}
                    </ScrollArea>
                </main>

                <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">{children}</section>
            </div>

            <footer
                className="h-8 shrink-0 border-t border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d31] dark:bg-[#1b1c20]">
                <div className="flex h-full items-center justify-between text-xs">
          <span className="truncate text-slate-600 dark:text-slate-300">
            {syncStatusText || 'Ready'}
          </span>
                    <span className="ml-3 shrink-0 text-slate-400 dark:text-slate-500">
            LunaMail
          </span>
                </div>
            </footer>

            {menu && (
                <div
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{left: menu.x, top: menu.y}}
                    onClick={(e) => e.stopPropagation()}
                >
                    {menu.kind === 'message' && (
                        <>
                            <ContextItem
                                label={menu.message.is_read ? 'Mark as unread' : 'Mark as read'}
                                onClick={() => {
                                    onMessageMarkReadToggle(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label={menu.message.is_flagged ? 'Unstar' : 'Star'}
                                onClick={() => {
                                    onMessageFlagToggle(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <div className="my-1 h-px bg-slate-200"/>
                            <div className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">Move to
                            </div>
                            {folders
                                .filter((f) => f.path !== selectedFolderPath)
                                .slice(0, 12)
                                .map((f) => (
                                    <ContextItem
                                        key={f.id}
                                        label={f.custom_name || f.name}
                                        onClick={() => {
                                            onMessageMove(menu.message, f.path);
                                            setMenu(null);
                                        }}
                                    />
                                ))}
                            <div className="my-1 h-px bg-slate-200"/>
                            <ContextItem
                                label="Delete"
                                danger
                                onClick={() => {
                                    onMessageDelete(menu.message);
                                    setMenu(null);
                                }}
                            />
                        </>
                    )}
                    {menu.kind === 'folder' && (
                        <>
                            <ContextItem
                                label="Open Folder"
                                onClick={() => {
                                    if (menu.folder.account_id !== selectedAccountId) {
                                        onSelectAccount(menu.folder.account_id);
                                    }
                                    onSelectFolder(menu.folder.path, menu.folder.account_id);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label="Edit Folder Settings"
                                onClick={() => {
                                    setFolderEditor({
                                        folder: menu.folder,
                                        customName: menu.folder.custom_name || menu.folder.name,
                                        type: menu.folder.type || '',
                                        color: menu.folder.color || '',
                                    });
                                    setFolderEditorError(null);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label="Sync Account"
                                onClick={() => {
                                    syncAccountNow(menu.folder.account_id);
                                    setMenu(null);
                                }}
                            />
                            {!isProtectedFolder(menu.folder) && (
                                <>
                                    <div className="my-1 h-px bg-slate-200"/>
                                    <ContextItem
                                        label="Delete Folder"
                                        danger
                                        onClick={() => {
                                            onDeleteFolder(menu.folder);
                                            setMenu(null);
                                        }}
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {accountMenu && (
                <div
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{left: accountMenu.x, top: accountMenu.y}}
                    onClick={(e) => e.stopPropagation()}
                >
                    <ContextItem
                        label="Edit Account Settings"
                        onClick={() => {
                            void window.electronAPI.openAccountSettingsWindow(accountMenu.account.id);
                            setAccountMenu(null);
                        }}
                    />
                </div>
            )}

            {folderEditor && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4"
                     onClick={() => setFolderEditor(null)}>
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#313338]"
                        onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Folder</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{folderEditor.folder.path}</p>

                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Display name</span>
                                <input
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    value={folderEditor.customName}
                                    onChange={(e) => setFolderEditor((prev) => (prev ? {
                                        ...prev,
                                        customName: e.target.value
                                    } : prev))}
                                />
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder type</span>
                                <select
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                    value={folderEditor.type}
                                    onChange={(e) => setFolderEditor((prev) => (prev ? {
                                        ...prev,
                                        type: e.target.value
                                    } : prev))}
                                >
                                    {FOLDER_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder color</span>
                                <select
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                    value={folderEditor.color}
                                    onChange={(e) => setFolderEditor((prev) => (prev ? {
                                        ...prev,
                                        color: e.target.value
                                    } : prev))}
                                >
                                    {FOLDER_COLOR_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {folderEditorError && <p className="mt-3 text-sm text-red-600">{folderEditorError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setFolderEditor(null)}
                                    disabled={folderEditorSaving}>
                                Cancel
                            </Button>
                            <Button onClick={() => void saveFolderSettings()} disabled={folderEditorSaving}>
                                {folderEditorSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FolderItemRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    dropActive?: boolean;
    count?: number;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLButtonElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLButtonElement>) => void;
    onDragEnter?: (e: React.DragEvent<HTMLButtonElement>) => void;
    onDragLeave?: (e: React.DragEvent<HTMLButtonElement>) => void;
}> = ({
          icon,
          label,
          active,
          dropActive,
          count,
          onClick,
          onContextMenu,
          onDrop,
          onDragOver,
          onDragEnter,
          onDragLeave
      }) => {
    return (
        <button
            className={cn(
                "relative ml-3 flex h-8 w-[calc(100%-0.75rem)] items-center justify-between rounded-md px-2 text-left transition-colors before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/80 before:content-[''] dark:before:bg-[#4a4d55]",
                dropActive && 'bg-slate-200 text-slate-900 ring-1 ring-slate-300 dark:bg-[#404249] dark:text-slate-100 dark:ring-[#5b5e66]',
                active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200',
                'hover:bg-slate-200/70 dark:hover:bg-[#3a3d44]',
            )}
            onClick={onClick}
            onContextMenu={onContextMenu}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
        >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
          <span
              className={cn('hidden truncate text-xs lg:inline', active ? 'font-semibold' : 'font-normal')}>{label}</span>
      </span>
            {typeof count === 'number' && count > 0 && (
                <Badge
                    className="hidden lg:inline-flex bg-slate-300/60 text-slate-700 dark:bg-white/15 dark:text-slate-100">{count}</Badge>
            )}
        </button>
    );
};

const ContextItem: React.FC<{ label: string; onClick: () => void; danger?: boolean }> = ({label, onClick, danger}) => (
    <button
        className={cn(
            'block w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
            danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]',
        )}
        onClick={onClick}
    >
        {label}
    </button>
);

function getFolderIcon(folder: FolderItem): React.ReactNode {
    const type = (folder.type ?? '').toLowerCase();
    const path = folder.path.toLowerCase();

    if (type === 'inbox' || path === 'inbox') return <Inbox size={18}/>;
    if (type === 'sent' || path.includes('sent')) return <Send size={18}/>;
    if (type === 'drafts' || path.includes('draft')) return <FileText size={18}/>;
    if (type === 'archive' || path.includes('archive')) return <Archive size={18}/>;
    if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return <Trash2 size={18}/>;
    if (type === 'junk' || path.includes('spam') || path.includes('junk')) return <ShieldAlert size={18}/>;
    return <Folder size={18}/>;
}

function isProtectedFolder(folder: FolderItem): boolean {
    const type = (folder.type || '').toLowerCase();
    const path = folder.path.toLowerCase();
    if (type === 'inbox' || path === 'inbox') return true;
    if (type === 'sent' || path.includes('sent')) return true;
    if (type === 'drafts' || path.includes('draft')) return true;
    if (type === 'archive' || path.includes('archive')) return true;
    if (type === 'junk' || path.includes('spam') || path.includes('junk')) return true;
    if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return true;
    return false;
}

function formatMessageSender(message: MessageItem): string {
    const name = (message.from_name || '').trim();
    const email = (message.from_address || '').trim();
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return 'Unknown sender';
}

function getHeaderLightTint(color: string | null | undefined): string {
    switch ((color || '').toLowerCase()) {
        case 'sky':
            return 'bg-sky-700';
        case 'emerald':
            return 'bg-emerald-700';
        case 'amber':
            return 'bg-amber-600';
        case 'rose':
            return 'bg-rose-700';
        case 'violet':
            return 'bg-violet-700';
        case 'slate':
            return 'bg-slate-700';
        default:
            return 'bg-slate-700';
    }
}

export default MainLayout;
