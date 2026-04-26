import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Check, Mail, Sparkles} from '@llamamail/ui/icon';
import type {
	AuthCapabilities,
	DavDiscoveryResult,
	DiscoverResult,
	OAuthSession,
	ProviderDriverCatalogItem,
} from '@preload';
import ServiceSettingsCard, {type ServiceSecurityMode} from '@renderer/components/settings/ServiceSettingsCard';
import {Button} from '@llamamail/ui/button';
import {FormCheckbox, FormInput} from '@llamamail/ui/form';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {isEditableTarget} from '@renderer/lib/dom';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';
import {Card} from '@llamamail/ui/card';
import {useI18n} from '@llamamail/app/i18n/renderer';

type Service = {host: string; port: number; security: ServiceSecurityMode};
type WizardStep = 1 | 2 | 3;
type VerifyType = 'imap' | 'smtp';
type DavServiceType = 'carddav' | 'caldav';
type SelectedAuthMethod = 'password' | 'app_password' | 'oauth2';
type ProviderChoice = string;

type VerifyResult = {
	ok: boolean;
	error?: string;
};

type TranslateFn = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;

type SettingsAddAccountProps = {
	embedded?: boolean;
	hasAccounts?: boolean;
	onCompleted?: () => void;
	onCancel?: () => void;
};

