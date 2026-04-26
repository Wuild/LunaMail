import {DEFAULT_APP_SETTINGS} from './defaults';
import type {AppLanguage, AppTheme, MailListSort, MailView, NavRailItemId} from './ipcTypes';

export const APP_LANGUAGE_VALUES = ['system', 'en-US'] as const;
export const APP_THEME_VALUES = ['system', 'light', 'dark'] as const;
export const MAIL_VIEW_VALUES = ['side-list', 'top-table'] as const;
export const MAIL_LIST_SORT_VALUES = ['arrived_desc', 'unread_then_arrived_desc'] as const;
export const NAV_RAIL_ITEM_VALUES = ['email', 'contacts', 'calendar', 'cloud'] as const;

export const SYNC_INTERVAL_MINUTES_MIN = 1;
export const SYNC_INTERVAL_MINUTES_MAX = 120;
export const ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MIN = 1;
export const ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MAX = 15;
export const ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS_MIN = 1;
export const ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS_MAX = 6;
export const DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES = 15;
export const DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS = 1;
export const ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MIN = 1;
export const ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MAX = 120;
export const ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MIN = 1;
export const ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MAX = 120;
export const DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES = 15;
export const DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES = 15;

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

export function parseMailListSort(
	value: unknown,
	fallback: MailListSort = DEFAULT_APP_SETTINGS.mailListSort,
): MailListSort {
	return typeof value === 'string' && MAIL_LIST_SORT_VALUES.includes(value as MailListSort)
		? (value as MailListSort)
		: fallback;
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

export function normalizeAccountEmailSyncIntervalMinutes(
	value: unknown,
	fallback: number = DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
): number {
	const normalizedFallback = Number.isFinite(Number(fallback))
		? Math.min(
				ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MAX,
				Math.max(ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MIN, Math.round(Number(fallback))),
			)
		: DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return normalizedFallback;
	return Math.min(
		ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MAX,
		Math.max(ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES_MIN, Math.round(parsed)),
	);
}

export function normalizeAccountEmailSyncLookbackMonths(
	value: unknown,
	fallback: number | null = DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
): number | null {
	const normalizeMonthsValue = (candidate: unknown): number | null => {
		if (candidate === null || candidate === '') return null;
		const parsed = Number(candidate);
		if (!Number.isFinite(parsed)) return null;
		const rounded = Math.round(parsed);
		if (rounded <= 0) return null;
		return Math.min(ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS_MAX, Math.max(ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS_MIN, rounded));
	};
	const normalizedFallback = normalizeMonthsValue(fallback);
	if (value === undefined) return normalizedFallback;
	if (value === null || value === '') return null;
	const parsed = normalizeMonthsValue(value);
	return parsed ?? normalizedFallback;
}

export function normalizeAccountContactsSyncIntervalMinutes(
	value: unknown,
	fallback: number = DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
): number {
	const normalizedFallback = Number.isFinite(Number(fallback))
		? Math.min(
				ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MAX,
				Math.max(ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MIN, Math.round(Number(fallback))),
			)
		: DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return normalizedFallback;
	return Math.min(
		ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MAX,
		Math.max(ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES_MIN, Math.round(parsed)),
	);
}

export function normalizeAccountCalendarSyncIntervalMinutes(
	value: unknown,
	fallback: number = DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
): number {
	const normalizedFallback = Number.isFinite(Number(fallback))
		? Math.min(
				ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MAX,
				Math.max(ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MIN, Math.round(Number(fallback))),
			)
		: DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return normalizedFallback;
	return Math.min(
		ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MAX,
		Math.max(ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES_MIN, Math.round(parsed)),
	);
}
