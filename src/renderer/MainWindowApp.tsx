import {Button} from '@llamamail/ui/button';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, X} from '@llamamail/ui/icon';
import {useLocation, useNavigate} from 'react-router-dom';
import {Modal} from '@llamamail/ui/modal';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {useAccounts} from './hooks/ipc/useAccounts';
import {useAutoUpdateState} from './hooks/ipc/useAutoUpdateState';
import {useAppSettings} from './hooks/ipc/useAppSettings';
import {useIpcEvent} from './hooks/ipc/useIpcEvent';
import {ipcClient} from './lib/ipcClient';
import type {GlobalErrorEvent} from '@llamamail/app/ipcTypes';
import type {PublicCloudAccount, SyncStatusEvent} from '@preload';
import {ContextMenu, ContextMenuItem} from '@llamamail/ui/contextmenu';
import MainWindowRoutes from './app/MainWindowRoutes';
import {MainWindowIpcBridge} from './app/MainWindowIpcBridge';
import {useApp} from '@renderer/app/AppContext';
import {useRuntimeStore} from '@renderer/store/runtimeStore';
import {useNotificationStore} from '@renderer/store/notificationStore';
import {useI18n} from '@llamamail/app/i18n/renderer';
import {
	emitReconnectRequired,
	isReconnectRequiredMessage,
	RECONNECT_REQUIRED_EVENT,
	type ReconnectRequest,
} from '@renderer/lib/reconnectPrompt';

type MainNavContextItemId = 'email' | 'contacts' | 'calendar' | 'cloud' | 'settings' | 'debug' | 'help';
type MainNavContextMenuState = {
	id: MainNavContextItemId;
	label: string;
	to: string;
	x: number;
	y: number;
};

export default function MainWindowApp() {
	return <MainWindowShell />;
}