const SettingsAddAccount: React.FC<SettingsAddAccountProps> = ({
	embedded = false,
	hasAccounts = false,
	onCompleted,
	onCancel,
}) => {
	useAppTheme();
	const {t} = useI18n();

	const [step, setStep] = useState<WizardStep>(1);
	const [providerChoice, setProviderChoice] = useState<ProviderChoice | null>(null);
	const [email, setEmail] = useState('');
	const [name, setName] = useState('');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [imapUsername, setImapUsername] = useState('');
	const [imapPassword, setImapPassword] = useState('');
	const [smtpUsername, setSmtpUsername] = useState('');
	const [smtpPassword, setSmtpPassword] = useState('');
	const [carddavUsername, setCarddavUsername] = useState('');
	const [carddavPassword, setCarddavPassword] = useState('');
	const [caldavUsername, setCaldavUsername] = useState('');
	const [caldavPassword, setCaldavPassword] = useState('');
	const [provider, setProvider] = useState<string | null>(null);
	const [imap, setImap] = useState<Service | null>(null);
	const [pop3, setPop3] = useState<Service | null>(null);
	const [smtp, setSmtp] = useState<Service | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilities | null>(null);
	const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null);
	const [selectedAuthMethod, setSelectedAuthMethod] = useState<SelectedAuthMethod>('password');
	const [syncEmails, setSyncEmails] = useState(1);
	const [syncContacts, setSyncContacts] = useState(1);
	const [syncCalendar, setSyncCalendar] = useState(1);
	const [davDiscovery, setDavDiscovery] = useState<DavDiscoveryResult | null>(null);
	const [providerDriverCatalog, setProviderDriverCatalog] = useState<ProviderDriverCatalogItem[]>([]);
	const oauthAttemptRef = useRef(0);
	const providerCatalogByKey = useMemo(
		() => new Map(providerDriverCatalog.map((item) => [item.key, item] as const)),
		[providerDriverCatalog],
	);
	const enabledProviderDrivers = useMemo(
		() => providerDriverCatalog.filter((item) => item.enabled),
		[providerDriverCatalog],
	);
	const providerCards = useMemo(() => {
		const ordered = [...enabledProviderDrivers].sort((left, right) => {
			if (left.key === 'custom') return -1;
			if (right.key === 'custom') return 1;
			return left.label.localeCompare(right.label);
		});
		return ordered.map((item) => ({
			key: item.key,
			title: item.label,
			description: describeProviderDriver(item, t),
			icon: getProviderIcon(item),
			driver: item,
		}));
	}, [enabledProviderDrivers, t]);
	const stepMeta = useMemo<Record<WizardStep, {title: string; subtitle: string}>>(
		() => ({
			1: {title: t('add_account.step.provider_title'), subtitle: t('add_account.step.provider_subtitle')},
			2: {title: t('add_account.step.signin_title'), subtitle: t('add_account.step.signin_subtitle')},
			3: {title: t('add_account.step.advanced_title'), subtitle: t('add_account.step.advanced_subtitle')},
		}),
		[t],
	);
	const selectedProviderDriver = useMemo(() => {
		if (!providerChoice) return null;
		return providerCatalogByKey.get(providerChoice) ?? null;
	}, [providerCatalogByKey, providerChoice]);
	const isOAuthProvider = useMemo(() => {
		if (!providerChoice || providerChoice === 'custom') return false;
		if (!selectedProviderDriver) return false;
		return selectedProviderDriver.supportedAuthMethods.includes('oauth2');
	}, [providerChoice, selectedProviderDriver]);
	const canGoProviderNext = useMemo(() => providerChoice !== null, [providerChoice]);
	const canGoCredentialsNext = useMemo(() => {
		if (isOAuthProvider) return true;
		return !!email.trim() && !!password;
	}, [email, isOAuthProvider, password]);
	const canVerifyManual = useMemo(() => !!imap?.host && !!imap.port && !!smtp?.host && !!smtp.port, [imap, smtp]);
	const selectedProviderCapabilities = useMemo(
		() =>
			selectedProviderDriver?.capabilities ?? {
				emails: true,
				contacts: true,
				calendar: true,
				files: false,
			},
		[selectedProviderDriver],
	);
	const canSaveModules = useMemo(() => syncEmails > 0 || syncContacts > 0 || syncCalendar > 0, [syncCalendar, syncContacts, syncEmails]);

	useEffect(() => {
		let active = true;
		void ipcClient
			.getProviderDriverCatalog()
			.then((rows) => {
				if (!active) return;
				setProviderDriverCatalog(Array.isArray(rows) ? rows : []);
			})
			.catch(() => {
				if (!active) return;
				setProviderDriverCatalog([]);
			});
		return () => {
			active = false;
		};
	}, []);

	function resetMessages() {
		setError(null);
		setSuccess(null);
	}

	function beginOAuthAttempt(): number {
		oauthAttemptRef.current += 1;
		return oauthAttemptRef.current;
	}

	function invalidateOAuthAttempt(): void {
		oauthAttemptRef.current += 1;
	}

	function isActiveOAuthAttempt(attemptId: number): boolean {
		return oauthAttemptRef.current === attemptId;
	}

	function resolveGlobalUsername(accountEmail: string): string {
		return String(username || '').trim() || String(accountEmail || '').trim();
	}

	function resolveServiceUsername(type: VerifyType, accountEmail: string): string {
		const globalUser = resolveGlobalUsername(accountEmail);
		const override = type === 'imap' ? imapUsername : smtpUsername;
		return String(override || '').trim() || globalUser;
	}

	function resolveDavServiceUsername(type: DavServiceType, accountEmail: string): string {
		const globalUser = resolveGlobalUsername(accountEmail);
		const override = type === 'carddav' ? carddavUsername : caldavUsername;
		return String(override || '').trim() || globalUser;
	}

	function resolveServicePassword(type: VerifyType, authMethod: SelectedAuthMethod, accountEmail: string): string {
		if (authMethod === 'oauth2') return '';
		const globalPassword = normalizeAuthPassword(password, authMethod, providerChoice, provider, accountEmail);
		const overrideValue = type === 'imap' ? imapPassword : smtpPassword;
		const overridePassword = normalizeAuthPassword(overrideValue, authMethod, providerChoice, provider, accountEmail);
		return String(overridePassword || '').trim() || String(globalPassword || '').trim();
	}

	function resolveDavServicePassword(type: DavServiceType, authMethod: SelectedAuthMethod, accountEmail: string): string {
		if (authMethod === 'oauth2') return '';
		const globalPassword = normalizeAuthPassword(password, authMethod, providerChoice, provider, accountEmail);
		const overrideValue = type === 'carddav' ? carddavPassword : caldavPassword;
		const overridePassword = normalizeAuthPassword(overrideValue, authMethod, providerChoice, provider, accountEmail);
		return String(overridePassword || '').trim() || String(globalPassword || '').trim();
	}

	function getMissingCredentialMessage(authMethod: SelectedAuthMethod, accountEmail: string): string | null {
		if (authMethod === 'oauth2') return null;
		const imapUser = resolveServiceUsername('imap', accountEmail);
		const smtpUser = resolveServiceUsername('smtp', accountEmail);
		const imapPass = resolveServicePassword('imap', authMethod, accountEmail);
		const smtpPass = resolveServicePassword('smtp', authMethod, accountEmail);
		const carddavUser = resolveDavServiceUsername('carddav', accountEmail);
		const caldavUser = resolveDavServiceUsername('caldav', accountEmail);
		const carddavPass = resolveDavServicePassword('carddav', authMethod, accountEmail);
		const caldavPass = resolveDavServicePassword('caldav', authMethod, accountEmail);
		if (imapUser && smtpUser && imapPass && smtpPass && carddavUser && caldavUser && carddavPass && caldavPass) {
			return null;
		}
		if (authMethod === 'app_password') {
			return t('add_account.error.enter_username_app_password');
		}
		return t('add_account.error.enter_username_password');
	}

	function renderAdvancedCredentials() {
		if (isOAuthProvider || selectedAuthMethod === 'oauth2') return null;
		return (
			<Card>
				<div>
					<p className="ui-text-primary text-sm font-semibold">{t('add_account.advanced_credentials.title')}</p>
					<p className="ui-text-muted mt-1 text-xs">
						{t('add_account.advanced_credentials.description')}
					</p>
				</div>
				<div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
					<Field
						label={t('add_account.field.global_username_optional')}
						value={username}
						onChange={setUsername}
						placeholder={t('add_account.placeholder.defaults_to_email')}
					/>
					<div />
					<Field
						label={t('add_account.field.imap_username_optional')}
						value={imapUsername}
						onChange={setImapUsername}
						placeholder={t('add_account.placeholder.defaults_to_global_username')}
					/>
					<Field
						type="password"
						label={t('add_account.field.imap_password_optional')}
						value={imapPassword}
						onChange={setImapPassword}
						placeholder={t('add_account.placeholder.defaults_to_step_password')}
					/>
					<Field
						label={t('add_account.field.smtp_username_optional')}
						value={smtpUsername}
						onChange={setSmtpUsername}
						placeholder={t('add_account.placeholder.defaults_to_global_username')}
					/>
					<Field
						type="password"
						label={t('add_account.field.smtp_password_optional')}
						value={smtpPassword}
						onChange={setSmtpPassword}
						placeholder={t('add_account.placeholder.defaults_to_step_password')}
					/>
					<Field
						label={t('add_account.field.carddav_username_optional')}
						value={carddavUsername}
						onChange={setCarddavUsername}
						placeholder={t('add_account.placeholder.defaults_to_global_username')}
					/>
					<Field
						type="password"
						label={t('add_account.field.carddav_password_optional')}
						value={carddavPassword}
						onChange={setCarddavPassword}
						placeholder={t('add_account.placeholder.defaults_to_step_password')}
					/>
					<Field
						label={t('add_account.field.caldav_username_optional')}
						value={caldavUsername}
						onChange={setCaldavUsername}
						placeholder={t('add_account.placeholder.defaults_to_global_username')}
					/>
					<Field
						type="password"
						label={t('add_account.field.caldav_password_optional')}
						value={caldavPassword}
						onChange={setCaldavPassword}
						placeholder={t('add_account.placeholder.defaults_to_step_password')}
					/>
				</div>
			</Card>
		);
	}

	function renderModuleSelection() {
		return (
			<Card>
				<p className="ui-text-primary text-sm font-semibold">{t('add_account.modules.title')}</p>
				<p className="ui-text-muted mt-1 text-xs">
					{t('add_account.modules.description')}
				</p>
				<div className="mt-3 space-y-2">
					<label className="ui-text-secondary flex items-center justify-between gap-3 text-sm">
						<span>{t('add_account.modules.email')}</span>
						<FormCheckbox
							checked={syncEmails > 0}
							disabled={!selectedProviderCapabilities.emails}
							onChange={(event) => setSyncEmails(event.target.checked ? 1 : 0)}
						/>
					</label>
					<label className="ui-text-secondary flex items-center justify-between gap-3 text-sm">
						<span>{t('add_account.modules.contacts')}</span>
						<FormCheckbox
							checked={syncContacts > 0}
							disabled={!selectedProviderCapabilities.contacts}
							onChange={(event) => setSyncContacts(event.target.checked ? 1 : 0)}
						/>
					</label>
					<label className="ui-text-secondary flex items-center justify-between gap-3 text-sm">
						<span>{t('add_account.modules.calendar')}</span>
						<FormCheckbox
							checked={syncCalendar > 0}
							disabled={!selectedProviderCapabilities.calendar}
							onChange={(event) => setSyncCalendar(event.target.checked ? 1 : 0)}
						/>
					</label>
				</div>
				{!canSaveModules && (
					<p className="text-danger mt-3 text-xs">
						{t('add_account.error.select_module')}
					</p>
				)}
			</Card>
		);
	}

	async function verifyService(
		type: VerifyType,
		svc: Service,
		authMethod: SelectedAuthMethod = selectedAuthMethod,
		session: OAuthSession | null = oauthSession,
		userEmail: string = email.trim(),
	): Promise<VerifyResult> {
		const resolvedUser = resolveServiceUsername(type, userEmail);
		const normalizedPassword = resolveServicePassword(type, authMethod, userEmail);
		return ipcClient.verifyCredentials({
			type,
			host: svc.host,
			port: Number(svc.port),
			secure: svc.security === 'ssl',
			user: resolvedUser,
			password: authMethod === 'oauth2' ? undefined : normalizedPassword || undefined,
			auth_method: authMethod,
			oauth_session: authMethod === 'oauth2' ? session : null,
		});
	}

	async function verifyImapAndSmtp(
		imapService: Service,
		smtpService: Service,
		authMethod: SelectedAuthMethod = selectedAuthMethod,
		session: OAuthSession | null = oauthSession,
		userEmail: string = email.trim(),
	): Promise<void> {
		const imapResult = await verifyService('imap', imapService, authMethod, session, userEmail);
		if (!imapResult.ok) {
			throw new Error(imapResult.error || t('add_account.error.imap_verification_failed'));
		}

		const smtpResult = await verifyService('smtp', smtpService, authMethod, session, userEmail);
		if (!smtpResult.ok) {
			throw new Error(smtpResult.error || t('add_account.error.smtp_verification_failed'));
		}
	}

	async function discoverDavPreview(imapService: Service, accountEmail: string = email.trim()): Promise<void> {
		try {
			const normalizedPassword = resolveDavServicePassword('carddav', selectedAuthMethod, accountEmail);
			const discovered = await ipcClient.discoverDavPreview({
				email: accountEmail,
				user: resolveDavServiceUsername('carddav', accountEmail),
				password: normalizedPassword,
				imapHost: imapService.host,
				carddavUser: resolveDavServiceUsername('carddav', accountEmail),
				carddavPassword: resolveDavServicePassword('carddav', selectedAuthMethod, accountEmail),
				caldavUser: resolveDavServiceUsername('caldav', accountEmail),
				caldavPassword: resolveDavServicePassword('caldav', selectedAuthMethod, accountEmail),
			});
			setDavDiscovery(discovered);
		} catch {
			setDavDiscovery(null);
		}
	}

	async function addAccountWithResolved(overrides?: {
		email?: string;
		displayName?: string | null;
		provider?: string | null;
		authMethod?: SelectedAuthMethod;
		oauthSession?: OAuthSession | null;
		imap?: Service | null;
		smtp?: Service | null;
		pop3?: Service | null;
	}): Promise<void> {
		const accountEmail = String(overrides?.email ?? email).trim();
		const effectiveImap = overrides?.imap ?? imap;
		const effectiveSmtp = overrides?.smtp ?? smtp;
		const effectivePop3 = overrides?.pop3 ?? pop3;
		const effectiveProvider = overrides?.provider ?? provider;
		const effectiveAuthMethod = overrides?.authMethod ?? selectedAuthMethod;
		const effectiveOAuthSession = overrides?.oauthSession ?? oauthSession;
		const effectiveDisplayName =
			overrides?.displayName ??
			(effectiveAuthMethod === 'oauth2' ? String(effectiveOAuthSession?.displayName || '').trim() || null : name.trim() || null);

		if (!accountEmail) throw new Error(t('add_account.error.email_required'));
		if (!effectiveImap || !effectiveSmtp) throw new Error(t('add_account.error.imap_smtp_required'));

		const globalPassword = normalizeAuthPassword(password, effectiveAuthMethod, providerChoice, effectiveProvider, accountEmail);
		const globalUser = resolveGlobalUsername(accountEmail);
		const resolvedImapUser = resolveServiceUsername('imap', accountEmail);
		const resolvedSmtpUser = resolveServiceUsername('smtp', accountEmail);
		const resolvedImapPassword = resolveServicePassword('imap', effectiveAuthMethod, accountEmail);
		const resolvedSmtpPassword = resolveServicePassword('smtp', effectiveAuthMethod, accountEmail);
		const resolvedCarddavUser = resolveDavServiceUsername('carddav', accountEmail);
		const resolvedCaldavUser = resolveDavServiceUsername('caldav', accountEmail);
		const resolvedCarddavPassword = resolveDavServicePassword('carddav', effectiveAuthMethod, accountEmail);
		const resolvedCaldavPassword = resolveDavServicePassword('caldav', effectiveAuthMethod, accountEmail);

		await ipcClient.addAccount({
			email: accountEmail,
			display_name: effectiveDisplayName,
			provider: effectiveProvider,
			imap_host: effectiveImap.host,
			imap_port: Number(effectiveImap.port),
			imap_secure: effectiveImap.security === 'ssl' ? 1 : 0,
			pop3_host: effectivePop3?.host ?? null,
			pop3_port: effectivePop3?.port ?? null,
			pop3_secure: effectivePop3 ? (effectivePop3.security === 'ssl' ? 1 : 0) : null,
			smtp_host: effectiveSmtp.host,
			smtp_port: Number(effectiveSmtp.port),
			smtp_secure: effectiveSmtp.security === 'ssl' ? 1 : 0,
			imap_user: resolvedImapUser || accountEmail,
			smtp_user: resolvedSmtpUser || accountEmail,
			carddav_user: resolvedCarddavUser || globalUser || accountEmail,
			caldav_user: resolvedCaldavUser || globalUser || accountEmail,
			user: globalUser || accountEmail,
			password: effectiveAuthMethod === 'oauth2' ? undefined : globalPassword || undefined,
			imap_password: effectiveAuthMethod === 'oauth2' ? undefined : resolvedImapPassword || undefined,
			smtp_password: effectiveAuthMethod === 'oauth2' ? undefined : resolvedSmtpPassword || undefined,
			carddav_password: effectiveAuthMethod === 'oauth2' ? undefined : resolvedCarddavPassword || undefined,
			caldav_password: effectiveAuthMethod === 'oauth2' ? undefined : resolvedCaldavPassword || undefined,
			auth_method: effectiveAuthMethod,
			oauth_provider: effectiveAuthMethod === 'oauth2' ? (effectiveOAuthSession?.provider ?? null) : null,
			oauth_session: effectiveAuthMethod === 'oauth2' ? effectiveOAuthSession : null,
			sync_emails: syncEmails,
			sync_contacts: syncContacts,
			sync_calendar: syncCalendar,
		});

		setSuccess(t('add_account.success.account_added'));
		onCompleted?.();
		if (!embedded) {
			window.close();
		}
	}

	async function onCredentialsNext() {
		if (!canGoCredentialsNext || !providerChoice) return;
		if (!canSaveModules) {
			setError(t('add_account.error.select_module'));
			return;
		}

		resetMessages();

		if (isOAuthProvider) {
			const oauthProvider = providerChoice === 'google' || providerChoice === 'microsoft' ? providerChoice : null;
			if (!oauthProvider) {
				setError(t('add_account.error.oauth_google_microsoft_only'));
				return;
			}

			const attemptId = beginOAuthAttempt();
			setLoading(true);
			try {
				setSuccess(t('add_account.success.waiting_for_browser_signin'));
				const session = await ipcClient.startMailOAuth({
					provider: oauthProvider,
					email: email.trim() || null,
				});
				if (!isActiveOAuthAttempt(attemptId)) return;

				const providerDiscover = buildProviderPresetDiscoverResult(oauthProvider);
				if (!providerDiscover?.imap || !providerDiscover?.smtp) {
					throw new Error(t('add_account.error.oauth_provider_not_configured', {provider: oauthProvider}));
				}

				const accountEmail = String(session.email || email).trim();
				if (!accountEmail) {
					throw new Error(t('add_account.error.provider_signin_missing_email'));
				}
				const discoveredImap: Service = {
					host: providerDiscover.imap.host,
					port: providerDiscover.imap.port,
					security: providerDiscover.imap.secure ? 'ssl' : 'starttls',
				};
				const discoveredSmtp: Service = {
					host: providerDiscover.smtp.host,
					port: providerDiscover.smtp.port,
					security: providerDiscover.smtp.secure ? 'ssl' : 'starttls',
				};

				await verifyImapAndSmtp(discoveredImap, discoveredSmtp, 'oauth2', session, accountEmail);
				await discoverDavPreview(discoveredImap, accountEmail);

				setOauthSession(session);
				setSelectedAuthMethod('oauth2');
				setAuthCapabilities(providerDiscover.auth ?? buildProviderPresetAuth(oauthProvider));
				setProvider(oauthProvider);
				setImap(discoveredImap);
				setSmtp(discoveredSmtp);
				setPop3(null);
				setEmail(accountEmail);
				if (session.displayName?.trim()) {
					setName(session.displayName.trim());
				}

				await addAccountWithResolved({
					email: accountEmail,
					displayName: session.displayName?.trim() || null,
					provider: oauthProvider,
					authMethod: 'oauth2',
					oauthSession: session,
					imap: discoveredImap,
					smtp: discoveredSmtp,
					pop3: null,
				});
			} catch (e: any) {
				if (!isActiveOAuthAttempt(attemptId)) return;
				setError(e?.message || String(e));
			} finally {
				if (isActiveOAuthAttempt(attemptId)) {
					setLoading(false);
				}
			}
			return;
		}

		setLoading(true);
		try {
			const accountEmail = email.trim();
			if (!accountEmail) {
				setError(t('add_account.error.enter_email'));
				return;
			}

			const discovered = (await ipcClient.discoverMailSettings(accountEmail)) as DiscoverResult;
			const providerPreset = providerChoice !== 'custom' ? buildProviderPresetDiscoverResult(providerChoice) : null;
			const resolvedDiscovery: DiscoverResult = {
				...discovered,
				provider: discovered?.provider ?? providerPreset?.provider ?? null,
				imap: discovered?.imap ?? providerPreset?.imap,
				smtp: discovered?.smtp ?? providerPreset?.smtp,
				auth: discovered?.auth ?? providerPreset?.auth ?? authCapabilities ?? null,
			};
			const hasAutoSettings = Boolean(resolvedDiscovery.imap && resolvedDiscovery.smtp);
			const discoveredAuthMethod = resolveAuthMethodFromDiscovery(resolvedDiscovery.auth ?? null);
			const nextAuthMethod: SelectedAuthMethod =
				discoveredAuthMethod === 'oauth2'
					? resolveProviderPreferredAuthMethod(providerCatalogByKey.get(providerChoice))
					: discoveredAuthMethod;

			setSelectedAuthMethod(nextAuthMethod);
			setAuthCapabilities(resolvedDiscovery.auth ?? null);
			setProvider(providerChoice === 'custom' ? (resolvedDiscovery.provider ?? null) : providerChoice);

			const missingCredentialMessage = getMissingCredentialMessage(nextAuthMethod, accountEmail);
			if (missingCredentialMessage) {
				setError(missingCredentialMessage);
				return;
			}

			if (!hasAutoSettings) {
				if (providerChoice !== 'custom') {
					setError(t('add_account.error.provider_auto_config_failed_use_custom'));
					return;
				}
				const [, domain] = accountEmail.split('@');
				setImap({host: domain ? `imap.${domain}` : '', port: 993, security: 'ssl'});
				setSmtp({host: domain ? `smtp.${domain}` : '', port: 465, security: 'ssl'});
				setPop3(null);
				setStep(3);
				setError(t('add_account.error.autodiscover_incomplete_manual'));
				return;
			}

			const discoveredImap: Service = {
				host: resolvedDiscovery.imap!.host,
				port: resolvedDiscovery.imap!.port,
				security: resolvedDiscovery.imap!.secure ? 'ssl' : 'starttls',
			};
			const discoveredSmtp: Service = {
				host: resolvedDiscovery.smtp!.host,
				port: resolvedDiscovery.smtp!.port,
				security: resolvedDiscovery.smtp!.secure ? 'ssl' : 'starttls',
			};
			const discoveredPop3 = resolvedDiscovery.pop3
				? {
						host: resolvedDiscovery.pop3.host,
						port: resolvedDiscovery.pop3.port,
						security: resolvedDiscovery.pop3.secure ? 'ssl' : 'starttls',
					}
				: null;

			setImap(discoveredImap);
			setSmtp(discoveredSmtp);
			setPop3(discoveredPop3);

			try {
				await verifyImapAndSmtp(discoveredImap, discoveredSmtp, nextAuthMethod, null, accountEmail);
				await discoverDavPreview(discoveredImap, accountEmail);
			} catch (verifyError: any) {
				const message = verifyError?.message || String(verifyError);
				if (providerChoice === 'custom') {
					setStep(3);
					setError(t('add_account.error.verify_discovered_custom', {message}));
					return;
				}
				if (isCredentialErrorMessage(message)) {
					setError(buildAuthFailureMessage(resolvedDiscovery.auth ?? null, message, t, nextAuthMethod));
					return;
				}
				setError(t('add_account.error.verify_discovered', {message}));
				return;
			}

			await addAccountWithResolved({
				email: accountEmail,
				provider: providerChoice === 'custom' ? (resolvedDiscovery.provider ?? null) : providerChoice,
				authMethod: nextAuthMethod,
				oauthSession: null,
				imap: discoveredImap,
				smtp: discoveredSmtp,
				pop3: discoveredPop3,
			});
		} catch (e: any) {
			setError(t('add_account.error.autodiscover_failed', {message: e?.message || String(e)}));
		} finally {
			setLoading(false);
		}
	}

	async function onVerifyManual() {
		if (!imap || !smtp || !canVerifyManual) return;
		if (!canSaveModules) {
			setError(t('add_account.error.select_module'));
			return;
		}

		setLoading(true);
		resetMessages();
		try {
			const accountEmail = email.trim();
			if (!accountEmail) {
				setError(t('add_account.error.enter_email'));
				return;
			}
			await verifyImapAndSmtp(imap, smtp, selectedAuthMethod, oauthSession, accountEmail);
			await discoverDavPreview(imap, accountEmail);
			await addAccountWithResolved({
				email: accountEmail,
				imap,
				smtp,
				pop3,
				provider,
				authMethod: selectedAuthMethod,
				oauthSession,
			});
		} catch (e: any) {
			const message = e?.message || String(e);
			if (message === 'Wrong username or password.' || isCredentialErrorMessage(message)) {
				setError(buildAuthFailureMessage(authCapabilities, message, t, selectedAuthMethod));
				return;
			}
			setError(t('add_account.error.verify_settings_failed', {message}));
		} finally {
			setLoading(false);
		}
	}

	function updateService(setter: React.Dispatch<React.SetStateAction<Service | null>>, patch: Partial<Service>) {
		setter((prev) => ({host: '', port: 0, security: 'ssl', ...(prev ?? {}), ...patch}));
	}

	function onProviderNext() {
		if (!providerChoice) return;
		if (applyProviderChoice(providerChoice)) {
			setStep(2);
		}
	}

	function applyProviderChoice(choice: ProviderChoice): boolean {
		const driver = providerCatalogByKey.get(choice);
		if (choice !== 'custom' && (!driver || !driver.enabled)) {
			setError(t('add_account.error.provider_not_enabled', {provider: choice}));
			return false;
		}

		resetMessages();
		setProviderChoice(choice);
		setProvider(choice === 'custom' ? null : choice);
		setAuthCapabilities(choice === 'custom' ? null : buildProviderPresetAuth(choice));
		setSelectedAuthMethod(resolveProviderPreferredAuthMethod(driver));
		setOauthSession(null);
		const capabilities = driver?.capabilities ?? {emails: true, contacts: true, calendar: true, files: false};
		const defaultSyncEmails = capabilities.emails ? 1 : 0;
		const defaultSyncContacts = capabilities.contacts ? 1 : 0;
		const defaultSyncCalendar = capabilities.calendar ? 1 : 0;
		const fallbackSyncEmails =
			defaultSyncEmails || defaultSyncContacts || defaultSyncCalendar ? defaultSyncEmails : 1;
		setSyncEmails(fallbackSyncEmails);
		setSyncContacts(defaultSyncContacts);
		setSyncCalendar(defaultSyncCalendar);

		if (choice !== 'custom') {
			setEmail('');
			setName('');
			setUsername('');
		}

		setPassword('');
		setImapUsername('');
		setImapPassword('');
		setSmtpUsername('');
		setSmtpPassword('');
		setCarddavUsername('');
		setCarddavPassword('');
		setCaldavUsername('');
		setCaldavPassword('');
		return true;
	}

	const primaryActionDisabled =
		loading ||
		(step === 1 && !canGoProviderNext) ||
		(step === 2 && (!canGoCredentialsNext || !canSaveModules)) ||
		(step === 3 && (!canVerifyManual || !canSaveModules));

	const primaryActionLabel =
		step === 1
			? t('add_account.action.continue')
			: step === 2
				? isOAuthProvider
					? loading
						? t('add_account.action.waiting_authentication')
						: t('add_account.action.connect_and_add')
					: loading
						? t('add_account.action.adding_account')
						: t('add_account.action.verify_and_add')
				: step === 3
					? loading
						? t('add_account.action.verifying')
						: t('add_account.action.verify_and_add')
					: t('add_account.action.continue');

	async function onPrimaryAction() {
		if (step === 1) {
			onProviderNext();
			return;
		}
		if (step === 2) {
			await onCredentialsNext();
			return;
		}
		await onVerifyManual();
	}

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (primaryActionDisabled) return;
		void onPrimaryAction();
	}

	function onBack() {
		resetMessages();
		const cancelOAuthWait = loading && step === 2 && isOAuthProvider;
		if (cancelOAuthWait) {
			invalidateOAuthAttempt();
			setLoading(false);
			setSuccess(null);
			setError(null);
			void ipcClient.cancelMailOAuth().catch(() => undefined);
			return;
		}
		if (step === 2) {
			setStep(1);
			return;
		}
		if (step === 3) {
			setStep(2);
		}
	}

	const canClose = embedded && typeof onCancel === 'function';
	const canCancelOAuthWait = loading && step === 2 && isOAuthProvider;

	return (
		<div className={`${embedded ? 'h-full w-full' : 'h-screen w-screen'} workspace-content overflow-hidden`}>
			<div className="flex h-full w-full flex-col overflow-hidden border-0">
				<div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
					<aside
						className="relative hidden min-h-0 overflow-hidden px-6 py-7 text-inverse lg:flex lg:flex-col"
						style={{
							backgroundImage:
								'radial-gradient(120% 120% at 12% 0%, rgba(190, 132, 255, 0.52) 0%, transparent 52%), radial-gradient(120% 120% at 88% 100%, #7b3fe0 0%, transparent 56%), linear-gradient(160deg, #6a34cc 0%, #7440d8 40%, #552ab8 72%, #3c1e86 100%)',
						}}
					>
						<div
							className="absolute -left-14 top-8 h-52 w-52 rounded-full blur-3xl"
							style={{backgroundColor: 'rgba(255, 255, 255, 0.10)'}}
						/>
						<div
							className="absolute -right-16 bottom-0 h-56 w-56 rounded-full blur-3xl"
							style={{backgroundColor: 'rgba(236, 72, 153, 0.20)'}}
						/>
						<div
							className="absolute inset-x-0 bottom-0 h-40 opacity-45"
							style={{
								backgroundImage:
									'radial-gradient(70% 130% at 25% 100%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.22) 48%, transparent 74%), radial-gradient(80% 120% at 76% 100%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.16) 45%, transparent 73%)',
							}}
						/>
						<div className="relative z-10 flex h-full min-h-0 flex-col items-center justify-end text-center">
							<div
								className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide"
								style={{
									borderColor: 'rgba(255, 255, 255, 0.25)',
									backgroundColor: 'rgba(255, 255, 255, 0.10)',
								}}
							>
								<Sparkles size={14} />
								{t('add_account.badge')}
							</div>
							<div className="mt-4 w-full max-w-[300px]">
								<h2 className="text-xl font-semibold">
									{hasAccounts ? t('add_account.hero.connect_another') : t('add_account.hero.connect_first')}
								</h2>
								<p className="mt-1 text-sm text-inverse opacity-80">
									{t('add_account.hero.subtitle')}
								</p>
								<ul className="mt-5 space-y-2.5 text-left text-sm text-inverse opacity-90">
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										{t('add_account.hero.bullet_autodiscover')}
									</li>
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										{t('add_account.hero.bullet_manual_fallback')}
									</li>
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										{t('add_account.hero.bullet_verify_before_save')}
									</li>
								</ul>
							</div>
							<div className="mt-6 w-full max-w-[300px]">
								<img
									src={llamaArt}
									alt=""
									className="mx-auto h-auto w-full max-w-[220px] object-contain drop-shadow-[0_12px_28px_rgba(21,8,46,0.45)]"
									draggable={false}
								/>
							</div>
						</div>
					</aside>

					<form
						className="flex min-h-0 min-w-0 flex-1 flex-col"
						onSubmit={onSubmit}
						onContextMenuCapture={(event) => {
							if (!isEditableTarget(event.target as HTMLElement | null)) return;
							event.stopPropagation();
						}}
					>
						<div className="ui-border-default shrink-0 border-b px-6 py-5 md:px-8 md:py-6">
							<p className="ui-text-muted text-xs font-medium uppercase tracking-wide">
								{t('add_account.step.progress', {step})}
							</p>
							<h3 className="ui-text-primary mt-1 text-lg font-semibold">{stepMeta[step].title}</h3>
							<div className="ui-surface-hover mt-3 h-1.5 w-full rounded-full">
								<div
									className="button-primary h-1.5 rounded-full border-0 transition-all"
									style={{width: `${(step / 3) * 100}%`}}
								/>
							</div>
						</div>

						<main className="min-h-0 flex-1">
							<div className="h-full overflow-y-auto px-6 py-5 md:px-8 md:py-6">
								<div className="mx-auto w-full max-w-5xl">
									{step === 1 && (
										<section className="space-y-5">
											<header>
												<h3 className="ui-text-primary text-2xl font-semibold">
													{t('add_account.provider.choose_title')}
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													{t('add_account.provider.choose_subtitle')}
												</p>
											</header>

											<div className="mx-auto flex w-full max-w-xl flex-col gap-3">
												{providerCards.length > 0 ? (
													providerCards.map((card) => (
														<ProviderCard
															key={card.key}
															title={card.title}
															description={card.description}
															icon={card.icon}
															active={providerChoice === card.key}
															onClick={() => applyProviderChoice(card.key)}
														/>
													))
												) : (
													<p className="ui-text-muted rounded-lg border border-dashed px-4 py-3 text-sm">
														{t('add_account.provider.none_enabled')}
													</p>
												)}
												</div>
											</section>
										)}

									{step === 2 && (
										<section className="space-y-5">
											<header>
												{isOAuthProvider && (
													<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
														{getProviderIcon(selectedProviderDriver, 20)}
														<span className="ui-text-secondary text-xs font-semibold uppercase tracking-wide">
															{t('add_account.provider.signin_badge', {
																provider: selectedProviderDriver?.label || providerChoice || t('add_account.provider.provider_fallback'),
															})}
														</span>
													</div>
												)}
												<h3 className="ui-text-primary text-2xl font-semibold">
													{isOAuthProvider
														? t('add_account.credentials.oauth_title')
														: t('add_account.credentials.password_title')}
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													{isOAuthProvider
														? t('add_account.credentials.oauth_subtitle')
														: t('add_account.credentials.password_subtitle')}
												</p>
											</header>

											<div className="space-y-4">
												{!isOAuthProvider && (
													<>
														<Field
															label={t('add_account.field.name_optional')}
															value={name}
															onChange={setName}
															placeholder={t('add_account.placeholder.display_name')}
														/>
														<Field
															label={t('add_account.field.email')}
															value={email}
															onChange={setEmail}
															placeholder={t('add_account.placeholder.email')}
														/>
														<Field
															label={
																selectedAuthMethod === 'app_password'
																	? t('add_account.field.app_password')
																	: t('add_account.field.password')
															}
															value={password}
															onChange={setPassword}
															type="password"
														/>
													</>
												)}

												{isOAuthProvider && (
													<div className="notice-info rounded-xl px-4 py-4 text-sm">
														{!loading ? (
															<>
																<p className="font-semibold">{t('add_account.oauth.secure_signin_title')}</p>
																<p className="mt-1 text-xs opacity-90">
																	{t('add_account.oauth.secure_signin_subtitle')}
																</p>
															</>
														) : (
															<div className="flex items-start gap-3">
																<span
																	className="spinner-info mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full"
																	aria-hidden
																/>
																<div>
																	<p className="font-semibold">{t('add_account.oauth.waiting_title')}</p>
																	<p className="mt-1 text-xs opacity-90">
																		{t('add_account.oauth.waiting_subtitle')}
																	</p>
																</div>
															</div>
														)}
													</div>
												)}
											</div>

											{renderModuleSelection()}
										</section>
									)}

									{step === 3 && (
										<section className="space-y-5">
											<header>
												<h3 className="ui-text-primary text-2xl font-semibold">
													{t('add_account.advanced_setup.title')}
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													{t('add_account.advanced_setup.subtitle')}
												</p>
											</header>

											<div className="space-y-4">
												<Field
													label={t('add_account.field.email')}
													value={email}
													onChange={setEmail}
													placeholder={t('add_account.placeholder.email')}
												/>
												<Field
													label={
														selectedAuthMethod === 'app_password'
															? t('add_account.field.app_password')
															: t('add_account.field.password')
													}
													value={password}
													onChange={setPassword}
													type="password"
												/>
											</div>

											<div className="grid gap-4">
												<ServiceSettingsCard
													title={t('settings.account_email.imap_incoming')}
													host={imap?.host ?? ''}
													port={imap?.port ?? 0}
													security={imap?.security ?? 'ssl'}
													onHostChange={(host) => updateService(setImap, {host})}
													onPortChange={(port) => updateService(setImap, {port})}
													onSecurityChange={(security) => updateService(setImap, {security})}
													allowNone
													tone="muted"
													controlVariant="subtle"
													controlSize="lg"
												/>
												<ServiceSettingsCard
													title={t('settings.account_email.smtp_outgoing')}
													host={smtp?.host ?? ''}
													port={smtp?.port ?? 0}
													security={smtp?.security ?? 'ssl'}
													onHostChange={(host) => updateService(setSmtp, {host})}
													onPortChange={(port) => updateService(setSmtp, {port})}
													onSecurityChange={(security) => updateService(setSmtp, {security})}
													allowNone
													tone="muted"
													controlVariant="subtle"
													controlSize="lg"
												/>
											</div>
											{renderAdvancedCredentials()}
											{renderModuleSelection()}
										</section>
									)}

									{error && (
										<p className="notice-danger mt-5 rounded-lg px-4 py-2 text-sm">{error}</p>
									)}
									{success && (
										<p className="notice-info mt-5 rounded-lg px-4 py-2 text-sm">{success}</p>
									)}
								</div>
							</div>
						</main>

						<footer className="app-footer flex shrink-0 items-center justify-between px-6 py-4 md:px-8">
							<Button
								type="button"
								disabled={(loading && !canCancelOAuthWait) || (!canClose && step === 1)}
								onClick={() => {
									if (step === 1 && canClose) {
										onCancel?.();
										return;
									}
									onBack();
								}}
								className="button-secondary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
							>
								{step === 1 && canClose ? t('add_account.action.cancel') : t('add_account.action.back')}
							</Button>

							<Button
								type="submit"
								disabled={primaryActionDisabled}
								className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
									step === 3 ? 'button-success' : 'button-primary'
								}`}
							>
								{primaryActionLabel}
							</Button>
						</footer>
					</form>
				</div>
			</div>
		</div>
	);
};

const Field: React.FC<{
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: string;
}> = ({label, value, onChange, placeholder, type = 'text'}) => (
	<label className="block text-sm">
		<span className="ui-text-secondary font-medium">{label}</span>
		<FormInput
			type={type}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			placeholder={placeholder}
			variant="subtle"
			size="lg"
			className="mt-2"
		/>
	</label>
);

const ProviderCard: React.FC<{
	title: string;
	description: string;
	icon: React.ReactNode;
	active: boolean;
	onClick: () => void;
}> = ({title, description, icon, active, onClick}) => (
	<Button
		type="button"
		variant={active ? 'default' : 'secondary'}
		onClick={onClick}
		className={`ui-border-default flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
			active ? 'text-on-brand' : 'ui-surface-hover ui-text-primary'
		}`}
	>
		<span
			className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
				active ? 'ui-surface-hover text-on-brand' : 'ui-surface text-brand'
			}`}
		>
			{icon}
		</span>
		<span className="min-w-0">
			<p className="text-sm font-semibold">{title}</p>
			<p className={`mt-1 text-xs ${active ? 'text-on-brand/90' : 'ui-text-muted'}`}>{description}</p>
		</span>
	</Button>
);

