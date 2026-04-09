import {Button} from '../ui/button';
import React from 'react';
import {
    Archive,
    ChevronRight,
    Folder,
    Mail,
    MailOpen,
    RefreshCw,
    Settings,
    SquareArrowOutUpRight,
    Star,
    Trash2,
} from 'lucide-react';
import type {FolderItem, MessageItem} from '../../../preload';
import ContextItem from './ContextItem';
import {cn} from '../../lib/utils';

type TagOption = {
    value: string;
    label: string;
    dotClass: string;
};

type ContextMenuState =
    | { kind: 'message'; x: number; y: number; message: MessageItem }
    | { kind: 'folder'; x: number; y: number; folder: FolderItem };

type FolderEditorState = {
    folder: FolderItem;
    customName: string;
    type: string;
    color: string;
};

type MessageFolderContextMenuProps = {
    menu: ContextMenuState | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    menuPosition: { left: number; top: number };
    menuReady: boolean;
    moveToTriggerRef: React.RefObject<HTMLButtonElement | null>;
    moveSubmenuLeft: boolean;
    moveSubmenuOffsetY: number;
    moveTargetsProtected: FolderItem[];
    moveTargetsCustom: FolderItem[];
    messageTagOptions: TagOption[];
    selectedAccountId: number | null;
    getTagDotClass: (tag: string | null) => string;
    getFolderColorClass: (color: string | null | undefined) => string | undefined;
    getFolderIcon: (folder: FolderItem) => React.ReactNode;
    isProtectedFolder: (folder: FolderItem) => boolean;
    onClose: () => void;
    onOpenMessageWindow: (messageId: number) => void;
    onMessageMarkReadToggle: (message: MessageItem) => void;
    onMessageFlagToggle: (message: MessageItem) => void;
    onMessageTagChange: (message: MessageItem, tag: string | null) => void;
    onMessageArchive: (message: MessageItem) => void;
    onMessageMove: (message: MessageItem, targetFolderPath: string) => void;
    onMessageDelete: (message: MessageItem) => void;
    onSelectAccount: (accountId: number) => void;
    onSelectFolder: (path: string, accountId?: number) => void;
    onOpenFolderSettings: (editor: FolderEditorState) => void;
    onSyncAccount: (accountId: number) => void;
    onDeleteFolder: (folder: FolderItem) => void;
};

