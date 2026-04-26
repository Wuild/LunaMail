import {contextBridge, ipcRenderer, webUtils} from 'electron';
import type {
	AppSettings,
	AppSettingsPatch,
	AccountSyncModuleStatusMap,
	AuthCapabilities,
	AuthMethod,
	AuthMethodSupport,
	AutoUpdateState,
	CalendarSyncRange,
	DavSyncOptions,
	DavSyncModules,
	DiscoverCandidate,
	DiscoverResult,
	GlobalErrorEvent,
	MailFilter,
	MailListSort,
	MailFilterRunSummary,
	OAuthProvider,
	OAuthSession,
	ProviderCapabilities,
	ProviderDriverCatalogItem,
	ProviderSyncError,
	ServiceProtocolType,
	ServiceSettings,
	SyncModuleKey,
	UpsertMailFilterPayload,
} from '@llamamail/app/ipcTypes';
import type {I18nCatalogByNamespace, SupportedAppLocale} from '@llamamail/app/i18n/types';

export type {
	AppLanguage,
	AppSettings,
	AppSettingsPatch,
	AccountSyncModuleStatusMap,
	AuthCapabilities,
	AuthMethod,
	AuthMethodSupport,
	AppTheme,
	AutoUpdatePhase,
	AutoUpdateState,
	CalendarSyncRange,
	DiscoverCandidate,
	DiscoverResult,
	GlobalErrorEvent,
	GlobalErrorSource,
	MailFilter,
	MailFilterAction,
	MailFilterActionType,
	MailFilterCondition,
	MailFilterField,
	MailFilterMatchMode,
	MailFilterOperator,
	MailFilterRunSummary,
	MailListSort,
	MailView,
	DavSyncOptions,
	DavSyncModules,
	OAuthProvider,
	OAuthSession,
	ProviderCapabilities,
	ProviderDriverCatalogItem,
	ProviderSyncError,
	ServiceProtocolType,
	ServiceSettings,
	SyncModuleKey,
	UpsertMailFilterPayload,
} from '@llamamail/app/ipcTypes';

export interface AddAccountPayload {
	email: string;
	provider?: string | null;
	auth_method?: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	display_name?: string | null;
	reply_to?: string | null;
	organization?: string | null;
	signature_text?: string | null;
	signature_is_html?: number;
	signature_file_path?: string | null;
	attach_vcard?: number;
	imap_host: string;
	imap_port: number;
	imap_secure?: number; // 1=SSL/TLS, 0=STARTTLS
	pop3_host?: string | null;
	pop3_port?: number | null;
	pop3_secure?: number | null; // 1=SSL/TLS, 0=STARTTLS
	smtp_host: string;
	smtp_port: number;
	smtp_secure?: number; // 1=SSL/TLS, 0=STARTTLS
	sync_emails?: number;
	sync_contacts?: number;
	sync_calendar?: number;
	contacts_sync_interval_minutes?: number;
	calendar_sync_interval_minutes?: number;
	email_list_sort?: MailListSort;
	email_sync_interval_minutes?: number;
	email_sync_lookback_months?: number | null;
	imap_user?: string | null;
	smtp_user?: string | null;
	carddav_user?: string | null;
	caldav_user?: string | null;
	user: string;
	password?: string;
	imap_password?: string;
	smtp_password?: string;
	carddav_password?: string;
	caldav_password?: string;
	oauth_session?: OAuthSession | null;
}

export interface UpdateAccountPayload {
	email: string;
	provider?: string | null;
	auth_method?: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	display_name?: string | null;
	reply_to?: string | null;
	organization?: string | null;
	signature_text?: string | null;
	signature_is_html?: number;
	signature_file_path?: string | null;
	attach_vcard?: number;
	imap_host: string;
	imap_port: number;
	imap_secure?: number;
	pop3_host?: string | null;
	pop3_port?: number | null;
	pop3_secure?: number | null;
	smtp_host: string;
	smtp_port: number;
	smtp_secure?: number;
	sync_emails?: number;
	sync_contacts?: number;
	sync_calendar?: number;
	contacts_sync_interval_minutes?: number;
	calendar_sync_interval_minutes?: number;
	email_list_sort?: MailListSort;
	email_sync_interval_minutes?: number;
	email_sync_lookback_months?: number | null;
	imap_user?: string | null;
	smtp_user?: string | null;
	carddav_user?: string | null;
	caldav_user?: string | null;
	user: string;
	password?: string | null;
	imap_password?: string | null;
	smtp_password?: string | null;
	carddav_password?: string | null;
	caldav_password?: string | null;
	oauth_session?: OAuthSession | null;
}

