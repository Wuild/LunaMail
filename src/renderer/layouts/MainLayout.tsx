import React from 'react';
import {Link} from 'react-router-dom';
import {
    Archive,
    Bug,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    FileText,
    Folder,
    FolderPlus,
    Inbox,
    Mail,
    MailOpen,
    PenSquare,
    RefreshCw,
    Search,
    Send,
    Settings,
    ShieldAlert,
    SquareArrowOutUpRight,
    Trash2,
    Users,
    X
} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '../../preload/index';
import {Badge} from '../components/ui/badge';
import {Button} from '../components/ui/button';
import {ScrollArea} from '../components/ui/scroll-area';
import {isProtectedFolder} from '../features/mail/folders';
import {getAccountAvatarColors, getAccountMonogram} from '../lib/accountAvatar';
import {formatSystemDate} from '../lib/dateTime';
import {useResizableSidebar} from '../hooks/useResizableSidebar';
import {cn} from '../lib/utils';
import WorkspaceLayout from './WorkspaceLayout';

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
    searchResults: MessageItem[];
    searchLoading: boolean;
    onLoadMoreMessages: () => void;
    hasMoreMessages: boolean;
    loadingMoreMessages: boolean;
    onRefresh: () => void;
    canNavigateBack?: boolean;
    canNavigateForward?: boolean;
    onNavigateBack?: () => void;
    onNavigateForward?: () => void;
    onOpenCalendar: () => void;
    onOpenContacts: () => void;
    activeWorkspace?: 'mail' | 'calendar' | 'contacts';
    hideFolderSidebar?: boolean;
    hideHeader?: boolean;
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
    onCreateFolder: (payload: {
        accountId: number;
        folderPath: string;
        type?: string | null;
        color?: string | null;
    }) => Promise<void>;
    onReorderCustomFolders: (accountId: number, orderedFolderPaths: string[]) => Promise<void>;
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

