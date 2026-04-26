import React from 'react';
import {FolderPlus, Settings} from '@llamamail/ui/icon';
import type {PublicAccount} from '@preload';
import ContextItem from './ContextItem';
import {ContextMenu, ContextMenuSeparator} from '@llamamail/ui/contextmenu';
import {useI18n} from '@llamamail/app/i18n/renderer';

type CreateFolderState = {
	accountId: number;
	folderPath: string;
	type: string;
	color: string;
};

type AccountContextMenuProps = {
	accountMenu: {x: number; y: number; account: PublicAccount} | null;
	menuRef: React.RefObject<HTMLDivElement | null>;
	position: {left: number; top: number};
	ready: boolean;
	onClose: () => void;
	onOpenCreateFolder: (payload: CreateFolderState) => void;
	onOpenAccountSettings: (accountId: number) => void;
};

export default function AccountContextMenu({
	accountMenu,
	menuRef,
	position,
	ready,
	onClose,
	onOpenCreateFolder,
	onOpenAccountSettings,
}: AccountContextMenuProps) {
	const {t} = useI18n();
	if (!accountMenu) return null;

	return (
		<ContextMenu
			ref={menuRef}
			size="lg"
			layer="1000"
			position={position}
			ready={ready}
			onRequestClose={onClose}
			onClick={(event) => event.stopPropagation()}
		>
			<ContextItem
				label={t('mail_components.context.create_folder')}
				icon={<FolderPlus size={14} />}
				onClick={() => {
					onOpenCreateFolder({
						accountId: accountMenu.account.id,
						folderPath: '',
						type: '',
						color: '',
					});
					onClose();
				}}
			/>
			<ContextMenuSeparator />
			<ContextItem
				label={t('mail_components.context.edit_account_settings')}
				icon={<Settings size={14} />}
				onClick={() => {
					onOpenAccountSettings(accountMenu.account.id);
					onClose();
				}}
			/>
		</ContextMenu>
	);
}
