import React from 'react';
import {ChevronRight, PenSquare, RefreshCw, Settings} from 'lucide-react';
import type {FolderItem, PublicAccount} from '../../../preload';
import {ScrollArea} from '../ui/scroll-area';
import {getAccountAvatarColors, getAccountMonogram} from '../../lib/accountAvatar';
import {cn} from '../../lib/utils';
import FolderItemRow from './FolderItemRow';
import NewEmailBadge from './NewEmailBadge';

type DraggingMessage = { id: number; accountId: number } | null;
type DragTargetFolder = { accountId: number; path: string } | null;
type DraggingCustomFolder = { accountId: number; path: string } | null;

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
    draggingMessage: DraggingMessage;
    dragTargetFolder: DragTargetFolder;
    draggingCustomFolder: DraggingCustomFolder;
    customFolderDropTarget: DragTargetFolder;
    onSetDragTargetFolder: (target: DragTargetFolder) => void;
    onSetDraggingCustomFolder: (target: DraggingCustomFolder) => void;
    onSetCustomFolderDropTarget: (target: DragTargetFolder) => void;
    onToggleAccountExpanded: (accountId: number) => void;
    onSelectAccount: (accountId: number) => void;
    onSyncAccount: (accountId: number) => void;
    onOpenAccountSettings: (accountId: number) => void;
    onOpenAccountContextMenu: (account: PublicAccount, x: number, y: number) => void;
    onOpenCompose: (accountId: number | null) => void;
    onHandleMessageDropOnFolder: (event: React.DragEvent<HTMLElement>, folder: FolderItem) => void;
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
                                                 draggingMessage,
                                                 dragTargetFolder,
                                                 draggingCustomFolder,
                                                 customFolderDropTarget,
                                                 onSetDragTargetFolder,
                                                 onSetDraggingCustomFolder,
                                                 onSetCustomFolderDropTarget,
                                                 onToggleAccountExpanded,
                                                 onSelectAccount: _onSelectAccount,
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
    if (hidden) return null;

    return (
        <div className="relative min-h-0 shrink-0" style={{width}}>
            <aside
                className="flex h-full min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-800 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-100">
                <ScrollArea className="min-h-0 flex-1 px-2.5 py-3">
                    <nav className="space-y-2">
                        <div className="mb-2 border-b border-slate-200 pb-2 dark:border-[#1b1c20]">
                            <button
                                type="button"
                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                onClick={() => onOpenCompose(selectedAccountId)}
                                title="Compose"
                                aria-label="Compose"
                            >
                                <PenSquare size={16}/>
                                <span>Compose</span>
                            </button>
                        </div>

                        {accounts.length === 0 && (
                            <div className="rounded-lg px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                                No accounts yet
                            </div>
                        )}

                        {accounts.map((account, accountIndex) => {
                            const isSelectedAccount = account.id === selectedAccountId;
                            const isSyncingAccount =
                                (syncingAccountIds?.has(account.id) ?? false) || localSyncingAccountIds.has(account.id);
                            const isPersistedExpanded = !collapsedAccountIds.has(account.id);
                            const isExpanded = isSelectedAccount || isPersistedExpanded;
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
                            const avatarColors = getAccountAvatarColors(
                                account.email || account.display_name || String(account.id),
                            );

                            return (
                                <div key={account.id} className="space-y-1">
                                    <div
                                        className={cn(
                                            'group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors',
                                            isSelectedAccount
                                                ? 'bg-gradient-to-r from-slate-200/90 to-slate-100/90 dark:from-[#3f434b] dark:to-[#373a42]'
                                                : 'bg-transparent hover:bg-gradient-to-r hover:from-slate-200/90 hover:to-slate-100/90 dark:hover:from-[#3f434b] dark:hover:to-[#373a42]',
                                        )}
                                    >
                                        <a
                                            href={`#${accountLinkTarget}`}
                                            className={cn(
                                                'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors',
                                                isSelectedAccount
                                                    ? 'font-semibold text-slate-900 dark:text-white'
                                                    : 'text-slate-700 dark:text-slate-200',
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
                                                        ? 'ring-slate-800/30 dark:ring-white/25'
                                                        : 'ring-black/10 dark:ring-white/10',
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
                                                        className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
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
                                                <button
                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
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
                                                </button>
                                                <button
                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onOpenAccountSettings(account.id);
                                                    }}
                                                    title="Edit account"
                                                    aria-label="Edit account"
                                                >
                                                    <Settings size={13}/>
                                                </button>
                                            </div>
                                            {accountUnread > 0 && (
                                                <NewEmailBadge
                                                    count={accountUnread}
                                                    title={`${accountUnread} unread in account`}
                                                    className={cn(
                                                        isSelectedAccount &&
                                                        'border-red-400/90 from-red-500 to-red-700 dark:border-red-400/80',
                                                    )}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
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
                                                            active={
                                                                isSelectedAccount && selectedFolderPath === folder.path
                                                            }
                                                            dropActive={
                                                                dragTargetFolder?.accountId === folder.account_id &&
                                                                dragTargetFolder.path === folder.path
                                                            }
                                                            onDragEnter={(event) => {
                                                                if (!isSelectedAccount || !draggingMessage) return;
                                                                if (
                                                                    draggingMessage.accountId !== folder.account_id ||
                                                                    folder.path === selectedFolderPath
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                onSetDragTargetFolder({
                                                                    accountId: folder.account_id,
                                                                    path: folder.path,
                                                                });
                                                            }}
                                                            onDragOver={(event) => {
                                                                if (!isSelectedAccount || !draggingMessage) return;
                                                                if (
                                                                    draggingMessage.accountId !== folder.account_id ||
                                                                    folder.path === selectedFolderPath
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                event.dataTransfer.dropEffect = 'move';
                                                                if (
                                                                    dragTargetFolder?.accountId !== folder.account_id ||
                                                                    dragTargetFolder.path !== folder.path
                                                                ) {
                                                                    onSetDragTargetFolder({
                                                                        accountId: folder.account_id,
                                                                        path: folder.path,
                                                                    });
                                                                }
                                                            }}
                                                            onDragLeave={(event) => {
                                                                const related = event.relatedTarget as Node | null;
                                                                if (related && event.currentTarget.contains(related))
                                                                    return;
                                                                if (
                                                                    dragTargetFolder?.accountId === folder.account_id &&
                                                                    dragTargetFolder.path === folder.path
                                                                ) {
                                                                    onSetDragTargetFolder(null);
                                                                }
                                                            }}
                                                            onDrop={(event) => {
                                                                if (!isSelectedAccount) return;
                                                                onHandleMessageDropOnFolder(event, folder);
                                                            }}
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
                                                    ))}
                                                    {accountProtectedFolders.length > 0 &&
                                                        accountCustomFolders.length > 0 && (
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
                                                            active={
                                                                isSelectedAccount && selectedFolderPath === folder.path
                                                            }
                                                            customDragActive={
                                                                customFolderDropTarget?.accountId ===
                                                                folder.account_id &&
                                                                customFolderDropTarget.path === folder.path
                                                            }
                                                            customDragging={
                                                                draggingCustomFolder?.accountId === folder.account_id &&
                                                                draggingCustomFolder.path === folder.path
                                                            }
                                                            draggableFolder
                                                            onFolderDragStart={(event) => {
                                                                onSetDraggingCustomFolder({
                                                                    accountId: folder.account_id,
                                                                    path: folder.path,
                                                                });
                                                                onSetCustomFolderDropTarget(null);
                                                                event.dataTransfer.effectAllowed = 'move';
                                                                event.dataTransfer.setData(
                                                                    'application/x-lunamail-folder-path',
                                                                    folder.path,
                                                                );
                                                                event.dataTransfer.setData(
                                                                    'application/x-lunamail-folder-account',
                                                                    String(folder.account_id),
                                                                );
                                                            }}
                                                            onFolderDragEnd={() => {
                                                                onSetDraggingCustomFolder(null);
                                                                onSetCustomFolderDropTarget(null);
                                                            }}
                                                            onFolderDragOver={(event) => {
                                                                if (
                                                                    !draggingCustomFolder ||
                                                                    draggingCustomFolder.accountId !==
                                                                    folder.account_id ||
                                                                    draggingCustomFolder.path === folder.path
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                event.dataTransfer.dropEffect = 'move';
                                                                if (
                                                                    customFolderDropTarget?.accountId !==
                                                                    folder.account_id ||
                                                                    customFolderDropTarget.path !== folder.path
                                                                ) {
                                                                    onSetCustomFolderDropTarget({
                                                                        accountId: folder.account_id,
                                                                        path: folder.path,
                                                                    });
                                                                }
                                                            }}
                                                            onFolderDrop={(event) => {
                                                                if (
                                                                    !draggingCustomFolder ||
                                                                    draggingCustomFolder.accountId !==
                                                                    folder.account_id ||
                                                                    draggingCustomFolder.path === folder.path
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                const accountId = folder.account_id;
                                                                const accountCustom = (
                                                                    accountFoldersById[accountId] ?? []
                                                                ).filter((item) => !isProtectedFolder(item));
                                                                const fromIndex = accountCustom.findIndex(
                                                                    (item) => item.path === draggingCustomFolder.path,
                                                                );
                                                                const toIndex = accountCustom.findIndex(
                                                                    (item) => item.path === folder.path,
                                                                );
                                                                if (
                                                                    fromIndex >= 0 &&
                                                                    toIndex >= 0 &&
                                                                    fromIndex !== toIndex
                                                                ) {
                                                                    const next = [...accountCustom];
                                                                    const [moved] = next.splice(fromIndex, 1);
                                                                    next.splice(toIndex, 0, moved);
                                                                    void onReorderCustomFolders(
                                                                        accountId,
                                                                        next.map((item) => item.path),
                                                                    );
                                                                }
                                                                onSetDraggingCustomFolder(null);
                                                                onSetCustomFolderDropTarget(null);
                                                            }}
                                                            onEditFolder={() => onOpenFolderEditor(folder)}
                                                            dropActive={
                                                                dragTargetFolder?.accountId === folder.account_id &&
                                                                dragTargetFolder.path === folder.path
                                                            }
                                                            onDragEnter={(event) => {
                                                                if (!isSelectedAccount || !draggingMessage) return;
                                                                if (
                                                                    draggingMessage.accountId !== folder.account_id ||
                                                                    folder.path === selectedFolderPath
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                onSetDragTargetFolder({
                                                                    accountId: folder.account_id,
                                                                    path: folder.path,
                                                                });
                                                            }}
                                                            onDragOver={(event) => {
                                                                if (!isSelectedAccount || !draggingMessage) return;
                                                                if (
                                                                    draggingMessage.accountId !== folder.account_id ||
                                                                    folder.path === selectedFolderPath
                                                                )
                                                                    return;
                                                                event.preventDefault();
                                                                event.dataTransfer.dropEffect = 'move';
                                                                if (
                                                                    dragTargetFolder?.accountId !== folder.account_id ||
                                                                    dragTargetFolder.path !== folder.path
                                                                ) {
                                                                    onSetDragTargetFolder({
                                                                        accountId: folder.account_id,
                                                                        path: folder.path,
                                                                    });
                                                                }
                                                            }}
                                                            onDragLeave={(event) => {
                                                                const related = event.relatedTarget as Node | null;
                                                                if (related && event.currentTarget.contains(related))
                                                                    return;
                                                                if (
                                                                    dragTargetFolder?.accountId === folder.account_id &&
                                                                    dragTargetFolder.path === folder.path
                                                                ) {
                                                                    onSetDragTargetFolder(null);
                                                                }
                                                            }}
                                                            onDrop={(event) => {
                                                                if (!isSelectedAccount) return;
                                                                onHandleMessageDropOnFolder(event, folder);
                                                            }}
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
            </aside>
            <div
                role="separator"
                aria-orientation="vertical"
                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                onMouseDown={onResizeStart}
            />
        </div>
    );
}
