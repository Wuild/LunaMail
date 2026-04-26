import {useEffect, useState} from 'react';
import type {AppSettings} from '@preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {describeUpdatePhase} from '../mailFilterHelpers';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';
import {Button} from '@llamamail/ui/button';
import {FormCheckbox} from '@llamamail/ui/form';
import {Modal} from '@llamamail/ui/modal';
import {Container} from '@llamamail/ui/container';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsDeveloperPage() {
	const {t} = useI18n();
	const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
	const {state: autoUpdateState, setState: setAutoUpdateState} = useAutoUpdateState();
	const [developerStatus, setDeveloperStatus] = useState<string | null>(null);
	const [showUpdaterModal, setShowUpdaterModal] = useState(false);
	const [updateActionBusy, setUpdateActionBusy] = useState(false);
	const openUpdaterToken = useOpenUpdaterToken();

	useEffect(() => {
		if (!openUpdaterToken) return;
		setShowUpdaterModal(true);
	}, [openUpdaterToken]);

	async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
		setSettings((prev : AppSettings) => ({...prev, ...patch}));
		setDeveloperStatus(t('settings.status.saving'));
		try {
			const saved = await ipcClient.updateAppSettings(patch);
			setSettings(saved);
			setDeveloperStatus(t('settings.status.saved'));
			return true;
		} catch (e: any) {
			const latest = await ipcClient.getAppSettings().catch(() => null);
			if (latest) setSettings(latest);
			setDeveloperStatus(t('settings.status.save_failed', {error: e?.message || String(e)}));
			return false;
		}
	}

	async function onCheckForUpdates() {
		if (updateActionBusy) return;
		setUpdateActionBusy(true);
		try {
			const next = await ipcClient.checkForUpdates();
			setAutoUpdateState(next);
		} finally {
			setUpdateActionBusy(false);
		}
	}

	async function onDownloadUpdate() {
		if (updateActionBusy) return;
		setUpdateActionBusy(true);
		try {
			const next = await ipcClient.downloadUpdate();
			setAutoUpdateState(next);
		} finally {
			setUpdateActionBusy(false);
		}
	}

	async function onInstallUpdate() {
		await ipcClient.quitAndInstallUpdate();
	}

	async function onTriggerTestNotification() {
		setDeveloperStatus(t('settings.developer.status.sending_test_notification'));
		try {
			const result = await ipcClient.devShowNotification();
			if (!result.supported) {
				setDeveloperStatus(t('settings.developer.status.notifications_not_supported'));
				return;
			}
			setDeveloperStatus(
				result.hasTarget
					? t('settings.developer.status.test_notification_sent_target')
					: t('settings.developer.status.test_notification_sent_no_target'),
			);
		} catch (e: any) {
			setDeveloperStatus(t('settings.developer.status.notification_failed', {error: e?.message || String(e)}));
		}
	}

	async function onPlayNotificationSound() {
		setDeveloperStatus(t('settings.developer.status.playing_notification_sound'));
		try {
			const result = await ipcClient.devPlayNotificationSound();
			setDeveloperStatus(
				result.played
					? t('settings.developer.status.notification_sound_played')
					: t('settings.developer.status.notification_sound_failed'),
			);
		} catch (e: any) {
			setDeveloperStatus(t('settings.developer.status.sound_failed', {error: e?.message || String(e)}));
		}
	}

	async function onShowUpdaterWindow() {
		setDeveloperStatus(t('settings.developer.status.opening_updater_view'));
		try {
			const result = await ipcClient.devOpenUpdaterWindow();
			if (result.opened) {
				setDeveloperStatus(t('settings.developer.status.updater_view_opened'));
				return;
			}
			setDeveloperStatus(t('settings.developer.status.no_app_window'));
		} catch (e: any) {
			setDeveloperStatus(t('settings.developer.status.open_updater_failed', {error: e?.message || String(e)}));
		}
	}

	return (
		<Container>
			<section className="panel rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">{t('settings.developer.title')}</h2>
				<p className="mt-1 ui-text-muted text-sm">
					{t('settings.developer.subtitle')}
				</p>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<span className="ui-text-secondary">{t('settings.developer.developer_mode')}</span>
					<FormCheckbox
						checked={settings.developerMode}
						onChange={(e) => void applySettingsPatch({developerMode: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.developer.show_debug_nav')}</span>
						<p className="mt-1 ui-text-muted text-xs">
							{t('settings.developer.show_debug_nav_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.developerShowDebugNavItem}
						disabled={!settings.developerMode}
						onChange={(e) => void applySettingsPatch({developerShowDebugNavItem: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.developer.show_route_overlay')}</span>
						<p className="mt-1 ui-text-muted text-xs">
							{t('settings.developer.show_route_overlay_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.developerShowRouteOverlay}
						onChange={(e) => void applySettingsPatch({developerShowRouteOverlay: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.developer.show_send_notifications')}</span>
						<p className="mt-1 ui-text-muted text-xs">
							{t('settings.developer.show_send_notifications_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.developerShowSendNotifications}
						onChange={(e) => void applySettingsPatch({developerShowSendNotifications: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.developer.show_system_failures')}</span>
						<p className="mt-1 ui-text-muted text-xs">
							{t('settings.developer.show_system_failures_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.developerShowSystemFailureNotifications}
						onChange={(e) =>
							void applySettingsPatch({developerShowSystemFailureNotifications: e.target.checked})
						}
					/>
				</label>
				<label className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.developer.demo_mode')}</span>
						<p className="mt-1 ui-text-muted text-xs">
							{t('settings.developer.demo_mode_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.developerDemoMode}
						onChange={(e) => void applySettingsPatch({developerDemoMode: e.target.checked})}
					/>
				</label>
				<div className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div>
						<p className="ui-text-secondary">{t('settings.developer.send_notification_preview')}</p>
						<p className="mt-0.5 ui-text-muted text-xs">
							{t('settings.developer.send_notification_preview_description')}
						</p>
					</div>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-1.5 text-xs font-medium"
						onClick={() => {
							window.dispatchEvent(new CustomEvent('llamamail:preview-send-notification'));
							setDeveloperStatus(t('settings.developer.status.preview_send_notification'));
						}}
					>
						{t('settings.developer.preview')}
					</Button>
				</div>
			</section>

			<section className="panel rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">{t('settings.developer.test_actions_title')}</h2>
				<p className="mt-1 ui-text-muted text-sm">
					{t('settings.developer.test_actions_subtitle')}
				</p>
				<div className="mt-4 flex flex-wrap items-center gap-2">
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => {
							window.dispatchEvent(new CustomEvent('llamamail:preview-sync-failure'));
							setDeveloperStatus(t('settings.developer.status.preview_sync_failure'));
						}}
					>
						{t('settings.developer.preview_sync_failure')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => {
							window.dispatchEvent(new CustomEvent('llamamail:preview-auth-failure'));
							setDeveloperStatus(t('settings.developer.status.preview_auth_failure'));
						}}
					>
						{t('settings.developer.preview_auth_failure')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => void onTriggerTestNotification()}
					>
						{t('settings.developer.test_notification')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => void onPlayNotificationSound()}
					>
						{t('settings.developer.play_notification_sound')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => void onShowUpdaterWindow()}
					>
						{t('settings.developer.open_updater_window')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => ipcClient.openDevTools()}
					>
						{t('settings.developer.open_devtools')}
					</Button>
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => setShowUpdaterModal(true)}
					>
						{t('settings.developer.updater_controls')}
					</Button>
				</div>
			</section>

			{showUpdaterModal && (
				<Modal open onClose={() => setShowUpdaterModal(false)} contentClassName="max-w-xl p-0">
					<header className="ui-border-default border-b px-5 py-4">
						<h3 className="ui-text-primary text-base font-semibold">{t('settings.developer.updater_controls')}</h3>
						<p className="ui-text-muted mt-1 text-xs">
							{autoUpdateState.message || describeUpdatePhase(autoUpdateState)}
						</p>
					</header>
					<div className="space-y-3 px-5 py-4 text-sm">
						<div className="flex items-center justify-between gap-3">
							<span className="ui-text-secondary">{t('settings.developer.updater_current_version')}</span>
							<span className="ui-text-primary font-medium">{autoUpdateState.currentVersion}</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="ui-text-secondary">{t('settings.developer.updater_latest_version')}</span>
							<span className="ui-text-primary font-medium">{autoUpdateState.latestVersion || '-'}</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="ui-text-secondary">{t('settings.developer.updater_phase')}</span>
							<span className="ui-text-primary font-medium">{autoUpdateState.phase}</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="ui-text-secondary">{t('settings.developer.updater_progress')}</span>
							<span className="ui-text-primary font-medium">
								{autoUpdateState.percent !== null ? `${Math.round(autoUpdateState.percent)}%` : '-'}
							</span>
						</div>
					</div>
					<footer className="ui-border-default flex items-center justify-end gap-2 border-t px-5 py-4">
						<Button
							type="button"
							variant="secondary"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setShowUpdaterModal(false)}
						>
							{t('settings.developer.close')}
						</Button>
						{autoUpdateState.phase === 'downloaded' ? (
							<Button
								type="button"
								variant="success"
								className="rounded-md px-3 py-2 text-sm"
								onClick={() => void onInstallUpdate()}
							>
								{t('settings.application.restart_to_update')}
							</Button>
						) : autoUpdateState.phase === 'available' || autoUpdateState.phase === 'downloading' ? (
							<Button
								type="button"
								className="button-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								onClick={() => void onDownloadUpdate()}
								disabled={updateActionBusy || autoUpdateState.phase === 'downloading'}
							>
								{autoUpdateState.phase === 'downloading'
									? t('settings.application.downloading', {
											suffix: autoUpdateState.percent !== null ? ` ${Math.round(autoUpdateState.percent)}%` : '...',
										})
									: t('settings.application.download_update')}
							</Button>
						) : (
							<Button
								type="button"
								className="button-secondary rounded-md px-3 py-2 text-sm disabled:opacity-50"
								onClick={() => void onCheckForUpdates()}
								disabled={updateActionBusy || !autoUpdateState.enabled}
							>
								{t('settings.application.check_for_updates')}
							</Button>
						)}
					</footer>
				</Modal>
			)}

			{developerStatus && (
				<div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{developerStatus}</div>
			)}
		</Container>
	);
}
