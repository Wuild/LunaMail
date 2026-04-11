import React, {useMemo, useState} from 'react';
import {Check, Mail, Sparkles} from 'lucide-react';
import type {AuthCapabilities, DavDiscoveryResult, DiscoverResult, OAuthSession} from '@/preload';
import {MAIL_PROVIDER_FLAGS, type MailProviderChoice} from '@/shared/mailProviderConfig';
import ServiceSettingsCard, {type ServiceSecurityMode} from '@renderer/components/settings/ServiceSettingsCard';
import {Button} from '@renderer/components/ui/button';
import {FormInput} from '@renderer/components/ui/FormControls';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {isEditableTarget} from '@renderer/lib/dom';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';

type Service = {host: string; port: number; security: ServiceSecurityMode};
type WizardStep = 1 | 2 | 3 | 4;
type VerifyType = 'imap' | 'smtp';
type SelectedAuthMethod = 'password' | 'app_password' | 'oauth2';
type ProviderChoice = MailProviderChoice;

type VerifyResult = {
	ok: boolean;
	error?: string;
};

const stepMeta: Record<WizardStep, {title: string; subtitle: string}> = {
	1: {title: 'Provider', subtitle: 'Choose account type'},
	2: {title: 'Credentials', subtitle: 'Email and automatic authentication'},
	3: {title: 'Manual Setup', subtitle: 'Server settings'},
	4: {title: 'Confirm', subtitle: 'Review and add'},
};

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
	const [step, setStep] = useState<WizardStep>(1);
	const [providerChoice, setProviderChoice] = useState<ProviderChoice | null>(null);
	const [email, setEmail] = useState('');
	const [name, setName] = useState('');
	const [password, setPassword] = useState('');
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
	const [davDiscovery, setDavDiscovery] = useState<DavDiscoveryResult | null>(null);
	const [usedManualSetup, setUsedManualSetup] = useState(false);
	const isOAuthProvider = providerChoice === 'google' || providerChoice === 'microsoft';
	const needsOAuthEmailFallback = isOAuthProvider && !!oauthSession && !oauthSession.email?.trim();
	const isGoogleProviderEnabled = MAIL_PROVIDER_FLAGS.google;
	const isMicrosoftProviderEnabled = MAIL_PROVIDER_FLAGS.microsoft;

	const canGoProviderNext = useMemo(() => providerChoice !== null, [providerChoice]);
	const canGoCredentialsNext = useMemo(() => (isOAuthProvider ? true : !!email.trim()), [email, isOAuthProvider]);
	const canVerifyManual = useMemo(() => !!imap?.host && !!imap.port && !!smtp?.host && !!smtp.port, [imap, smtp]);

	function resetMessages() {
		setError(null);
		setSuccess(null);
	}

	async function verifyService(
		type: VerifyType,
		svc: Service,
		authMethod: SelectedAuthMethod = selectedAuthMethod,
		session: OAuthSession | null = oauthSession,
		userEmail: string = email.trim(),
	): Promise<VerifyResult> {
		return ipcClient.verifyCredentials({
			type,
			host: svc.host,
			port: Number(svc.port),
			secure: svc.security === 'ssl',
			user: userEmail,
			password: authMethod === 'oauth2' ? undefined : password || undefined,
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
			throw new Error(imapResult.error || 'IMAP verification failed.');
		}

		const smtpResult = await verifyService('smtp', smtpService, authMethod, session, userEmail);
		if (!smtpResult.ok) {
			throw new Error(smtpResult.error || 'SMTP verification failed.');
		}
	}

	async function discoverDavPreview(imapService: Service, accountEmail: string = email.trim()): Promise<void> {
		try {
			const discovered = await ipcClient.discoverDavPreview({
				email: accountEmail,
				user: accountEmail,
				password,
				imapHost: imapService.host,
			});
			setDavDiscovery(discovered);
		} catch {
			setDavDiscovery(null);
		}
	}

	async function onCredentialsNext() {
		if (!canGoCredentialsNext) return;
		if (!providerChoice) {
			setError('Select a provider to continue.');
			return;
		}
		setLoading(true);
		resetMessages();

		let discovered: DiscoverResult;
		if (providerChoice === 'google') {
			if (!isGoogleProviderEnabled) {
				setError('Google account provider is disabled in this build.');
				setLoading(false);
				return;
			}
			discovered = buildProviderPresetDiscoverResult('google');
		} else if (providerChoice === 'microsoft') {
			if (!isMicrosoftProviderEnabled) {
				setError('Microsoft account provider is disabled in this build.');
				setLoading(false);
				return;
			}
			discovered = buildProviderPresetDiscoverResult('microsoft');
		} else {
			try {
				discovered = (await ipcClient.discoverMailSettings(email.trim())) as DiscoverResult;
			} catch (e: any) {
				const message = e?.message || String(e);
				setError(`Could not run autodiscover: ${message}`);
				setLoading(false);
				return;
			}
		}

		try {
			const hasAutoSettings = !!discovered?.imap && !!discovered?.smtp;
			const nextAuthMethod =
				providerChoice === 'google' || providerChoice === 'microsoft'
					? 'oauth2'
					: resolveAuthMethodFromDiscovery(discovered?.auth ?? null);
			let accountEmail = email.trim();
			setSelectedAuthMethod(nextAuthMethod);
			setAuthCapabilities(discovered?.auth ?? null);
			setProvider(discovered?.provider ?? null);

			let activeOAuthSession = oauthSession;
			if (nextAuthMethod === 'oauth2' && !activeOAuthSession?.accessToken) {
				const session = await ipcClient.startMailOAuth({
					email: accountEmail,
					provider: discovered?.provider ?? null,
				});
				setOauthSession(session);
				activeOAuthSession = session;
				if (session.email?.trim()) {
					accountEmail = session.email.trim();
					setEmail(accountEmail);
				}
				if (!name.trim() && session.displayName?.trim()) setName(session.displayName.trim());
				setSuccess('Provider sign-in completed. Verifying server settings now.');
			}

			if (!accountEmail) {
				setError('Provider sign-in did not return an email address. Enter your email to continue.');
				return;
			}

			if (nextAuthMethod !== 'oauth2' && !password.trim()) {
				setError(
					nextAuthMethod === 'app_password'
						? 'This provider requires an app-specific password. Generate one in provider security settings and enter it.'
						: 'Enter your account password to continue.',
				);
				return;
			}

			if (!hasAutoSettings) {
				const [, domain] = accountEmail.split('@');
				setImap(
					discovered?.imap
						? {
								host: discovered.imap.host,
								port: discovered.imap.port,
								security: discovered.imap.secure ? 'ssl' : 'starttls',
							}
						: {host: domain ? `imap.${domain}` : '', port: 993, security: 'ssl'},
				);
				setPop3(
					discovered?.pop3
						? {
								host: discovered.pop3.host,
								port: discovered.pop3.port,
								security: discovered.pop3.secure ? 'ssl' : 'starttls',
							}
						: null,
				);
				setSmtp(
					discovered?.smtp
						? {
								host: discovered.smtp.host,
								port: discovered.smtp.port,
								security: discovered.smtp.secure ? 'ssl' : 'starttls',
							}
						: {host: domain ? `smtp.${domain}` : '', port: 465, security: 'ssl'},
				);
				setUsedManualSetup(true);
				setStep(3);
				setSuccess('Autodiscover did not return complete settings. Enter server settings manually.');
				return;
			}

			setImap({
				host: discovered.imap!.host,
				port: discovered.imap!.port,
				security: discovered.imap!.secure ? 'ssl' : 'starttls',
			});
			setPop3(
				discovered.pop3
					? {
							host: discovered.pop3.host,
							port: discovered.pop3.port,
							security: discovered.pop3.secure ? 'ssl' : 'starttls',
						}
					: null,
			);
			setSmtp({
				host: discovered.smtp!.host,
				port: discovered.smtp!.port,
				security: discovered.smtp!.secure ? 'ssl' : 'starttls',
			});
			const discoveredImap: Service = {
				host: discovered.imap!.host,
				port: discovered.imap!.port,
				security: discovered.imap!.secure ? 'ssl' : 'starttls',
			};
			const discoveredSmtp: Service = {
				host: discovered.smtp!.host,
				port: discovered.smtp!.port,
				security: discovered.smtp!.secure ? 'ssl' : 'starttls',
			};

			try {
				await verifyImapAndSmtp(
					discoveredImap,
					discoveredSmtp,
					nextAuthMethod,
					nextAuthMethod === 'oauth2' ? activeOAuthSession : null,
					accountEmail,
				);
				await discoverDavPreview(discoveredImap, accountEmail);
				setUsedManualSetup(false);
				setSuccess('Account verified successfully.');
				setStep(4);
			} catch (verifyError: any) {
				const message = verifyError?.message || String(verifyError);
				if (message === 'Wrong username or password.' || isCredentialErrorMessage(message)) {
					setError(buildAuthFailureMessage(discovered?.auth ?? null, message));
					return;
				}
				setUsedManualSetup(true);
				setStep(3);
				setSuccess('Autodiscover succeeded. Please review server settings manually.');
			}
		} finally {
			setLoading(false);
		}
	}

	async function onVerifyManual() {
		if (!imap || !smtp || !canVerifyManual) return;
		if (selectedAuthMethod === 'oauth2' && !oauthSession?.accessToken) {
			setError('Return to step 2 to continue with provider sign-in.');
			return;
		}
		setLoading(true);
		resetMessages();
		try {
			await verifyImapAndSmtp(imap, smtp);
			await discoverDavPreview(imap);
			setSuccess('Server settings verified successfully.');
			setStep(4);
		} catch (e: any) {
			const message = e?.message || String(e);
			if (message === 'Wrong username or password.' || isCredentialErrorMessage(message)) {
				setError(buildAuthFailureMessage(authCapabilities, message));
				return;
			}
			setError(`Could not verify settings: ${message}`);
		} finally {
			setLoading(false);
		}
	}

	async function onSave() {
		if (!imap || !smtp) return;
		setLoading(true);
		resetMessages();
		try {
			await ipcClient.addAccount({
				email: email.trim(),
				display_name:
					selectedAuthMethod === 'oauth2'
						? String(oauthSession?.displayName || '').trim() || null
						: name.trim() || null,
				provider,
				imap_host: imap.host,
				imap_port: Number(imap.port),
				imap_secure: imap.security === 'ssl' ? 1 : 0,
				pop3_host: pop3?.host ?? null,
				pop3_port: pop3?.port ?? null,
				pop3_secure: pop3 ? (pop3.security === 'ssl' ? 1 : 0) : null,
				smtp_host: smtp.host,
				smtp_port: Number(smtp.port),
				smtp_secure: smtp.security === 'ssl' ? 1 : 0,
				user: email.trim(),
				password: selectedAuthMethod === 'oauth2' ? undefined : password,
				auth_method: selectedAuthMethod,
				oauth_provider: selectedAuthMethod === 'oauth2' ? oauthSession?.provider ?? null : null,
				oauth_session: selectedAuthMethod === 'oauth2' ? oauthSession : null,
			});
			setSuccess('Account added successfully.');
			onCompleted?.();
			if (!embedded) {
				window.close();
			}
		} catch (e: any) {
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	function updateService(setter: React.Dispatch<React.SetStateAction<Service | null>>, patch: Partial<Service>) {
		setter((prev) => ({host: '', port: 0, security: 'ssl', ...(prev ?? {}), ...patch}));
	}

	function onProviderNext() {
		if (!providerChoice) return;
		applyProviderChoice(providerChoice);
	}

	function applyProviderChoice(choice: ProviderChoice) {
		if (choice === 'google' && !isGoogleProviderEnabled) {
			setError('Google account provider is disabled in this build.');
			return;
		}
		if (choice === 'microsoft' && !isMicrosoftProviderEnabled) {
			setError('Microsoft account provider is disabled in this build.');
			return;
		}
		resetMessages();
		setProviderChoice(choice);
		setProvider(choice === 'custom' ? null : choice);
		setAuthCapabilities(choice === 'custom' ? null : buildProviderPresetAuth(choice));
		setSelectedAuthMethod(choice === 'custom' ? 'password' : 'oauth2');
		setOauthSession(null);
		setUsedManualSetup(false);
		if (choice !== 'custom') {
			setName('');
		}
		setPassword('');
		setStep(2);
	}

	const primaryActionDisabled =
		loading ||
		(step === 1 && !canGoProviderNext) ||
		(step === 2 && !canGoCredentialsNext) ||
		(step === 3 && !canVerifyManual);

		const primaryActionLabel =
		step === 1
			? 'Continue'
			: step === 2
			? isOAuthProvider
				? loading
					? 'Authenticating...'
					: 'Authenticate'
				: loading
					? 'Checking account...'
					: 'Next'
			: step === 3
				? loading
					? 'Verifying...'
					: 'Verify and Continue'
				: loading
					? 'Saving...'
					: 'Add Account';

	async function onPrimaryAction() {
		if (step === 1) {
			onProviderNext();
			return;
		}
		if (step === 2) {
			await onCredentialsNext();
			return;
		}
		if (step === 3) {
			await onVerifyManual();
			return;
		}
		await onSave();
	}

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (primaryActionDisabled) return;
		void onPrimaryAction();
	}

	function onBack() {
		resetMessages();
		if (step === 2) {
			setStep(1);
			return;
		}
		if (step === 3) {
			setStep(2);
			return;
		}
		if (step === 4) {
			setStep(usedManualSetup ? 3 : 2);
		}
	}

	const canClose = embedded && typeof onCancel === 'function';
	const authGuidance = authCapabilities ? buildAuthGuidance(authCapabilities) : null;
	const appPasswordNote = authCapabilities?.methods?.find((method) => method.method === 'app_password')?.note ?? null;

	return (
		<div className={`${embedded ? 'h-full w-full' : 'h-screen w-screen'} workspace-content overflow-hidden`}>
			<div className="panel flex h-full w-full flex-col overflow-hidden border-0">
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
								Account setup
							</div>
							<div className="mt-4 w-full max-w-[300px]">
								<h2 className="text-xl font-semibold">
									{hasAccounts ? 'Connect another mailbox' : 'Connect your first mailbox'}
								</h2>
								<p className="mt-1 text-sm text-inverse opacity-80">
									We will auto-detect settings, verify auth, and save everything securely.
								</p>
								<ul className="mt-5 space-y-2.5 text-left text-sm text-inverse opacity-90">
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										Fast autodiscover
									</li>
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										Manual fallback when needed
									</li>
									<li className="flex items-center gap-2.5">
										<span
											className="rounded-full p-1"
											style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
										>
											<Check size={12} />
										</span>
										IMAP/SMTP verification before save
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
								Step {step} of 4
							</p>
							<h3 className="ui-text-primary mt-1 text-lg font-semibold">{stepMeta[step].title}</h3>
							<div className="ui-surface-hover mt-3 h-1.5 w-full rounded-full">
								<div
									className="button-primary h-1.5 rounded-full border-0 transition-all"
									style={{width: `${(step / 4) * 100}%`}}
								/>
							</div>
						</div>
						<main className="min-h-0 flex-1">
							<div className="h-full overflow-y-auto px-6 py-5 md:px-8 md:py-6">
								<div className="mx-auto w-full max-w-5xl">
									{step === 1 && (
										<section className="space-y-5">
											<header>
												<h3 className="ui-text-primary text-2xl font-semibold">Choose your provider</h3>
												<p className="ui-text-muted mt-1 text-sm">
													Select the account type to get the best sign-in flow.
												</p>
											</header>
											<div className="mx-auto flex w-full max-w-xl flex-col gap-3">
												<ProviderCard
													title="Custom IMAP/SMTP"
													description="Use autodiscover and password or app password."
													icon={<Mail size={20} />}
													active={providerChoice === 'custom'}
													onClick={() => applyProviderChoice('custom')}
												/>
												{isGoogleProviderEnabled && (
													<ProviderCard
														title="Google"
														description="Sign in with Google OAuth."
														icon={<GoogleLogo size={20} />}
														active={providerChoice === 'google'}
														onClick={() => applyProviderChoice('google')}
													/>
												)}
												{isMicrosoftProviderEnabled && (
													<ProviderCard
														title="Microsoft"
														description="Sign in with Microsoft OAuth."
														icon={<MicrosoftLogo size={20} />}
														active={providerChoice === 'microsoft'}
														onClick={() => applyProviderChoice('microsoft')}
													/>
												)}
											</div>
										</section>
									)}

									{step === 2 && (
										<section className="space-y-5">
											<header>
												{isOAuthProvider && (
													<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
														{providerChoice === 'google' ? <GoogleLogo size={20} /> : <MicrosoftLogo size={20} />}
														<span className="ui-text-secondary text-xs font-semibold uppercase tracking-wide">
															{providerChoice === 'google' ? 'Google' : 'Microsoft'} sign-in
														</span>
													</div>
												)}
												<h3 className="ui-text-primary text-2xl font-semibold">
													Enter your account credentials
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													We will autodiscover your server settings and verify authentication.
												</p>
											</header>

											<div className="space-y-4">
												{providerChoice === 'custom' && (
													<Field
														label="Name (optional)"
														value={name}
														onChange={setName}
														placeholder="Your display name"
													/>
												)}
												{(!isOAuthProvider || needsOAuthEmailFallback) && (
													<Field
														label="Email"
														value={email}
														onChange={setEmail}
														placeholder="you@domain.com"
													/>
												)}
												{isOAuthProvider && (
													<p className="ui-text-muted text-xs">
														For {providerChoice === 'google' ? 'Google' : 'Microsoft'}, email and account name are loaded
														from provider sign-in automatically.
													</p>
												)}
												{selectedAuthMethod === 'oauth2' ? (
													<div className="notice-info rounded-xl px-4 py-3 text-sm">
														<p className="font-semibold">Provider sign-in will open automatically</p>
														<p className="mt-1 text-xs opacity-90">
															After clicking Next, we will open your provider login page so you can complete 2FA/passkey.
														</p>
													</div>
												) : (
													<Field
														label={selectedAuthMethod === 'app_password' ? 'App password' : 'Password'}
														value={password}
														onChange={setPassword}
														type="password"
													/>
												)}
											</div>
											{authGuidance && (
												<div className="notice-info rounded-xl px-4 py-3 text-sm">
													<p className="font-semibold">{authGuidance.title}</p>
													<p className="mt-1 text-xs opacity-90">{authGuidance.description}</p>
												</div>
											)}
											{oauthSession && selectedAuthMethod === 'oauth2' && (
												<div className="notice-info rounded-xl px-4 py-3 text-sm">
													<p className="font-semibold">Provider session connected</p>
													<p className="mt-1 text-xs opacity-90">
														{oauthSession.email ? `Signed in as ${oauthSession.email}.` : 'OAuth session is ready.'}
													</p>
												</div>
											)}
											{selectedAuthMethod === 'app_password' && (
												<div className="notice-info rounded-xl px-4 py-3 text-sm">
													<p className="font-semibold">Using app-specific password</p>
													<p className="mt-1 text-xs opacity-90">
														{appPasswordNote ||
															'Generate an app password in your provider security settings, then paste it into the password field above.'}
													</p>
												</div>
											)}

											{loading && (
												<div className="notice-info flex items-start gap-3 rounded-xl px-4 py-3 text-sm">
													<span
														className="spinner-info mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full"
														aria-hidden
													/>
													<div>
														<p className="font-semibold">Running autodiscover</p>
														<p className="mt-0.5 text-xs opacity-90">
															Detecting server settings and verifying IMAP/SMTP
															credentials.
														</p>
													</div>
												</div>
											)}
										</section>
									)}

									{step === 3 && (
										<section className="space-y-5">
											<header>
												<h3 className="ui-text-primary text-2xl font-semibold">
													Manual server setup
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													Autodiscover did not return complete settings. Enter IMAP and SMTP
													manually.
												</p>
											</header>

											<div className="grid gap-4">
												<ServiceSettingsCard
													title="IMAP Incoming"
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
													title="SMTP Outgoing"
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
											{authGuidance && (
												<div className="notice-info rounded-xl px-4 py-3 text-sm">
													<p className="font-semibold">{authGuidance.title}</p>
													<p className="mt-1 text-xs opacity-90">{authGuidance.description}</p>
												</div>
											)}
										</section>
									)}

									{step === 4 && (
										<section className="space-y-5">
											<header>
												<h3 className="ui-text-primary text-2xl font-semibold">
													Confirm account details
												</h3>
												<p className="ui-text-muted mt-1 text-sm">
													Everything looks good. Save to add this mailbox.
												</p>
											</header>

											<div className="space-y-1">
												<SummaryRow label="Email" value={email} />
												<SummaryRow label="Provider" value={provider ?? 'custom'} />
												<SummaryRow
													label="IMAP"
													value={`${imap?.host ?? '-'}:${imap?.port ?? '-'}`}
												/>
												<SummaryRow
													label="SMTP"
													value={`${smtp?.host ?? '-'}:${smtp?.port ?? '-'}`}
												/>
												{davDiscovery?.carddavUrl && (
													<SummaryRow label="CardDAV" value={davDiscovery.carddavUrl} />
												)}
												{davDiscovery?.caldavUrl && (
													<SummaryRow label="CalDAV" value={davDiscovery.caldavUrl} />
												)}
											</div>
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
								disabled={loading || (!canClose && step === 1)}
								onClick={() => {
									if (step === 1 && canClose) {
										onCancel?.();
										return;
									}
									onBack();
								}}
								className="button-secondary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
							>
								{step === 1 && canClose ? 'Cancel' : 'Back'}
							</Button>
							<Button
								type="submit"
								disabled={primaryActionDisabled}
								className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
									step === 4 ? 'button-success' : 'button-primary'
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
}> = ({
	title,
	description,
	icon,
	active,
	onClick,
}) => (
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
				active ? 'bg-white/20 text-on-brand' : 'ui-surface text-brand'
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

function buildAuthFailureMessage(auth: AuthCapabilities | null, fallbackMessage: string): string {
	if (!auth) return fallbackMessage;
	if (auth.preferredMethod === 'oauth2') {
		return 'This provider usually requires OAuth sign-in (2FA/passkeys supported) or an app password. Direct password login may be blocked.';
	}
	if (auth.preferredMethod === 'app_password') {
		return 'This provider usually requires an app-specific password for IMAP/SMTP. Generate one in provider security settings and retry.';
	}
	return fallbackMessage;
}

function buildAuthGuidance(auth: AuthCapabilities): {title: string; description: string} {
	const preferredTitle =
		auth.preferredMethod === 'oauth2'
			? 'Recommended auth: OAuth sign-in'
			: auth.preferredMethod === 'app_password'
				? 'Recommended auth: App-specific password'
				: 'Recommended auth: Account password';
	const methodNotes = auth.methods
		.filter((method) => method.supported && method.note)
		.map((method) => method.note?.trim())
		.filter((note): note is string => !!note);

	const securityNotes: string[] = [];
	if (auth.supportsTwoFactorFlow) securityNotes.push('2FA supported via provider sign-in flow.');
	if (auth.supportsPasskeysViaProvider) securityNotes.push('Passkeys are handled in provider sign-in, not direct IMAP/SMTP.');
	const description = [...methodNotes.slice(0, 1), ...securityNotes].join(' ') || 'Use the recommended auth method.';
	return {title: preferredTitle, description};
}

function resolveAuthMethodFromDiscovery(auth: AuthCapabilities | null): SelectedAuthMethod {
	if (!auth) return 'password';
	if (auth.preferredMethod === 'oauth2') return 'oauth2';
	if (auth.preferredMethod === 'app_password') return 'app_password';
	return 'password';
}

function buildProviderPresetAuth(provider: Exclude<ProviderChoice, 'custom'>): AuthCapabilities {
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

function buildProviderPresetDiscoverResult(provider: Exclude<ProviderChoice, 'custom'>): DiscoverResult {
	if (provider === 'google') {
		return {
			provider: 'google',
			imap: {host: 'imap.gmail.com', port: 993, secure: true},
			smtp: {host: 'smtp.gmail.com', port: 465, secure: true},
			auth: buildProviderPresetAuth('google'),
		};
	}
	return {
		provider: 'microsoft',
		imap: {host: 'outlook.office365.com', port: 993, secure: true},
		smtp: {host: 'smtp.office365.com', port: 587, secure: false},
		auth: buildProviderPresetAuth('microsoft'),
	};
}