export interface PublicAccount {
	id: number;
	email: string;
	provider: string | null;
	auth_method?: AuthMethod;
	oauth_provider?: OAuthProvider | null;
	display_name: string | null;
	reply_to: string | null;
	organization: string | null;
	signature_text: string | null;
	signature_is_html: number;
	signature_file_path: string | null;
	attach_vcard: number;
	imap_host: string;
	imap_port: number;
	imap_secure: number;
	pop3_host: string | null;
	pop3_port: number | null;
	pop3_secure: number | null;
	smtp_host: string;
	smtp_port: number;
	smtp_secure: number;
	sync_emails: number;
	sync_contacts: number;
	sync_calendar: number;
	contacts_sync_interval_minutes: number;
	calendar_sync_interval_minutes: number;
	email_list_sort: MailListSort;
	email_sync_interval_minutes: number;
	email_sync_lookback_months: number | null;
	imap_user: string;
	smtp_user: string;
	carddav_user: string;
	caldav_user: string;
	user: string;
	created_at: string;
}

export type CloudProvider = 'nextcloud' | 'webdav' | 'icloud-drive' | 'google-drive' | 'onedrive';

export interface PublicCloudAccount {
	id: number;
	provider: CloudProvider;
	name: string;
	base_url: string | null;
	user: string | null;
	created_at: string;
}

export interface AddCloudAccountPayload {
	provider: CloudProvider;
	name: string;
	base_url?: string | null;
	user?: string | null;
	secret: string;
}

export interface UpdateCloudAccountPayload {
	name?: string | null;
	base_url?: string | null;
	user?: string | null;
	secret?: string | null;
}

export interface CloudItem {
	id: string;
	name: string;
	path: string;
	isFolder: boolean;
	size: number | null;
	createdAt: string | null;
	modifiedAt: string | null;
	mimeType: string | null;
}

export interface CloudStorageUsage {
	usedBytes: number | null;
	totalBytes: number | null;
}

export interface CloudItemStatus {
	exists: boolean;
	item: CloudItem | null;
	checkedAt: string;
}

export interface CloudShareLinkResult {
	url: string;
}

export interface LinkCloudOAuthPayload {
	clientId?: string | null;
	tenantId?: string | null;
}

export interface UnlinkAccountCloudDriveResult {
	removed: boolean;
	reason?: 'provider-not-supported' | 'not-linked' | null;
	cloudAccountId?: number | null;
}

export interface LinkAccountCloudDriveResult {
	linked: boolean;
	reason?: 'provider-not-supported' | 'already-linked' | null;
	cloudAccount?: PublicCloudAccount | null;
}

export interface CloudUploadResult {
	uploaded: number;
}

export interface CloudMoveResult {
	moved: boolean;
}

export interface CloudOpenItemResult {
	ok: boolean;
	action: 'opened' | 'saved' | 'cancelled';
	path: string;
}

export interface VerifyPayload {
	type: 'imap' | 'pop3' | 'smtp';
	mode?: 'connection' | 'authentication';
	host: string;
	port: number;
	secure: boolean;
	user: string;
	password?: string;
	auth_method?: AuthMethod;
	oauth_session?: OAuthSession | null;
}

export interface VerifyResult {
	ok: boolean;
	error?: string;
}

export interface StartMailOAuthPayload {
	email?: string | null;
	provider?: string | null;
	clientId?: string | null;
	tenantId?: string | null;
}

export interface FolderItem {
	id: number;
	account_id: number;
	name: string;
	custom_name: string | null;
	color: string | null;
	sort_order?: number | null;
	path: string;
	type: string | null;
	unread_count: number;
	total_count: number;
}

export interface MessageItem {
	id: number;
	account_id: number;
	folder_id: number;
	uid: number;
	seq: number;
	message_id: string | null;
	in_reply_to: string | null;
	references_text: string | null;
	subject: string | null;
	from_name: string | null;
	from_address: string | null;
	to_address: string | null;
	date: string | null;
	is_read: number;
	is_flagged: number;
	tag: string | null;
	size: number | null;
}

export interface MessageThreadItem extends MessageItem {
	thread_count: number;
	thread_unread_count: number;
	thread_latest_date: string | null;
}

export type MessageDetails = MessageItem;

export interface SyncStatusEvent {
	accountId: number;
	status: 'syncing' | 'done' | 'error';
	source?: string;
	error?: string;
	syncError?: ProviderSyncError;
	summary?: AccountSyncSummary;
}

export interface MessageBodyResult {
	messageId: number;
	text: string | null;
	html: string | null;
	attachments: Array<{
		filename: string | null;
		contentType: string | null;
		size: number | null;
	}>;
	cached: boolean;
}

export interface MessageSourceResult {
	messageId: number;
	source: string;
}

export interface WindowControlsCapabilities {
	minimizable: boolean;
	maximizable: boolean;
}

