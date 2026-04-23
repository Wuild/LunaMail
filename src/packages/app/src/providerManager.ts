import type {AccountSyncModuleStatusMap, DavSyncOptions, OAuthProvider, ProviderDriverCatalogItem} from './ipcTypes';
import type {ProviderCapability, ProviderSyncModules} from './providerDriver';
import type {ProviderDriverRegistration, ProviderRuntimeDriver} from './providerRegistration';

type MailProviderKey = string;
type DriverFactory = () => ProviderRuntimeDriver;
type EmailSyncServiceFactory<TEmailSummary, TWorker> = (
	driver: ProviderRuntimeDriver,
) => ProviderEmailSyncService<TEmailSummary, TWorker>;
type AncillarySyncServiceFactory<TDavSummary> = (
	driver: ProviderRuntimeDriver,
) => ProviderAncillarySyncService<TDavSummary>;

export interface ProviderAccountRecord {
	id: number;
	provider: string | null;
	oauth_provider: OAuthProvider | null;
	auth_method: string;
}

export interface ProviderEmailSyncService<TEmailSummary = unknown, TWorker = unknown> {
	syncMailbox(accountId: number, onWorkerReady?: (worker: TWorker) => void): Promise<TEmailSummary>;
}

export interface ProviderAncillarySyncResult<TDavSummary = unknown> {
	dav?: TDavSummary;
	moduleStatus?: Partial<AccountSyncModuleStatusMap>;
}

export interface ProviderAncillarySyncService<TDavSummary = unknown> {
	sync(accountId: number, options?: DavSyncOptions | null): Promise<ProviderAncillarySyncResult<TDavSummary>>;
}

export interface ProviderManagerDependencies<TEmailSummary = unknown, TWorker = unknown, TDavSummary = unknown> {
	getAccounts(): Promise<ProviderAccountRecord[]>;
	discoverProviderDriverRegistrations(): Promise<ProviderDriverRegistration[]>;
	createEmailSyncService(
		registration: ProviderDriverRegistration,
		driver: ProviderRuntimeDriver,
	): ProviderEmailSyncService<TEmailSummary, TWorker>;
	createAncillarySyncService(
		registration: ProviderDriverRegistration,
		driver: ProviderRuntimeDriver,
	): ProviderAncillarySyncService<TDavSummary>;
}

export class ProviderManagerError extends Error {
	readonly code: 'account-not-found' | 'provider-unsupported' | 'provider-disabled';

	constructor(code: 'account-not-found' | 'provider-unsupported' | 'provider-disabled', message: string) {
		super(message);
		this.name = 'ProviderManagerError';
		this.code = code;
	}
}

export class ProviderManager<TEmailSummary = unknown, TWorker = unknown, TDavSummary = unknown> {
	readonly #dependencies: ProviderManagerDependencies<TEmailSummary, TWorker, TDavSummary>;
	readonly #drivers = new Map<MailProviderKey, ProviderRuntimeDriver>();
	readonly #driverFactories = new Map<MailProviderKey, DriverFactory>();
	readonly #driverRegistrations = new Map<MailProviderKey, ProviderDriverRegistration>();
	readonly #emailSyncServices = new Map<MailProviderKey, ProviderEmailSyncService<TEmailSummary, TWorker>>();
	readonly #emailSyncServiceFactories = new Map<MailProviderKey, EmailSyncServiceFactory<TEmailSummary, TWorker>>();
	readonly #ancillarySyncServices = new Map<MailProviderKey, ProviderAncillarySyncService<TDavSummary>>();
	readonly #ancillarySyncServiceFactories = new Map<MailProviderKey, AncillarySyncServiceFactory<TDavSummary>>();
	#isRegistryReady = false;
	#registryLoadPromise: Promise<void> | null = null;

	constructor(dependencies: ProviderManagerDependencies<TEmailSummary, TWorker, TDavSummary>) {
		this.#dependencies = dependencies;
	}

