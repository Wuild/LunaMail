import type {AppLanguage, AppTheme, MailListSort, MailView} from './ipcTypes';

type LabeledOption<T extends string> = {
	value: T;
	label: string;
};

export const APP_LANGUAGE_OPTIONS: ReadonlyArray<LabeledOption<AppLanguage>> = [
	{value: 'system', label: 'System default'},
	{value: 'en-US', label: 'English (US)'},
	{value: 'sv-SE', label: 'Swedish (Sweden)'},
];

export const APP_THEME_OPTIONS: ReadonlyArray<LabeledOption<AppTheme>> = [
	{value: 'light', label: 'Light'},
	{value: 'dark', label: 'Dark'},
	{value: 'system', label: 'System'},
];

export const MAIL_VIEW_OPTIONS: ReadonlyArray<LabeledOption<MailView>> = [
	{value: 'side-list', label: 'Side List'},
	{value: 'top-table', label: 'Top Table'},
];
export const MAIL_LIST_SORT_OPTIONS: ReadonlyArray<LabeledOption<MailListSort>> = [
	{value: 'unread_then_arrived_desc', label: 'Unread first, then newest'},
	{value: 'arrived_desc', label: 'Newest first'},
];

export const SYNC_INTERVAL_OPTIONS: ReadonlyArray<number> = [1, 2, 5, 10, 15, 30, 60];
export const ACCOUNT_EMAIL_SYNC_INTERVAL_OPTIONS: ReadonlyArray<number> = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
export const ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTH_OPTIONS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6];
export const ACCOUNT_CONTACTS_SYNC_INTERVAL_OPTIONS: ReadonlyArray<number> = [1, 2, 5, 10, 15, 30, 45, 60, 90, 120];
export const ACCOUNT_CALENDAR_SYNC_INTERVAL_OPTIONS: ReadonlyArray<number> = [1, 2, 5, 10, 15, 30, 45, 60, 90, 120];