export default function MessageFolderContextMenu({
                                                     menu,
                                                     menuRef,
                                                     menuPosition,
                                                     menuReady,
                                                     moveToTriggerRef,
                                                     moveSubmenuLeft,
                                                     moveSubmenuOffsetY,
                                                     moveTargetsProtected,
                                                     moveTargetsCustom,
                                                     messageTagOptions,
                                                     selectedAccountId,
                                                     getTagDotClass,
                                                     getFolderColorClass,
                                                     getFolderIcon,
                                                     isProtectedFolder,
                                                     onClose,
                                                     onOpenMessageWindow,
                                                     onMessageMarkReadToggle,
                                                     onMessageFlagToggle,
                                                     onMessageTagChange,
                                                     onMessageArchive,
                                                     onMessageMove,
                                                     onMessageDelete,
                                                     onSelectAccount,
                                                     onSelectFolder,
                                                     onOpenFolderSettings,
                                                     onSyncAccount,
                                                     onDeleteFolder,
                                                 }: MessageFolderContextMenuProps) {
    if (!menu) return null;

    return (
        <div
            ref={menuRef}
            className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-menu-dark)]"
            style={{
                left: menuPosition.left,
                top: menuPosition.top,
                visibility: menuReady ? 'visible' : 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
        >
            {menu.kind === 'message' && (
                <>
                    <ContextItem
                        label="Open in new window"
                        icon={<SquareArrowOutUpRight size={14}/>}
                        onClick={() => {
                            onOpenMessageWindow(menu.message.id);
                            onClose();
                        }}
                    />
                    <ContextItem
                        label={menu.message.is_read ? 'Mark as unread' : 'Mark as read'}
                        icon={menu.message.is_read ? <Mail size={14}/> : <MailOpen size={14}/>}
                        onClick={() => {
                            onMessageMarkReadToggle(menu.message);
                            onClose();
                        }}
                    />
                    <ContextItem
                        label={menu.message.is_flagged ? 'Remove star' : 'Star message'}
                        icon={<Star size={14}/>}
                        onClick={() => {
                            onMessageFlagToggle(menu.message);
                            onClose();
                        }}
                    />
                    <div className="group relative">
                        <Button
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
                        >
							<span className="flex items-center gap-2">
								<span
                                    className={cn(
                                        'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
                                        getTagDotClass(
                                            (menu.message as MessageItem & { tag?: string | null }).tag ?? null,
                                        ),
                                    )}
                                />
								Tag
							</span>
                            <ChevronRight size={14}/>
                        </Button>
                        <div
                            className={cn(
                                'absolute top-0 z-[1010] hidden min-w-52 rounded-md border border-slate-200 bg-white p-1 shadow-xl group-hover:block group-focus-within:block dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-menu-dark)]',
                                moveSubmenuLeft ? 'right-full mr-1' : 'left-full ml-1',
                            )}
                            style={{transform: `translateY(${moveSubmenuOffsetY}px)`}}
                        >
                            {messageTagOptions.map((tag) => (
                                <Button
                                    key={tag.value}
                                    type="button"
                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
                                    onClick={() => {
                                        onMessageTagChange(menu.message, tag.value);
                                        onClose();
                                    }}
                                >
									<span className="flex items-center gap-2">
										<span className={cn('inline-flex h-2.5 w-2.5 rounded-full', tag.dotClass)}/>
                                        {tag.label}
									</span>
                                    {((menu.message as MessageItem & { tag?: string | null }).tag || '') ===
                                        tag.value && (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-300">On</span>
                                        )}
                                </Button>
                            ))}
                            <div className="my-1 h-px bg-slate-200 dark:bg-[var(--lm-border-default-dark)]"/>
                            <Button
                                type="button"
                                className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
                                onClick={() => {
                                    onMessageTagChange(menu.message, null);
                                    onClose();
                                }}
                            >
                                Clear tag
                            </Button>
                        </div>
                    </div>
                    <ContextItem
                        label="Archive"
                        icon={<Archive size={14}/>}
                        onClick={() => {
                            onMessageArchive(menu.message);
                            onClose();
                        }}
                    />
                    <div className="my-1 h-px bg-slate-200"/>
                    <div className="group relative">
                        <Button
                            ref={moveToTriggerRef}
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
                        >
							<span className="flex items-center gap-2">
								<Folder size={14}/>
								Move to
							</span>
                            <ChevronRight size={14}/>
                        </Button>
                        <div
                            className={cn(
                                'absolute top-0 z-[1010] hidden min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl group-hover:block group-focus-within:block dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-menu-dark)]',
                                moveSubmenuLeft ? 'right-full mr-1' : 'left-full ml-1',
                            )}
                            style={{
                                transform: `translateY(${moveSubmenuOffsetY}px)`,
                                maxHeight: 'calc(100vh - 16px)',
                                overflowY: 'auto',
                            }}
                        >
                            {moveTargetsProtected.map((folder) => (
                                <ContextItem
                                    key={folder.id}
                                    label={folder.custom_name || folder.name}
                                    icon={
                                        <span
                                            className={cn(
                                                getFolderColorClass(folder.color) ||
                                                'text-slate-500 dark:text-slate-300',
                                            )}
                                        >
											{getFolderIcon(folder)}
										</span>
                                    }
                                    onClick={() => {
                                        onMessageMove(menu.message, folder.path);
                                        onClose();
                                    }}
                                />
                            ))}
                            {moveTargetsProtected.length > 0 && moveTargetsCustom.length > 0 && (
                                <div className="my-1 h-px bg-slate-200 dark:bg-[var(--lm-border-default-dark)]"/>
                            )}
                            {moveTargetsCustom.map((folder) => (
                                <ContextItem
                                    key={folder.id}
                                    label={folder.custom_name || folder.name}
                                    icon={
                                        <span
                                            className={cn(
                                                getFolderColorClass(folder.color) ||
                                                'text-slate-500 dark:text-slate-300',
                                            )}
                                        >
											{getFolderIcon(folder)}
										</span>
                                    }
                                    onClick={() => {
                                        onMessageMove(menu.message, folder.path);
                                        onClose();
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
                            onClose();
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
                            onClose();
                        }}
                    />
                    <ContextItem
                        label="Edit Folder Settings"
                        icon={<Settings size={14}/>}
                        onClick={() => {
                            onOpenFolderSettings({
                                folder: menu.folder,
                                customName: menu.folder.custom_name || menu.folder.name,
                                type: menu.folder.type || '',
                                color: menu.folder.color || '',
                            });
                            onClose();
                        }}
                    />
                    <ContextItem
                        label="Sync Account"
                        icon={<RefreshCw size={14}/>}
                        onClick={() => {
                            onSyncAccount(menu.folder.account_id);
                            onClose();
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
                                    onClose();
                                }}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}