const GoogleLogo: React.FC<{size?: number}> = ({size = 16}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
		<path
			fill="#EA4335"
			d="M12.24 10.29v3.94h5.57c-.24 1.27-.96 2.34-2.03 3.06l3.28 2.55c1.91-1.76 3.01-4.35 3.01-7.43 0-.72-.07-1.41-.19-2.08h-9.64z"
		/>
		<path
			fill="#34A853"
			d="M12 22c2.7 0 4.96-.89 6.61-2.41l-3.28-2.55c-.91.61-2.08.97-3.33.97-2.56 0-4.73-1.73-5.5-4.06H3.11v2.62A10 10 0 0 0 12 22z"
		/>
		<path
			fill="#FBBC05"
			d="M6.5 13.95A5.99 5.99 0 0 1 6.2 12c0-.68.12-1.34.3-1.95V7.43H3.11A10 10 0 0 0 2 12c0 1.61.39 3.14 1.11 4.57l3.39-2.62z"
		/>
		<path
			fill="#4285F4"
			d="M12 5.99c1.47 0 2.79.51 3.83 1.52l2.87-2.87C16.96 3.01 14.7 2 12 2A10 10 0 0 0 3.11 7.43l3.39 2.62C7.27 7.72 9.44 5.99 12 5.99z"
		/>
	</svg>
);

