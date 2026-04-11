import {DEFAULT_APP_SETTINGS} from './defaults.js';
import type {AppLanguage, AppTheme, MailView, NavRailItemId} from './ipcTypes';

export const APP_LANGUAGE_VALUES = ['system', 'en-US', 'sv-SE'] as const;
export const APP_THEME_VALUES = ['system', 'light', 'dark'] as const;
export const MAIL_VIEW_VALUES = ['side-list', 'top-table'] as const;
export const NAV_RAIL_ITEM_VALUES = ['email', 'contacts', 'calendar', 'cloud'] as const;

export const SYNC_INTERVAL_MINUTES_MIN = 1;
export const SYNC_INTERVAL_MINUTES_MAX = 120;

export function parseAppLanguage(value: unknown, fallback: AppLanguage = DEFAULT_APP_SETTINGS.language): AppLanguage {
    return typeof value === 'string' && APP_LANGUAGE_VALUES.includes(value as AppLanguage)
        ? (value as AppLanguage)
        : fallback;
}

export function parseAppTheme(value: unknown, fallback: AppTheme = DEFAULT_APP_SETTINGS.theme): AppTheme {
    return typeof value === 'string' && APP_THEME_VALUES.includes(value as AppTheme) ? (value as AppTheme) : fallback;
}

export function parseMailView(value: unknown, fallback: MailView = DEFAULT_APP_SETTINGS.mailView): MailView {
    return typeof value === 'string' && MAIL_VIEW_VALUES.includes(value as MailView) ? (value as MailView) : fallback;
}

export function normalizeNavRailOrder(
    value: unknown,
    fallback: NavRailItemId[] = DEFAULT_APP_SETTINGS.navRailOrder,
): NavRailItemId[] {
    const source = Array.isArray(value) ? value : [];
    const normalized: NavRailItemId[] = [];
    for (const item of source) {
        if (typeof item !== 'string') continue;
        if (!NAV_RAIL_ITEM_VALUES.includes(item as NavRailItemId)) continue;
        const typed = item as NavRailItemId;
        if (normalized.includes(typed)) continue;
        normalized.push(typed);
    }
    const fallbackOrder = Array.isArray(fallback) && fallback.length > 0 ? fallback : DEFAULT_APP_SETTINGS.navRailOrder;
    for (const item of fallbackOrder) {
        if (!normalized.includes(item)) normalized.push(item);
    }
    return normalized;
}

export function normalizeSyncIntervalMinutes(
    value: unknown,
    fallback: number = DEFAULT_APP_SETTINGS.syncIntervalMinutes,
): number {
    const normalizedFallback = Number.isFinite(Number(fallback))
        ? Math.min(SYNC_INTERVAL_MINUTES_MAX, Math.max(SYNC_INTERVAL_MINUTES_MIN, Math.round(Number(fallback))))
        : DEFAULT_APP_SETTINGS.syncIntervalMinutes;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return normalizedFallback;
    return Math.min(SYNC_INTERVAL_MINUTES_MAX, Math.max(SYNC_INTERVAL_MINUTES_MIN, Math.round(parsed)));
}