	registerDriver(
		providerKey: MailProviderKey,
		factory: DriverFactory,
		registration?: ProviderDriverRegistration,
	): void {
		this.#driverFactories.set(providerKey, factory);
		if (registration) this.#driverRegistrations.set(providerKey, registration);
		this.#drivers.delete(providerKey);
		this.#emailSyncServices.delete(providerKey);
		this.#ancillarySyncServices.delete(providerKey);
	}

	listRegisteredDriverKeys(): MailProviderKey[] {
		return Array.from(this.#driverFactories.keys());
	}

	registerEmailSyncService(providerKey: MailProviderKey, factory: EmailSyncServiceFactory<TEmailSummary, TWorker>): void {
		this.#emailSyncServiceFactories.set(providerKey, factory);
		this.#emailSyncServices.delete(providerKey);
	}

	registerAncillarySyncService(providerKey: MailProviderKey, factory: AncillarySyncServiceFactory<TDavSummary>): void {
		this.#ancillarySyncServiceFactories.set(providerKey, factory);
		this.#ancillarySyncServices.delete(providerKey);
	}

	async resolveDriverForAccount(accountId: number): Promise<ProviderRuntimeDriver> {
		await this.#ensureRegistryLoaded();
		const account = await this.#getAccount(accountId);
		const key = this.#resolveProviderKeyForAccount(account);
		return this.#getOrCreateDriver(key);
	}

	async getCapabilities(accountId: number): Promise<Record<ProviderCapability, boolean>> {
		const driver = await this.resolveDriverForAccount(accountId);
		return {
			emails: driver.supports('emails'),
			contacts: driver.supports('contacts'),
			calendar: driver.supports('calendar'),
			files: driver.supports('files'),
		};
	}

	async getSyncModules(accountId: number): Promise<ProviderSyncModules> {
		await this.#ensureRegistryLoaded();
		const account = await this.#getAccount(accountId);
		const key = this.#resolveProviderKeyForAccount(account);
		const driver = this.#getOrCreateDriver(key);
		return driver.resolveSyncModules({
			id: account.id,
			provider: account.provider ?? null,
			oauthProvider: account.oauth_provider ?? null,
			authMethod: account.auth_method as any,
		});
	}

	async resolveEmailSyncServiceForAccount(accountId: number): Promise<ProviderEmailSyncService<TEmailSummary, TWorker>> {
		await this.#ensureRegistryLoaded();
		const account = await this.#getAccount(accountId);
		return this.#getOrCreateEmailSyncService(this.#resolveProviderKeyForAccount(account));
	}

	async resolveAncillarySyncServiceForAccount(accountId: number): Promise<ProviderAncillarySyncService<TDavSummary>> {
		await this.#ensureRegistryLoaded();
		const account = await this.#getAccount(accountId);
		return this.#getOrCreateAncillarySyncService(this.#resolveProviderKeyForAccount(account));
	}

	async getProviderDriverCatalog(): Promise<ProviderDriverCatalogItem[]> {
		await this.#ensureRegistryLoaded();
		return this.listRegisteredDriverKeys().map((providerKey) => {
			const registration = this.#driverRegistrations.get(providerKey);
			if (!registration) {
				throw new ProviderManagerError(
					'provider-unsupported',
					`Provider '${providerKey}' is missing registration metadata.`,
				);
			}
			return {
				key: providerKey,
				label: registration.label,
				logo: registration.logo,
				enabled: registration.enabled,
				capabilities: registration.capabilities,
				sync: registration.sync,
				recommendedAuthMethod: registration.recommendedAuthMethod,
				supportedAuthMethods: registration.supportedAuthMethods,
			};
		});
	}

	async #getAccount(accountId: number): Promise<ProviderAccountRecord> {
		const account = (await this.#dependencies.getAccounts()).find((item) => item.id === accountId) ?? null;
		if (!account) {
			throw new ProviderManagerError('account-not-found', `Account ${accountId} not found`);
		}
		return account;
	}

	#resolveProviderKeyForAccount(account: Pick<ProviderAccountRecord, 'provider' | 'oauth_provider'>): MailProviderKey {
		const provider = String(account.provider || '')
			.trim()
			.toLowerCase();
		if (provider && this.#driverFactories.has(provider)) return provider;
		const oauthProvider = String(account.oauth_provider || '')
			.trim()
			.toLowerCase();
		if (oauthProvider && this.#driverFactories.has(oauthProvider)) return oauthProvider;
		if (this.#driverFactories.has('custom')) return 'custom';
		const fallback = this.listRegisteredDriverKeys()[0] ?? null;
		if (!fallback) {
			throw new ProviderManagerError('provider-unsupported', 'No provider drivers are registered.');
		}
		return fallback;
	}

	async #ensureRegistryLoaded(): Promise<void> {
		if (this.#isRegistryReady) return;
		if (this.#registryLoadPromise) {
			await this.#registryLoadPromise;
			return;
		}
		this.#registryLoadPromise = this.#loadRegistry();
		await this.#registryLoadPromise;
	}

	async #loadRegistry(): Promise<void> {
		try {
			const registrations = await this.#dependencies.discoverProviderDriverRegistrations();
			if (registrations.length === 0) {
				throw new ProviderManagerError('provider-unsupported', 'No provider driver modules were discovered.');
			}
			for (const registration of registrations) {
				this.registerDriver(registration.key, registration.createDriver, registration);
				this.registerEmailSyncService(registration.key, (driver) =>
					this.#dependencies.createEmailSyncService(registration, driver),
				);
				this.registerAncillarySyncService(registration.key, (driver) =>
					this.#dependencies.createAncillarySyncService(registration, driver),
				);
			}
			this.#isRegistryReady = true;
		} finally {
			this.#registryLoadPromise = null;
		}
	}

	#getOrCreateDriver(providerKey: MailProviderKey): ProviderRuntimeDriver {
		if (!this.#driverFactories.has(providerKey)) {
			throw new ProviderManagerError(
				'provider-unsupported',
				`Provider '${providerKey}' is not registered. Registered providers: ${this.listRegisteredDriverKeys().join(', ')}`,
			);
		}
		const registration = this.#driverRegistrations.get(providerKey);
		if (registration && !registration.enabled) {
			throw new ProviderManagerError('provider-disabled', `Provider '${providerKey}' is currently disabled.`);
		}
		const existing = this.#drivers.get(providerKey);
		if (existing) return existing;
		const created = this.#driverFactories.get(providerKey)!();
		this.#drivers.set(providerKey, created);
		return created;
	}

	#getOrCreateEmailSyncService(providerKey: MailProviderKey): ProviderEmailSyncService<TEmailSummary, TWorker> {
		const existing = this.#emailSyncServices.get(providerKey);
		if (existing) return existing;
		const factory = this.#emailSyncServiceFactories.get(providerKey);
		if (!factory) {
			throw new ProviderManagerError(
				'provider-unsupported',
				`Provider '${providerKey}' does not have a registered email sync service.`,
			);
		}
		const driver = this.#getOrCreateDriver(providerKey);
		const created = factory(driver);
		this.#emailSyncServices.set(providerKey, created);
		return created;
	}

	#getOrCreateAncillarySyncService(providerKey: MailProviderKey): ProviderAncillarySyncService<TDavSummary> {
		const existing = this.#ancillarySyncServices.get(providerKey);
		if (existing) return existing;
		const factory = this.#ancillarySyncServiceFactories.get(providerKey);
		if (!factory) {
			throw new ProviderManagerError(
				'provider-unsupported',
				`Provider '${providerKey}' does not have a registered ancillary sync service.`,
			);
		}
		const driver = this.#getOrCreateDriver(providerKey);
		const created = factory(driver);
		this.#ancillarySyncServices.set(providerKey, created);
		return created;
	}
}
