import {contextBridge, ipcRenderer} from 'electron';

export interface AddAccountPayload {
    email: string;
    provider?: string | null;
    display_name?: string | null;
    reply_to?: string | null;
    organization?: string | null;
    signature_text?: string | null;
    signature_is_html?: number;
    signature_file_path?: string | null;
    attach_vcard?: number;
    imap_host: string;
    imap_port: number;
    imap_secure?: number; // 0/1
    pop3_host?: string | null;
    pop3_port?: number | null;
    pop3_secure?: number | null; // 0/1
    smtp_host: string;
    smtp_port: number;
    smtp_secure?: number; // 0/1
    user: string;
    password: string;
}

export interface UpdateAccountPayload {
    email: string;
    provider?: string | null;
    display_name?: string | null;
    reply_to?: string | null;
    organization?: string | null;
    signature_text?: string | null;
    signature_is_html?: number;
    signature_file_path?: string | null;
    attach_vcard?: number;
    imap_host: string;
    imap_port: number;
    imap_secure?: number;
    pop3_host?: string | null;
    pop3_port?: number | null;
    pop3_secure?: number | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure?: number;
    user: string;
    password?: string | null;
}

export interface PublicAccount {
    id: number;
    email: string;
    provider: string | null;
    display_name: string | null;
    reply_to: string | null;
    organization: string | null;
    signature_text: string | null;
    signature_is_html: number;
    signature_file_path: string | null;
    attach_vcard: number;
    imap_host: string;
    imap_port: number;
    imap_secure: number;
    pop3_host: string | null;
    pop3_port: number | null;
    pop3_secure: number | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: number;
    user: string;
    created_at: string;
}

export interface ServiceSettings {
    host: string;
    port: number;
    secure: boolean;
}

export interface DiscoverResult {
    provider?: string | null;
    imap?: ServiceSettings;
    pop3?: ServiceSettings;
    smtp?: ServiceSettings;
}

export interface VerifyPayload {
    type: 'imap' | 'pop3' | 'smtp';
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
}

export interface VerifyResult {
    ok: boolean;
    error?: string;
}

export interface FolderItem {
    id: number;
    account_id: number;
    name: string;
    custom_name: string | null;
    color: string | null;
    path: string;
    type: string | null;
    unread_count: number;
    total_count: number;
}

export interface MessageItem {
    id: number;
    account_id: number;
    folder_id: number;
    uid: number;
    seq: number;
    message_id: string | null;
    in_reply_to: string | null;
    references_text: string | null;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    to_address: string | null;
    date: string | null;
    is_read: number;
    is_flagged: number;
    size: number | null;
}

export type MessageDetails = MessageItem;

export interface SyncStatusEvent {
    accountId: number;
    status: 'syncing' | 'done' | 'error';
    error?: string;
    summary?: { accountId: number; folders: number; messages: number; newMessages?: number };
}

export interface MessageBodyResult {
    messageId: number;
    text: string | null;
    html: string | null;
    attachments: Array<{
        filename: string | null;
        contentType: string | null;
        size: number | null;
    }>;
    cached: boolean;
}

export interface EmailAttachmentPayload {
    path: string;
    filename?: string | null;
    contentType?: string | null;
}

export interface PickedAttachment {
    path: string;
    filename: string;
    contentType: string | null;
}

export interface SetMessageReadResult {
    messageId: number;
    accountId: number;
    folderId: number;
    folderPath: string;
    unreadCount: number;
    totalCount: number;
    isRead: number;
}

export interface MoveMessageResult {
    messageId: number;
    accountId: number;
    sourceFolderId: number;
    sourceFolderPath: string;
    targetFolderId: number;
    targetFolderPath: string;
    uid: number;
    sourceUnreadCount: number;
    sourceTotalCount: number;
    targetUnreadCount: number;
    targetTotalCount: number;
}

export interface CreateFolderResult {
    accountId: number;
    path: string;
}

export interface DeleteFolderResult {
    accountId: number;
    path: string;
    removed: boolean;
}

export interface SendEmailPayload {
    accountId: number;
    to: string;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    markdown?: string | null;
    text?: string | null;
    html?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
    attachments?: EmailAttachmentPayload[] | null;
}

