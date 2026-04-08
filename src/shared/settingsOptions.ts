import type {AppLanguage, AppTheme, MailView} from './ipcTypes';

type LabeledOption<T extends string> = {
    value: T;
    label: string;
};

export const APP_LANGUAGE_OPTIONS: ReadonlyArray<LabeledOption<AppLanguage>> = [
    {value: 'system', label: 'System default'},
    {value: 'en-US', label: 'English (US)'},
    {value: 'sv-SE', label: 'Swedish'},
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

export const SYNC_INTERVAL_OPTIONS: ReadonlyArray<number> = [1, 2, 5, 10, 15, 30, 60];
