import React from 'react';
import {FolderPlus, Settings} from 'lucide-react';
import type {PublicAccount} from '../../../preload';
import ContextItem from './ContextItem';

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
        <div
            ref={menuRef}
            className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
            style={{
                left: position.left,
                top: position.top,
                visibility: ready ? 'visible' : 'hidden',
            }}
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
            <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
            <ContextItem
                label="Edit Account Settings"
                icon={<Settings size={14}/>}
                onClick={() => {
                    onOpenAccountSettings(accountMenu.account.id);
                    onClose();
                }}
            />
        </div>
    );
}
