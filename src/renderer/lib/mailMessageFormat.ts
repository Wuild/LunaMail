import type {FolderItem, MessageItem, PublicAccount} from '@/preload';

export function formatMessageSender(message: MessageItem): string {
    const name = (message.from_name || '').trim();
    const email = (message.from_address || '').trim();
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return 'Unknown sender';
}

export function formatMessageRecipient(message: MessageItem): string {
    const value = String(message.to_address || '').trim();
    return value || 'Unknown recipient';
}

export function formatMessageAccount(message: MessageItem, accounts: PublicAccount[]): string {
    const account = accounts.find((item) => item.id === message.account_id);
    if (!account) return `Account ${message.account_id}`;
    return account.display_name?.trim() || account.email;
}

export function formatMessageLocation(message: MessageItem, folders: FolderItem[]): string {
    const folder = folders.find((item) => item.id === message.folder_id);
    if (!folder) return `Folder ${message.folder_id}`;
    return folder.custom_name || folder.name || folder.path;
}

export function formatAccountSearchLabel(account: PublicAccount | null): string {
    if (!account) return 'selected account';
    const displayName = (account.display_name || '').trim();
    if (!displayName) return account.email;
    return `${displayName} <${account.email}>`;
}

export function getThreadCount(message: MessageItem): number {
    const raw = (message as MessageItem & { thread_count?: number }).thread_count;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.round(parsed);
}

export function formatMessageSize(size: number | null): string {
    if (!size || size <= 0) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function isInboxFolderPath(folder: FolderItem): boolean {
    const type = String(folder.type || '').toLowerCase();
    const path = String(folder.path || '').toLowerCase();
    return type === 'inbox' || path === 'inbox' || path.endsWith('/inbox') || path.endsWith('.inbox');
}