export interface DavDiscoveryResult {
	accountId: number;
	carddavUrl: string | null;
	caldavUrl: string | null;
}

export interface DavDiscoveryPreviewPayload {
	email: string;
	user: string;
	password: string;
	imapHost: string;
	carddavUser?: string | null;
	carddavPassword?: string | null;
	caldavUser?: string | null;
	caldavPassword?: string | null;
}

export interface DavSyncSummary {
	accountId: number;
	discovered: DavDiscoveryResult;
	contacts: {upserted: number; removed: number; books: number};
	events: {upserted: number; removed: number; calendars: number};
}

export interface AccountSyncSummary {
	accountId: number;
	folders: number;
	messages: number;
	newMessages?: number;
	dav?: DavSyncSummary;
	moduleStatus?: AccountSyncModuleStatusMap;
	partialSuccess?: boolean;
	failedModules?: SyncModuleKey[];
}

export interface ContactItem {
	id: number;
	account_id: number;
	address_book_id: number | null;
	source: string;
	source_uid: string;
	full_name: string | null;
	email: string;
	phone: string | null;
	organization: string | null;
	title: string | null;
	note: string | null;
	etag: string | null;
	last_seen_sync: string;
	created_at: string;
	updated_at: string;
}

export interface RecentRecipientItem {
	email: string;
	display_name: string | null;
	last_used_at: string | null;
}

export interface AddressBookItem {
	id: number;
	account_id: number;
	name: string;
	source: string;
	remote_url: string | null;
	created_at: string;
	updated_at: string;
}

export interface CalendarEventItem {
	id: number;
	account_id: number;
	source: string;
	calendar_url: string;
	uid: string;
	summary: string | null;
	description: string | null;
	location: string | null;
	starts_at: string | null;
	ends_at: string | null;
	etag: string | null;
	raw_ics: string | null;
	last_seen_sync: string;
	created_at: string;
	updated_at: string;
}

export interface AddCalendarEventPayload {
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	startsAt: string;
	endsAt: string;
}

export interface UpdateCalendarEventPayload {
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	startsAt: string;
	endsAt: string;
}

export interface ExportContactsPayload {
	format: 'csv' | 'vcf';
	addressBookId?: number | null;
}

export interface ExportContactsResult {
	canceled: boolean;
	count: number;
	path: string | null;
	format: 'csv' | 'vcf';
}

export interface OpenMessageAttachmentResult {
	ok: boolean;
	action: 'opened' | 'saved' | 'cancelled';
	path?: string;
}

export interface EmailAttachmentPayload {
	path: string;
	filename?: string | null;
	contentType?: string | null;
}

export interface PickedAttachment {
	path: string;
	filename: string;
	contentType: string | null;
}

export interface PickedCloudAttachment extends PickedAttachment {}

export interface SetMessageReadResult {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	unreadCount: number;
	totalCount: number;
	isRead: number;
}

export interface SetMessageTagResult {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	tag: string | null;
}

export interface MoveMessageResult {
	messageId: number;
	accountId: number;
	sourceFolderId: number;
	sourceFolderPath: string;
	targetFolderId: number;
	targetFolderPath: string;
	uid: number;
	sourceUnreadCount: number;
	sourceTotalCount: number;
	targetUnreadCount: number;
	targetTotalCount: number;
}

export interface CreateFolderResult {
	accountId: number;
	path: string;
}

export interface DeleteFolderResult {
	accountId: number;
	path: string;
	removed: boolean;
}

export interface SendEmailPayload {
	accountId: number;
	to: string;
	cc?: string | null;
	bcc?: string | null;
	subject?: string | null;
	markdown?: string | null;
	text?: string | null;
	html?: string | null;
	inReplyTo?: string | null;
	references?: string[] | string | null;
	attachments?: EmailAttachmentPayload[] | null;
	draftSessionId?: string | null;
}

export interface SendEmailResult {
	ok: true;
	messageId: string;
}

export interface SendEmailBackgroundResult {
	ok: true;
	queued: true;
	jobId: string;
	queuedAt: number;
}

export interface SendEmailBackgroundStatusEvent {
	jobId: string;
	accountId: number;
	phase: 'queued' | 'sending' | 'sent' | 'failed';
	progress: number;
	message: string;
	error?: string | null;
	timestamp: string;
}

export interface SaveDraftPayload {
	accountId: number;
	draftMessageId?: number | null;
	to?: string | null;
	cc?: string | null;
	bcc?: string | null;
	subject?: string | null;
	text?: string | null;
	html?: string | null;
	inReplyTo?: string | null;
	references?: string[] | string | null;
	attachments?: EmailAttachmentPayload[] | null;
	draftSessionId?: string | null;
}

