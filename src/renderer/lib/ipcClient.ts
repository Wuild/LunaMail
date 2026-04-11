import type {
    AccountSyncSummary,
    AddAccountPayload,
    AddCalendarEventPayload,
    AddCloudAccountPayload,
    AddressBookItem,
    AppSettings,
    AutoUpdateState,
    CalendarEventItem,
    CloudItem,
    CloudItemStatus,
    CloudOpenItemResult,
    CloudShareLinkResult,
    CloudStorageUsage,
    CloudUploadResult,
    ComposeDraftPayload,
    ContactItem,
    DavDiscoveryResult,
    DavSyncSummary,
    DebugLogEntry,
    DiscoverResult,
    ExportContactsPayload,
    ExportContactsResult,
    GlobalErrorEvent,
    MailFilter,
    MailFilterRunSummary,
    MessageBodyResult,
    OpenMessageTargetEvent,
    PickedAttachment,
    PickedCloudAttachment,
    PublicAccount,
    PublicCloudAccount,
    RecentRecipientItem,
    SaveDraftPayload,
    SaveDraftResult,
    SendEmailPayload,
    SendEmailBackgroundResult,
    SendEmailBackgroundStatusEvent,
    SendEmailResult,
    SetMessageReadResult,
    SyncStatusEvent,
    UpdateAccountPayload,
    UpdateCalendarEventPayload,
    UpdateCloudAccountPayload,
    UpsertMailFilterPayload,
    VerifyPayload,
    VerifyResult,
    WindowControlsCapabilities,
} from '@/preload';

const noopUnsubscribe = () => undefined;

type AddContactPayload = {
    addressBookId?: number | null;
    fullName?: string | null;
    email: string;
    phone?: string | null;
    organization?: string | null;
    title?: string | null;
    note?: string | null;
};

type UpdateContactPayload = {
    addressBookId?: number | null;
    fullName?: string | null;
    email?: string;
    phone?: string | null;
    organization?: string | null;
    title?: string | null;
    note?: string | null;
};