const MicrosoftLogo: React.FC<{size?: number}> = ({size = 16}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
		<rect x="3" y="3" width="8.5" height="8.5" fill="#F25022" />
		<rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00" />
		<rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF" />
		<rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900" />
	</svg>
);

const SummaryRow: React.FC<{label: string; value: string}> = ({label, value}) => (
	<div className="ui-border-default mb-2 flex items-start justify-between border-b pb-2 last:mb-0 last:border-b-0 last:pb-0">
		<span className="ui-text-secondary text-sm font-medium">{label}</span>
		<span className="ui-text-primary max-w-[65%] break-all text-right text-sm">{value}</span>
	</div>
);

export default SettingsAddAccount;

function isCredentialErrorMessage(message: string): boolean {
	return /(auth|credential|password|login|not authenticated|invalid)/i.test(message);
}

function buildAuthFailureMessage(
	auth: AuthCapabilities | null,
	fallbackMessage: string,
	t: TranslateFn,
	selectedMethod?: SelectedAuthMethod,
): string {
	if (!auth) return fallbackMessage;
	if (auth.preferredMethod === 'oauth2') {
		return t('add_account.error.auth.oauth_preferred');
	}
	if (auth.preferredMethod === 'app_password') {
		if (selectedMethod === 'app_password') {
			return t('add_account.error.auth.app_password_failed');
		}
		return t('add_account.error.auth.app_password_required');
	}
	return fallbackMessage;
}

