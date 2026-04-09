import {Button} from '../ui/button';
import React from 'react';
import {ChevronRight, Folder, PenSquare, RefreshCw, Settings} from 'lucide-react';
import {useDrop} from 'react-dnd';
import {
    closestCenter,
    DndContext,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    defaultAnimateLayoutChanges,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import type {FolderItem, PublicAccount} from '../../../preload';
import {ScrollArea} from '../ui/scroll-area';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '../../lib/accountAvatar';
import {cn} from '../../lib/utils';
import FolderItemRow from './FolderItemRow';
import NewEmailBadge from './NewEmailBadge';
import {DND_ITEM} from '../../lib/dndTypes';

type MailMessageDragItem = {
    type: typeof DND_ITEM.MAIL_MESSAGE;
    accountId: number;
    messageIds: number[];
};

type SortableAccountShellProps = {
    accountId: number;
    children: (dragHandle: {
        attributes: Record<string, unknown>;
        listeners: Record<string, unknown>;
        setActivatorRef: (node: HTMLElement | null) => void;
    }) => React.ReactNode;
};

function toFolderSortableId(accountId: number, path: string): string {
    return `folder-${accountId}-${encodeURIComponent(path)}`;
}

function parseFolderSortableId(id: string): { accountId: number; path: string } | null {
    if (!id.startsWith('folder-')) return null;
    const remainder = id.slice('folder-'.length);
    const dashIndex = remainder.indexOf('-');
    if (dashIndex <= 0) return null;
    const accountId = Number(remainder.slice(0, dashIndex));
    const encodedPath = remainder.slice(dashIndex + 1);
    if (!Number.isFinite(accountId) || !encodedPath) return null;
    return {accountId, path: decodeURIComponent(encodedPath)};
}

function MessageDropZone({
    folder,
    selectedFolderPath,
    isSelectedAccount,
    onDropMessages,
    children,
}: {
    folder: FolderItem;
    selectedFolderPath: string | null;
    isSelectedAccount: boolean;
    onDropMessages: (folder: FolderItem, draggedIds: number[], dragAccountId: number) => void;
    children: (dropActive: boolean) => React.ReactNode;
}) {
    const [{isOver, canDrop}, dropRef] = useDrop<MailMessageDragItem, void, { isOver: boolean; canDrop: boolean }>(
        () => ({
            accept: DND_ITEM.MAIL_MESSAGE,
            canDrop: (item) =>
                isSelectedAccount &&
                item.accountId === folder.account_id &&
                Array.isArray(item.messageIds) &&
                item.messageIds.length > 0 &&
                folder.path !== selectedFolderPath,
            drop: (item) => {
                onDropMessages(folder, item.messageIds, item.accountId);
            },
            collect: (monitor) => ({
                isOver: monitor.isOver({shallow: true}),
                canDrop: monitor.canDrop(),
            }),
        }),
        [folder, isSelectedAccount, onDropMessages, selectedFolderPath],
    );
    return <div ref={(node) => void dropRef(node)}>{children(isOver && canDrop)}</div>;
}

function SortableCustomFolderRow({
    folder,
    children,
}: {
    folder: FolderItem;
    children: (state: {
        attributes: Record<string, unknown>;
        listeners: Record<string, unknown>;
        setActivatorRef: (node: HTMLElement | null) => void;
    }) => React.ReactNode;
}) {
    const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
        id: toFolderSortableId(folder.account_id, folder.path),
        data: {
            kind: 'folder',
            accountId: folder.account_id,
            path: folder.path,
            label: folder.custom_name || folder.name,
        },
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges(args),
    });
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: transition ?? 'transform 180ms cubic-bezier(0.2, 0.65, 0.3, 1)',
                opacity: isDragging ? 0.2 : 1,
            }}
        >
            {children({
                attributes: attributes as unknown as Record<string, unknown>,
                listeners: (listeners ?? {}) as Record<string, unknown>,
                setActivatorRef: setActivatorNodeRef,
            })}
        </div>
    );
}

function SortableAccountShell({
    accountId,
    children,
}: SortableAccountShellProps) {
    const {attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging} = useSortable({
        id: `account-${accountId}`,
        data: {accountId},
    });
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.2 : 1,
            }}
        >
            {children({
                attributes: attributes as unknown as Record<string, unknown>,
                listeners: (listeners ?? {}) as Record<string, unknown>,
                setActivatorRef: setActivatorNodeRef,
            })}
        </div>
    );
}