export interface SaveDraftResult {
	ok: true;
	draftId: string;
	draftMessageId?: number | null;
}

export interface ComposeDraftPayload {
	accountId?: number | null;
	draftMessageId?: number | null;
	draftSessionId?: string | null;
	to?: string | null;
	cc?: string | null;
	bcc?: string | null;
	subject?: string | null;
	body?: string | null;
	bodyHtml?: string | null;
	bodyText?: string | null;
	quotedBodyHtml?: string | null;
	quotedBodyText?: string | null;
	quotedAllowRemote?: boolean;
	inReplyTo?: string | null;
	references?: string[] | string | null;
}

export interface AccountDeletedEvent {
	id: number;
	email: string;
}

export interface OpenMessageTargetEvent {
	accountId: number;
	folderPath: string;
	messageId: number;
}

export interface DebugLogEntry {
	id: number;
	timestamp: string;
	source: 'imap' | 'smtp' | 'carddav' | 'caldav' | 'cloud' | 'app';
	level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
	scope: string;
	message: string;
}

export interface DevNotificationPayload {
	title?: string;
	body?: string;
	route?: string | null;
}

export interface DevShowNotificationResult {
	ok: true;
	supported: boolean;
	hasTarget: boolean;
}

export interface I18nCatalogPayload {
	locale: SupportedAppLocale;
	catalog: I18nCatalogByNamespace;
}