function MainWindowShell() {
	const {t} = useI18n();
	const {setShowNavRail} = useApp();
	const location = useLocation();
	const navigate = useNavigate();
	const {accounts, selectedAccountId, setSelectedAccountId} = useAccounts();
	const {autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();
	const {appSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
	const developerMode = Boolean(appSettings.developerMode);
	const showRouteOverlay = developerMode && Boolean(appSettings.developerShowRouteOverlay);
	const showSendNotifications = Boolean(appSettings.developerShowSendNotifications);
	const showSystemFailureNotifications = Boolean(appSettings.developerShowSystemFailureNotifications);
	const showDebugNavItem = developerMode && Boolean(appSettings.developerShowDebugNavItem);
	const [globalErrors, setGlobalErrors] = useState<GlobalErrorEvent[]>([]);
	const [restartBusy, setRestartBusy] = useState(false);
	const notifications = useNotificationStore((state) => state.notifications);
	const createNotification = useNotificationStore((state) => state.createNotification);
	const updateNotification = useNotificationStore((state) => state.updateNotification);
	const dismissNotification = useNotificationStore((state) => state.dismissNotification);
	const clearNotificationsByCategory = useNotificationStore((state) => state.clearNotificationsByCategory);
	const applySyncEvent = useRuntimeStore((state) => state.applySyncEvent);
	const [mainNavContextMenu, setMainNavContextMenu] = useState<MainNavContextMenuState | null>(null);
	const mainNavContextMenuRef = useRef<HTMLDivElement | null>(null);
	const [cloudAccounts, setCloudAccounts] = useState<PublicCloudAccount[]>([]);
	const [reconnectQueue, setReconnectQueue] = useState<ReconnectRequest[]>([]);
	const [reconnectBusyKey, setReconnectBusyKey] = useState<string | null>(null);

	const pushGlobalError = (entry: GlobalErrorEvent) => {
		setGlobalErrors((prev) => {
			const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
			return next.slice(0, 5);
		});
	};

	const dismissGlobalError = (id: string) => {
		setGlobalErrors((prev) => prev.filter((item) => item.id !== id));
	};

	useIpcEvent(ipcClient.onGlobalError, pushGlobalError);
	useIpcEvent(ipcClient.onSendEmailBackgroundStatus, (payload) => {
		if (!showSendNotifications) return;
		const id = `send:${payload.jobId}`;
		const clampedProgress = Math.max(0, Math.min(100, Math.round(payload.progress)));
		const isFinal = payload.phase === 'sent' || payload.phase === 'failed';
		const title = payload.phase === 'failed' ? t('main.send.send_failed_title') : t('main.send.sending_title');
		createNotification({
			id,
			title,
			message: payload.error ? `${payload.message} ${payload.error}` : payload.message,
			progress: clampedProgress,
			busy: !isFinal,
			tone: payload.phase === 'failed' ? 'danger' : payload.phase === 'sent' ? 'success' : 'info',
			category: 'send',
			autoCloseMs: isFinal ? 4200 : null,
		});
	});
	useIpcEvent(ipcClient.onAccountSyncStatus, (payload: SyncStatusEvent) => {
		applySyncEvent(payload);
		if (!showSystemFailureNotifications) return;
		if (payload.status !== 'error') return;
		const accountName =
			accounts.find((item) => item.id === payload.accountId)?.display_name?.trim() ||
			accounts.find((item) => item.id === payload.accountId)?.email ||
			`Account ${payload.accountId}`;
		const errorText = String(payload.syncError?.message || payload.error || t('main.sync.unknown_error')).trim();
		const category = payload.syncError?.category;
		const isAuthFailure =
			category === 'auth' ||
			category === 'renewal' ||
			/(authentication|auth|password|credential|login|invalid credentials)/i.test(errorText);
		const title = isAuthFailure
			? t('main.sync.authentication_failed')
			: category === 'rate_limit'
				? t('main.sync.rate_limited')
				: category === 'timeout'
					? t('main.sync.sync_timeout')
					: t('main.sync.sync_failed');
		createNotification({
			id: `system:${isAuthFailure ? 'auth' : 'sync'}:${payload.accountId}:${errorText}`.slice(0, 160),
			title,
			message: `${accountName}: ${errorText}`,
			progress: 100,
			busy: false,
			tone: 'danger',
			category: 'system',
			autoCloseMs: 6500,
			accountId: isAuthFailure ? payload.accountId : undefined,
		});
		if (isAuthFailure) {
			emitReconnectRequired({
				kind: 'mail',
				accountId: payload.accountId,
				reason: errorText,
			});
		}
	});

	useEffect(() => {
		let active = true;
		void ipcClient
			.getCloudAccounts()
			.then((rows) => {
				if (!active) return;
				setCloudAccounts(rows);
			})
			.catch(() => undefined);
		const off = ipcClient.onCloudAccountsUpdated((rows) => {
			if (!active) return;
			setCloudAccounts(rows);
		});
		return () => {
			active = false;
			if (typeof off === 'function') off();
		};
	}, []);

	useEffect(() => {
		const onReconnectRequired = (event: Event) => {
			const customEvent = event as CustomEvent<ReconnectRequest>;
			const detail = customEvent.detail;
			if (!detail || !Number.isFinite(Number(detail.accountId)) || Number(detail.accountId) <= 0) return;
			const normalized: ReconnectRequest = {
				kind: detail.kind === 'cloud' ? 'cloud' : 'mail',
				accountId: Number(detail.accountId),
				reason: String(detail.reason || '').trim() || t('main.sync.reconnect_required'),
			};
			setReconnectQueue((prev) => {
				const exists = prev.some((item) => item.kind === normalized.kind && item.accountId === normalized.accountId);
				if (exists) return prev;
				return [...prev, normalized];
			});
		};
		window.addEventListener(RECONNECT_REQUIRED_EVENT, onReconnectRequired as EventListener);
		return () => {
			window.removeEventListener(RECONNECT_REQUIRED_EVENT, onReconnectRequired as EventListener);
		};
	}, []);

	useEffect(() => {
		if (globalErrors.length === 0) return;
		for (const item of globalErrors) {
			const message = String(item.message || '').trim();
			if (!isReconnectRequiredMessage(message)) continue;
			if (!selectedAccountId) continue;
			emitReconnectRequired({
				kind: 'mail',
				accountId: selectedAccountId,
				reason: message,
			});
			break;
		}
	}, [globalErrors, selectedAccountId]);

	useEffect(() => {
		if (!mainNavContextMenu) return;
		const onWindowClick = () => setMainNavContextMenu(null);
		const onWindowContextMenu = () => setMainNavContextMenu(null);
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setMainNavContextMenu(null);
		};
		window.addEventListener('click', onWindowClick);
		window.addEventListener('contextmenu', onWindowContextMenu);
		window.addEventListener('keydown', onEscape);
		return () => {
			window.removeEventListener('click', onWindowClick);
			window.removeEventListener('contextmenu', onWindowContextMenu);
			window.removeEventListener('keydown', onEscape);
		};
	}, [mainNavContextMenu]);

	useEffect(() => {
		setMainNavContextMenu(null);
	}, [location.pathname, location.search]);

	useEffect(() => {
		if (!showSendNotifications) {
			clearNotificationsByCategory('send');
		}
	}, [clearNotificationsByCategory, showSendNotifications]);

	useEffect(() => {
		if (!showSystemFailureNotifications) {
			clearNotificationsByCategory('system');
		}
	}, [clearNotificationsByCategory, showSystemFailureNotifications]);

	useEffect(() => {
		if (notifications.length === 0) return;
		const timers = notifications
			.filter((item) => !item.busy && typeof item.autoCloseMs === 'number' && item.autoCloseMs > 0)
			.map((item) =>
				window.setTimeout(() => {
					dismissNotification(item.id);
				}, item.autoCloseMs as number),
			);
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [dismissNotification, notifications]);

	useEffect(() => {
		const timers: number[] = [];
		const onPreview = () => {
			const jobId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
			const id = `send:${jobId}`;
			createNotification({
				id,
				title: t('main.send.sending_title'),
				message: t('main.send.queued_message'),
				progress: 12,
				busy: true,
				tone: 'info',
				category: 'send',
			});
			timers.push(
				window.setTimeout(() => {
					updateNotification(id, {
						title: t('main.send.sending_title'),
						message: t('main.send.sending_message'),
						progress: 62,
						busy: true,
						tone: 'info',
						category: 'send',
					});
				}, 450),
			);
			timers.push(
				window.setTimeout(() => {
					updateNotification(id, {
						title: t('main.send.sending_title'),
						message: t('main.send.sent_message'),
						progress: 100,
						busy: false,
						tone: 'success',
						category: 'send',
						autoCloseMs: 4200,
					});
				}, 1200),
			);
		};
		window.addEventListener('llamamail:preview-send-notification', onPreview);
		const onPreviewSyncFailure = () => {
			createNotification({
				id: `system:preview-sync-failure-${Date.now().toString(36)}`,
				title: t('main.sync.sync_failed'),
				message: t('main.demo.sync_failed_message'),
				progress: 100,
				busy: false,
				tone: 'danger',
				category: 'system',
				autoCloseMs: 6500,
			});
		};
		const onPreviewAuthFailure = () => {
			const accountId = accounts[0]?.id ?? 1;
			createNotification({
				id: `system:preview-auth-failure-${Date.now().toString(36)}`,
				title: t('main.sync.authentication_failed'),
				message: t('main.demo.auth_failed_message'),
				progress: 100,
				busy: false,
				tone: 'danger',
				category: 'system',
				autoCloseMs: 6500,
				accountId,
			});
		};
		window.addEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
		window.addEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
		return () => {
			window.removeEventListener('llamamail:preview-send-notification', onPreview);
			window.removeEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
			window.removeEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [accounts, createNotification, t, updateNotification]);

	useEffect(() => {
		const onWindowError = (event: ErrorEvent) => {
			pushGlobalError({
				id: `renderer-window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message: event.message || t('errors.renderer_unexpected'),
				detail: event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			const message = reason instanceof Error ? reason.message : String(reason ?? t('errors.unhandled_promise_rejection'));
			pushGlobalError({
				id: `renderer-rejection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message,
				detail: reason instanceof Error ? reason.stack : null,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		window.addEventListener('error', onWindowError);
		window.addEventListener('unhandledrejection', onUnhandledRejection);
		return () => {
			window.removeEventListener('error', onWindowError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
		};
	}, [t]);

	useEffect(() => {
		if (globalErrors.length === 0) return;
		const timer = window.setTimeout(() => {
			const oldest = globalErrors[globalErrors.length - 1];
			if (oldest) {
				dismissGlobalError(oldest.id);
			}
		}, 15000);
		return () => {
			window.clearTimeout(timer);
		};
	}, [globalErrors]);

	const queuedReconnect = reconnectQueue[0] ?? null;
	const queuedReconnectKey = queuedReconnect ? `${queuedReconnect.kind}:${queuedReconnect.accountId}` : null;
	const queuedReconnectAccountLabel = queuedReconnect
		? queuedReconnect.kind === 'cloud'
			? (cloudAccounts.find((item) => item.id === queuedReconnect.accountId)?.name ??
				`Cloud account ${queuedReconnect.accountId}`)
			: (accounts.find((item) => item.id === queuedReconnect.accountId)?.display_name?.trim() ||
				accounts.find((item) => item.id === queuedReconnect.accountId)?.email ||
				`Account ${queuedReconnect.accountId}`)
		: null;

	const dismissReconnectPrompt = useCallback(() => {
		if (!queuedReconnect) return;
		setReconnectQueue((prev) => prev.filter((item) => !(item.kind === queuedReconnect.kind && item.accountId === queuedReconnect.accountId)));
	}, [queuedReconnect]);

	const onReconnectQueued = useCallback(async () => {
		if (!queuedReconnect || !queuedReconnectKey) return;
		setReconnectBusyKey(queuedReconnectKey);
		try {
			if (queuedReconnect.kind === 'cloud') {
				await ipcClient.relinkCloudOAuth(queuedReconnect.accountId, {});
			} else {
				const account = accounts.find((item) => item.id === queuedReconnect.accountId) ?? null;
				if (!account) throw new Error(`Account ${queuedReconnect.accountId} not found.`);
				const provider = String(account.oauth_provider || account.provider || '')
					.trim()
					.toLowerCase();
				const oauthProvider =
					provider === 'microsoft' || provider.includes('outlook') || provider.includes('office')
						? 'microsoft'
						: provider === 'google' || provider.includes('gmail')
							? 'google'
							: null;
				if (!oauthProvider) {
					navigate(`/settings/account?accountId=${queuedReconnect.accountId}`);
				} else {
					const session = await ipcClient.startMailOAuth({
						provider: oauthProvider,
						email: account.email,
					});
					await ipcClient.updateAccount(account.id, {
						email: account.email,
						provider: account.provider,
						auth_method: 'oauth2',
						oauth_provider: session.provider ?? oauthProvider,
						display_name: account.display_name,
						reply_to: account.reply_to,
						organization: account.organization,
						signature_text: account.signature_text,
						signature_is_html: account.signature_is_html,
						signature_file_path: account.signature_file_path,
						attach_vcard: account.attach_vcard,
						imap_host: account.imap_host,
						imap_port: account.imap_port,
						imap_secure: account.imap_secure,
						pop3_host: account.pop3_host,
						pop3_port: account.pop3_port,
						pop3_secure: account.pop3_secure,
						smtp_host: account.smtp_host,
						smtp_port: account.smtp_port,
						smtp_secure: account.smtp_secure,
						sync_emails: account.sync_emails,
						sync_contacts: account.sync_contacts,
						sync_calendar: account.sync_calendar,
						user: account.user,
						password: null,
						oauth_session: session,
					});
					void ipcClient.syncAccount(account.id).catch(() => undefined);
				}
			}
			setReconnectQueue((prev) =>
				prev.filter((item) => !(item.kind === queuedReconnect.kind && item.accountId === queuedReconnect.accountId)),
			);
		} catch (error: any) {
			pushGlobalError({
				id: `reconnect-failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message: t('main.reconnect.failed', {
					error: String(error?.message || error || t('errors.unknown_error')),
				}),
				detail: null,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		} finally {
			setReconnectBusyKey((current) => (current === queuedReconnectKey ? null : current));
		}
	}, [accounts, navigate, queuedReconnect, queuedReconnectKey, t]);

	const hideMainNavRail = location.pathname.startsWith('/onboarding') || location.pathname.startsWith('/add-account');

	const showUpdateBanner =
		autoUpdatePhase === 'available' || autoUpdatePhase === 'downloading' || autoUpdatePhase === 'downloaded';
	const updateBannerText =
		autoUpdateMessage ||
		(autoUpdatePhase === 'downloaded'
			? t('main.update.downloaded_ready')
			: autoUpdatePhase === 'downloading'
				? t('main.update.downloading')
				: t('main.update.available'));
	const pendingRestartItems: string[] = [];
	if (appSettings.pendingHardwareAcceleration !== null) pendingRestartItems.push(t('main.restart.hardware_acceleration'));
	if (appSettings.pendingUseNativeTitleBar !== null) pendingRestartItems.push(t('main.restart.native_titlebar'));
	const hasRestartRequiredBanner = pendingRestartItems.length > 0;

	const onRestartNow = useCallback(() => {
		if (restartBusy) return;
		setRestartBusy(true);
		void ipcClient.restartApp().catch(() => {
			setRestartBusy(false);
		});
	}, [restartBusy]);

	useEffect(() => {
		setShowNavRail(!hideMainNavRail);
		return () => {
			setShowNavRail(false);
		};
	}, [hideMainNavRail, setShowNavRail]);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<MainWindowIpcBridge />
			{showUpdateBanner && (
				<div className="notice-warning shrink-0 border-b px-3 py-2">
					<div className="mx-auto flex w-full max-w-350 items-center justify-between gap-3">
						<span className="text-sm font-medium">{updateBannerText}</span>
						<Button
							type="button"
							className="notice-button-warning shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
							onClick={() => navigate('/settings/application')}
						>
							{t('main.update.open_settings')}
						</Button>
					</div>
				</div>
			)}
			{globalErrors.length > 0 && (
				<div className="notice-danger shrink-0 border-b px-3 py-2">
					<div className="mx-auto flex w-full max-w-350 flex-col gap-2">
						{globalErrors.map((item) => (
							<div key={item.id} className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="truncate text-sm font-semibold">{item.message}</div>
									<div className="truncate text-xs opacity-80">
										{item.source} · {new Date(item.timestamp).toLocaleTimeString()}
									</div>
								</div>
								<Button
									type="button"
									className="notice-button-danger shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
									onClick={() => dismissGlobalError(item.id)}
								>
									{t('main.dismiss')}
								</Button>
							</div>
						))}
					</div>
				</div>
			)}

			<main className="min-h-0 min-w-0 flex-1 overflow-hidden">
				<div className="flex h-full min-h-0 flex-col overflow-hidden">
					{hasRestartRequiredBanner && (
						<div className="notice-info shrink-0 border-b px-3 py-2">
							<div className="flex w-full items-center justify-between gap-3">
								<span className="text-sm font-medium">
									{t('main.restart.required_apply', {items: pendingRestartItems.join(', ')})}
								</span>
								<Button
									type="button"
									className="notice-button-info shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
									onClick={onRestartNow}
									disabled={restartBusy}
								>
									{restartBusy ? t('main.restart.restarting') : t('main.restart.restart_now')}
								</Button>
							</div>
						</div>
					)}
					<div className="min-h-0 flex-1 overflow-hidden">
						<MainWindowRoutes
							accountId={selectedAccountId}
							accounts={accounts}
							onSelectAccount={setSelectedAccountId}
							showDebugNavItem={showDebugNavItem}
						/>
					</div>
				</div>
			</main>
			{showRouteOverlay && (
				<div
					className={`overlay route-overlay-text pointer-events-none fixed right-3 z-1200 rounded-md px-2.5 py-1.5 font-mono text-[11px] shadow-sm ${
						notifications.length > 0 ? 'bottom-21' : 'bottom-3'
					}`}
				>
					{`#${location.pathname}${location.search || ''}`}
				</div>
			)}
			{notifications.length > 0 && (
				<div className="fixed bottom-3 right-3 z-1187 flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col-reverse gap-2">
					{notifications.map((item) => (
						<div
							key={item.id}
							role={item.accountId ? 'button' : undefined}
							tabIndex={item.accountId ? 0 : -1}
							onClick={() => {
								if (!item.accountId) return;
								navigate(`/settings/account/${item.accountId}`);
							}}
							onKeyDown={(event) => {
								if (!item.accountId) return;
								if (event.key !== 'Enter' && event.key !== ' ') return;
								event.preventDefault();
								navigate(`/settings/account/${item.accountId}`);
							}}
							className={`overlay overflow-hidden rounded-md shadow-lg backdrop-blur ${
								item.accountId ? 'cursor-pointer' : ''
							}`}
						>
							<div className="px-3 py-2.5">
								<div className="flex items-center justify-between gap-2">
									<p className="ui-text-primary truncate text-sm font-medium">{item.title}</p>
									<div className="flex items-center gap-1">
										<span className="ui-text-muted text-[11px]">{item.progress}%</span>
										{!item.busy && (
											<Button
												type="button"
												className="menu-item inline-flex h-6 w-6 items-center justify-center rounded"
												onClick={() => dismissNotification(item.id)}
												aria-label={t('main.dismiss_notification')}
											>
												<X size={13} />
											</Button>
										)}
									</div>
								</div>
								<p className="ui-text-secondary mt-0.5 flex items-center gap-1.5 truncate text-xs">
									{item.busy && <Loader2 size={12} className="shrink-0 animate-spin" />}
									<span className="truncate">{item.message}</span>
								</p>
							</div>
							<div className="progress-track h-1.5 w-full">
								<div
									className={`h-full transition-all duration-300 ease-out ${
										item.tone === 'danger'
											? 'progress-fill-danger'
											: item.tone === 'success'
												? 'progress-fill-success'
												: 'progress-fill-info'
									}`}
									style={{width: `${item.progress}%`}}
								/>
							</div>
						</div>
					))}
				</div>
			)}
			{queuedReconnect && queuedReconnectAccountLabel && (
				<Modal
					open
					onClose={dismissReconnectPrompt}
					backdropClassName="z-[1205] backdrop-blur-[1px]"
					contentClassName="max-w-md p-4"
				>
					<div className="mb-3">
						<h3 className="ui-text-primary text-base font-semibold">{t('main.reconnect.title')}</h3>
						<p className="ui-text-muted mt-1 text-xs">
							{t('main.reconnect.needs_sign_in', {account: queuedReconnectAccountLabel})}
						</p>
						<p className="ui-text-muted mt-2 text-xs">{queuedReconnect.reason}</p>
						<div className="ui-text-muted mt-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] p-2 text-xs">
							<p className="ui-text-primary mb-1 font-medium">{t('main.reconnect.why_happen')}</p>
							<p>
								{t('main.reconnect.why_happen_body')}
							</p>
						</div>
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={dismissReconnectPrompt}
							disabled={reconnectBusyKey === queuedReconnectKey}
						>
							{t('main.reconnect.later')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							onClick={() => void onReconnectQueued()}
							disabled={reconnectBusyKey === queuedReconnectKey}
						>
							{reconnectBusyKey === queuedReconnectKey ? t('main.reconnect.connecting') : t('main.reconnect.action')}
						</Button>
					</div>
				</Modal>
			)}
			{mainNavContextMenu && (
				<ContextMenu
					ref={mainNavContextMenuRef}
					size="nav"
					layer="1202"
					position={{left: mainNavContextMenu.x, top: mainNavContextMenu.y}}
					onRequestClose={() => setMainNavContextMenu(null)}
					onClick={(event) => event.stopPropagation()}
					onContextMenu={(event) => event.preventDefault()}
				>
					<ContextMenuItem
						type="button"
						className="transition-colors"
						onClick={() => {
							navigate(mainNavContextMenu.to);
							setMainNavContextMenu(null);
						}}
					>
						{t('main.context.open', {label: mainNavContextMenu.label})}
					</ContextMenuItem>
					{mainNavContextMenu.id === 'debug' && (
						<ContextMenuItem
							type="button"
							className="transition-colors"
							onClick={() => {
								void ipcClient.openDebugWindow();
								setMainNavContextMenu(null);
							}}
						>
							{t('main.context.open_debug_new_window')}
						</ContextMenuItem>
					)}
				</ContextMenu>
			)}
		</div>
	);
}