function SortableAccountEndDrop() {
    const {setNodeRef} = useDroppable({
        id: 'account-end',
        data: {kind: 'account-end'},
    });
    return <div ref={setNodeRef} className="absolute inset-x-0 bottom-0 h-40 w-full"/>;
}

function SortableFolderEndDrop({accountId}: { accountId: number }) {
    const {setNodeRef} = useDroppable({
        id: `folder-end-${accountId}`,
        data: {kind: 'folder-end', accountId},
    });
    return <div ref={setNodeRef} className="-mt-1 h-2"/>;
}

type AccountFolderSidebarProps = {
    hidden: boolean;
    width: number;
    onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
    selectedAccountId: number | null;
    accounts: PublicAccount[];
    accountFoldersById: Record<number, FolderItem[]>;
    selectedFolderPath: string | null;
    syncingAccountIds?: ReadonlySet<number>;
    localSyncingAccountIds: Set<number>;
    collapsedAccountIds: Set<number>;
    onToggleAccountExpanded: (accountId: number) => void;
    onSelectAccount: (accountId: number) => void;
    onReorderAccounts: (orderedAccountIds: number[]) => void;
    onSyncAccount: (accountId: number) => void;
    onOpenAccountSettings: (accountId: number) => void;
    onOpenAccountContextMenu: (account: PublicAccount, x: number, y: number) => void;
    onOpenCompose: (accountId: number | null) => void;
    onHandleMessageDropOnFolder: (folder: FolderItem, draggedIds: number[], dragAccountId: number) => void;
    onOpenFolderContextMenu: (accountId: number, folder: FolderItem, x: number, y: number) => void;
    onOpenFolderEditor: (folder: FolderItem) => void;
    onReorderCustomFolders: (accountId: number, orderedFolderPaths: string[]) => Promise<void>;
    isProtectedFolder: (folder: FolderItem) => boolean;
    getFolderIcon: (folder: FolderItem) => React.ReactNode;
    getFolderColorClass: (color: string | null | undefined) => string | undefined;
};