function resolveAuthMethodFromDiscovery(auth: AuthCapabilities | null): SelectedAuthMethod {
	if (!auth) return 'password';
	if (auth.preferredMethod === 'oauth2') return 'oauth2';
	if (auth.preferredMethod === 'app_password') return 'app_password';
	return 'password';
}

function resolveProviderPreferredAuthMethod(driver: ProviderDriverCatalogItem | null | undefined): SelectedAuthMethod {
	if (!driver || driver.key === 'custom') return 'password';
	if (driver.recommendedAuthMethod === 'app_password') return 'app_password';
	if (driver.recommendedAuthMethod === 'oauth2' && (driver.key === 'google' || driver.key === 'microsoft')) {
		return 'oauth2';
	}
	return 'password';
}

function normalizeAuthPassword(
	rawPassword: string,
	authMethod: SelectedAuthMethod,
	providerChoice: string | null,
	provider: string | null,
	accountEmail: string,
): string {
	const value = String(rawPassword || '');
	if (authMethod !== 'app_password') return value;
	const choice = String(providerChoice || '')
		.trim()
		.toLowerCase();
	const resolvedProvider = String(provider || '')
		.trim()
		.toLowerCase();
	const emailDomain = String(accountEmail || '')
		.trim()
		.toLowerCase()
		.split('@')[1];
	const isIcloud =
		choice === 'icloud' ||
		resolvedProvider === 'icloud' ||
		emailDomain === 'icloud.com' ||
		emailDomain === 'me.com' ||
		emailDomain === 'mac.com';
	if (!isIcloud) return value;
	// Apple app-specific passwords are often shown with whitespace grouping.
	return value.replace(/\s+/g, '');
}

