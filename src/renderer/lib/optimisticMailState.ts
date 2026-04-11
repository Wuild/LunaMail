import type {FolderItem, MessageItem} from '@/preload';

export function applyReadStateToMessages(messages: MessageItem[], messageId: number, nextRead: number): MessageItem[] {
    return messages.map((message) => (message.id === messageId ? {...message, is_read: nextRead} : message));
}

export function applyReadStateToFolders(
    folders: FolderItem[],
    folderPath: string,
    previousRead: number,
    nextRead: number,
): FolderItem[] {
    if (previousRead === nextRead) return folders;
    const delta = nextRead ? -1 : 1;
    return folders.map((folder) => {
        if (folder.path !== folderPath) return folder;
        return {...folder, unread_count: Math.max(0, folder.unread_count + delta)};
    });
}

export function applyReadStateToAccountFoldersById(
    accountFoldersById: Record<number, FolderItem[]>,
    accountId: number,
    folderPath: string,
    previousRead: number,
    nextRead: number,
): Record<number, FolderItem[]> {
    if (previousRead === nextRead) return accountFoldersById;
    const accountFolders = accountFoldersById[accountId] ?? [];
    return {
        ...accountFoldersById,
        [accountId]: applyReadStateToFolders(accountFolders, folderPath, previousRead, nextRead),
    };
}
