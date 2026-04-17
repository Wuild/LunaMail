import type {AccountSyncCredentials} from '@main/db/repositories/accountsRepo.js';
import type {
	AccountSyncModuleStatusMap,
	AuthMethod,
	DavSyncOptions,
	OAuthProvider,
	ProviderCapabilities,
	ProviderDriverSyncMetadata,
	ProviderLogoKey,
} from '@/shared/ipcTypes.js';
import type {SyncSummary} from '@main/mail/sync.js';
import type {Worker} from 'node:worker_threads';
import type {DavSyncSummary} from '@main/dav/sync.js';

export type ProviderCapability = 'emails' | 'contacts' | 'calendar' | 'files';

export interface ProviderAccountContext {
	id: number;
	provider: string | null;
	oauthProvider: OAuthProvider | null;
	authMethod: AuthMethod;
}

export interface ProviderSyncModules {
	emails: boolean;
	contacts: boolean;
	calendar: boolean;
	files: boolean;
	reasons: Partial<Record<ProviderCapability, string>>;
}

export type WorkerReadyCallback = (worker: Worker) => void;

export interface ProviderEmailSyncService {
	syncMailbox(accountId: number, onWorkerReady?: WorkerReadyCallback): Promise<SyncSummary>;
}

export interface ProviderAncillarySyncResult {
	dav?: DavSyncSummary;
	moduleStatus?: Partial<AccountSyncModuleStatusMap>;
}

export interface ProviderAncillarySyncService {
	sync(accountId: number, options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult>;
}

export interface ProviderSyncMetadata {
	canRunInitialSync(): boolean;
	canRunIncrementalSync(): boolean;
	supportsRealtimeEvents(): boolean;
	supportsPushNotifications(): boolean;
}

export interface MailProviderDriver extends ProviderSyncMetadata {
	key(): string;
	label(): string;
	supports(capability: ProviderCapability): boolean;
	resolveSyncModules(account: ProviderAccountContext): ProviderSyncModules;
	resolveSyncCredentials(accountId: number): Promise<AccountSyncCredentials>;
}

export interface ProviderDriverRegistration {
	key: string;
	label: string;
	logo: ProviderLogoKey;
	enabled: boolean;
	capabilities: ProviderCapabilities;
	sync: ProviderDriverSyncMetadata;
	recommendedAuthMethod: AuthMethod;
	supportedAuthMethods: AuthMethod[];
	createDriver(): MailProviderDriver;
	createEmailSyncService(driver: MailProviderDriver): ProviderEmailSyncService;
	createAncillarySyncService(driver: MailProviderDriver): ProviderAncillarySyncService;
}
