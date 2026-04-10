import React from 'react';
import {FolderPlus, Settings} from 'lucide-react';
import type {PublicAccount} from '@/preload';
import ContextItem from './ContextItem';
import {ContextMenu, ContextMenuSeparator} from '../ui/ContextMenu';

type CreateFolderState = {
    accountId: number;
    folderPath: string;
    type: string;
    color: string;
};

type AccountContextMenuProps = {
    accountMenu: { x: number; y: number; account: PublicAccount } | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    position: { left: number; top: number };
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
    if (!accountMenu) return null;

    return (
        <ContextMenu
            ref={menuRef}
            size="lg"
            layer="1000"
            position={position}
            ready={ready}
            onClick={(event) => event.stopPropagation()}
        >
            <ContextItem
                label="Create Folder"
                icon={<FolderPlus size={14}/>}
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
            <ContextMenuSeparator/>
            <ContextItem
                label="Edit Account Settings"
                icon={<Settings size={14}/>}
                onClick={() => {
                    onOpenAccountSettings(accountMenu.account.id);
                    onClose();
                }}
            />
        </ContextMenu>
    );
}
