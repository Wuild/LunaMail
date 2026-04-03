const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  addAccount: (account) => ipcRenderer.invoke('add-account', account),
  updateAccount: (accountId, payload) => ipcRenderer.invoke('update-account', accountId, payload),
  deleteAccount: (accountId) => ipcRenderer.invoke('delete-account', accountId),
  discoverMailSettings: (email) => ipcRenderer.invoke('discover-mail-settings', email),
  verifyCredentials: (payload) => ipcRenderer.invoke('verify-credentials', payload),
  syncAccount: (accountId) => ipcRenderer.invoke('sync-account', accountId),
  getFolders: (accountId) => ipcRenderer.invoke('get-folders', accountId),
  createFolder: (accountId, folderPath) => ipcRenderer.invoke('create-folder', accountId, folderPath),
  deleteFolder: (accountId, folderPath) => ipcRenderer.invoke('delete-folder', accountId, folderPath),
  updateFolderSettings: (accountId, folderPath, payload) => ipcRenderer.invoke('update-folder-settings', accountId, folderPath, payload),
  getFolderMessages: (accountId, folderPath, limit) => ipcRenderer.invoke('get-folder-messages', accountId, folderPath, limit),
  searchMessages: (accountId, query, folderPath, limit) => ipcRenderer.invoke('search-messages', accountId, query, folderPath ?? null, limit),
  getMessage: (messageId) => ipcRenderer.invoke('get-message', messageId),
  getMessageBody: (messageId, requestId) => ipcRenderer.invoke('get-message-body', messageId, requestId),
  openMessageAttachment: (messageId, attachmentIndex, action) => ipcRenderer.invoke('open-message-attachment', messageId, attachmentIndex, action ?? 'prompt'),
  cancelMessageBody: (requestId) => ipcRenderer.invoke('cancel-message-body', requestId),
  setMessageRead: (messageId, isRead) => ipcRenderer.invoke('set-message-read', messageId, isRead),
  setMessageFlagged: (messageId, isFlagged) => ipcRenderer.invoke('set-message-flagged', messageId, isFlagged),
  moveMessage: (messageId, targetFolderPath) => ipcRenderer.invoke('move-message', messageId, targetFolderPath),
  deleteMessage: (messageId) => ipcRenderer.invoke('delete-message', messageId),
  sendEmail: (payload) => ipcRenderer.invoke('send-email', payload),
  saveDraft: (payload) => ipcRenderer.invoke('save-draft', payload),
  openAddAccountWindow: () => ipcRenderer.invoke('open-add-account-window'),
  openComposeWindow: (draft) => ipcRenderer.invoke('open-compose-window', draft ?? null),
  openAppSettingsWindow: () => ipcRenderer.invoke('open-app-settings-window'),
  openSupportWindow: () => ipcRenderer.invoke('open-support-window'),
  openDebugWindow: () => ipcRenderer.invoke('open-debug-window'),
  openMessageWindow: (messageId) => ipcRenderer.invoke('open-message-window', messageId ?? null),
  getDebugLogs: (limit) => ipcRenderer.invoke('get-debug-logs', limit),
  clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs'),
  getComposeDraft: () => ipcRenderer.invoke('get-compose-draft'),
  getMessageWindowTarget: () => ipcRenderer.invoke('get-message-window-target'),
  openAccountSettingsWindow: (accountId) => ipcRenderer.invoke('open-account-settings-window', accountId ?? null),
  getAccountSettingsTarget: () => ipcRenderer.invoke('get-account-settings-target'),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  getSystemLocale: () => ipcRenderer.invoke('get-system-locale'),
  updateAppSettings: (patch) => ipcRenderer.invoke('update-app-settings', patch),
  pickComposeAttachments: () => ipcRenderer.invoke('pick-compose-attachments'),
  getAutoUpdateState: () => ipcRenderer.invoke('get-auto-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
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
  onAccountSettingsTarget: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('account-settings-target', listener);
    return () => ipcRenderer.removeListener('account-settings-target', listener);
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
  // More to be added as we progress
});
