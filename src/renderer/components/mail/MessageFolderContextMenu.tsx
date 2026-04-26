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
} from '@llamamail/ui/icon';
import type {FolderItem, MessageItem} from '@preload';
import ContextItem from './ContextItem';
import {cn} from '@llamamail/ui/utils';
import {
	ContextMenu,
	ContextMenuAnchor,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSubmenu,
} from '@llamamail/ui/contextmenu';
import {useI18n} from '@llamamail/app/i18n/renderer';

type TagOption = {
	value: string;
	label: string;
	dotClass: string;
};

type ContextMenuState =
	| {kind: 'message'; x: number; y: number; message: MessageItem}
	| {kind: 'folder'; x: number; y: number; folder: FolderItem};

type FolderEditorState = {
	folder: FolderItem;
	customName: string;
	type: string;
	color: string;
};

type MessageFolderContextMenuProps = {
	menu: ContextMenuState | null;
	menuRef: React.RefObject<HTMLDivElement | null>;
	menuPosition: {left: number; top: number};
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
	onMessageMarkJunk: (message: MessageItem) => void;
	onMessageMarkNotJunk: (message: MessageItem) => void;
	isMessageInJunkFolder: (message: MessageItem) => boolean;
	onMessageMove: (message: MessageItem, targetFolderPath: string) => void;
	onMessageDelete: (message: MessageItem) => void;
	onSelectAccount: (accountId: number) => void;
	onSelectFolder: (path: string, accountId?: number) => void;
	onRefreshFolder: (folder: FolderItem) => void;
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
	onMessageMarkJunk,
	onMessageMarkNotJunk,
	isMessageInJunkFolder,
	onMessageMove,
	onMessageDelete,
	onSelectAccount,
	onSelectFolder,
	onRefreshFolder,
	onOpenFolderSettings,
	onSyncAccount,
	onDeleteFolder,
}: MessageFolderContextMenuProps) {
	const {t} = useI18n();
	if (!menu) return null;

	return (
		<ContextMenu
			ref={menuRef}
			size="lg"
			layer="1000"
			position={menuPosition}
			ready={menuReady}
			onRequestClose={onClose}
			dismissOnInteractOutside={false}
			onClick={(event) => event.stopPropagation()}
		>
			{menu.kind === 'message' && (
				<>
					<ContextItem
						label={t('mail_components.context.open_in_new_window')}
						icon={<SquareArrowOutUpRight size={14} />}
						onClick={() => {
							onOpenMessageWindow(menu.message.id);
							onClose();
						}}
					/>
					<ContextItem
						label={menu.message.is_read ? t('mail_components.context.mark_as_unread') : t('mail_components.context.mark_as_read')}
						icon={menu.message.is_read ? <Mail size={14} /> : <MailOpen size={14} />}
						onClick={() => {
							onMessageMarkReadToggle(menu.message);
							onClose();
						}}
					/>
					<ContextItem
						label={menu.message.is_flagged ? t('mail_components.context.remove_star') : t('mail_components.context.star_message')}
						icon={<Star size={14} />}
						onClick={() => {
							onMessageFlagToggle(menu.message);
							onClose();
						}}
					/>
					<ContextMenuAnchor>
						<ContextMenuItem type="button" align="between" className="transition-colors">
							<span className="flex items-center gap-2">
								<span
									className={cn(
										'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
										getTagDotClass(
											(menu.message as MessageItem & {tag?: string | null}).tag ?? null,
										),
									)}
								/>
								{t('mail_components.context.tag')}
							</span>
							<ChevronRight size={14} />
						</ContextMenuItem>
						<ContextMenuSubmenu
							size="md"
							className={cn(moveSubmenuLeft ? 'right-full' : 'left-full')}
							style={{transform: `translateY(${moveSubmenuOffsetY}px)`}}
						>
							{messageTagOptions.map((tag) => (
								<ContextMenuItem
									key={tag.value}
									type="button"
									align="between"
									onClick={() => {
										const activeTag =
											(
												menu.message as MessageItem & {
													tag?: string | null;
												}
											).tag ?? null;
										onMessageTagChange(menu.message, activeTag === tag.value ? null : tag.value);
										onClose();
									}}
								>
									<span className="flex items-center gap-2">
										<span className={cn('inline-flex h-2.5 w-2.5 rounded-full', tag.dotClass)} />
										{tag.label}
									</span>
									{((menu.message as MessageItem & {tag?: string | null}).tag || '') ===
										tag.value && <span className="text-success text-xs">{t('mail_components.context.on')}</span>}
								</ContextMenuItem>
							))}
							<ContextMenuSeparator />
							<ContextMenuItem
								type="button"
								onClick={() => {
									onMessageTagChange(menu.message, null);
									onClose();
								}}
							>
								{t('mail_components.context.clear_tag')}
							</ContextMenuItem>
						</ContextMenuSubmenu>
					</ContextMenuAnchor>
					<ContextItem
						label={t('mail_components.context.archive')}
						icon={<Archive size={14} />}
						onClick={() => {
							onMessageArchive(menu.message);
							onClose();
						}}
					/>
					<ContextItem
						label={isMessageInJunkFolder(menu.message) ? t('mail_components.context.mark_as_not_junk') : t('mail_components.context.mark_as_junk')}
						icon={<Mail size={14} />}
						onClick={() => {
							if (isMessageInJunkFolder(menu.message)) {
								onMessageMarkNotJunk(menu.message);
							} else {
								onMessageMarkJunk(menu.message);
							}
							onClose();
						}}
					/>
					<ContextMenuSeparator />
					<ContextMenuAnchor>
						<ContextMenuItem
							ref={moveToTriggerRef}
							type="button"
							align="between"
							className="transition-colors"
						>
							<span className="flex items-center gap-2">
								<Folder size={14} />
								{t('mail_components.context.move_to')}
							</span>
							<ChevronRight size={14} />
						</ContextMenuItem>
						<ContextMenuSubmenu
							size="lg"
							className={cn(moveSubmenuLeft ? 'right-full' : 'left-full')}
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
										<span className={cn(getFolderColorClass(folder.color) || 'icon-muted')}>
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
								<ContextMenuSeparator />
							)}
							{moveTargetsCustom.map((folder) => (
								<ContextItem
									key={folder.id}
									label={folder.custom_name || folder.name}
									icon={
										<span className={cn(getFolderColorClass(folder.color) || 'icon-muted')}>
											{getFolderIcon(folder)}
										</span>
									}
									onClick={() => {
										onMessageMove(menu.message, folder.path);
										onClose();
									}}
								/>
							))}
						</ContextMenuSubmenu>
					</ContextMenuAnchor>
					<ContextMenuSeparator />
					<ContextItem
						label={t('mail_components.common.delete')}
						icon={<Trash2 size={14} />}
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
						label={t('mail_components.context.open_folder')}
						icon={<Folder size={14} />}
						onClick={() => {
							if (menu.folder.account_id !== selectedAccountId) {
								onSelectAccount(menu.folder.account_id);
							}
							onSelectFolder(menu.folder.path, menu.folder.account_id);
							onClose();
						}}
					/>
					<ContextItem
						label={t('mail_components.context.edit_folder_settings')}
						icon={<Settings size={14} />}
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
						label={t('mail_components.context.refresh_folder')}
						icon={<RefreshCw size={14} />}
						onClick={() => {
							onRefreshFolder(menu.folder);
							onClose();
						}}
					/>
					<ContextItem
						label={t('mail_components.context.sync_account')}
						icon={<RefreshCw size={14} />}
						onClick={() => {
							onSyncAccount(menu.folder.account_id);
							onClose();
						}}
					/>
					{!isProtectedFolder(menu.folder) && (
						<>
							<ContextMenuSeparator />

							<ContextItem
								label={t('mail_components.context.delete_folder')}
								icon={<Trash2 size={14} />}
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
		</ContextMenu>
	);
}
