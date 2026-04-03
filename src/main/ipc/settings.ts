import {app, BrowserWindow, ipcMain} from 'electron';
import {type AppSettingsPatch, getAppSettings, updateAppSettings} from '../settings/store.js';

export function registerSettingsIpc(onSettingsUpdated: (settings: Awaited<ReturnType<typeof getAppSettings>>) => void): void {
    ipcMain.handle('get-app-settings', async () => {
        return await getAppSettings();
    });

    ipcMain.handle('update-app-settings', async (_event, patch: AppSettingsPatch) => {
        const settings = await updateAppSettings(patch);
        onSettingsUpdated(settings);
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('app-settings-updated', settings);
        }
        return settings;
    });

    ipcMain.handle('get-system-locale', async () => {
        return resolveSystemLocale();
    });
}

function resolveSystemLocale(): string {
    const envCandidates = [process.env.LC_TIME, process.env.LC_ALL, process.env.LANG]
        .map((value) => normalizeLocaleTag(value))
        .filter((value): value is string => Boolean(value));
    for (const candidate of envCandidates) {
        if (isValidLocale(candidate)) return candidate;
    }

    const preferred = app.getPreferredSystemLanguages?.() ?? [];
    for (const candidate of preferred) {
        const normalized = normalizeLocaleTag(candidate);
        if (normalized && isValidLocale(normalized)) return normalized;
    }

    const appLocale = normalizeLocaleTag(app.getLocale());
    if (appLocale && isValidLocale(appLocale)) return appLocale;

    const intlLocale = normalizeLocaleTag(Intl.DateTimeFormat().resolvedOptions().locale);
    if (intlLocale && isValidLocale(intlLocale)) return intlLocale;

    return 'en-US';
}

function normalizeLocaleTag(value?: string | null): string | null {
    if (!value) return null;
    const withoutEncoding = value.split('.')[0] || value;
    const withoutVariant = withoutEncoding.split('@')[0] || withoutEncoding;
    const normalized = withoutVariant.replace(/_/g, '-').trim();
    if (!normalized || normalized.toLowerCase() === 'c' || normalized.toLowerCase() === 'posix') {
        return null;
    }
    return normalized;
}

function isValidLocale(locale: string): boolean {
    try {
        new Intl.DateTimeFormat(locale);
        return true;
    } catch {
        return false;
    }
}
