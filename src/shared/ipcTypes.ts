export type AppLanguage = 'system' | 'en-US' | 'sv-SE';
export type AppTheme = 'system' | 'light' | 'dark';
export type MailView = 'side-list' | 'top-table';
export type NavRailItemId = 'email' | 'contacts' | 'calendar' | 'cloud';

export interface AppSettings {
	language: AppLanguage;
	theme: AppTheme;
	mailView: MailView;
	navRailOrder: NavRailItemId[];
	hardwareAcceleration: boolean;
	pendingHardwareAcceleration: boolean | null;
	spellcheckEnabled: boolean;
	playNotificationSound: boolean;
	showUnreadInTitleBar: boolean;
	useNativeTitleBar: boolean;
	pendingUseNativeTitleBar: boolean | null;
	blockRemoteContent: boolean;
	remoteContentAllowlist: string[];
	minimizeToTray: boolean;
	syncIntervalMinutes: number;
	autoUpdateEnabled: boolean;
	developerMode: boolean;
	developerDemoMode: boolean;
	developerShowRouteOverlay: boolean;
	developerShowSendNotifications: boolean;
	developerShowSystemFailureNotifications: boolean;
	developerShowDebugNavItem: boolean;
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

export type ServiceProtocolType = 'imap' | 'pop3' | 'smtp';

export interface ServiceSettings {
	host: string;
	port: number;
	secure: boolean;
}

export type AuthMethod = 'oauth2' | 'app_password' | 'password';
export type OAuthProvider = 'google' | 'microsoft';
export interface ProviderCapabilities {
	emails: boolean;
	contacts: boolean;
	calendar: boolean;
	files: boolean;
}

export interface ProviderDriverSyncMetadata {
	canRunInitialSync: boolean;
	canRunIncrementalSync: boolean;
	supportsRealtimeEvents: boolean;
	supportsPushNotifications: boolean;
}

export interface ProviderDriverCatalogItem {
	key: string;
	label: string;
	logo: ProviderLogoKey;
	enabled: boolean;
	capabilities: ProviderCapabilities;
	sync: ProviderDriverSyncMetadata;
	recommendedAuthMethod: AuthMethod;
	supportedAuthMethods: AuthMethod[];
}

export type ProviderLogoKey = 'mail' | 'google' | 'microsoft';

export type SyncModuleState = 'success' | 'failed' | 'skipped';

export interface AccountSyncModuleStatus {
	state: SyncModuleState;
	reason?: string;
}

export interface AccountSyncModuleStatusMap {
	emails: AccountSyncModuleStatus;
	contacts: AccountSyncModuleStatus;
	calendar: AccountSyncModuleStatus;
	files: AccountSyncModuleStatus;
}

export type SyncModuleKey = keyof AccountSyncModuleStatusMap;

export type ProviderErrorCategory =
	| 'auth'
	| 'renewal'
	| 'timeout'
	| 'rate_limit'
	| 'provider_api'
	| 'partial_sync'
	| 'validation'
	| 'cancelled'
	| 'unknown';

export interface ProviderSyncError {
	category: ProviderErrorCategory;
	message: string;
	retryable: boolean;
	code?: string | null;
}

export interface AuthMethodSupport {
	method: AuthMethod;
	supported: boolean;
	recommended: boolean;
	note?: string;
}

export interface AuthCapabilities {
	preferredMethod: AuthMethod;
	supportsTwoFactorFlow: boolean;
	supportsPasskeysViaProvider: boolean;
	methods: AuthMethodSupport[];
}

export interface OAuthSession {
	provider: OAuthProvider;
	accessToken: string;
	refreshToken: string | null;
	expiresAt: number | null;
	tokenType: string | null;
	scope: string | null;
	email: string | null;
	displayName: string | null;
	clientId: string | null;
	tenantId: string | null;
}

export interface CalendarSyncRange {
	startIso?: string | null;
	endIso?: string | null;
}

export interface DavSyncModules {
	contacts?: boolean | null;
	calendar?: boolean | null;
}

export interface DavSyncOptions {
	calendarRange?: CalendarSyncRange | null;
	modules?: DavSyncModules | null;
}

export interface DiscoverCandidate {
	type: ServiceProtocolType;
	host: string;
	port: number;
	secure: boolean;
	source: string;
}

export interface DiscoverResult {
	provider?: string | null;
	imap?: ServiceSettings;
	pop3?: ServiceSettings;
	smtp?: ServiceSettings;
	candidates?: DiscoverCandidate[];
	mxPrimaryHost?: string;
	auth?: AuthCapabilities;
}