function buildProviderPresetAuth(provider: string): AuthCapabilities {
	if (provider === 'google') {
		return {
			preferredMethod: 'oauth2',
			supportsTwoFactorFlow: true,
			supportsPasskeysViaProvider: true,
			methods: [
				{
					method: 'oauth2',
					supported: true,
					recommended: true,
					note: 'Recommended. Handles 2FA and passkeys through Google sign-in.',
				},
				{
					method: 'app_password',
					supported: true,
					recommended: false,
					note: 'Fallback if your account policy requires app passwords.',
				},
				{
					method: 'password',
					supported: false,
					recommended: false,
					note: 'Regular passwords are typically blocked for IMAP/SMTP.',
				},
			],
		};
	}

	if (provider === 'microsoft') {
		return {
			preferredMethod: 'oauth2',
			supportsTwoFactorFlow: true,
			supportsPasskeysViaProvider: true,
			methods: [
				{
					method: 'oauth2',
					supported: true,
					recommended: true,
					note: 'Recommended. Handles MFA and passkeys through Microsoft sign-in.',
				},
				{
					method: 'app_password',
					supported: true,
					recommended: false,
					note: 'Some legacy tenants may require app passwords.',
				},
				{
					method: 'password',
					supported: false,
					recommended: false,
					note: 'Password-only sign-in is often disabled.',
				},
			],
		};
	}

	if (provider === 'icloud') {
		return {
			preferredMethod: 'app_password',
			supportsTwoFactorFlow: true,
			supportsPasskeysViaProvider: true,
			methods: [
				{
					method: 'app_password',
					supported: true,
					recommended: true,
					note: 'Generate one at appleid.apple.com > Sign-In and Security > App-Specific Passwords, then use that password here.',
				},
				{
					method: 'password',
					supported: false,
					recommended: false,
					note: 'Apple ID account passwords are blocked for IMAP/SMTP.',
				},
			],
		};
	}

	return {
		preferredMethod: 'oauth2',
		supportsTwoFactorFlow: true,
		supportsPasskeysViaProvider: true,
		methods: [
			{
				method: 'oauth2',
				supported: true,
				recommended: true,
				note: 'Recommended provider OAuth sign-in.',
			},
			{
				method: 'app_password',
				supported: true,
				recommended: false,
				note: 'Fallback when provider policy requires app passwords.',
			},
			{
				method: 'password',
				supported: true,
				recommended: false,
				note: 'May be blocked by provider security policies.',
			},
		],
	};
}

