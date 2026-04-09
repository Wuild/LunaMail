import {app} from 'electron';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type {AppLanguage, AppSettings, AppSettingsPatch, AppTheme, MailView} from '../../shared/ipcTypes.js';
import {DEFAULT_APP_SETTINGS, createDefaultAppSettings} from '../../shared/defaults.js';
import {
    normalizeNavRailOrder,
    normalizeSyncIntervalMinutes,
    parseAppLanguage,
    parseAppTheme,
    parseMailView,
} from '../../shared/settingsRules.js';

export type {AppLanguage, AppSettings, AppSettingsPatch, AppTheme, MailView} from '../../shared/ipcTypes.js';

let settingsCache: AppSettings = createDefaultAppSettings();
let hasLoaded = false;

function getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
    const parseBoolean = (value: unknown, fallback: boolean): boolean => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
            if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
        }
        return fallback;
    };
    const parseNullableBoolean = (value: unknown): boolean | null => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
            if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
        }
        return null;
    };
    const language: AppLanguage = parseAppLanguage(input?.language);
    const theme: AppTheme = parseAppTheme(input?.theme);
    const mailView: MailView = parseMailView(input?.mailView);
    const navRailOrder = normalizeNavRailOrder(input?.navRailOrder);
    const blockRemoteContent = parseBoolean(input?.blockRemoteContent, DEFAULT_APP_SETTINGS.blockRemoteContent);
    const remoteContentAllowlist = Array.isArray(input?.remoteContentAllowlist)
        ? [
            ...new Set(
                input.remoteContentAllowlist
                    .map((entry) =>
                        String(entry || '')
                            .trim()
                            .toLowerCase(),
                    )
                    .filter((entry) => entry.length > 0)
                    .slice(0, 500),
            ),
        ]
        : DEFAULT_APP_SETTINGS.remoteContentAllowlist;

    const syncIntervalMinutes = normalizeSyncIntervalMinutes(input?.syncIntervalMinutes);

    const minimizeToTray = parseBoolean(input?.minimizeToTray, DEFAULT_APP_SETTINGS.minimizeToTray);
    const useNativeTitleBar = parseBoolean(input?.useNativeTitleBar, DEFAULT_APP_SETTINGS.useNativeTitleBar);
    const hardwareAcceleration = parseBoolean(input?.hardwareAcceleration, DEFAULT_APP_SETTINGS.hardwareAcceleration);
    const pendingHardwareAcceleration = parseNullableBoolean(input?.pendingHardwareAcceleration);
    const pendingUseNativeTitleBar = parseNullableBoolean(input?.pendingUseNativeTitleBar);
    const spellcheckEnabled = parseBoolean(input?.spellcheckEnabled, DEFAULT_APP_SETTINGS.spellcheckEnabled);
    const playNotificationSound = parseBoolean(input?.playNotificationSound, DEFAULT_APP_SETTINGS.playNotificationSound);
    const showUnreadInTitleBar = parseBoolean(input?.showUnreadInTitleBar, DEFAULT_APP_SETTINGS.showUnreadInTitleBar);
    const autoUpdateEnabled = parseBoolean(input?.autoUpdateEnabled, DEFAULT_APP_SETTINGS.autoUpdateEnabled);
    const developerMode = parseBoolean(input?.developerMode, DEFAULT_APP_SETTINGS.developerMode);
    const developerShowRouteOverlay = parseBoolean(
        input?.developerShowRouteOverlay,
        DEFAULT_APP_SETTINGS.developerShowRouteOverlay,
    );
    const developerShowSendNotifications = parseBoolean(
        input?.developerShowSendNotifications,
        DEFAULT_APP_SETTINGS.developerShowSendNotifications,
    );
    const developerShowSystemFailureNotifications = parseBoolean(
        input?.developerShowSystemFailureNotifications,
        DEFAULT_APP_SETTINGS.developerShowSystemFailureNotifications,
    );
    const developerShowDebugNavItem = parseBoolean(
        input?.developerShowDebugNavItem,
        DEFAULT_APP_SETTINGS.developerShowDebugNavItem,
    );

    return {
        language,
        theme,
        mailView,
        navRailOrder,
        hardwareAcceleration,
        pendingHardwareAcceleration,
        spellcheckEnabled,
        playNotificationSound,
        showUnreadInTitleBar,
        blockRemoteContent,
        remoteContentAllowlist,
        minimizeToTray,
        useNativeTitleBar,
        pendingUseNativeTitleBar,
        syncIntervalMinutes,
        autoUpdateEnabled,
        developerMode,
        developerShowRouteOverlay,
        developerShowSendNotifications,
        developerShowSystemFailureNotifications,
        developerShowDebugNavItem,
    };
}

function applyPendingRestartSettings(settings: AppSettings): {settings: AppSettings; changed: boolean} {
    let changed = false;
    let next = settings;
    if (settings.pendingHardwareAcceleration !== null) {
        changed = true;
        next = {
            ...next,
            hardwareAcceleration: settings.pendingHardwareAcceleration,
            pendingHardwareAcceleration: null,
        };
    }
    if (settings.pendingUseNativeTitleBar !== null) {
        changed = true;
        next = {
            ...next,
            useNativeTitleBar: settings.pendingUseNativeTitleBar,
            pendingUseNativeTitleBar: null,
        };
    }
    return {settings: next, changed};
}

async function writeSettings(settings: AppSettings): Promise<void> {
    const filePath = getSettingsPath();
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

export async function getAppSettings(): Promise<AppSettings> {
    if (hasLoaded) return settingsCache;
    hasLoaded = true;
    try {
        const raw = await fs.readFile(getSettingsPath(), 'utf8');
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        settingsCache = sanitizeSettings(parsed);
    } catch {
        settingsCache = createDefaultAppSettings();
        await writeSettings(settingsCache).catch(() => undefined);
    }
    return settingsCache;
}

export function getAppSettingsSync(): AppSettings {
    return settingsCache;
}

export function getAppSettingsBootSnapshotSync(): AppSettings {
    try {
        const raw = fsSync.readFileSync(getSettingsPath(), 'utf8');
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        const sanitized = sanitizeSettings(parsed);
        const {settings, changed} = applyPendingRestartSettings(sanitized);
        settingsCache = settings;
        if (changed) {
            const filePath = getSettingsPath();
            fsSync.mkdirSync(path.dirname(filePath), {recursive: true});
            fsSync.writeFileSync(filePath, `${JSON.stringify(settingsCache, null, 2)}\n`, 'utf8');
        }
        hasLoaded = true;
        return settingsCache;
    } catch {
        return settingsCache;
    }
}

export async function updateAppSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    const current = await getAppSettings();
    settingsCache = sanitizeSettings({
        ...current,
        ...patch,
    });
    await writeSettings(settingsCache);
    return settingsCache;
}

export function resolveLocaleTag(language: AppLanguage): string | undefined {
    if (language === 'system') return undefined;
    return language;
}

export function getSpellCheckerLanguages(language: AppLanguage): string[] {
    if (language === 'sv-SE') return ['sv-SE', 'en-US'];
    if (language === 'en-US') return ['en-US', 'sv-SE'];
    const locale = app.getLocale() || 'en-US';
    if (locale.toLowerCase().startsWith('sv')) return ['sv-SE', 'en-US'];
    return ['en-US', 'sv-SE'];
}