export interface SendEmailResult {
    ok: true;
    messageId: string;
}

export interface SaveDraftPayload {
    accountId: number;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
    attachments?: EmailAttachmentPayload[] | null;
}

export interface SaveDraftResult {
    ok: true;
}

export interface ComposeDraftPayload {
    accountId?: number | null;
    to?: string | null;
    cc?: string | null;
    subject?: string | null;
    body?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
}

export type AppLanguage = 'system' | 'en-US' | 'sv-SE';
export type AppTheme = 'system' | 'light' | 'dark';

export interface AppSettings {
    language: AppLanguage;
    theme: AppTheme;
    minimizeToTray: boolean;
    syncIntervalMinutes: number;
}

export interface AccountDeletedEvent {
    id: number;
    email: string;
}

export interface OpenMessageTargetEvent {
    accountId: number;
    folderPath: string;
    messageId: number;
}

export type AppSettingsPatch = Partial<AppSettings>;

const api = {
    getAccounts: (): Promise<PublicAccount[]> => ipcRenderer.invoke('get-accounts'),
    addAccount: (account: AddAccountPayload): Promise<{ id: number; email: string }> =>
        ipcRenderer.invoke('add-account', account),
    updateAccount: (accountId: number, payload: UpdateAccountPayload): Promise<PublicAccount> =>
        ipcRenderer.invoke('update-account', accountId, payload),
    deleteAccount: (accountId: number): Promise<AccountDeletedEvent> =>
        ipcRenderer.invoke('delete-account', accountId),
    discoverMailSettings: (email: string): Promise<DiscoverResult> =>
        ipcRenderer.invoke('discover-mail-settings', email),
    verifyCredentials: (payload: VerifyPayload): Promise<VerifyResult> =>
        ipcRenderer.invoke('verify-credentials', payload),
    syncAccount: (accountId: number): Promise<{ accountId: number; folders: number; messages: number }> =>
        ipcRenderer.invoke('sync-account', accountId),
    getFolders: (accountId: number): Promise<FolderItem[]> =>
        ipcRenderer.invoke('get-folders', accountId),
    createFolder: (accountId: number, folderPath: string): Promise<CreateFolderResult> =>
        ipcRenderer.invoke('create-folder', accountId, folderPath),
    deleteFolder: (accountId: number, folderPath: string): Promise<DeleteFolderResult> =>
        ipcRenderer.invoke('delete-folder', accountId, folderPath),
    updateFolderSettings: (
        accountId: number,
        folderPath: string,
        payload: { customName?: string | null; color?: string | null; type?: string | null },
    ): Promise<FolderItem> => ipcRenderer.invoke('update-folder-settings', accountId, folderPath, payload),
    getFolderMessages: (accountId: number, folderPath: string, limit?: number): Promise<MessageItem[]> =>
        ipcRenderer.invoke('get-folder-messages', accountId, folderPath, limit),
    searchMessages: (accountId: number, query: string, folderPath?: string | null, limit?: number): Promise<MessageItem[]> =>
        ipcRenderer.invoke('search-messages', accountId, query, folderPath ?? null, limit),
    getMessage: (messageId: number): Promise<MessageDetails | null> =>
        ipcRenderer.invoke('get-message', messageId),
    getMessageBody: (messageId: number, requestId?: string): Promise<MessageBodyResult> =>
        ipcRenderer.invoke('get-message-body', messageId, requestId),
    cancelMessageBody: (requestId: string): Promise<{ ok: true }> =>
        ipcRenderer.invoke('cancel-message-body', requestId),
    setMessageRead: (messageId: number, isRead: number): Promise<SetMessageReadResult> =>
        ipcRenderer.invoke('set-message-read', messageId, isRead),
    setMessageFlagged: (messageId: number, isFlagged: number): Promise<{
        accountId: number;
        folders: number;
        messages: number
    }> =>
        ipcRenderer.invoke('set-message-flagged', messageId, isFlagged),
    moveMessage: (messageId: number, targetFolderPath: string): Promise<MoveMessageResult> =>
        ipcRenderer.invoke('move-message', messageId, targetFolderPath),
    deleteMessage: (messageId: number): Promise<{ accountId: number; folders: number; messages: number }> =>
        ipcRenderer.invoke('delete-message', messageId),
    sendEmail: (payload: SendEmailPayload): Promise<SendEmailResult> =>
        ipcRenderer.invoke('send-email', payload),
    saveDraft: (payload: SaveDraftPayload): Promise<SaveDraftResult> =>
        ipcRenderer.invoke('save-draft', payload),
    openAddAccountWindow: (): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-add-account-window'),
    openComposeWindow: (draft?: ComposeDraftPayload | null): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-compose-window', draft ?? null),
    openAppSettingsWindow: (): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-app-settings-window'),
    openSupportWindow: (): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-support-window'),
    openMessageWindow: (messageId?: number | null): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-message-window', messageId ?? null),
    getComposeDraft: (): Promise<ComposeDraftPayload | null> =>
        ipcRenderer.invoke('get-compose-draft'),
    getMessageWindowTarget: (): Promise<number | null> =>
        ipcRenderer.invoke('get-message-window-target'),
    openAccountSettingsWindow: (accountId?: number | null): Promise<{ ok: true }> =>
        ipcRenderer.invoke('open-account-settings-window', accountId ?? null),
    getAccountSettingsTarget: (): Promise<number | null> =>
        ipcRenderer.invoke('get-account-settings-target'),
    getAppSettings: (): Promise<AppSettings> =>
        ipcRenderer.invoke('get-app-settings'),
    getSystemLocale: (): Promise<string> =>
        ipcRenderer.invoke('get-system-locale'),
    updateAppSettings: (patch: AppSettingsPatch): Promise<AppSettings> =>
        ipcRenderer.invoke('update-app-settings', patch),
    pickComposeAttachments: (): Promise<PickedAttachment[]> =>
        ipcRenderer.invoke('pick-compose-attachments'),
    onAccountAdded: (callback: (payload: { id: number; email: string }) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: {
            id: number;
            email: string
        }) => callback(payload);
        ipcRenderer.on('account-added', listener);
        return () => ipcRenderer.removeListener('account-added', listener);
    },
    onAccountUpdated: (callback: (payload: PublicAccount) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: PublicAccount) => callback(payload);
        ipcRenderer.on('account-updated', listener);
        return () => ipcRenderer.removeListener('account-updated', listener);
    },
    onAccountDeleted: (callback: (payload: AccountDeletedEvent) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: AccountDeletedEvent) => callback(payload);
        ipcRenderer.on('account-deleted', listener);
        return () => ipcRenderer.removeListener('account-deleted', listener);
    },
    onAccountSyncStatus: (callback: (payload: SyncStatusEvent) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: SyncStatusEvent) => callback(payload);
        ipcRenderer.on('account-sync-status', listener);
        return () => ipcRenderer.removeListener('account-sync-status', listener);
    },
    onComposeDraft: (callback: (payload: ComposeDraftPayload | null) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: ComposeDraftPayload | null) => callback(payload);
        ipcRenderer.on('compose-draft', listener);
        return () => ipcRenderer.removeListener('compose-draft', listener);
    },
    onAppSettingsUpdated: (callback: (payload: AppSettings) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: AppSettings) => callback(payload);
        ipcRenderer.on('app-settings-updated', listener);
        return () => ipcRenderer.removeListener('app-settings-updated', listener);
    },
    onOpenMessageTarget: (callback: (payload: OpenMessageTargetEvent) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: OpenMessageTargetEvent) => callback(payload);
        ipcRenderer.on('open-message-target', listener);
        return () => ipcRenderer.removeListener('open-message-target', listener);
    },
    onAccountSettingsTarget: (callback: (payload: number | null) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: number | null) => callback(payload);
        ipcRenderer.on('account-settings-target', listener);
        return () => ipcRenderer.removeListener('account-settings-target', listener);
    },
    onMessageWindowTarget: (callback: (payload: number | null) => void): (() => void) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: number | null) => callback(payload);
        ipcRenderer.on('message-window-target', listener);
        return () => ipcRenderer.removeListener('message-window-target', listener);
    },
};

declare global {
    interface Window {
        electronAPI: typeof api;
    }
}

contextBridge.exposeInMainWorld('electronAPI', api);
