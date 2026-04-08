import {app} from 'electron';
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
    const autoUpdateEnabled = parseBoolean(input?.autoUpdateEnabled, DEFAULT_APP_SETTINGS.autoUpdateEnabled);
    const developerMode = parseBoolean(input?.developerMode, DEFAULT_APP_SETTINGS.developerMode);

    return {
        language,
        theme,
        mailView,
        navRailOrder,
        blockRemoteContent,
        remoteContentAllowlist,
        minimizeToTray,
        useNativeTitleBar,
        syncIntervalMinutes,
        autoUpdateEnabled,
        developerMode,
    };
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
