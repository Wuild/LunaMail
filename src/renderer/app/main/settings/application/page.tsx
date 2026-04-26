import React, {useEffect, useState} from 'react';
import type {AppSettings} from '@preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {describeUpdatePhase} from '../mailFilterHelpers';
import {Button} from '@llamamail/ui/button';
import {FormCheckbox, FormSelect} from '@llamamail/ui/form';
import {parseAppLanguage} from '@llamamail/app/settingsRules';
import {Card} from '@llamamail/ui/card';
import {Label} from '@llamamail/ui';
import {Container} from '@llamamail/ui/container';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsApplicationPage() {
	const {t} = useI18n();
	const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
	const {state: autoUpdateState, setState: setAutoUpdateState} = useAutoUpdateState();
	const [appStatus, setAppStatus] = useState<string | null>(null);
	const [updateActionBusy, setUpdateActionBusy] = useState(false);
	const [isDefaultEmailClient, setIsDefaultEmailClient] = useState<boolean | null>(null);
	const [defaultEmailClientBusy, setDefaultEmailClientBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const result = await ipcClient.getDefaultEmailClientStatus();
				if (cancelled) return;
				setIsDefaultEmailClient(result.isDefault);
			} catch {
				if (cancelled) return;
				setIsDefaultEmailClient(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
		setSettings((prev: AppSettings) => ({...prev, ...patch}));
		setAppStatus(t('settings.status.saving'));
		try {
			const saved = await ipcClient.updateAppSettings(patch);
			setSettings(saved);
			setAppStatus(t('settings.status.saved'));
			return true;
		} catch (e: any) {
			const latest = await ipcClient.getAppSettings().catch(() => null);
			if (latest) setSettings(latest);
			setAppStatus(t('settings.status.save_failed', {error: e?.message || String(e)}));
			return false;
		}
	}

	async function onHardwareAccelerationChange(enabled: boolean): Promise<void> {
		const pendingValue = enabled === settings.hardwareAcceleration ? null : enabled;
		const saved = await applySettingsPatch({pendingHardwareAcceleration: pendingValue});
		if (!saved) return;
		setAppStatus(
			pendingValue === null
				? t('settings.status.hardware_accel_restart_change_cleared')
				: t('settings.status.hardware_accel_change_queued'),
		);
	}

	async function onSetDefaultEmailClient(): Promise<void> {
		setDefaultEmailClientBusy(true);
		setAppStatus(t('settings.status.requesting_default_email_app'));
		try {
			const result = await ipcClient.setDefaultEmailClient();
			setIsDefaultEmailClient(result.isDefault);
			if (result.isDefault) {
				setAppStatus(t('settings.status.default_email_now_set'));
				return;
			}
			if (result.ok) {
				setAppStatus(t('settings.status.default_email_request_sent'));
				return;
			}
			setAppStatus(result.error || t('settings.status.default_email_could_not_set'));
		} catch (e: any) {
			setAppStatus(t('settings.status.default_email_change_failed', {error: e?.message || String(e)}));
		} finally {
			setDefaultEmailClientBusy(false);
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

	const effectiveHardwareAcceleration =
		typeof settings.pendingHardwareAcceleration === 'boolean'
			? settings.pendingHardwareAcceleration
			: settings.hardwareAcceleration;

	return (
		<Container>
			<Card>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="ui-text-secondary text-sm font-medium">{t('settings.application.updates')}</p>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.current_version', {version: autoUpdateState.currentVersion})}
						</p>
						<p className="ui-text-muted mt-1 text-xs">
							{autoUpdateState.message || describeUpdatePhase(autoUpdateState)}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{autoUpdateState.phase === 'downloaded' ? (
							<Button
								type="button"
								variant="success"
								className="rounded-md px-3 py-2 text-sm font-medium"
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
											suffix:
												autoUpdateState.percent !== null
													? ` ${Math.round(autoUpdateState.percent)}%`
													: '...',
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
					</div>
				</div>
				<label className="ui-border-default mt-3 flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.auto_update')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.auto_update_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.autoUpdateEnabled}
						onChange={(e) => void applySettingsPatch({autoUpdateEnabled: e.target.checked})}
					/>
				</label>
			</Card>

			<Card>
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="ui-text-secondary text-sm font-medium">
							{t('settings.application.default_email_app')}
						</p>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.default_email_description')}
						</p>
						{isDefaultEmailClient === true && (
							<p className="text-success mt-1 text-xs">
								{t('settings.application.default_email_already_set')}
							</p>
						)}
					</div>
					{isDefaultEmailClient !== true && (
						<Button
							type="button"
							className="button-secondary rounded-md px-3 py-2 text-sm disabled:opacity-60"
							onClick={() => void onSetDefaultEmailClient()}
							disabled={defaultEmailClientBusy}
						>
							{defaultEmailClientBusy
								? t('settings.application.setting_in_progress')
								: t('settings.application.set_as_default')}
						</Button>
					)}
				</div>
			</Card>

			<Card title={t('settings.application.general')}>
				<Label
					label={t('settings.application.language')}
					subtitle={t('settings.application.language_description')}
				>
					<FormSelect
						className="field-select h-10 w-full rounded-md px-3 text-sm"
						value={settings.language}
						onChange={(e) => void applySettingsPatch({language: parseAppLanguage(e.target.value)})}
					>
						<option value="system">{t('language.system')}</option>
						<option value="en-US">{t('language.en_us')}</option>
						<option value="sv-SE">{t('language.sv_se')}</option>
					</FormSelect>
				</Label>
			</Card>

			<Card title={t('settings.application.window_and_startup')}>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.minimize_to_tray')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.minimize_to_tray_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.minimizeToTray}
						onChange={(e) => void applySettingsPatch({minimizeToTray: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.show_unread_in_titlebar')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.show_unread_in_titlebar_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.showUnreadInTitleBar}
						onChange={(event) => void applySettingsPatch({showUnreadInTitleBar: event.target.checked})}
					/>
				</label>
			</Card>

			<Card title={t('settings.application.composer_and_notifications')}>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.spell_check')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.spell_check_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.spellcheckEnabled}
						onChange={(event) => void applySettingsPatch({spellcheckEnabled: event.target.checked})}
					/>
				</label>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.notification_sound')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.notification_sound_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.playNotificationSound}
						onChange={(event) => void applySettingsPatch({playNotificationSound: event.target.checked})}
					/>
				</label>
			</Card>

			<Card title={t('settings.application.performance')}>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.application.hardware_acceleration')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.application.hardware_acceleration_description')}
						</p>
					</div>
					<FormCheckbox
						checked={effectiveHardwareAcceleration}
						onChange={(event) => void onHardwareAccelerationChange(event.target.checked)}
					/>
				</label>
				{settings.pendingHardwareAcceleration !== null && (
					<p className="notice-warning rounded-md px-2 py-1 text-xs">
						{t('settings.application.restart_queued_switch', {
							state: settings.pendingHardwareAcceleration
								? t('settings.application.enabled')
								: t('settings.application.disabled'),
						})}
					</p>
				)}
			</Card>
			{appStatus && <p className="ui-text-muted text-xs">{appStatus}</p>}
		</Container>
	);
}