export const ipcClient = {
    getAccounts: (): Promise<PublicAccount[]> => window.electronAPI.getAccounts(),
    getUnreadCount: (): Promise<number> => window.electronAPI.getUnreadCount(),
    onAccountAdded: (cb: (payload: { id: number; email: string }) => void): (() => void) =>
        window.electronAPI.onAccountAdded?.(cb) ?? noopUnsubscribe,
    onAccountUpdated: (cb: (payload: PublicAccount) => void): (() => void) =>
        window.electronAPI.onAccountUpdated?.(cb) ?? noopUnsubscribe,
    onAccountDeleted: (cb: (payload: { id: number }) => void): (() => void) =>
        window.electronAPI.onAccountDeleted?.(cb) ?? noopUnsubscribe,
    onUnreadCountUpdated: (cb: (count: number) => void): (() => void) =>
        window.electronAPI.onUnreadCountUpdated?.(cb) ?? noopUnsubscribe,
    onMessageReadUpdated: (cb: (payload: SetMessageReadResult) => void): (() => void) =>
        window.electronAPI.onMessageReadUpdated?.(cb) ?? noopUnsubscribe,
    onAccountSyncStatus: (cb: (payload: SyncStatusEvent) => void): (() => void) =>
        window.electronAPI.onAccountSyncStatus?.(cb) ?? noopUnsubscribe,
    onOpenMessageTarget: (cb: (payload: OpenMessageTargetEvent) => void): (() => void) =>
        window.electronAPI.onOpenMessageTarget?.(cb) ?? noopUnsubscribe,

    getAppSettings: (): Promise<AppSettings> => window.electronAPI.getAppSettings(),
    onAppSettingsUpdated: (cb: (settings: AppSettings) => void): (() => void) =>
        window.electronAPI.onAppSettingsUpdated?.(cb) ?? noopUnsubscribe,

    getAutoUpdateState: (): Promise<AutoUpdateState> => window.electronAPI.getAutoUpdateState(),
    checkForUpdates: (): Promise<AutoUpdateState> => window.electronAPI.checkForUpdates(),
    downloadUpdate: (): Promise<AutoUpdateState> => window.electronAPI.downloadUpdate(),
    quitAndInstallUpdate: (): Promise<{ ok: true }> => window.electronAPI.quitAndInstallUpdate(),
    devShowNotification: () => window.electronAPI.devShowNotification(),
    devPlayNotificationSound: () => window.electronAPI.devPlayNotificationSound(),
    devOpenUpdaterWindow: () => window.electronAPI.devOpenUpdaterWindow(),
    setDefaultEmailClient: (): Promise<{ ok: boolean; isDefault: boolean; error?: string }> =>
        window.electronAPI.setDefaultEmailClient(),
    getDefaultEmailClientStatus: (): Promise<{ ok: boolean; isDefault: boolean; error?: string }> =>
        window.electronAPI.getDefaultEmailClientStatus(),
    onAutoUpdateStatus: (cb: (state: AutoUpdateState) => void): (() => void) =>
        window.electronAPI.onAutoUpdateStatus?.(cb) ?? noopUnsubscribe,
    onGlobalError: (cb: (payload: GlobalErrorEvent) => void): (() => void) =>
        window.electronAPI.onGlobalError?.(cb) ?? noopUnsubscribe,
    onComposeDraft: (cb: (draft: ComposeDraftPayload | null) => void): (() => void) =>
        window.electronAPI.onComposeDraft?.(cb) ?? noopUnsubscribe,
    onSendEmailBackgroundStatus: (cb: (payload: SendEmailBackgroundStatusEvent) => void): (() => void) =>
        window.electronAPI.onSendEmailBackgroundStatus?.(cb) ?? noopUnsubscribe,
    onDebugLog: (cb: (entry: DebugLogEntry) => void): (() => void) =>
        window.electronAPI.onDebugLog?.(cb) ?? noopUnsubscribe,
    getDebugLogs: (limit?: number): Promise<DebugLogEntry[]> => window.electronAPI.getDebugLogs(limit),
    clearDebugLogs: (): Promise<{ ok: true }> => window.electronAPI.clearDebugLogs(),

    isWindowMaximized: (): Promise<boolean> => window.electronAPI.isWindowMaximized(),
    minimizeWindow: (): Promise<{ ok: true }> => window.electronAPI.minimizeWindow(),
    toggleMaximizeWindow: (): Promise<{ ok: true; isMaximized: boolean }> => window.electronAPI.toggleMaximizeWindow(),
    closeWindow: (): Promise<{ ok: true }> => window.electronAPI.closeWindow(),
    getWindowControlsCapabilities: (): Promise<WindowControlsCapabilities> =>
        window.electronAPI.getWindowControlsCapabilities(),
    openDevTools: (): Promise<{ ok: true }> => window.electronAPI.openDevTools(),
    restartApp: (): Promise<{ ok: true }> => window.electronAPI.restartApp(),
    openAddAccountWindow: (): Promise<{ ok: true }> => window.electronAPI.openAddAccountWindow(),

    getSystemLocale: (): Promise<string> => window.electronAPI.getSystemLocale(),
    discoverMailSettings: (email: string): Promise<DiscoverResult> => window.electronAPI.discoverMailSettings(email),
    verifyCredentials: (payload: VerifyPayload): Promise<VerifyResult> => window.electronAPI.verifyCredentials(payload),
    discoverDavPreview: (payload: {
        email: string;
        user: string;
        password: string;
        imapHost: string;
    }): Promise<DavDiscoveryResult> => window.electronAPI.discoverDavPreview(payload),
    addAccount: (payload: AddAccountPayload) => window.electronAPI.addAccount(payload),
    updateAccount: (accountId: number, payload: UpdateAccountPayload) =>
        window.electronAPI.updateAccount(accountId, payload),
    deleteAccount: (accountId: number) => window.electronAPI.deleteAccount(accountId),
    getCloudAccounts: (): Promise<PublicCloudAccount[]> => window.electronAPI.getCloudAccounts(),
    onCloudAccountsUpdated: (cb: (payload: PublicCloudAccount[]) => void): (() => void) =>
        window.electronAPI.onCloudAccountsUpdated?.(cb) ?? noopUnsubscribe,
    addCloudAccount: (payload: AddCloudAccountPayload): Promise<PublicCloudAccount> =>
        window.electronAPI.addCloudAccount(payload),
    updateCloudAccount: (accountId: number, payload: UpdateCloudAccountPayload): Promise<PublicCloudAccount> =>
        window.electronAPI.updateCloudAccount(accountId, payload),
    deleteCloudAccount: (accountId: number): Promise<{ removed: boolean }> =>
        window.electronAPI.deleteCloudAccount(accountId),
    linkCloudOAuth: (
        provider: 'google-drive' | 'onedrive',
        payload: { clientId: string; tenantId?: string | null },
    ): Promise<PublicCloudAccount> => window.electronAPI.linkCloudOAuth(provider, payload),
    listCloudItems: (accountId: number, pathOrToken?: string | null): Promise<{ path: string; items: CloudItem[] }> =>
        window.electronAPI.listCloudItems(accountId, pathOrToken ?? null),
    getCloudStorageUsage: (accountId: number): Promise<CloudStorageUsage> =>
        window.electronAPI.getCloudStorageUsage(accountId),
    createCloudFolder: (
        accountId: number,
        parentPathOrToken: string | null,
        folderName: string,
    ): Promise<{ id: string; path: string; name: string }> =>
        window.electronAPI.createCloudFolder(accountId, parentPathOrToken ?? null, folderName),
    uploadCloudFiles: (accountId: number, parentPathOrToken?: string | null): Promise<CloudUploadResult> =>
        window.electronAPI.uploadCloudFiles(accountId, parentPathOrToken ?? null),
    deleteCloudItem: (accountId: number, itemPathOrToken: string): Promise<{ removed: true }> =>
        window.electronAPI.deleteCloudItem(accountId, itemPathOrToken),
    getCloudItemStatus: (accountId: number, itemPathOrToken: string): Promise<CloudItemStatus> =>
        window.electronAPI.getCloudItemStatus(accountId, itemPathOrToken),
    openCloudItem: (
        accountId: number,
        itemPathOrToken: string,
        fallbackName?: string | null,
        action?: 'open' | 'save',
    ): Promise<CloudOpenItemResult> =>
        window.electronAPI.openCloudItem(accountId, itemPathOrToken, fallbackName ?? null, action ?? 'open'),
    pickCloudAttachment: (
        accountId: number,
        itemPathOrToken: string,
        fallbackName?: string | null,
    ): Promise<PickedCloudAttachment> =>
        window.electronAPI.pickCloudAttachment(accountId, itemPathOrToken, fallbackName ?? null),
    createCloudShareLink: (accountId: number, itemPathOrToken: string): Promise<CloudShareLinkResult> =>
        window.electronAPI.createCloudShareLink(accountId, itemPathOrToken),
    syncAccount: (accountId: number): Promise<AccountSyncSummary> => window.electronAPI.syncAccount(accountId),
    getFolders: (accountId: number) => window.electronAPI.getFolders(accountId),
    getFolderMessages: (accountId: number, folderPath: string, limit?: number) =>
        window.electronAPI.getFolderMessages(accountId, folderPath, limit),
    searchMessages: (accountId: number, query: string, folderPath?: string | null, limit?: number) =>
        window.electronAPI.searchMessages(accountId, query, folderPath ?? null, limit),
    getMessage: (messageId: number) => window.electronAPI.getMessage(messageId),
    getMessageSource: (messageId: number) => window.electronAPI.getMessageSource(messageId),
    openMessageWindow: (messageId?: number) => window.electronAPI.openMessageWindow(messageId),
    openDebugWindow: () => window.electronAPI.openDebugWindow(),
    openRouteWindow: (route: string) => window.electronAPI.openRouteWindow(route),
    openComposeWindow: (draft?: ComposeDraftPayload | Record<string, unknown>) =>
        window.electronAPI.openComposeWindow(draft),
    getComposeDraft: (): Promise<ComposeDraftPayload | null> => window.electronAPI.getComposeDraft(),
    sendEmail: (payload: SendEmailPayload): Promise<SendEmailResult> => window.electronAPI.sendEmail(payload),
    sendEmailBackground: (payload: SendEmailPayload): Promise<SendEmailBackgroundResult> =>
        window.electronAPI.sendEmailBackground(payload),
    saveDraft: (payload: SaveDraftPayload): Promise<SaveDraftResult> => window.electronAPI.saveDraft(payload),
    pickComposeAttachments: (): Promise<PickedAttachment[]> => window.electronAPI.pickComposeAttachments(),
    getPathForFile: (file: File): string => window.electronAPI.getPathForFile(file),
    updateAppSettings: (patch: Partial<AppSettings>) => window.electronAPI.updateAppSettings(patch),
    createFolder: (accountId: number, folderPath: string) => window.electronAPI.createFolder(accountId, folderPath),
    updateFolderSettings: (
        accountId: number,
        folderPath: string,
        payload: { customName?: string | null; color?: string | null; type?: string | null },
    ) => window.electronAPI.updateFolderSettings(accountId, folderPath, payload),
    reorderCustomFolders: (accountId: number, orderedFolderPaths: string[]) =>
        window.electronAPI.reorderCustomFolders(accountId, orderedFolderPaths),
    deleteFolder: (accountId: number, folderPath: string) => window.electronAPI.deleteFolder(accountId, folderPath),
    openMessageAttachment: (messageId: number, attachmentIndex: number, action?: 'open' | 'save') =>
        window.electronAPI.openMessageAttachment(messageId, attachmentIndex, action),
    markMessageRead: (messageId: number) => window.electronAPI.markMessageRead(messageId),
    setMessageFlagged: (messageId: number, isFlagged: number) =>
        window.electronAPI.setMessageFlagged(messageId, isFlagged),
    setMessageTag: (messageId: number, tag: string | null) => window.electronAPI.setMessageTag(messageId, tag ?? null),
    moveMessage: (messageId: number, targetFolderPath: string) =>
        window.electronAPI.moveMessage(messageId, targetFolderPath),
    archiveMessage: (messageId: number) => window.electronAPI.archiveMessage(messageId),
    deleteMessage: (messageId: number) => window.electronAPI.deleteMessage(messageId),
    getMailFilters: (accountId: number): Promise<MailFilter[]> => window.electronAPI.getMailFilters(accountId),
    saveMailFilter: (accountId: number, payload: UpsertMailFilterPayload): Promise<MailFilter> =>
        window.electronAPI.saveMailFilter(accountId, payload),
    deleteMailFilter: (accountId: number, filterId: number): Promise<{ removed: boolean }> =>
        window.electronAPI.deleteMailFilter(accountId, filterId),
    runMailFilters: (
        accountId: number,
        payload?: { filterId?: number; folderPath?: string | null; limit?: number },
    ): Promise<MailFilterRunSummary> => window.electronAPI.runMailFilters(accountId, payload),
    syncDav: (accountId: number): Promise<DavSyncSummary> => window.electronAPI.syncDav(accountId),
    getContacts: (
        accountId: number,
        query?: string | null,
        limit?: number,
        addressBookId?: number | null,
    ): Promise<ContactItem[]> => window.electronAPI.getContacts(accountId, query ?? null, limit, addressBookId ?? null),
    getAddressBooks: (accountId: number): Promise<AddressBookItem[]> => window.electronAPI.getAddressBooks(accountId),
    addAddressBook: (accountId: number, name: string): Promise<AddressBookItem> =>
        window.electronAPI.addAddressBook(accountId, name),
    addContact: (accountId: number, payload: AddContactPayload): Promise<ContactItem> =>
        window.electronAPI.addContact(accountId, payload),
    updateContact: (contactId: number, payload: UpdateContactPayload): Promise<ContactItem> =>
        window.electronAPI.updateContact(contactId, payload),
    deleteContact: (contactId: number): Promise<{ removed: boolean }> => window.electronAPI.deleteContact(contactId),
    deleteAddressBook: (accountId: number, addressBookId: number): Promise<{ removed: boolean }> =>
        window.electronAPI.deleteAddressBook(accountId, addressBookId),
    exportContacts: (accountId: number, payload: ExportContactsPayload): Promise<ExportContactsResult> =>
        window.electronAPI.exportContacts(accountId, payload),
    getRecentRecipients: (accountId: number, query?: string | null, limit?: number): Promise<RecentRecipientItem[]> =>
        window.electronAPI.getRecentRecipients(accountId, query ?? null, limit),
    getCalendarEvents: (
        accountId: number,
        startIso?: string | null,
        endIso?: string | null,
        limit?: number,
    ): Promise<CalendarEventItem[]> =>
        window.electronAPI.getCalendarEvents(accountId, startIso ?? null, endIso ?? null, limit),
    addCalendarEvent: (accountId: number, payload: AddCalendarEventPayload): Promise<CalendarEventItem> =>
        window.electronAPI.addCalendarEvent(accountId, payload),
    updateCalendarEvent: (eventId: number, payload: UpdateCalendarEventPayload): Promise<CalendarEventItem> =>
        window.electronAPI.updateCalendarEvent(eventId, payload),
    deleteCalendarEvent: (eventId: number): Promise<{ removed: boolean }> =>
        window.electronAPI.deleteCalendarEvent(eventId),
    setMessageRead: (messageId: number, isRead: number): Promise<SetMessageReadResult> =>
        window.electronAPI.setMessageRead(messageId, isRead),
    getMessageBody: (messageId: number, requestId?: string): Promise<MessageBodyResult> =>
        window.electronAPI.getMessageBody(messageId, requestId),
    cancelMessageBody: (requestId: string): Promise<{ ok: true }> => window.electronAPI.cancelMessageBody(requestId),
    getMessageWindowTarget: (): Promise<number | null> => window.electronAPI.getMessageWindowTarget(),
    onMessageWindowTarget: (cb: (target: number | null) => void): (() => void) =>
        window.electronAPI.onMessageWindowTarget?.(cb) ?? noopUnsubscribe,
    onLinkHoverUrl: (cb: (url: string) => void): (() => void) =>
        window.electronAPI.onLinkHoverUrl?.(cb) ?? noopUnsubscribe,
};
