import type {AppSettings} from './ipcTypes';

export const DEFAULT_APP_SETTINGS: AppSettings = {
    language: 'system',
    theme: 'system',
    mailView: 'side-list',
    navRailOrder: ['email', 'contacts', 'calendar', 'cloud'],
    hardwareAcceleration: true,
    pendingHardwareAcceleration: null,
    spellcheckEnabled: true,
    playNotificationSound: true,
    showUnreadInTitleBar: true,
    useNativeTitleBar: false,
    pendingUseNativeTitleBar: null,
    blockRemoteContent: true,
    remoteContentAllowlist: [],
    minimizeToTray: true,
    syncIntervalMinutes: 2,
    autoUpdateEnabled: true,
    developerMode: false,
    developerShowRouteOverlay: true,
    developerShowSendNotifications: true,
    developerShowSystemFailureNotifications: true,
    developerShowDebugNavItem: false,
};

export function createDefaultAppSettings(): AppSettings {
    return {
        ...DEFAULT_APP_SETTINGS,
        navRailOrder: [...DEFAULT_APP_SETTINGS.navRailOrder],
        remoteContentAllowlist: [...DEFAULT_APP_SETTINGS.remoteContentAllowlist],
    };
}
