import {app} from 'electron';
import fs from 'fs/promises';
import path from 'path';

export type AppLanguage = 'system' | 'en-US' | 'sv-SE';
export type AppTheme = 'system' | 'light' | 'dark';

export interface AppSettings {
    language: AppLanguage;
    theme: AppTheme;
    minimizeToTray: boolean;
    syncIntervalMinutes: number;
}

export type AppSettingsPatch = Partial<AppSettings>;

const DEFAULT_APP_SETTINGS: AppSettings = {
    language: 'system',
    theme: 'system',
    minimizeToTray: true,
    syncIntervalMinutes: 2,
};

let settingsCache: AppSettings = {...DEFAULT_APP_SETTINGS};
let hasLoaded = false;

function getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
    const languageRaw = input?.language;
    const language: AppLanguage =
        languageRaw === 'en-US' || languageRaw === 'sv-SE' || languageRaw === 'system'
            ? languageRaw
            : DEFAULT_APP_SETTINGS.language;

    const themeRaw = input?.theme;
    const theme: AppTheme =
        themeRaw === 'light' || themeRaw === 'dark' || themeRaw === 'system'
            ? themeRaw
            : DEFAULT_APP_SETTINGS.theme;

    const syncRaw = Number(input?.syncIntervalMinutes);
    const syncIntervalMinutes = Number.isFinite(syncRaw)
        ? Math.min(120, Math.max(1, Math.round(syncRaw)))
        : DEFAULT_APP_SETTINGS.syncIntervalMinutes;

    const minimizeToTray =
        typeof input?.minimizeToTray === 'boolean'
            ? input.minimizeToTray
            : DEFAULT_APP_SETTINGS.minimizeToTray;

    return {
        language,
        theme,
        minimizeToTray,
        syncIntervalMinutes,
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
        settingsCache = {...DEFAULT_APP_SETTINGS};
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
