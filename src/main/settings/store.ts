import {app} from "electron";
import fs from "fs/promises";
import path from "path";

export type AppLanguage = "system" | "en-US" | "sv-SE";
export type AppTheme = "system" | "light" | "dark";
export type MailView = "side-list" | "top-table";
export type NavRailItemId = "email" | "cloud" | "contacts" | "calendar";

const DEFAULT_NAV_RAIL_ORDER: NavRailItemId[] = ["email", "contacts", "calendar", "cloud"];

export interface AppSettings {
    language: AppLanguage;
    theme: AppTheme;
    mailView: MailView;
    navRailOrder: NavRailItemId[];
    useNativeTitleBar: boolean;
    blockRemoteContent: boolean;
    remoteContentAllowlist: string[];
    minimizeToTray: boolean;
    syncIntervalMinutes: number;
    autoUpdateEnabled: boolean;
    developerMode: boolean;
}

export type AppSettingsPatch = Partial<AppSettings>;

const DEFAULT_APP_SETTINGS: AppSettings = {
    language: "system",
    theme: "system",
    mailView: "side-list",
    navRailOrder: [...DEFAULT_NAV_RAIL_ORDER],
    useNativeTitleBar: false,
    blockRemoteContent: true,
    remoteContentAllowlist: [],
    minimizeToTray: true,
    syncIntervalMinutes: 2,
    autoUpdateEnabled: true,
    developerMode: false,
};

let settingsCache: AppSettings = {...DEFAULT_APP_SETTINGS};
let hasLoaded = false;

function isNavRailItemId(value: unknown): value is NavRailItemId {
    return value === "email" || value === "cloud" || value === "contacts" || value === "calendar";
}

function normalizeNavRailOrder(input: unknown): NavRailItemId[] {
    const fromInput = Array.isArray(input) ? input : [];
    const normalized: NavRailItemId[] = [];
    for (const item of fromInput) {
        if (!isNavRailItemId(item)) continue;
        if (normalized.includes(item)) continue;
        normalized.push(item);
    }
    for (const item of DEFAULT_NAV_RAIL_ORDER) {
        if (!normalized.includes(item)) normalized.push(item);
    }
    return normalized;
}

function getSettingsPath(): string {
    return path.join(app.getPath("userData"), "settings.json");
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
    const languageRaw = input?.language;
    const language: AppLanguage =
        languageRaw === "en-US" || languageRaw === "sv-SE" || languageRaw === "system"
            ? languageRaw
            : DEFAULT_APP_SETTINGS.language;

    const themeRaw = input?.theme;
    const theme: AppTheme =
        themeRaw === "light" || themeRaw === "dark" || themeRaw === "system" ? themeRaw : DEFAULT_APP_SETTINGS.theme;
    const mailViewRaw = input?.mailView;
    const mailView: MailView =
        mailViewRaw === "top-table" || mailViewRaw === "side-list" ? mailViewRaw : DEFAULT_APP_SETTINGS.mailView;
    const navRailOrder = normalizeNavRailOrder(input?.navRailOrder);
    const blockRemoteContent =
        typeof input?.blockRemoteContent === "boolean" ? input.blockRemoteContent : DEFAULT_APP_SETTINGS.blockRemoteContent;
    const useNativeTitleBar =
        typeof input?.useNativeTitleBar === "boolean" ? input.useNativeTitleBar : DEFAULT_APP_SETTINGS.useNativeTitleBar;
    const remoteContentAllowlist = Array.isArray(input?.remoteContentAllowlist)
        ? [
            ...new Set(
                input.remoteContentAllowlist
                    .map((entry) =>
                        String(entry || "")
                            .trim()
                            .toLowerCase()
                    )
                    .filter((entry) => entry.length > 0)
                    .slice(0, 500)
            ),
        ]
        : DEFAULT_APP_SETTINGS.remoteContentAllowlist;

    const syncRaw = Number(input?.syncIntervalMinutes);
    const syncIntervalMinutes = Number.isFinite(syncRaw)
        ? Math.min(120, Math.max(1, Math.round(syncRaw)))
        : DEFAULT_APP_SETTINGS.syncIntervalMinutes;

    const minimizeToTray =
        typeof input?.minimizeToTray === "boolean" ? input.minimizeToTray : DEFAULT_APP_SETTINGS.minimizeToTray;
    const autoUpdateEnabled =
        typeof input?.autoUpdateEnabled === "boolean" ? input.autoUpdateEnabled : DEFAULT_APP_SETTINGS.autoUpdateEnabled;
    const developerMode =
        typeof input?.developerMode === "boolean" ? input.developerMode : DEFAULT_APP_SETTINGS.developerMode;

    return {
        language,
        theme,
        mailView,
        navRailOrder,
        useNativeTitleBar,
        blockRemoteContent,
        remoteContentAllowlist,
        minimizeToTray,
        syncIntervalMinutes,
        autoUpdateEnabled,
        developerMode,
    };
}

async function writeSettings(settings: AppSettings): Promise<void> {
    const filePath = getSettingsPath();
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export async function getAppSettings(): Promise<AppSettings> {
    if (hasLoaded) return settingsCache;
    hasLoaded = true;
    try {
        const raw = await fs.readFile(getSettingsPath(), "utf8");
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
    if (language === "system") return undefined;
    return language;
}

export function getSpellCheckerLanguages(language: AppLanguage): string[] {
    if (language === "sv-SE") return ["sv-SE", "en-US"];
    if (language === "en-US") return ["en-US", "sv-SE"];
    const locale = app.getLocale() || "en-US";
    if (locale.toLowerCase().startsWith("sv")) return ["sv-SE", "en-US"];
    return ["en-US", "sv-SE"];
}