const api = {
	getAccounts: (): Promise<PublicAccount[]> => ipcRenderer.invoke('get-accounts'),
	getProviderDriverCatalog: (): Promise<ProviderDriverCatalogItem[]> =>
		ipcRenderer.invoke('get-provider-driver-catalog'),
	getAccountProviderCapabilities: (accountId: number): Promise<ProviderCapabilities> =>
		ipcRenderer.invoke('get-account-provider-capabilities', accountId),
	addAccount: (account: AddAccountPayload): Promise<{id: number; email: string}> =>
		ipcRenderer.invoke('add-account', account),
	updateAccount: (accountId: number, payload: UpdateAccountPayload): Promise<PublicAccount> =>
		ipcRenderer.invoke('update-account', accountId, payload),
	deleteAccount: (accountId: number): Promise<AccountDeletedEvent> => ipcRenderer.invoke('delete-account', accountId),
	getCloudAccounts: (): Promise<PublicCloudAccount[]> => ipcRenderer.invoke('get-cloud-accounts'),
	addCloudAccount: (payload: AddCloudAccountPayload): Promise<PublicCloudAccount> =>
		ipcRenderer.invoke('add-cloud-account', payload),
	updateCloudAccount: (accountId: number, payload: UpdateCloudAccountPayload): Promise<PublicCloudAccount> =>
		ipcRenderer.invoke('update-cloud-account', accountId, payload),
	deleteCloudAccount: (accountId: number): Promise<{removed: boolean}> =>
		ipcRenderer.invoke('delete-cloud-account', accountId),
	unlinkAccountCloudDrive: (accountId: number): Promise<UnlinkAccountCloudDriveResult> =>
		ipcRenderer.invoke('unlink-account-cloud-drive', accountId),
	linkAccountCloudDrive: (accountId: number): Promise<LinkAccountCloudDriveResult> =>
		ipcRenderer.invoke('link-account-cloud-drive', accountId),
	linkCloudOAuth: (
		provider: 'google-drive' | 'onedrive',
		payload: LinkCloudOAuthPayload,
	): Promise<PublicCloudAccount> => ipcRenderer.invoke('link-cloud-oauth', provider, payload),
	relinkCloudOAuth: (accountId: number, payload: LinkCloudOAuthPayload): Promise<PublicCloudAccount> =>
		ipcRenderer.invoke('relink-cloud-oauth', accountId, payload),
	listCloudItems: (accountId: number, pathOrToken?: string | null): Promise<{path: string; items: CloudItem[]}> =>
		ipcRenderer.invoke('list-cloud-items', accountId, pathOrToken ?? null),
	getCloudStorageUsage: (accountId: number): Promise<CloudStorageUsage> =>
		ipcRenderer.invoke('get-cloud-storage-usage', accountId),
	createCloudFolder: (
		accountId: number,
		parentPathOrToken: string | null,
		folderName: string,
	): Promise<{id: string; path: string; name: string}> =>
		ipcRenderer.invoke('create-cloud-folder', accountId, parentPathOrToken ?? null, folderName),
	deleteCloudItem: (accountId: number, itemPathOrToken: string): Promise<{removed: true}> =>
		ipcRenderer.invoke('delete-cloud-item', accountId, itemPathOrToken),
	moveCloudItem: (
		accountId: number,
		itemPathOrToken: string,
		targetParentPathOrToken: string | null,
	): Promise<CloudMoveResult> => ipcRenderer.invoke('move-cloud-item', accountId, itemPathOrToken, targetParentPathOrToken ?? null),
	getCloudItemStatus: (accountId: number, itemPathOrToken: string): Promise<CloudItemStatus> =>
		ipcRenderer.invoke('get-cloud-item-status', accountId, itemPathOrToken),
	createCloudShareLink: (accountId: number, itemPathOrToken: string): Promise<CloudShareLinkResult> =>
		ipcRenderer.invoke('create-cloud-share-link', accountId, itemPathOrToken),
	uploadCloudFiles: (accountId: number, parentPathOrToken?: string | null): Promise<CloudUploadResult> =>
		ipcRenderer.invoke('upload-cloud-files', accountId, parentPathOrToken ?? null),
	openCloudItem: (
		accountId: number,
		itemPathOrToken: string,
		fallbackName?: string | null,
		action?: 'open' | 'save',
	): Promise<CloudOpenItemResult> =>
		ipcRenderer.invoke('open-cloud-item', accountId, itemPathOrToken, fallbackName ?? null, action ?? 'open'),
	pickCloudAttachment: (
		accountId: number,
		itemPathOrToken: string,
		fallbackName?: string | null,
	): Promise<PickedCloudAttachment> =>
		ipcRenderer.invoke('pick-cloud-attachment', accountId, itemPathOrToken, fallbackName ?? null),
	getUnreadCount: (): Promise<number> => ipcRenderer.invoke('get-unread-count'),
	discoverMailSettings: (email: string): Promise<DiscoverResult> =>
		ipcRenderer.invoke('discover-mail-settings', email),
	verifyCredentials: (payload: VerifyPayload): Promise<VerifyResult> =>
		ipcRenderer.invoke('verify-credentials', payload),
	startMailOAuth: (payload: StartMailOAuthPayload): Promise<OAuthSession> =>
		ipcRenderer.invoke('start-mail-oauth', payload),
	cancelMailOAuth: (): Promise<{ok: true; cancelled: number}> => ipcRenderer.invoke('cancel-mail-oauth'),
	syncAccount: (accountId: number): Promise<AccountSyncSummary> => ipcRenderer.invoke('sync-account', accountId),
	getFolders: (accountId: number): Promise<FolderItem[]> => ipcRenderer.invoke('get-folders', accountId),
	createFolder: (accountId: number, folderPath: string): Promise<CreateFolderResult> =>
		ipcRenderer.invoke('create-folder', accountId, folderPath),
	deleteFolder: (accountId: number, folderPath: string): Promise<DeleteFolderResult> =>
		ipcRenderer.invoke('delete-folder', accountId, folderPath),
	updateFolderSettings: (
		accountId: number,
		folderPath: string,
		payload: {customName?: string | null; color?: string | null; type?: string | null},
	): Promise<FolderItem> => ipcRenderer.invoke('update-folder-settings', accountId, folderPath, payload),
	reorderCustomFolders: (accountId: number, orderedFolderPaths: string[]): Promise<FolderItem[]> =>
		ipcRenderer.invoke('reorder-custom-folders', accountId, orderedFolderPaths),
	discoverDav: (accountId: number): Promise<DavDiscoveryResult> => ipcRenderer.invoke('discover-dav', accountId),
	discoverDavPreview: (payload: DavDiscoveryPreviewPayload): Promise<DavDiscoveryResult> =>
		ipcRenderer.invoke('discover-dav-preview', payload),
	syncDav: (accountId: number, options?: DavSyncOptions | null): Promise<DavSyncSummary> =>
		ipcRenderer.invoke('sync-dav', accountId, options ?? null),
	getContacts: (
		accountId: number,
		query?: string | null,
		limit?: number,
		addressBookId?: number | null,
	): Promise<ContactItem[]> =>
		ipcRenderer.invoke('get-contacts', accountId, query ?? null, limit, addressBookId ?? null),
	getRecentRecipients: (accountId: number, query?: string | null, limit?: number): Promise<RecentRecipientItem[]> =>
		ipcRenderer.invoke('get-recent-recipients', accountId, query ?? null, limit),
	getAddressBooks: (accountId: number): Promise<AddressBookItem[]> =>
		ipcRenderer.invoke('get-address-books', accountId),
	addAddressBook: (accountId: number, name: string): Promise<AddressBookItem> =>
		ipcRenderer.invoke('add-address-book', accountId, name),
	deleteAddressBook: (accountId: number, addressBookId: number): Promise<{removed: boolean}> =>
		ipcRenderer.invoke('delete-address-book', accountId, addressBookId),
	addContact: (
		accountId: number,
		payload: {
			addressBookId?: number | null;
			fullName?: string | null;
			email: string;
			phone?: string | null;
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		},
	): Promise<ContactItem> => ipcRenderer.invoke('add-contact', accountId, payload),
	updateContact: (
		contactId: number,
		payload: {
			addressBookId?: number | null;
			fullName?: string | null;
			email?: string;
			phone?: string | null;
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		},
	): Promise<ContactItem> => ipcRenderer.invoke('update-contact', contactId, payload),
	deleteContact: (
		contactId: number,
	): Promise<{
		removed: boolean;
	}> => ipcRenderer.invoke('delete-contact', contactId),
	exportContacts: (accountId: number, payload: ExportContactsPayload): Promise<ExportContactsResult> =>
		ipcRenderer.invoke('export-contacts', accountId, payload),
	getCalendarEvents: (
		accountId: number,
		startIso?: string | null,
		endIso?: string | null,
		limit?: number,
	): Promise<CalendarEventItem[]> =>
		ipcRenderer.invoke('get-calendar-events', accountId, startIso ?? null, endIso ?? null, limit),
	addCalendarEvent: (accountId: number, payload: AddCalendarEventPayload): Promise<CalendarEventItem> =>
		ipcRenderer.invoke('add-calendar-event', accountId, payload),
	updateCalendarEvent: (eventId: number, payload: UpdateCalendarEventPayload): Promise<CalendarEventItem> =>
		ipcRenderer.invoke('update-calendar-event', eventId, payload),
	deleteCalendarEvent: (eventId: number): Promise<{removed: boolean}> =>
		ipcRenderer.invoke('delete-calendar-event', eventId),
	getFolderMessages: (accountId: number, folderPath: string, limit?: number): Promise<MessageItem[]> =>
		ipcRenderer.invoke('get-folder-messages', accountId, folderPath, limit),
	getFolderThreads: (accountId: number, folderPath: string, limit?: number): Promise<MessageThreadItem[]> =>
		ipcRenderer.invoke('get-folder-threads', accountId, folderPath, limit),
	getMailFilters: (accountId: number): Promise<MailFilter[]> => ipcRenderer.invoke('get-mail-filters', accountId),
	saveMailFilter: (accountId: number, payload: UpsertMailFilterPayload): Promise<MailFilter> =>
		ipcRenderer.invoke('save-mail-filter', accountId, payload),
	deleteMailFilter: (accountId: number, filterId: number): Promise<{removed: boolean}> =>
		ipcRenderer.invoke('delete-mail-filter', accountId, filterId),
	runMailFilters: (
		accountId: number,
		payload?: {filterId?: number; folderPath?: string | null; limit?: number},
	): Promise<MailFilterRunSummary> => ipcRenderer.invoke('run-mail-filters', accountId, payload ?? null),
	searchMessages: (
		accountId: number,
		query: string,
		folderPath?: string | null,
		limit?: number,
	): Promise<MessageItem[]> => ipcRenderer.invoke('search-messages', accountId, query, folderPath ?? null, limit),
	getMessage: (messageId: number): Promise<MessageDetails | null> => ipcRenderer.invoke('get-message', messageId),
	getSenderAvatar: (fromAddress: string | null): Promise<string | null> =>
		ipcRenderer.invoke('get-sender-avatar', fromAddress ?? null),
	getMessageBody: (messageId: number, requestId?: string): Promise<MessageBodyResult> =>
		ipcRenderer.invoke('get-message-body', messageId, requestId),
	getMessageSource: (messageId: number): Promise<MessageSourceResult> =>
		ipcRenderer.invoke('get-message-source', messageId),
	openMessageAttachment: (
		messageId: number,
		attachmentIndex: number,
		action?: 'open' | 'save' | 'prompt',
	): Promise<OpenMessageAttachmentResult> =>
		ipcRenderer.invoke('open-message-attachment', messageId, attachmentIndex, action ?? 'prompt'),
	cancelMessageBody: (
		requestId: string,
	): Promise<{
		ok: true;
	}> => ipcRenderer.invoke('cancel-message-body', requestId),
	setMessageRead: (messageId: number, isRead: number): Promise<SetMessageReadResult> =>
		ipcRenderer.invoke('set-message-read', messageId, isRead),
	markMessageRead: (messageId: number): Promise<SetMessageReadResult> =>
		ipcRenderer.invoke('mark-message-read', messageId),
	markMessageUnread: (messageId: number): Promise<SetMessageReadResult> =>
		ipcRenderer.invoke('mark-message-unread', messageId),
	setMessageFlagged: (
		messageId: number,
		isFlagged: number,
	): Promise<{
		accountId: number;
	}> => ipcRenderer.invoke('set-message-flagged', messageId, isFlagged),
	setMessageTag: (messageId: number, tag: string | null): Promise<SetMessageTagResult> =>
		ipcRenderer.invoke('set-message-tag', messageId, tag ?? null),
	moveMessage: (messageId: number, targetFolderPath: string): Promise<MoveMessageResult> =>
		ipcRenderer.invoke('move-message', messageId, targetFolderPath),
	archiveMessage: (messageId: number): Promise<MoveMessageResult> => ipcRenderer.invoke('archive-message', messageId),
	deleteMessage: (messageId: number): Promise<{accountId: number; folders: number; messages: number}> =>
		ipcRenderer.invoke('delete-message', messageId),
	sendEmail: (payload: SendEmailPayload): Promise<SendEmailResult> => ipcRenderer.invoke('send-email', payload),
	sendEmailBackground: (payload: SendEmailPayload): Promise<SendEmailBackgroundResult> =>
		ipcRenderer.invoke('send-email-background', payload),
	saveDraft: (payload: SaveDraftPayload): Promise<SaveDraftResult> => ipcRenderer.invoke('save-draft', payload),
	openAddAccountWindow: (): Promise<{ok: true}> => ipcRenderer.invoke('open-add-account-window'),
	openComposeWindow: (draft?: ComposeDraftPayload | null): Promise<{ok: true}> =>
		ipcRenderer.invoke('open-compose-window', draft ?? null),
	minimizeWindow: (): Promise<{ok: true}> => ipcRenderer.invoke('window-minimize'),
	toggleMaximizeWindow: (): Promise<{
		ok: true;
		isMaximized: boolean;
	}> => ipcRenderer.invoke('window-toggle-maximize'),
	closeWindow: (): Promise<{ok: true}> => ipcRenderer.invoke('window-close'),
	isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
	getWindowControlsCapabilities: (): Promise<WindowControlsCapabilities> =>
		ipcRenderer.invoke('window-controls-capabilities'),
	openDevTools: (): Promise<{ok: true}> => ipcRenderer.invoke('window-open-dev-tools'),
	restartApp: (): Promise<{ok: true}> => ipcRenderer.invoke('app-restart'),
	openMessageWindow: (messageId?: number | null): Promise<{ok: true}> =>
		ipcRenderer.invoke('open-message-window', messageId ?? null),
	openDebugWindow: (): Promise<{ok: true}> => ipcRenderer.invoke('open-debug-window'),
	openRouteWindow: (route: string): Promise<{ok: true}> => ipcRenderer.invoke('open-route-window', route),
	getDebugLogs: (limit?: number): Promise<DebugLogEntry[]> => ipcRenderer.invoke('get-debug-logs', limit),
	clearDebugLogs: (): Promise<{ok: true}> => ipcRenderer.invoke('clear-debug-logs'),
	getComposeDraft: (): Promise<ComposeDraftPayload | null> => ipcRenderer.invoke('get-compose-draft'),
	getMessageWindowTarget: (): Promise<number | null> => ipcRenderer.invoke('get-message-window-target'),
	getAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-app-settings'),
	getSystemLocale: (): Promise<string> => ipcRenderer.invoke('get-system-locale'),
	getI18nCatalog: (locale?: string | null): Promise<I18nCatalogPayload> =>
		ipcRenderer.invoke('get-i18n-catalog', locale ?? null),
	updateAppSettings: (patch: AppSettingsPatch): Promise<AppSettings> =>
		ipcRenderer.invoke('update-app-settings', patch),
	pickComposeAttachments: (): Promise<PickedAttachment[]> => ipcRenderer.invoke('pick-compose-attachments'),
	getPathForFile: (file: File): string => {
		try {
			return String(webUtils.getPathForFile(file) || '');
		} catch {
			return '';
		}
	},
	getAutoUpdateState: (): Promise<AutoUpdateState> => ipcRenderer.invoke('get-auto-update-state'),
	checkForUpdates: (): Promise<AutoUpdateState> => ipcRenderer.invoke('check-for-updates'),
	downloadUpdate: (): Promise<AutoUpdateState> => ipcRenderer.invoke('download-update'),
	quitAndInstallUpdate: (): Promise<{ok: true}> => ipcRenderer.invoke('quit-and-install-update'),
	devShowNotification: (payload?: DevNotificationPayload): Promise<DevShowNotificationResult> =>
		ipcRenderer.invoke('dev-show-notification', payload ?? null),
	devPlayNotificationSound: (): Promise<{ok: true; played: boolean}> =>
		ipcRenderer.invoke('dev-play-notification-sound'),
	devOpenUpdaterWindow: (): Promise<{ok: true; opened: boolean}> => ipcRenderer.invoke('dev-open-updater-window'),
	setDefaultEmailClient: (): Promise<{ok: boolean; isDefault: boolean; error?: string}> =>
		ipcRenderer.invoke('set-default-email-client'),
	getDefaultEmailClientStatus: (): Promise<{ok: boolean; isDefault: boolean; error?: string}> =>
		ipcRenderer.invoke('get-default-email-client-status'),
	onAccountAdded: (callback: (payload: {id: number; email: string}) => void): (() => void) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			payload: {
				id: number;
				email: string;
			},
		) => callback(payload);
		ipcRenderer.on('account-added', listener);
		return () => ipcRenderer.removeListener('account-added', listener);
	},
	onAccountUpdated: (callback: (payload: PublicAccount) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: PublicAccount) => callback(payload);
		ipcRenderer.on('account-updated', listener);
		return () => ipcRenderer.removeListener('account-updated', listener);
	},
	onAccountDeleted: (callback: (payload: AccountDeletedEvent) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: AccountDeletedEvent) => callback(payload);
		ipcRenderer.on('account-deleted', listener);
		return () => ipcRenderer.removeListener('account-deleted', listener);
	},
	onCloudAccountsUpdated: (callback: (payload: PublicCloudAccount[]) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: PublicCloudAccount[]) => callback(payload);
		ipcRenderer.on('cloud-accounts-updated', listener);
		return () => ipcRenderer.removeListener('cloud-accounts-updated', listener);
	},
	onUnreadCountUpdated: (callback: (payload: number) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: number) => callback(payload);
		ipcRenderer.on('unread-count-updated', listener);
		return () => ipcRenderer.removeListener('unread-count-updated', listener);
	},
	onMessageReadUpdated: (callback: (payload: SetMessageReadResult) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: SetMessageReadResult) => callback(payload);
		ipcRenderer.on('message-read-updated', listener);
		return () => ipcRenderer.removeListener('message-read-updated', listener);
	},
	onAccountSyncStatus: (callback: (payload: SyncStatusEvent) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: SyncStatusEvent) => callback(payload);
		ipcRenderer.on('account-sync-status', listener);
		return () => ipcRenderer.removeListener('account-sync-status', listener);
	},
	onComposeDraft: (callback: (payload: ComposeDraftPayload | null) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: ComposeDraftPayload | null) => callback(payload);
		ipcRenderer.on('compose-draft', listener);
		return () => ipcRenderer.removeListener('compose-draft', listener);
	},
	onSendEmailBackgroundStatus: (callback: (payload: SendEmailBackgroundStatusEvent) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: SendEmailBackgroundStatusEvent) =>
			callback(payload);
		ipcRenderer.on('send-email-background-status', listener);
		return () => ipcRenderer.removeListener('send-email-background-status', listener);
	},
	onAppSettingsUpdated: (callback: (payload: AppSettings) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: AppSettings) => callback(payload);
		ipcRenderer.on('app-settings-updated', listener);
		return () => ipcRenderer.removeListener('app-settings-updated', listener);
	},
	onNativeThemeUpdated: (callback: (payload: {shouldUseDarkColors: boolean}) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: {shouldUseDarkColors: boolean}) =>
			callback(payload);
		ipcRenderer.on('native-theme-updated', listener);
		return () => ipcRenderer.removeListener('native-theme-updated', listener);
	},
	onOpenMessageTarget: (callback: (payload: OpenMessageTargetEvent) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: OpenMessageTargetEvent) => callback(payload);
		ipcRenderer.on('open-message-target', listener);
		return () => ipcRenderer.removeListener('open-message-target', listener);
	},
	onMessageWindowTarget: (callback: (payload: number | null) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: number | null) => callback(payload);
		ipcRenderer.on('message-window-target', listener);
		return () => ipcRenderer.removeListener('message-window-target', listener);
	},
	onDebugLog: (callback: (payload: DebugLogEntry) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: DebugLogEntry) => callback(payload);
		ipcRenderer.on('debug-log', listener);
		return () => ipcRenderer.removeListener('debug-log', listener);
	},
	onAutoUpdateStatus: (callback: (payload: AutoUpdateState) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: AutoUpdateState) => callback(payload);
		ipcRenderer.on('auto-update-status', listener);
		return () => ipcRenderer.removeListener('auto-update-status', listener);
	},
	onGlobalError: (callback: (payload: GlobalErrorEvent) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: GlobalErrorEvent) => callback(payload);
		ipcRenderer.on('global-error', listener);
		return () => ipcRenderer.removeListener('global-error', listener);
	},
	onLinkHoverUrl: (callback: (payload: string) => void): (() => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: string) => callback(payload || '');
		ipcRenderer.on('link-hover-url', listener);
		return () => ipcRenderer.removeListener('link-hover-url', listener);
	},
};

declare global {
	interface Window {
		electronAPI: typeof api;
	}
}

contextBridge.exposeInMainWorld('electronAPI', api);