const ACCOUNT_COLLAPSE_STORAGE_KEY = 'lunamail.accountCollapseState.v1';

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
                                                   searchResults,
                                                   searchLoading,
                                                   onLoadMoreMessages,
                                                   hasMoreMessages,
                                                   loadingMoreMessages,
                                                   onRefresh,
                                                   canNavigateBack = false,
                                                   canNavigateForward = false,
                                                   onNavigateBack,
                                                   onNavigateForward,
                                                   onOpenCalendar,
                                                   onOpenContacts,
                                                   activeWorkspace = 'mail',
                                                   hideFolderSidebar = false,
                                                   hideHeader = false,
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
                                                   onReorderCustomFolders,
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
    const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
    const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
    const moveToTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const mailSearchModalInputRef = React.useRef<HTMLInputElement | null>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number }>({left: 0, top: 0});
    const [accountMenuPosition, setAccountMenuPosition] = React.useState<{ left: number; top: number }>({
        left: 0,
        top: 0
    });
    const [moveSubmenuLeft, setMoveSubmenuLeft] = React.useState(false);
    const [moveSubmenuOffsetY, setMoveSubmenuOffsetY] = React.useState(0);
    const [collapsedAccountIds, setCollapsedAccountIds] = React.useState<Set<number>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = window.localStorage.getItem(ACCOUNT_COLLAPSE_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw) as number[];
            if (!Array.isArray(parsed)) return new Set();
            return new Set(parsed.filter((v) => Number.isFinite(v)));
        } catch {
            return new Set();
        }
    });
    const [draggingMessage, setDraggingMessage] = React.useState<{ id: number; accountId: number } | null>(null);
    const [dragTargetFolder, setDragTargetFolder] = React.useState<{ accountId: number; path: string } | null>(null);
    const [draggingCustomFolder, setDraggingCustomFolder] = React.useState<{
        accountId: number;
        path: string
    } | null>(null);
    const [customFolderDropTarget, setCustomFolderDropTarget] = React.useState<{
        accountId: number;
        path: string
    } | null>(null);
    const [searchModalOpen, setSearchModalOpen] = React.useState(false);
    const [advancedSearchOpen, setAdvancedSearchOpen] = React.useState(false);
    const [fromFilter, setFromFilter] = React.useState('');
    const [subjectFilter, setSubjectFilter] = React.useState('');
    const [toFilter, setToFilter] = React.useState('');
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
    const [createFolderModal, setCreateFolderModal] = React.useState<
        | {
        accountId: number;
        folderPath: string;
        type: string;
        color: string;
    }
        | null
    >(null);
    const [createFolderSaving, setCreateFolderSaving] = React.useState(false);
    const [createFolderError, setCreateFolderError] = React.useState<string | null>(null);
    const {sidebarWidth, onResizeStart} = useResizableSidebar();
    const {sidebarWidth: mailListWidth, onResizeStart: onMailListResizeStart} = useResizableSidebar({
        storageKey: 'lunamail.mailList.width',
        defaultWidth: 420,
        minWidth: 300,
        maxWidth: 760,
    });
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
    const moveTargets = React.useMemo(
        () => folders.filter((f) => f.path !== selectedFolderPath).slice(0, 12),
        [folders, selectedFolderPath],
    );
    const moveTargetsProtected = React.useMemo(
        () => moveTargets.filter((folder) => isProtectedFolder(folder)),
        [moveTargets],
    );
    const moveTargetsCustom = React.useMemo(
        () => moveTargets.filter((folder) => !isProtectedFolder(folder)),
        [moveTargets],
    );
    const isGlobalSearchActive = searchQuery.trim().length > 0;
    const filteredSearchMessages = React.useMemo(() => {
        const normalizedFrom = fromFilter.trim().toLowerCase();
        const normalizedSubject = subjectFilter.trim().toLowerCase();
        const normalizedTo = toFilter.trim().toLowerCase();
        if (!normalizedFrom && !normalizedSubject && !normalizedTo) return searchResults;
        return searchResults.filter((message) => {
            if (normalizedFrom) {
                const fromName = (message.from_name || '').toLowerCase();
                const fromAddress = (message.from_address || '').toLowerCase();
                if (!fromName.includes(normalizedFrom) && !fromAddress.includes(normalizedFrom)) return false;
            }
            if (normalizedSubject) {
                const subject = (message.subject || '').toLowerCase();
                if (!subject.includes(normalizedSubject)) return false;
            }
            if (normalizedTo) {
                const toAddress = (message.to_address || '').toLowerCase();
                if (!toAddress.includes(normalizedTo)) return false;
            }
            return true;
        });
    }, [searchResults, fromFilter, subjectFilter, toFilter]);

    React.useEffect(() => {
        setCollapsedAccountIds((prev) => {
            // Keep persisted collapse state while accounts are still loading.
            // Otherwise an initial empty accounts list would wipe stored state.
            if (accounts.length === 0) return prev;
            const validIds = new Set(accounts.map((account) => account.id));
            const next = new Set<number>();
            let changed = false;
            for (const id of prev) {
                if (validIds.has(id)) next.add(id);
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [accounts]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(
                ACCOUNT_COLLAPSE_STORAGE_KEY,
                JSON.stringify(Array.from(collapsedAccountIds)),
            );
        } catch {
            // ignore storage failures
        }
    }, [collapsedAccountIds]);

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

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod || event.shiftKey || event.altKey) return;
            if (event.key.toLowerCase() !== 'f') return;
            event.preventDefault();
            setSearchModalOpen(true);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    React.useEffect(() => {
        if (!searchModalOpen) return;
        const raf = window.requestAnimationFrame(() => {
            mailSearchModalInputRef.current?.focus();
            mailSearchModalInputRef.current?.select();
        });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setSearchModalOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [searchModalOpen]);

    React.useEffect(() => {
        if (!menu) {
            setMoveSubmenuLeft(false);
            setMoveSubmenuOffsetY(0);
            return;
        }
        const updatePosition = () => {
            const el = contextMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(menu.x, menu.y, rect.width, rect.height);
            setMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
            if (menu.kind === 'message') {
                const rightSpace = window.innerWidth - (next.left + rect.width) - 8;
                setMoveSubmenuLeft(rightSpace < 236);
            } else {
                setMoveSubmenuLeft(false);
            }
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updatePosition);
        };
    }, [menu]);

    React.useEffect(() => {
        if (!menu || menu.kind !== 'message') {
            setMoveSubmenuOffsetY(0);
            return;
        }
        const updateSubmenuY = () => {
            const trigger = moveToTriggerRef.current;
            if (!trigger) return;
            const triggerTop = trigger.getBoundingClientRect().top;
            const estimatedSubmenuHeight = Math.min(moveTargets.length * 34 + 8, window.innerHeight - 16);
            const availableBelow = window.innerHeight - triggerTop - 8;
            let offsetY = 0;
            if (availableBelow < estimatedSubmenuHeight) {
                offsetY = availableBelow - estimatedSubmenuHeight;
            }
            const maxUpShift = 8 - triggerTop;
            if (offsetY < maxUpShift) offsetY = maxUpShift;
            setMoveSubmenuOffsetY(offsetY);
        };
        const raf = window.requestAnimationFrame(updateSubmenuY);
        window.addEventListener('resize', updateSubmenuY);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updateSubmenuY);
        };
    }, [menu, menuPosition, moveTargets.length]);

    React.useEffect(() => {
        if (!accountMenu) return;
        const updatePosition = () => {
            const el = accountMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(accountMenu.x, accountMenu.y, rect.width, rect.height);
            setAccountMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updatePosition);
        };
    }, [accountMenu]);

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

    async function createFolderFromModal() {
        if (!createFolderModal || createFolderSaving) return;
        const normalizedPath = createFolderModal.folderPath.trim();
        if (!normalizedPath) {
            setCreateFolderError('Folder path is required');
            return;
        }
        setCreateFolderSaving(true);
        setCreateFolderError(null);
        try {
            await onCreateFolder({
                accountId: createFolderModal.accountId,
                folderPath: normalizedPath,
                type: createFolderModal.type || null,
                color: createFolderModal.color || null,
            });
            setCreateFolderModal(null);
        } catch (e: any) {
            setCreateFolderError(e?.message || String(e));
        } finally {
            setCreateFolderSaving(false);
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
        setCollapsedAccountIds((prev) => {
            const next = new Set(prev);
            if (next.has(accountId)) next.delete(accountId);
            else next.add(accountId);
            return next;
        });
    }

    function ensureAccountExpanded(accountId: number): void {
        setCollapsedAccountIds((prev) => {
            if (!prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.delete(accountId);
            return next;
        });
    }

    function syncAllAccountsNow(): void {
        if (accounts.length === 0) return;
        for (const account of accounts) {
            syncAccountNow(account.id);
        }
    }

    return (
        <>
            <WorkspaceLayout
                className="bg-slate-100 dark:bg-[#2f3136]"
                showMenuBar={!hideHeader}
                menubar={(
                    <div className="flex h-full items-center justify-between gap-3 px-4">
                        <div className="min-w-0 flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                                    onClick={() => onNavigateBack?.()}
                                    title="Back"
                                    aria-label="Back"
                                    disabled={!canNavigateBack}
                                >
                                    <ChevronLeft size={16}/>
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                                    onClick={() => onNavigateForward?.()}
                                    title="Forward"
                                    aria-label="Forward"
                                    disabled={!canNavigateForward}
                                >
                                    <ChevronRight size={16}/>
                                </Button>
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
                            <Button
                                variant="ghost"
                                className={cn(
                                    'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
                                    activeWorkspace === 'calendar' && 'bg-white/20 text-white',
                                )}
                                onClick={onOpenCalendar}
                                title="Open calendar"
                                aria-label="Open calendar"
                            >
                                <CalendarDays size={16} className="mr-2"/>
                                <span className="text-sm font-medium">Calendar</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className={cn(
                                    'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
                                    activeWorkspace === 'contacts' && 'bg-white/20 text-white',
                                )}
                                onClick={onOpenContacts}
                                title="Open contacts"
                                aria-label="Open contacts"
                            >
                                <Users size={16} className="mr-2"/>
                                <span className="text-sm font-medium">Contacts</span>
                            </Button>
                        </div>
                        <div className="flex items-center justify-end">
                            <Button
                                variant="ghost"
                                className={cn(
                                    'mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white',
                                    searchModalOpen && 'bg-white/20 text-white',
                                )}
                                onClick={() => setSearchModalOpen(true)}
                                title="Search mail"
                                aria-label="Search mail"
                            >
                                <Search size={15}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = '/settings';
                                }}
                                title="App settings"
                                aria-label="App settings"
                            >
                                <Settings size={17}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = '/debug';
                                }}
                                title="Debug console"
                                aria-label="Debug console"
                            >
                                <Bug size={17}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = '/help';
                                }}
                                title="Support"
                                aria-label="Support"
                            >
                                <CircleHelp size={17}/>
                            </Button>
                        </div>
                    </div>
                )}
                showStatusBar
                statusText={syncStatusText || 'Ready'}
                statusBusy={Boolean(syncInProgress)}
                contentClassName="min-h-0 flex-1 overflow-hidden p-0"
            >

                <div className="min-h-0 flex h-full overflow-hidden">
                {!hideFolderSidebar && (
                    <div className="relative min-h-0 shrink-0" style={{width: sidebarWidth}}>
                    <aside
                        className="flex h-full min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-800 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-100">
                        <ScrollArea className="min-h-0 flex-1 px-2.5 py-3">
                            <nav className="space-y-2">
                                <div className="mb-2 pb-2 border-b border-slate-200 dark:border-[#1b1c20]">
                                    <button
                                        type="button"
                                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                        onClick={() => void window.electronAPI.openComposeWindow(selectedAccountId ? {accountId: selectedAccountId} : null)}
                                        title="Compose"
                                        aria-label="Compose"
                                    >
                                        <PenSquare size={16}/>
                                        <span>Compose</span>
                                    </button>
                                </div>

                                {accounts.length === 0 && (
                                    <div
                                        className="rounded-lg px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">No
                                        accounts yet</div>
                                )}

                                {accounts.map((account, accountIndex) => {
                                    const isSelectedAccount = account.id === selectedAccountId;
                                    const isSyncingAccount = (syncingAccountIds?.has(account.id) ?? false) || localSyncingAccountIds.has(account.id);
                                    const isExpanded = !collapsedAccountIds.has(account.id);
                                    const accountFolders = accountFoldersById[account.id] ?? [];
                                    const accountProtectedFolders = accountFolders.filter((folder) => isProtectedFolder(folder));
                                    const accountCustomFolders = accountFolders.filter((folder) => !isProtectedFolder(folder));
                                    const accountDefaultFolder = accountFolders[0] ?? null;
                                    const accountLinkTarget = accountDefaultFolder
                                        ? `/email/${account.id}/${accountDefaultFolder.id}`
                                        : `/email/${account.id}`;
                                    const avatarColors = getAccountAvatarColors(account.email || account.display_name || String(account.id));
                                    return (
                                        <div key={account.id} className="space-y-1">
                                            <div
                                                className={cn(
                                                    'group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors',
                                                    isSelectedAccount
                                                        ? 'bg-gradient-to-r from-slate-200/90 to-slate-100/90 dark:from-[#3f434b] dark:to-[#373a42]'
                                                        : 'bg-transparent hover:bg-gradient-to-r hover:from-slate-200/90 hover:to-slate-100/90 dark:hover:from-[#3f434b] dark:hover:to-[#373a42]',
                                                )}>

                                                <Link
                                                    to={accountLinkTarget}
                                                    className={cn(
                                                        'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors',
                                                        isSelectedAccount
                                                            ? 'font-semibold text-slate-900 dark:text-white'
                                                            : 'text-slate-700 dark:text-slate-200',
                                                    )}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setAccountMenu({x: e.clientX, y: e.clientY, account});
                                                    }}
                                                    style={{color: 'inherit'}}
                                                >
                                                <span
                                                    className={cn(
                                                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1',
                                                        isSelectedAccount
                                                            ? 'ring-slate-800/30 dark:ring-white/25'
                                                            : 'ring-black/10 dark:ring-white/10',
                                                    )}
                                                    style={{
                                                        backgroundColor: avatarColors.background,
                                                        color: avatarColors.foreground
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
                                                                className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                            {account.email}
                                                        </span>
                                                        )}
                                                </span>
                                                </Link>
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
                                                            window.location.hash = `/settings?accountId=${account.id}`;
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
                                                    className="relative space-y-1 pl-7 before:absolute before:bottom-2 before:left-3.5 before:top-1 before:w-px before:bg-gradient-to-b before:from-slate-300 before:to-slate-200/30 before:content-[''] dark:before:from-[#4a4d55] dark:before:to-transparent">
                                                    {accountFolders.length === 0 ? (
                                                        <div
                                                            className="rounded-md px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                            No folders yet
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {accountProtectedFolders.map((folder) => (
                                                                <FolderItemRow
                                                                    key={folder.id}
                                                                    to={`/email/${account.id}/${folder.id}`}
                                                                    icon={getFolderIcon(folder)}
                                                                    iconColorClassName={getFolderColorClass(folder.color)}
                                                                    label={folder.custom_name || folder.name}
                                                                    count={folder.unread_count}
                                                                    active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                    dropActive={
                                                                        dragTargetFolder?.accountId === folder.account_id
                                                                        && dragTargetFolder.path === folder.path
                                                                    }
                                                                    onDragEnter={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        setDragTargetFolder({
                                                                            accountId: folder.account_id,
                                                                            path: folder.path
                                                                        });
                                                                    }}
                                                                    onDragOver={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        e.dataTransfer.dropEffect = 'move';
                                                                        if (dragTargetFolder?.accountId !== folder.account_id || dragTargetFolder.path !== folder.path) {
                                                                            setDragTargetFolder({
                                                                                accountId: folder.account_id,
                                                                                path: folder.path
                                                                            });
                                                                        }
                                                                    }}
                                                                    onDragLeave={(e) => {
                                                                        const related = e.relatedTarget as Node | null;
                                                                        if (related && e.currentTarget.contains(related)) return;
                                                                        if (dragTargetFolder?.accountId === folder.account_id && dragTargetFolder.path === folder.path) {
                                                                            setDragTargetFolder(null);
                                                                        }
                                                                    }}
                                                                    onDrop={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        const idRaw =
                                                                            e.dataTransfer.getData('application/x-lunamail-message-id') ||
                                                                            e.dataTransfer.getData('text/plain');
                                                                        const droppedMessageId = Number(idRaw);
                                                                        const droppedMessage = messages.find((m) => m.id === droppedMessageId);
                                                                        if (droppedMessage && droppedMessage.account_id === folder.account_id) {
                                                                            onMessageMove(droppedMessage, folder.path);
                                                                        }
                                                                        setDragTargetFolder(null);
                                                                        setDraggingMessage(null);
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
                                                                    className="my-1.5 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-[#3a3d44]"/>
                                                            )}
                                                            {accountCustomFolders.map((folder) => (
                                                                <FolderItemRow
                                                                    key={folder.id}
                                                                    to={`/email/${account.id}/${folder.id}`}
                                                                    icon={getFolderIcon(folder)}
                                                                    iconColorClassName={getFolderColorClass(folder.color)}
                                                                    label={folder.custom_name || folder.name}
                                                                    count={folder.unread_count}
                                                                    active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                    customDragActive={
                                                                        customFolderDropTarget?.accountId === folder.account_id
                                                                        && customFolderDropTarget.path === folder.path
                                                                    }
                                                                    customDragging={
                                                                        draggingCustomFolder?.accountId === folder.account_id
                                                                        && draggingCustomFolder.path === folder.path
                                                                    }
                                                                    draggableFolder
                                                                    onFolderDragStart={(e) => {
                                                                        setDraggingCustomFolder({
                                                                            accountId: folder.account_id,
                                                                            path: folder.path
                                                                        });
                                                                        setCustomFolderDropTarget(null);
                                                                        e.dataTransfer.effectAllowed = 'move';
                                                                        e.dataTransfer.setData('application/x-lunamail-folder-path', folder.path);
                                                                        e.dataTransfer.setData('application/x-lunamail-folder-account', String(folder.account_id));
                                                                    }}
                                                                    onFolderDragEnd={() => {
                                                                        setDraggingCustomFolder(null);
                                                                        setCustomFolderDropTarget(null);
                                                                    }}
                                                                    onFolderDragOver={(e) => {
                                                                        if (!draggingCustomFolder) return;
                                                                        if (draggingCustomFolder.accountId !== folder.account_id) return;
                                                                        if (draggingCustomFolder.path === folder.path) return;
                                                                        e.preventDefault();
                                                                        e.dataTransfer.dropEffect = 'move';
                                                                        if (customFolderDropTarget?.accountId !== folder.account_id || customFolderDropTarget.path !== folder.path) {
                                                                            setCustomFolderDropTarget({
                                                                                accountId: folder.account_id,
                                                                                path: folder.path
                                                                            });
                                                                        }
                                                                    }}
                                                                    onFolderDrop={(e) => {
                                                                        if (!draggingCustomFolder) return;
                                                                        if (draggingCustomFolder.accountId !== folder.account_id) return;
                                                                        if (draggingCustomFolder.path === folder.path) return;
                                                                        e.preventDefault();
                                                                        const accountId = folder.account_id;
                                                                        const accountCustom = (accountFoldersById[accountId] ?? []).filter((f) => !isProtectedFolder(f));
                                                                        const fromIndex = accountCustom.findIndex((f) => f.path === draggingCustomFolder.path);
                                                                        const toIndex = accountCustom.findIndex((f) => f.path === folder.path);
                                                                        if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
                                                                            const next = [...accountCustom];
                                                                            const [moved] = next.splice(fromIndex, 1);
                                                                            next.splice(toIndex, 0, moved);
                                                                            void onReorderCustomFolders(accountId, next.map((f) => f.path));
                                                                        }
                                                                        setDraggingCustomFolder(null);
                                                                        setCustomFolderDropTarget(null);
                                                                    }}
                                                                    onEditFolder={() => {
                                                                        setFolderEditor({
                                                                            folder,
                                                                            customName: folder.custom_name || folder.name,
                                                                            type: folder.type || '',
                                                                            color: folder.color || '',
                                                                        });
                                                                        setFolderEditorError(null);
                                                                    }}
                                                                    dropActive={
                                                                        dragTargetFolder?.accountId === folder.account_id
                                                                        && dragTargetFolder.path === folder.path
                                                                    }
                                                                    onDragEnter={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        setDragTargetFolder({
                                                                            accountId: folder.account_id,
                                                                            path: folder.path
                                                                        });
                                                                    }}
                                                                    onDragOver={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        e.dataTransfer.dropEffect = 'move';
                                                                        if (dragTargetFolder?.accountId !== folder.account_id || dragTargetFolder.path !== folder.path) {
                                                                            setDragTargetFolder({
                                                                                accountId: folder.account_id,
                                                                                path: folder.path
                                                                            });
                                                                        }
                                                                    }}
                                                                    onDragLeave={(e) => {
                                                                        const related = e.relatedTarget as Node | null;
                                                                        if (related && e.currentTarget.contains(related)) return;
                                                                        if (dragTargetFolder?.accountId === folder.account_id && dragTargetFolder.path === folder.path) {
                                                                            setDragTargetFolder(null);
                                                                        }
                                                                    }}
                                                                    onDrop={(e) => {
                                                                        if (!isSelectedAccount) return;
                                                                        if (!draggingMessage) return;
                                                                        if (draggingMessage.accountId !== folder.account_id) return;
                                                                        if (folder.path === selectedFolderPath) return;
                                                                        e.preventDefault();
                                                                        const idRaw =
                                                                            e.dataTransfer.getData('application/x-lunamail-message-id') ||
                                                                            e.dataTransfer.getData('text/plain');
                                                                        const droppedMessageId = Number(idRaw);
                                                                        const droppedMessage = messages.find((m) => m.id === droppedMessageId);
                                                                        if (droppedMessage && droppedMessage.account_id === folder.account_id) {
                                                                            onMessageMove(droppedMessage, folder.path);
                                                                        }
                                                                        setDragTargetFolder(null);
                                                                        setDraggingMessage(null);
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
                                            {accountIndex < accounts.length - 1 && (
                                                <div
                                                    className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-slate-300/85 to-transparent dark:via-[#3b3e45]"/>
                                            )}
                                        </div>
                                    );
                                })}
                            </nav>
                        </ScrollArea>
                        <div className="shrink-0 border-t border-slate-200 px-2 py-3 dark:border-[#3a3d44]">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                    onClick={syncAllAccountsNow}
                                    title="Sync all accounts"
                                    aria-label="Sync all accounts"
                                    disabled={accounts.length === 0}
                                >
                                    <RefreshCw size={14}/>
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-600 text-white transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                    onClick={() => window.electronAPI.openAddAccountWindow()}
                                    title="Add account"
                                    aria-label="Add account"
                                >
                                    <FolderPlus size={14}/>
                                </button>
                            </div>
                        </div>

                    </aside>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                            onMouseDown={onResizeStart}
                        />
                    </div>
                )}

                <main
                    className="relative flex min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]"
                    style={{width: mailListWidth}}
                >
                    <div className="border-b border-slate-200 p-2 dark:border-[#3a3d44]">
                        <div className="relative">
                            <Search size={14}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"/>
                            <input
                                type="text"
                                readOnly
                                value=""
                                placeholder="Search mail"
                                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:placeholder:text-slate-400 dark:hover:bg-[#25272c] dark:focus:border-[#5865f2]"
                                onClick={() => setSearchModalOpen(true)}
                                onFocus={(event) => {
                                    setSearchModalOpen(true);
                                    event.currentTarget.blur();
                                }}
                                aria-label="Search mail"
                            />
                            <span
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Ctrl+F
                            </span>
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
                            <Link
                                key={message.id}
                                to={`/email/${message.account_id}/${message.folder_id}/${message.id}`}
                                className={cn(
                                    'block w-full border-b border-slate-100 px-5 py-4 text-left no-underline transition-colors hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]',
                                    draggingMessage?.id === message.id && 'opacity-60',
                                    selectedMessageIds.includes(message.id) && 'bg-sky-50/70 dark:bg-[#3a3e52]',
                                    selectedMessageId === message.id && 'border-l-4 border-l-sky-600 dark:border-l-[#5865f2]',
                                )}
                                style={{color: 'inherit'}}
                                onClick={(e) =>
                                    onSelectMessage(message.id, messageIndex, {
                                        shiftKey: e.shiftKey,
                                        ctrlKey: e.ctrlKey,
                                        metaKey: e.metaKey,
                                    })}
                                onDoubleClick={() => {
                                    void window.electronAPI.openMessageWindow(message.id);
                                }}
                                draggable
                                onDragStart={(e) => {
                                    setDraggingMessage({id: message.id, accountId: message.account_id});
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
                                    setDraggingMessage(null);
                                    setDragTargetFolder(null);
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
                            </Link>
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
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                        onMouseDown={onMailListResizeStart}
                    />
                </main>

                <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">{children}</section>
            </div>
            </WorkspaceLayout>

            {searchModalOpen && (
                <div className="fixed inset-0 z-[1100] flex items-start justify-center bg-slate-950/45 p-4 pt-20"
                     onClick={() => setSearchModalOpen(false)}>
                    <div
                        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#25272c]"
                        onClick={(e) => e.stopPropagation()}>
                        <div
                            className="group flex h-11 items-center rounded-xl border border-slate-300 bg-white/90 px-3 shadow-sm transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 dark:border-[#40444b] dark:bg-[#1f2125] dark:focus-within:border-[#5865f2] dark:focus-within:ring-[#5865f2]/30">
                            <Search size={16} className="mr-2 shrink-0 text-slate-400 dark:text-slate-500"/>
                            <input
                                ref={mailSearchModalInputRef}
                                type="search"
                                value={searchQuery}
                                onChange={(e) => onSearchQueryChange(e.target.value)}
                                placeholder="Search sender, subject, or content across all accounts..."
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
                        <div
                            className="mt-2 flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>Searching all accounts and folders</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                                    onClick={() => setAdvancedSearchOpen((prev) => !prev)}
                                >
                                    {advancedSearchOpen ? 'Basic' : 'Advanced'}
                                </button>
                                <button
                                    type="button"
                                    className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                                    onClick={() => setSearchModalOpen(false)}
                                >
                                    Esc
                                </button>
                            </div>
                        </div>
                        {advancedSearchOpen && (
                            <div
                                className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#1f2125] sm:grid-cols-3">
                                <input
                                    type="search"
                                    value={fromFilter}
                                    onChange={(e) => setFromFilter(e.target.value)}
                                    placeholder="From address/name"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <input
                                    type="search"
                                    value={subjectFilter}
                                    onChange={(e) => setSubjectFilter(e.target.value)}
                                    placeholder="Subject"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <input
                                    type="search"
                                    value={toFilter}
                                    onChange={(e) => setToFilter(e.target.value)}
                                    placeholder="To address"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
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
                                        const account = accounts.find((a) => a.id === message.account_id);
                                        const folder = (accountFoldersById[message.account_id] ?? []).find((f) => f.id === message.folder_id);
                                        return (
                                            <Link
                                                key={message.id}
                                                to={`/email/${message.account_id}/${message.folder_id}/${message.id}`}
                                                className="block w-full rounded-lg border border-transparent px-3 py-2 text-left no-underline transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-[#3a3d44] dark:hover:bg-[#30333a]"
                                                style={{color: 'inherit'}}
                                                onClick={() => {
                                                    onSelectMessage(message.id, idx);
                                                    setSearchModalOpen(false);
                                                }}
                                            >
                                                <div
                                                    className={`truncate text-sm ${message.is_read ? 'font-medium text-slate-800 dark:text-slate-200' : 'font-semibold text-slate-950 dark:text-white'}`}>
                                                    {message.subject || '(No subject)'}
                                                </div>
                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                    <span
                                                        className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                        {formatMessageSender(message)}
                                                    </span>
                                                    <span
                                                        className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                                                        {formatSystemDate(message.date, dateLocale)}
                                                    </span>
                                                </div>
                                                <div
                                                    className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                                                    <span className="truncate">
                                                        {account?.display_name?.trim() || account?.email || `Account ${message.account_id}`}
                                                    </span>
                                                    <span
                                                        className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#30333a] dark:text-slate-300">
                                                        {folder?.custom_name || folder?.name || folder?.path || 'Unknown folder'}
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
            )}

            {menu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{left: menuPosition.left, top: menuPosition.top}}
                    onClick={(e) => e.stopPropagation()}
                >
                    {menu.kind === 'message' && (
                        <>
                            <ContextItem
                                label="Open in new window"
                                icon={<SquareArrowOutUpRight size={14}/>}
                                onClick={() => {
                                    void window.electronAPI.openMessageWindow(menu.message.id);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label={menu.message.is_read ? 'Mark as unread' : 'Mark as read'}
                                icon={menu.message.is_read ? <Mail size={14}/> : <MailOpen size={14}/>}
                                onClick={() => {
                                    onMessageMarkReadToggle(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <div className="my-1 h-px bg-slate-200"/>
                            <div className="group relative">
                                <button
                                    ref={moveToTriggerRef}
                                    type="button"
                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                >
                                    <span className="flex items-center gap-2">
                                        <Folder size={14}/>
                                        Move to
                                    </span>
                                    <ChevronRight size={14}/>
                                </button>
                                <div
                                    className={cn(
                                        'absolute top-0 z-[1010] hidden min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl group-hover:block group-focus-within:block dark:border-[#3a3d44] dark:bg-[#313338]',
                                        moveSubmenuLeft ? 'right-full mr-1' : 'left-full ml-1',
                                    )}
                                    style={{
                                        transform: `translateY(${moveSubmenuOffsetY}px)`,
                                        maxHeight: 'calc(100vh - 16px)',
                                        overflowY: 'auto',
                                    }}>
                                    {moveTargetsProtected.map((f) => (
                                        <ContextItem
                                            key={f.id}
                                            label={f.custom_name || f.name}
                                            icon={
                                                <span
                                                    className={cn(getFolderColorClass(f.color) || 'text-slate-500 dark:text-slate-300')}>
                                                    {getFolderIcon(f)}
                                                </span>
                                            }
                                            onClick={() => {
                                                onMessageMove(menu.message, f.path);
                                                setMenu(null);
                                            }}
                                        />
                                    ))}
                                    {moveTargetsProtected.length > 0 && moveTargetsCustom.length > 0 && (
                                        <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                                    )}
                                    {moveTargetsCustom.map((f) => (
                                        <ContextItem
                                            key={f.id}
                                            label={f.custom_name || f.name}
                                            icon={
                                                <span
                                                    className={cn(getFolderColorClass(f.color) || 'text-slate-500 dark:text-slate-300')}>
                                                    {getFolderIcon(f)}
                                                </span>
                                            }
                                            onClick={() => {
                                                onMessageMove(menu.message, f.path);
                                                setMenu(null);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="my-1 h-px bg-slate-200"/>
                            <ContextItem
                                label="Delete"
                                icon={<Trash2 size={14}/>}
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
                                icon={<Folder size={14}/>}
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
                                icon={<Settings size={14}/>}
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
                                icon={<RefreshCw size={14}/>}
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
                                        icon={<Trash2 size={14}/>}
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
                    ref={accountMenuRef}
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{left: accountMenuPosition.left, top: accountMenuPosition.top}}
                    onClick={(e) => e.stopPropagation()}
                >
                    <ContextItem
                        label="Create Folder"
                        icon={<FolderPlus size={14}/>}
                        onClick={() => {
                            setCreateFolderModal({
                                accountId: accountMenu.account.id,
                                folderPath: '',
                                type: '',
                                color: '',
                            });
                            setCreateFolderError(null);
                            setAccountMenu(null);
                        }}
                    />
                    <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                    <ContextItem
                        label="Edit Account Settings"
                        icon={<Settings size={14}/>}
                        onClick={() => {
                            window.location.hash = `/settings?accountId=${accountMenu.account.id}`;
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
                                <div
                                    className="grid grid-cols-4 gap-2 rounded-md border border-slate-300 bg-white p-2 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                                    {FOLDER_COLOR_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setFolderEditor((prev) => (prev ? {
                                                ...prev,
                                                color: option.value
                                            } : prev))}
                                            className={cn(
                                                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                                                folderEditor.color === option.value
                                                    ? 'border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-[#2b2e34] dark:text-slate-100'
                                                    : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2b2e34]',
                                            )}
                                            title={option.label}
                                            aria-label={`Set folder color ${option.label}`}
                                        >
                                            <span
                                                className={cn(
                                                    'inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15',
                                                    getFolderSwatchClass(option.value),
                                                )}
                                            />
                                            <span className="truncate">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
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

            {createFolderModal && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4"
                     onClick={() => setCreateFolderModal(null)}>
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#313338]"
                        onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Folder</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {(accounts.find((a) => a.id === createFolderModal.accountId)?.display_name?.trim())
                                || accounts.find((a) => a.id === createFolderModal.accountId)?.email
                                || `Account ${createFolderModal.accountId}`}
                        </p>

                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder path</span>
                                <input
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    value={createFolderModal.folderPath}
                                    onChange={(e) => setCreateFolderModal((prev) => (prev ? {
                                        ...prev,
                                        folderPath: e.target.value
                                    } : prev))}
                                />
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder type</span>
                                <select
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                    value={createFolderModal.type}
                                    onChange={(e) => setCreateFolderModal((prev) => (prev ? {
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
                                <div
                                    className="grid grid-cols-4 gap-2 rounded-md border border-slate-300 bg-white p-2 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                                    {FOLDER_COLOR_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setCreateFolderModal((prev) => (prev ? {
                                                ...prev,
                                                color: option.value
                                            } : prev))}
                                            className={cn(
                                                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                                                createFolderModal.color === option.value
                                                    ? 'border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-[#2b2e34] dark:text-slate-100'
                                                    : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2b2e34]',
                                            )}
                                            title={option.label}
                                            aria-label={`Set folder color ${option.label}`}
                                        >
                                            <span
                                                className={cn(
                                                    'inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15',
                                                    getFolderSwatchClass(option.value),
                                                )}
                                            />
                                            <span className="truncate">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </label>
                        </div>

                        {createFolderError && <p className="mt-3 text-sm text-red-600">{createFolderError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCreateFolderModal(null)}
                                    disabled={createFolderSaving}>
                                Cancel
                            </Button>
                            <Button onClick={() => void createFolderFromModal()} disabled={createFolderSaving}>
                                {createFolderSaving ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const FolderItemRow: React.FC<{
    to?: string;
    icon: React.ReactNode;
    iconColorClassName?: string;
    label: string;
    active?: boolean;
    dropActive?: boolean;
    customDragActive?: boolean;
    customDragging?: boolean;
    count?: number;
    onEditFolder?: () => void;
    draggableFolder?: boolean;
    onFolderDragStart?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDragEnd?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDragOver?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDrop?: (e: React.DragEvent<HTMLElement>) => void;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnter?: (e: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (e: React.DragEvent<HTMLElement>) => void;
}> = ({
          to,
          icon,
          iconColorClassName,
          label,
          active,
          dropActive,
          customDragActive,
          customDragging,
          count,
          onEditFolder,
          draggableFolder,
          onFolderDragStart,
          onFolderDragEnd,
          onFolderDragOver,
          onFolderDrop,
          onClick,
          onContextMenu,
          onDrop,
          onDragOver,
          onDragEnter,
          onDragLeave
      }) => {
    return (
        <div
            className={cn(
                "group relative ml-3 w-[calc(100%-0.75rem)] before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/80 before:content-[''] dark:before:bg-[#4a4d55]",
            )}
        >
            <Link
                to={to || '#'}
                className={cn(
                    'relative flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left no-underline transition-all',
                    dropActive && 'bg-slate-200 text-slate-900 ring-1 ring-slate-300 shadow-sm dark:bg-[#404249] dark:text-slate-100 dark:ring-[#5b5e66]',
                    customDragging && 'opacity-45',
                    active
                        ? 'bg-slate-200/80 text-slate-900 ring-1 ring-slate-300/70 dark:bg-[#3d4048] dark:text-slate-100 dark:ring-[#575a62]'
                        : 'text-slate-700 dark:text-slate-200',
                    'hover:bg-slate-200/70 dark:hover:bg-[#3a3d44]',
                )}
                draggable={Boolean(draggableFolder)}
                onDragStart={onFolderDragStart}
                onDragEnd={onFolderDragEnd}
                onDragOver={(e) => {
                    onFolderDragOver?.(e);
                    onDragOver?.(e);
                }}
                onDrop={(e) => {
                    onFolderDrop?.(e);
                    onDrop?.(e);
                }}
                onClick={onClick}
                onContextMenu={onContextMenu}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                style={{color: 'inherit'}}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                  <span
                      className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                          active ? 'bg-white dark:bg-[#2c2f36]' : 'bg-slate-100 dark:bg-[#32353b]',
                          iconColorClassName || (active ? 'text-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'),
                      )}
                  >
                    {icon}
                  </span>
                  <span
                      className={cn('truncate pr-8 text-xs', active ? 'font-semibold' : 'font-medium')}>{label}</span>
              </span>
                <span className="flex items-center">
                    {typeof count === 'number' && count > 0 && (
                        <Badge
                            className={cn(
                                'inline-flex rounded-md px-1.5 py-0.5 text-[11px] transition-opacity',
                                onEditFolder && 'group-hover:opacity-0',
                                active
                                    ? 'bg-slate-900 text-white dark:bg-white/85 dark:text-slate-900'
                                    : 'bg-slate-300/70 text-slate-700 dark:bg-white/15 dark:text-slate-100',
                            )}
                        >
                            {count}
                        </Badge>
                    )}
                </span>
            </Link>
            {onEditFolder && (
                <button
                    type="button"
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditFolder();
                    }}
                    title="Edit folder"
                    aria-label="Edit folder"
                >
                    <Settings size={13}/>
                </button>
            )}
            {customDragActive && (
                <div
                    className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-sky-500/90 dark:bg-sky-400/90"/>
            )}
        </div>
    );
};

const ContextItem: React.FC<{
    label: string;
    onClick: () => void;
    danger?: boolean;
    icon?: React.ReactNode;
}> = ({label, onClick, danger, icon}) => (
    <button
        className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
            danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]',
        )}
        onClick={onClick}
    >
        {icon && <span className="shrink-0">{icon}</span>}
        {label}
    </button>
);

function getFolderIcon(folder: FolderItem): React.ReactNode {
    const type = (folder.type ?? '').toLowerCase();
    const path = folder.path.toLowerCase();

    if (type === 'inbox' || path === 'inbox') return <Inbox size={15}/>;
    if (type === 'sent' || path.includes('sent')) return <Send size={15}/>;
    if (type === 'drafts' || path.includes('draft')) return <FileText size={15}/>;
    if (type === 'archive' || path.includes('archive')) return <Archive size={15}/>;
    if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return <Trash2 size={15}/>;
    if (type === 'junk' || path.includes('spam') || path.includes('junk')) return <ShieldAlert size={15}/>;
    return <FilledFolderIcon/>;
}

const FilledFolderIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="shrink-0 fill-current">
        <path
            d="M3 6.5a2.5 2.5 0 0 1 2.5-2.5h4.1c.56 0 1.1.19 1.52.53l1.38 1.13c.18.15.4.23.64.23h5.35A2.5 2.5 0 0 1 21 8.4v8.1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6.5z"/>
    </svg>
);

function getFolderColorClass(color: string | null | undefined): string | undefined {
    switch ((color || '').toLowerCase()) {
        case 'sky':
            return 'text-sky-600 dark:text-sky-300';
        case 'emerald':
            return 'text-emerald-600 dark:text-emerald-300';
        case 'amber':
            return 'text-amber-600 dark:text-amber-300';
        case 'rose':
            return 'text-rose-600 dark:text-rose-300';
        case 'violet':
            return 'text-violet-600 dark:text-violet-300';
        case 'slate':
            return 'text-slate-700 dark:text-slate-200';
        default:
            return undefined;
    }
}

function getFolderSwatchClass(color: string): string {
    switch ((color || '').toLowerCase()) {
        case 'sky':
            return 'bg-sky-500';
        case 'emerald':
            return 'bg-emerald-500';
        case 'amber':
            return 'bg-amber-500';
        case 'rose':
            return 'bg-rose-500';
        case 'violet':
            return 'bg-violet-500';
        case 'slate':
            return 'bg-slate-500';
        default:
            return 'bg-transparent ring-1 ring-dashed ring-slate-400 dark:ring-slate-500';
    }
}

function formatMessageSender(message: MessageItem): string {
    const name = (message.from_name || '').trim();
    const email = (message.from_address || '').trim();
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return 'Unknown sender';
}

function constrainToViewport(x: number, y: number, width: number, height: number): { left: number; top: number } {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(x, margin), maxLeft);
    const top = Math.min(Math.max(y, margin), maxTop);
    return {left, top};
}

export default MainLayout;
