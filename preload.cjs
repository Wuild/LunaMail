const {contextBridge, ipcRenderer, webUtils} = require('electron');
const api = {
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    addAccount: (account) => ipcRenderer.invoke('add-account', account),
    updateAccount: (accountId, payload) => ipcRenderer.invoke('update-account', accountId, payload),
    deleteAccount: (accountId) => ipcRenderer.invoke('delete-account', accountId),
    getCloudAccounts: () => ipcRenderer.invoke('get-cloud-accounts'),
    addCloudAccount: (payload) => ipcRenderer.invoke('add-cloud-account', payload),
    updateCloudAccount: (accountId, payload) => ipcRenderer.invoke('update-cloud-account', accountId, payload),
    deleteCloudAccount: (accountId) => ipcRenderer.invoke('delete-cloud-account', accountId),
    linkCloudOAuth: (provider, payload) => ipcRenderer.invoke('link-cloud-oauth', provider, payload),
    listCloudItems: (accountId, pathOrToken) => ipcRenderer.invoke('list-cloud-items', accountId, pathOrToken ?? null),
    getCloudStorageUsage: (accountId) => ipcRenderer.invoke('get-cloud-storage-usage', accountId),
    createCloudFolder: (accountId, parentPathOrToken, folderName) => ipcRenderer.invoke('create-cloud-folder', accountId, parentPathOrToken ?? null, folderName),
    deleteCloudItem: (accountId, itemPathOrToken) => ipcRenderer.invoke('delete-cloud-item', accountId, itemPathOrToken),
    getCloudItemStatus: (accountId, itemPathOrToken) => ipcRenderer.invoke('get-cloud-item-status', accountId, itemPathOrToken),
    createCloudShareLink: (accountId, itemPathOrToken) => ipcRenderer.invoke('create-cloud-share-link', accountId, itemPathOrToken),
    uploadCloudFiles: (accountId, parentPathOrToken) => ipcRenderer.invoke('upload-cloud-files', accountId, parentPathOrToken ?? null),
    openCloudItem: (accountId, itemPathOrToken, fallbackName, action) => ipcRenderer.invoke('open-cloud-item', accountId, itemPathOrToken, fallbackName ?? null, action ?? 'open'),
    pickCloudAttachment: (accountId, itemPathOrToken, fallbackName) => ipcRenderer.invoke('pick-cloud-attachment', accountId, itemPathOrToken, fallbackName ?? null),
    getUnreadCount: () => ipcRenderer.invoke('get-unread-count'),
    discoverMailSettings: (email) => ipcRenderer.invoke('discover-mail-settings', email),
    verifyCredentials: (payload) => ipcRenderer.invoke('verify-credentials', payload),
    startMailOAuth: (payload) => ipcRenderer.invoke('start-mail-oauth', payload),
    syncAccount: (accountId) => ipcRenderer.invoke('sync-account', accountId),
    getFolders: (accountId) => ipcRenderer.invoke('get-folders', accountId),
    createFolder: (accountId, folderPath) => ipcRenderer.invoke('create-folder', accountId, folderPath),
    deleteFolder: (accountId, folderPath) => ipcRenderer.invoke('delete-folder', accountId, folderPath),
    updateFolderSettings: (accountId, folderPath, payload) => ipcRenderer.invoke('update-folder-settings', accountId, folderPath, payload),
    reorderCustomFolders: (accountId, orderedFolderPaths) => ipcRenderer.invoke('reorder-custom-folders', accountId, orderedFolderPaths),
    discoverDav: (accountId) => ipcRenderer.invoke('discover-dav', accountId),
    discoverDavPreview: (payload) => ipcRenderer.invoke('discover-dav-preview', payload),
    syncDav: (accountId) => ipcRenderer.invoke('sync-dav', accountId),
    getContacts: (accountId, query, limit, addressBookId) => ipcRenderer.invoke('get-contacts', accountId, query ?? null, limit, addressBookId ?? null),
    getRecentRecipients: (accountId, query, limit) => ipcRenderer.invoke('get-recent-recipients', accountId, query ?? null, limit),
    getAddressBooks: (accountId) => ipcRenderer.invoke('get-address-books', accountId),
    addAddressBook: (accountId, name) => ipcRenderer.invoke('add-address-book', accountId, name),
    deleteAddressBook: (accountId, addressBookId) => ipcRenderer.invoke('delete-address-book', accountId, addressBookId),
    addContact: (accountId, payload) => ipcRenderer.invoke('add-contact', accountId, payload),
    updateContact: (contactId, payload) => ipcRenderer.invoke('update-contact', contactId, payload),
    deleteContact: (contactId) => ipcRenderer.invoke('delete-contact', contactId),
    exportContacts: (accountId, payload) => ipcRenderer.invoke('export-contacts', accountId, payload),
    getCalendarEvents: (accountId, startIso, endIso, limit) => ipcRenderer.invoke('get-calendar-events', accountId, startIso ?? null, endIso ?? null, limit),
    addCalendarEvent: (accountId, payload) => ipcRenderer.invoke('add-calendar-event', accountId, payload),
    updateCalendarEvent: (eventId, payload) => ipcRenderer.invoke('update-calendar-event', eventId, payload),
    deleteCalendarEvent: (eventId) => ipcRenderer.invoke('delete-calendar-event', eventId),
    getFolderMessages: (accountId, folderPath, limit) => ipcRenderer.invoke('get-folder-messages', accountId, folderPath, limit),
    getFolderThreads: (accountId, folderPath, limit) => ipcRenderer.invoke('get-folder-threads', accountId, folderPath, limit),
    getMailFilters: (accountId) => ipcRenderer.invoke('get-mail-filters', accountId),
    saveMailFilter: (accountId, payload) => ipcRenderer.invoke('save-mail-filter', accountId, payload),
    deleteMailFilter: (accountId, filterId) => ipcRenderer.invoke('delete-mail-filter', accountId, filterId),
    runMailFilters: (accountId, payload) => ipcRenderer.invoke('run-mail-filters', accountId, payload ?? null),
    searchMessages: (accountId, query, folderPath, limit) => ipcRenderer.invoke('search-messages', accountId, query, folderPath ?? null, limit),
    getMessage: (messageId) => ipcRenderer.invoke('get-message', messageId),
    getSenderAvatar: (fromAddress) => ipcRenderer.invoke('get-sender-avatar', fromAddress ?? null),
    getMessageBody: (messageId, requestId) => ipcRenderer.invoke('get-message-body', messageId, requestId),
    getMessageSource: (messageId) => ipcRenderer.invoke('get-message-source', messageId),
    openMessageAttachment: (messageId, attachmentIndex, action) => ipcRenderer.invoke('open-message-attachment', messageId, attachmentIndex, action ?? 'prompt'),
    cancelMessageBody: (requestId) => ipcRenderer.invoke('cancel-message-body', requestId),
    setMessageRead: (messageId, isRead) => ipcRenderer.invoke('set-message-read', messageId, isRead),
    markMessageRead: (messageId) => ipcRenderer.invoke('mark-message-read', messageId),
    markMessageUnread: (messageId) => ipcRenderer.invoke('mark-message-unread', messageId),
    setMessageFlagged: (messageId, isFlagged) => ipcRenderer.invoke('set-message-flagged', messageId, isFlagged),
    setMessageTag: (messageId, tag) => ipcRenderer.invoke('set-message-tag', messageId, tag ?? null),
    moveMessage: (messageId, targetFolderPath) => ipcRenderer.invoke('move-message', messageId, targetFolderPath),
    archiveMessage: (messageId) => ipcRenderer.invoke('archive-message', messageId),
    deleteMessage: (messageId) => ipcRenderer.invoke('delete-message', messageId),
    sendEmail: (payload) => ipcRenderer.invoke('send-email', payload),
    sendEmailBackground: (payload) => ipcRenderer.invoke('send-email-background', payload),
    saveDraft: (payload) => ipcRenderer.invoke('save-draft', payload),
    openAddAccountWindow: () => ipcRenderer.invoke('open-add-account-window'),
    openComposeWindow: (draft) => ipcRenderer.invoke('open-compose-window', draft ?? null),
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    getWindowControlsCapabilities: () => ipcRenderer.invoke('window-controls-capabilities'),
    openDevTools: () => ipcRenderer.invoke('window-open-dev-tools'),
    restartApp: () => ipcRenderer.invoke('app-restart'),
    openMessageWindow: (messageId) => ipcRenderer.invoke('open-message-window', messageId ?? null),
    openDebugWindow: () => ipcRenderer.invoke('open-debug-window'),
    openRouteWindow: (route) => ipcRenderer.invoke('open-route-window', route),
    getDebugLogs: (limit) => ipcRenderer.invoke('get-debug-logs', limit),
    clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs'),
    getComposeDraft: () => ipcRenderer.invoke('get-compose-draft'),
    getMessageWindowTarget: () => ipcRenderer.invoke('get-message-window-target'),
    getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
    getSystemLocale: () => ipcRenderer.invoke('get-system-locale'),
    updateAppSettings: (patch) => ipcRenderer.invoke('update-app-settings', patch),
    pickComposeAttachments: () => ipcRenderer.invoke('pick-compose-attachments'),
    getPathForFile: (file) => {
        try {
            return String(webUtils.getPathForFile(file) || '');
        }
        catch {
            return '';
        }
    },
    getAutoUpdateState: () => ipcRenderer.invoke('get-auto-update-state'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
    devShowNotification: (payload) => ipcRenderer.invoke('dev-show-notification', payload ?? null),
    devPlayNotificationSound: () => ipcRenderer.invoke('dev-play-notification-sound'),
    devOpenUpdaterWindow: () => ipcRenderer.invoke('dev-open-updater-window'),
    setDefaultEmailClient: () => ipcRenderer.invoke('set-default-email-client'),
    getDefaultEmailClientStatus: () => ipcRenderer.invoke('get-default-email-client-status'),
    onAccountAdded: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('account-added', listener);
        return () => ipcRenderer.removeListener('account-added', listener);
    },
    onAccountUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('account-updated', listener);
        return () => ipcRenderer.removeListener('account-updated', listener);
    },
    onAccountDeleted: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('account-deleted', listener);
        return () => ipcRenderer.removeListener('account-deleted', listener);
    },
    onCloudAccountsUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('cloud-accounts-updated', listener);
        return () => ipcRenderer.removeListener('cloud-accounts-updated', listener);
    },
    onUnreadCountUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('unread-count-updated', listener);
        return () => ipcRenderer.removeListener('unread-count-updated', listener);
    },
    onMessageReadUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('message-read-updated', listener);
        return () => ipcRenderer.removeListener('message-read-updated', listener);
    },
    onAccountSyncStatus: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('account-sync-status', listener);
        return () => ipcRenderer.removeListener('account-sync-status', listener);
    },
    onComposeDraft: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('compose-draft', listener);
        return () => ipcRenderer.removeListener('compose-draft', listener);
    },
    onSendEmailBackgroundStatus: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('send-email-background-status', listener);
        return () => ipcRenderer.removeListener('send-email-background-status', listener);
    },
    onAppSettingsUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('app-settings-updated', listener);
        return () => ipcRenderer.removeListener('app-settings-updated', listener);
    },
    onOpenMessageTarget: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('open-message-target', listener);
        return () => ipcRenderer.removeListener('open-message-target', listener);
    },
    onMessageWindowTarget: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('message-window-target', listener);
        return () => ipcRenderer.removeListener('message-window-target', listener);
    },
    onDebugLog: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('debug-log', listener);
        return () => ipcRenderer.removeListener('debug-log', listener);
    },
    onAutoUpdateStatus: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('auto-update-status', listener);
        return () => ipcRenderer.removeListener('auto-update-status', listener);
    },
    onGlobalError: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('global-error', listener);
        return () => ipcRenderer.removeListener('global-error', listener);
    },
    onLinkHoverUrl: (callback) => {
        const listener = (_event, payload) => callback(payload || '');
        ipcRenderer.on('link-hover-url', listener);
        return () => ipcRenderer.removeListener('link-hover-url', listener);
    },
};
contextBridge.exposeInMainWorld('electronAPI', api);