function buildProviderPresetDiscoverResult(provider: string): DiscoverResult | null {
	if (provider === 'google') {
		return {
			provider: 'google',
			imap: {host: 'imap.gmail.com', port: 993, secure: true},
			smtp: {host: 'smtp.gmail.com', port: 465, secure: true},
			auth: buildProviderPresetAuth('google'),
		};
	}

	if (provider === 'microsoft') {
		return {
			provider: 'microsoft',
			imap: {host: 'outlook.office365.com', port: 993, secure: true},
			smtp: {host: 'smtp.office365.com', port: 587, secure: false},
			auth: buildProviderPresetAuth('microsoft'),
		};
	}

	if (provider === 'icloud') {
		return {
			provider: 'icloud',
			imap: {host: 'imap.mail.me.com', port: 993, secure: true},
			smtp: {host: 'smtp.mail.me.com', port: 587, secure: false},
			auth: buildProviderPresetAuth('icloud'),
		};
	}

	return null;
}

function describeProviderDriver(driver: ProviderDriverCatalogItem, t: TranslateFn): string {
	if (driver.key === 'custom') return t('add_account.provider.custom_description');
	if (driver.key === 'google') return t('add_account.provider.google_description');
	if (driver.key === 'microsoft') return t('add_account.provider.microsoft_description');
	if (driver.key === 'icloud') return t('add_account.provider.icloud_description');
	return t('add_account.provider.generic_description', {provider: driver.label});
}

function getProviderIcon(driver: ProviderDriverCatalogItem | null | undefined, size = 20): React.ReactNode {
	const logo =
		driver?.logo ?? (driver?.key === 'google' ? 'google' : driver?.key === 'microsoft' ? 'microsoft' : 'mail');
	if (logo === 'google') return <GoogleLogo size={size} />;
	if (logo === 'microsoft') return <MicrosoftLogo size={size} />;
	return <Mail size={size} />;
}
