export type AppLanguage = 'system' | 'en-US' | 'sv-SE';
export type AppTheme = 'system' | 'light' | 'dark';
export type MailView = 'side-list' | 'top-table';

export interface AppSettings {
    language: AppLanguage;
    theme: AppTheme;
    mailView: MailView;
    blockRemoteContent: boolean;
    remoteContentAllowlist: string[];
    minimizeToTray: boolean;
    syncIntervalMinutes: number;
    autoUpdateEnabled: boolean;
    developerMode: boolean;
}

export type AppSettingsPatch = Partial<AppSettings>;

export type AutoUpdatePhase =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';

export interface AutoUpdateState {
    enabled: boolean;
    phase: AutoUpdatePhase;
    currentVersion: string;
    latestVersion: string | null;
    downloadedVersion: string | null;
    percent: number | null;
    transferred: number | null;
    total: number | null;
    message: string | null;
}

export type MailFilterMatchMode = 'all' | 'any' | 'all_messages';
export type MailFilterField = 'subject' | 'from' | 'to' | 'body';
export type MailFilterOperator = 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with';
export type MailFilterActionType = 'move_to_folder' | 'mark_read' | 'mark_unread' | 'star' | 'unstar';

export interface MailFilterCondition {
    id: number;
    filter_id: number;
    field: MailFilterField;
    operator: MailFilterOperator;
    value: string;
    sort_order: number;
}

export interface MailFilterAction {
    id: number;
    filter_id: number;
    type: MailFilterActionType;
    value: string;
    sort_order: number;
}

export interface MailFilter {
    id: number;
    account_id: number;
    name: string;
    enabled: number;
    run_on_incoming: number;
    match_mode: MailFilterMatchMode;
    stop_processing: number;
    created_at: string;
    updated_at: string;
    conditions: MailFilterCondition[];
    actions: MailFilterAction[];
}

export interface UpsertMailFilterPayload {
    id?: number;
    name: string;
    enabled?: number;
    run_on_incoming?: number;
    match_mode?: MailFilterMatchMode;
    stop_processing?: number;
    conditions?: Array<{
        field?: MailFilterField;
        operator?: MailFilterOperator;
        value?: string | null;
    }>;
    actions?: Array<{
        type?: MailFilterActionType;
        value?: string | null;
    }>;
}

export interface MailFilterRunSummary {
    accountId: number;
    trigger: 'incoming' | 'manual';
    processed: number;
    matched: number;
    actionsApplied: number;
    errors: number;
}

export type GlobalErrorSource =
    | 'main-process'
    | 'renderer-process'
    | 'renderer-window'
    | 'window-load'
    | 'web-contents';

export interface GlobalErrorEvent {
    id: string;
    source: GlobalErrorSource;
    message: string;
    detail?: string | null;
    timestamp: string;
    fatal?: boolean;
}