export default function AccountFolderSidebar({
                                                 hidden,
                                                 width,
                                                 onResizeStart,
                                                 selectedAccountId,
                                                 accounts,
                                                 accountFoldersById,
                                                 selectedFolderPath,
                                                 syncingAccountIds,
                                                 localSyncingAccountIds,
                                                 collapsedAccountIds,
                                                 onToggleAccountExpanded,
                                                 onSelectAccount: _onSelectAccount,
                                                 onReorderAccounts,
                                                 onSyncAccount,
                                                 onOpenAccountSettings,
                                                 onOpenAccountContextMenu,
                                                 onOpenCompose,
                                                 onHandleMessageDropOnFolder,
                                                 onOpenFolderContextMenu,
                                                 onOpenFolderEditor,
                                                 onReorderCustomFolders,
                                                 isProtectedFolder,
                                                 getFolderIcon,
                                                 getFolderColorClass,
                                             }: AccountFolderSidebarProps) {
    const [draggingAccountId, setDraggingAccountId] = React.useState<number | null>(null);
    const [dragOverlaySize, setDragOverlaySize] = React.useState<{width: number; height: number} | null>(null);
    const [draggingFolder, setDraggingFolder] = React.useState<{accountId: number; path: string; label: string} | null>(null);
    const [folderOverlaySize, setFolderOverlaySize] = React.useState<{width: number; height: number} | null>(null);
    const [dragCollapsedRestore, setDragCollapsedRestore] = React.useState<{
        accountId: number;
        shouldRestoreExpanded: boolean;
    } | null>(null);
    const accountSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
    const accountSortableIds = React.useMemo(() => accounts.map((account) => `account-${account.id}`), [accounts]);
    const draggingAccount = React.useMemo(
        () => (draggingAccountId === null ? null : accounts.find((account) => account.id === draggingAccountId) ?? null),
        [accounts, draggingAccountId],
    );
    const clearFolderDragState = React.useCallback(() => {
        setDraggingFolder(null);
        setFolderOverlaySize(null);
    }, []);

    const handleAccountDragStart = React.useCallback((event: DragStartEvent) => {
        const kind = String(event.active.data.current?.kind || '');
        if (kind === 'folder') {
            const accountId = Number(event.active.data.current?.accountId);
            const path = String(event.active.data.current?.path || '');
            const label = String(event.active.data.current?.label || '');
            if (!Number.isFinite(accountId) || !path) return;
            setDraggingFolder({accountId, path, label: label || path});
            const initialRect = event.active.rect.current.initial;
            if (initialRect) {
                setFolderOverlaySize({width: initialRect.width, height: initialRect.height});
            } else {
                setFolderOverlaySize(null);
            }
            return;
        }
        const accountId = Number(event.active.data.current?.accountId);
        if (!Number.isFinite(accountId)) return;
        setDraggingAccountId(accountId);
        const isExpanded = !collapsedAccountIds.has(accountId);
        setDragCollapsedRestore({accountId, shouldRestoreExpanded: isExpanded});
        if (isExpanded) {
            onToggleAccountExpanded(accountId);
        }
        const initialRect = event.active.rect.current.initial;
        if (initialRect) {
            setDragOverlaySize({width: initialRect.width, height: initialRect.height});
        } else {
            setDragOverlaySize(null);
        }
    }, [collapsedAccountIds, onToggleAccountExpanded]);
    const handleAccountDragEnd = React.useCallback((event: DragEndEvent) => {
        const kind = String(event.active.data.current?.kind || '');
        if (kind === 'folder') {
            const activeAccountId = Number(event.active.data.current?.accountId);
            const activePath = String(event.active.data.current?.path || '');
            if (!Number.isFinite(activeAccountId) || !activePath || !event.over) {
                clearFolderDragState();
                return;
            }
            const accountCustom = (accountFoldersById[activeAccountId] ?? []).filter((entry) => !isProtectedFolder(entry));
            const sourceIndex = accountCustom.findIndex((entry) => entry.path === activePath);
            if (sourceIndex < 0) {
                clearFolderDragState();
                return;
            }
            let targetIndex = sourceIndex;
            const overId = String(event.over.id);
            if (overId === `folder-end-${activeAccountId}`) {
                targetIndex = Math.max(0, accountCustom.length - 1);
            } else {
                const parsed = parseFolderSortableId(overId);
                if (!parsed || parsed.accountId !== activeAccountId) {
                    clearFolderDragState();
                    return;
                }
                const overIndex = accountCustom.findIndex((entry) => entry.path === parsed.path);
                if (overIndex >= 0) targetIndex = overIndex;
            }
            if (targetIndex !== sourceIndex) {
                const nextPaths = arrayMove(accountCustom, sourceIndex, targetIndex).map((entry) => entry.path);
                void onReorderCustomFolders(activeAccountId, nextPaths);
            }
            clearFolderDragState();
            return;
        }
        const activeAccountId = Number(event.active.data.current?.accountId);
        if (!Number.isFinite(activeAccountId)) {
            if (dragCollapsedRestore?.accountId === activeAccountId && dragCollapsedRestore.shouldRestoreExpanded) {
                onToggleAccountExpanded(activeAccountId);
            }
            setDraggingAccountId(null);
            setDragOverlaySize(null);
            setDragCollapsedRestore(null);
            clearFolderDragState();
            return;
        }
        const order = accounts.map((item) => item.id);
        const sourceIndex = order.indexOf(activeAccountId);
        if (sourceIndex < 0) {
            setDraggingAccountId(null);
            setDragOverlaySize(null);
            return;
        }
        let targetIndex = sourceIndex;
        if (!event.over) {
            targetIndex = Math.max(0, order.length - 1);
        } else if (event.over.id === 'account-end') {
            targetIndex = Math.max(0, order.length - 1);
        } else {
            const overAccountId = Number(String(event.over.id).replace('account-', ''));
            if (!Number.isFinite(overAccountId)) {
                setDraggingAccountId(null);
                setDragOverlaySize(null);
                clearFolderDragState();
                return;
            }
            const overIndex = order.indexOf(overAccountId);
            if (overIndex >= 0) targetIndex = overIndex;
        }
        if (targetIndex !== sourceIndex) {
            onReorderAccounts(arrayMove(order, sourceIndex, targetIndex));
        }
        if (dragCollapsedRestore?.accountId === activeAccountId && dragCollapsedRestore.shouldRestoreExpanded) {
            onToggleAccountExpanded(activeAccountId);
        }
        setDraggingAccountId(null);
        setDragOverlaySize(null);
        setDragCollapsedRestore(null);
        clearFolderDragState();
    }, [accountFoldersById, accounts, clearFolderDragState, dragCollapsedRestore, isProtectedFolder, onReorderAccounts, onReorderCustomFolders, onToggleAccountExpanded]);

    if (hidden) return null;

    return (
        <div className="relative min-h-0 shrink-0" style={{width}}>
            <aside
                className="lm-sidebar lm-text-primary flex h-full min-h-0 shrink-0 flex-col">
                <ScrollArea className="min-h-0 flex-1 px-2.5 py-3">
                    <nav
                        className="space-y-2 overflow-x-hidden"
                    >
                        <div className="lm-border-default mb-2 border-b pb-2">
                            <Button
                                type="button"
                                className="lm-btn-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold shadow-sm transition-colors"
                                onClick={() => onOpenCompose(selectedAccountId)}
                                title="Compose"
                                aria-label="Compose"
                            >
                                <PenSquare size={16}/>
                                <span>Compose</span>
                            </Button>
                        </div>

                        {accounts.length === 0 && (
                            <div className="lm-text-muted rounded-lg px-3 py-2.5 text-sm">
                                No accounts yet
                            </div>
                        )}

                        <DndContext
                            sensors={accountSensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleAccountDragStart}
                            onDragEnd={handleAccountDragEnd}
                            onDragCancel={() => {
                                if (dragCollapsedRestore?.shouldRestoreExpanded) {
                                    onToggleAccountExpanded(dragCollapsedRestore.accountId);
                                }
                                setDraggingAccountId(null);
                                setDragOverlaySize(null);
                                setDragCollapsedRestore(null);
                                clearFolderDragState();
                            }}
                        >
                            <div className="flex min-h-full flex-col">
                                <SortableContext items={accountSortableIds} strategy={verticalListSortingStrategy}>
                                    {accounts.map((account, accountIndex) => {
                            const isSelectedAccount = account.id === selectedAccountId;
                            const isSyncingAccount =
                                (syncingAccountIds?.has(account.id) ?? false) || localSyncingAccountIds.has(account.id);
                            const isExpanded = !collapsedAccountIds.has(account.id);
                            const accountFolders = accountFoldersById[account.id] ?? [];
                            const accountUnread = accountFolders.reduce(
                                (sum, folder) => sum + Math.max(0, Number(folder.unread_count) || 0),
                                0,
                            );
                            const accountProtectedFolders = accountFolders.filter((folder) =>
                                isProtectedFolder(folder),
                            );
                            const accountCustomFolders = accountFolders.filter((folder) => !isProtectedFolder(folder));
                            const accountDefaultFolder = accountFolders[0] ?? null;
                            const accountLinkTarget = accountDefaultFolder
                                ? `/email/${account.id}/${accountDefaultFolder.id}`
                                : `/email/${account.id}`;
                            const avatarColors = getAccountAvatarColorsForAccount(account);

                            return (
                                <div key={account.id} className="space-y-1">
                                    <SortableAccountShell
                                        accountId={account.id}
                                    >
                                        {({attributes, listeners, setActivatorRef}) => (
                                        <>
                                            <div
                                                ref={setActivatorRef}
                                                {...attributes}
                                                {...listeners}
                                                className={cn(
                                                    'group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors',
                                                    isSelectedAccount
                                                        ? 'bg-gradient-to-r from-slate-200/90 to-slate-100/90'
                                                        : 'bg-transparent hover:bg-gradient-to-r hover:from-slate-200/90 hover:to-slate-100/90',
                                                )}
                                            >
                                            <a
                                                href={`#${accountLinkTarget}`}
                                                draggable={false}
                                                className={cn(
                                                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors',
                                                    isSelectedAccount
                                                        ? 'lm-text-primary font-semibold'
                                                        : 'lm-text-secondary',
                                                )}
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    onOpenAccountContextMenu(account, event.clientX, event.clientY);
                                                }}
                                                style={{color: 'inherit'}}
                                            >
											<span
                                                className={cn(
                                                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1',
                                                    isSelectedAccount
                                                        ? 'ring-slate-800/30'
                                                        : 'ring-black/10',
                                                )}
                                                style={{
                                                    backgroundColor: avatarColors.background,
                                                    color: avatarColors.foreground,
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
                                                        className="lm-text-muted block truncate text-[11px] font-normal">
														{account.email}
													</span>
                                                )}
											</span>
                                            </a>
                                            <div className="ml-auto flex items-center gap-1 pr-0">
                                                <div
                                                    className={cn(
                                                        'flex items-center gap-1 transition-opacity',
                                                        isSyncingAccount
                                                            ? 'opacity-100'
                                                            : 'opacity-0 group-hover:opacity-100',
                                                    )}
                                                >
                                                    <Button
                                                        className="lm-btn-ghost rounded p-1 transition-colors"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSyncAccount(account.id);
                                                        }}
                                                        title="Sync account"
                                                        aria-label="Sync account"
                                                        disabled={isSyncingAccount}
                                                    >
                                                        <RefreshCw
                                                            size={13}
                                                            className={cn(isSyncingAccount && 'animate-spin')}
                                                        />
                                                    </Button>
                                                    <Button
                                                        className="lm-btn-ghost rounded p-1 transition-colors"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onOpenAccountSettings(account.id);
                                                        }}
                                                        title="Edit account"
                                                        aria-label="Edit account"
                                                    >
                                                        <Settings size={13}/>
                                                    </Button>
                                                </div>
                                                {accountUnread > 0 && (
                                                    <NewEmailBadge
                                                        count={accountUnread}
                                                        title={`${accountUnread} unread in account`}
                                                        className={cn(
                                                            isSelectedAccount &&
                                                            'border-red-400/90 from-red-500 to-red-700',
                                                        )}
                                                    />
                                                )}
                                                <Button
                                                    type="button"
                                                    className="lm-btn-ghost rounded p-1 transition-colors"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        onToggleAccountExpanded(account.id);
                                                    }}
                                                    title={
                                                        isExpanded ? 'Collapse account folders' : 'Expand account folders'
                                                    }
                                                    aria-label={
                                                        isExpanded ? 'Collapse account folders' : 'Expand account folders'
                                                    }
                                                    aria-expanded={isExpanded}
                                                >
                                                    <ChevronRight
                                                        size={14}
                                                        className={cn('transition-transform', isExpanded && 'rotate-90')}
                                                    />
                                                </Button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div
                                                className="relative mt-1 space-y-1 pl-7 before:absolute before:bottom-2 before:left-3.5 before:top-1 before:w-px before:bg-gradient-to-b before:from-[var(--border-strong)] before:to-transparent before:content-['']">
                                            {accountFolders.length === 0 ? (
                                                <div
                                                    className="lm-text-muted rounded-md px-2 py-1.5 text-xs">
                                                    No folders yet
                                                </div>
                                            ) : (
                                                <>
                                                    {accountProtectedFolders.map((folder) => (
                                                        <MessageDropZone
                                                            key={folder.id}
                                                            folder={folder}
                                                            selectedFolderPath={selectedFolderPath}
                                                            isSelectedAccount={isSelectedAccount}
                                                            onDropMessages={onHandleMessageDropOnFolder}
                                                        >
                                                            {(dropActive) => (
                                                                <FolderItemRow
                                                                    to={`/email/${account.id}/${folder.id}`}
                                                                    icon={getFolderIcon(folder)}
                                                                    iconColorClassName={getFolderColorClass(folder.color)}
                                                                    label={folder.custom_name || folder.name}
                                                                    count={folder.unread_count}
                                                                    active={
                                                                        isSelectedAccount &&
                                                                        selectedFolderPath === folder.path
                                                                    }
                                                                    dropActive={dropActive}
                                                                    onContextMenu={(event) => {
                                                                        event.preventDefault();
                                                                        onOpenFolderContextMenu(
                                                                            account.id,
                                                                            folder,
                                                                            event.clientX,
                                                                            event.clientY,
                                                                        );
                                                                    }}
                                                                />
                                                            )}
                                                        </MessageDropZone>
                                                    ))}
                                                    {accountProtectedFolders.length > 0 &&
                                                        accountCustomFolders.length > 0 && (
                                                            <div
                                                                className="my-1.5 h-px bg-gradient-to-r from-transparent via-[var(--border-default)] to-transparent"/>
                                                        )}
                                                    <SortableContext
                                                        items={accountCustomFolders.map((entry) => toFolderSortableId(entry.account_id, entry.path))}
                                                        strategy={verticalListSortingStrategy}
                                                    >
                                                        {accountCustomFolders.map((folder) => (
                                                            <MessageDropZone
                                                                key={folder.id}
                                                                folder={folder}
                                                                selectedFolderPath={selectedFolderPath}
                                                                isSelectedAccount={isSelectedAccount}
                                                                onDropMessages={onHandleMessageDropOnFolder}
                                                            >
                                                                {(dropActive) => (
                                                                    <SortableCustomFolderRow folder={folder}>
                                                                        {({attributes, listeners, setActivatorRef}) => (
                                                                            <div
                                                                                ref={setActivatorRef}
                                                                                {...attributes}
                                                                                {...listeners}
                                                                            >
                                                                                <FolderItemRow
                                                                                    to={`/email/${account.id}/${folder.id}`}
                                                                                    icon={getFolderIcon(folder)}
                                                                                    iconColorClassName={getFolderColorClass(
                                                                                        folder.color,
                                                                                    )}
                                                                                    label={folder.custom_name || folder.name}
                                                                                    count={folder.unread_count}
                                                                                    active={
                                                                                        isSelectedAccount &&
                                                                                        selectedFolderPath === folder.path
                                                                                    }
                                                                                    onEditFolder={() => onOpenFolderEditor(folder)}
                                                                                    dropActive={dropActive}
                                                                                    onContextMenu={(event) => {
                                                                                        event.preventDefault();
                                                                                        onOpenFolderContextMenu(
                                                                                            account.id,
                                                                                            folder,
                                                                                            event.clientX,
                                                                                            event.clientY,
                                                                                        );
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </SortableCustomFolderRow>
                                                                )}
                                                            </MessageDropZone>
                                                        ))}
                                                        {draggingFolder?.accountId === account.id && accountCustomFolders.length > 0 && (
                                                            <SortableFolderEndDrop accountId={account.id}/>
                                                        )}
                                                    </SortableContext>
                                                </>
                                            )}
                                            </div>
                                        )}
                                        {accountIndex < accounts.length - 1 && (
                                            <div
                                                className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-[var(--border-default)] to-transparent"/>
                                        )}
                                        </>
                                        )}
                                    </SortableAccountShell>
                                </div>
                            );
                                    })}
                                </SortableContext>
                                {draggingAccountId !== null && (
                                    <SortableAccountEndDrop/>
                                )}
                            </div>
                            <DragOverlay dropAnimation={null}>
                                {draggingAccount ? (
                                    <div
                                        className="lm-card rounded-lg opacity-85 shadow-xl"
                                        style={{
                                            width: dragOverlaySize?.width,
                                            minHeight: dragOverlaySize?.height,
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <div className="flex items-center gap-2 px-2 py-1.5">
                                            <span
                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-black/10">
                                                {getAccountMonogram(draggingAccount)}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="lm-text-primary block truncate text-sm font-semibold">
                                                    {draggingAccount.display_name?.trim() || draggingAccount.email}
                                                </span>
                                                {draggingAccount.display_name?.trim() && (
                                                    <span
                                                        className="lm-text-muted block truncate text-[11px]">
                                                        {draggingAccount.email}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                            <DragOverlay dropAnimation={null}>
                                {draggingFolder ? (
                                    <div
                                        className="lm-card rounded-lg opacity-85 shadow-xl"
                                        style={{
                                            width: folderOverlaySize?.width,
                                            minHeight: folderOverlaySize?.height,
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        <div className="flex items-center gap-2 px-2 py-1.5">
                                            <span className="lm-bg-hover lm-text-secondary inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                                                <Folder size={14}/>
                                            </span>
                                            <span className="lm-text-primary truncate text-sm font-medium">
                                                {draggingFolder.label}
                                            </span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </nav>
                </ScrollArea>
            </aside>
            <div
                role="separator"
                aria-orientation="vertical"
                className="lm-resize-handle absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent"
                onMouseDown={onResizeStart}
            />
        </div>
    );
}
