import React, {useEffect, useState} from 'react';
import type {AppSettings} from '@/preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@/shared/defaults';
import {describeUpdatePhase} from '../mailFilterHelpers';
import {Button} from '@renderer/components/ui/button';
import {FormCheckbox, FormSelect} from '@renderer/components/ui/FormControls';
import {normalizeSyncIntervalMinutes, parseAppLanguage} from '@/shared/settingsRules';
import {APP_LANGUAGE_OPTIONS, SYNC_INTERVAL_OPTIONS} from '@/shared/settingsOptions';

export default function SettingsApplicationPage() {
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
		setSettings((prev) => ({...prev, ...patch}));
		setAppStatus('Saving...');
		try {
			const saved = await ipcClient.updateAppSettings(patch);
			setSettings(saved);
			setAppStatus('Settings saved.');
			return true;
		} catch (e: any) {
			const latest = await ipcClient.getAppSettings().catch(() => null);
			if (latest) setSettings(latest);
			setAppStatus(`Save failed: ${e?.message || String(e)}`);
			return false;
		}
	}

	async function onHardwareAccelerationChange(enabled: boolean): Promise<void> {
		const pendingValue = enabled === settings.hardwareAcceleration ? null : enabled;
		const saved = await applySettingsPatch({pendingHardwareAcceleration: pendingValue});
		if (!saved) return;
		setAppStatus(
			pendingValue === null
				? 'Hardware acceleration restart change cleared.'
				: 'Hardware acceleration change queued. Restart required to apply.',
		);
	}

	async function onSetDefaultEmailClient(): Promise<void> {
		setDefaultEmailClientBusy(true);
		setAppStatus('Requesting default email app...');
		try {
			const result = await ipcClient.setDefaultEmailClient();
			setIsDefaultEmailClient(result.isDefault);
			if (result.isDefault) {
				setAppStatus('LlamaMail is now the default email app for mailto links.');
				return;
			}
			if (result.ok) {
				setAppStatus('Default email app request sent. Confirm the change in your system settings if prompted.');
				return;
			}
			setAppStatus(result.error || 'Could not set LlamaMail as default email app.');
		} catch (e: any) {
			setAppStatus(`Default app change failed: ${e?.message || String(e)}`);
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
		<div className="mx-auto h-full min-h-0 w-full max-w-5xl space-y-4 pb-6">
			<div className="panel rounded-xl p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="ui-text-secondary text-sm font-medium">Updates</p>
						<p className="ui-text-muted mt-1 text-xs">Current version: {autoUpdateState.currentVersion}</p>
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
								Restart to Update
							</Button>
						) : autoUpdateState.phase === 'available' || autoUpdateState.phase === 'downloading' ? (
							<Button
								type="button"
								className="button-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
								onClick={() => void onDownloadUpdate()}
								disabled={updateActionBusy || autoUpdateState.phase === 'downloading'}
							>
								{autoUpdateState.phase === 'downloading'
									? `Downloading${autoUpdateState.percent !== null ? ` ${Math.round(autoUpdateState.percent)}%` : '...'}`
									: 'Download Update'}
							</Button>
						) : (
							<Button
								type="button"
								className="button-secondary rounded-md px-3 py-2 text-sm disabled:opacity-50"
								onClick={() => void onCheckForUpdates()}
								disabled={updateActionBusy || !autoUpdateState.enabled}
							>
								Check for Updates
							</Button>
						)}
					</div>
				</div>
				<label className="ui-border-default mt-3 flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Auto update</span>
						<p className="ui-text-muted mt-1 text-xs">
							Automatically checks for new versions and prepares update downloads.
						</p>
					</div>
					<FormCheckbox
						checked={settings.autoUpdateEnabled}
						onChange={(e) => void applySettingsPatch({autoUpdateEnabled: e.target.checked})}
					/>
				</label>
			</div>

			<div className="panel rounded-xl p-4">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="ui-text-secondary text-sm font-medium">Default Email App</p>
						<p className="ui-text-muted mt-1 text-xs">
							Use LlamaMail for `mailto:` links from browsers and other apps.
						</p>
						{isDefaultEmailClient === true && (
							<p className="text-success mt-1 text-xs">LlamaMail is already your default email app.</p>
						)}
					</div>
					{isDefaultEmailClient !== true && (
						<Button
							type="button"
							className="button-secondary rounded-md px-3 py-2 text-sm disabled:opacity-60"
							onClick={() => void onSetDefaultEmailClient()}
							disabled={defaultEmailClientBusy}
						>
							{defaultEmailClientBusy ? 'Setting...' : 'Set as default'}
						</Button>
					)}
				</div>
			</div>

			<section className="panel space-y-3 rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">General</h2>
				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">Language</span>
					<p className="ui-text-muted mb-2 text-xs">
						Sets the app interface language for menus, labels, and settings.
					</p>
					<FormSelect
						className="field-select h-10 w-full rounded-md px-3 text-sm"
						value={settings.language}
						onChange={(e) => void applySettingsPatch({language: parseAppLanguage(e.target.value)})}
					>
						{APP_LANGUAGE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</FormSelect>
				</label>
				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">Auto sync interval (minutes)</span>
					<p className="ui-text-muted mb-2 text-xs">
						How often the app checks mail and updates unread counts in the background.
					</p>
					<FormSelect
						className="field-select h-10 w-full rounded-md px-3 text-sm"
						value={settings.syncIntervalMinutes}
						onChange={(e) =>
							void applySettingsPatch({syncIntervalMinutes: normalizeSyncIntervalMinutes(e.target.value)})
						}
					>
						{SYNC_INTERVAL_OPTIONS.map((m) => (
							<option key={m} value={m}>
								Every {m} minute{m > 1 ? 's' : ''}
							</option>
						))}
					</FormSelect>
				</label>
			</section>

			<section className="panel space-y-3 rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Window And Startup</h2>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Minimize to tray</span>
						<p className="ui-text-muted mt-1 text-xs">
							Keeps LunaMail running in the background when minimized.
						</p>
					</div>
					<FormCheckbox
						checked={settings.minimizeToTray}
						onChange={(e) => void applySettingsPatch({minimizeToTray: e.target.checked})}
					/>
				</label>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Show unread in titlebar</span>
						<p className="ui-text-muted mt-1 text-xs">
							Adds unread count to the window title when new mail is available.
						</p>
					</div>
					<FormCheckbox
						checked={settings.showUnreadInTitleBar}
						onChange={(event) => void applySettingsPatch({showUnreadInTitleBar: event.target.checked})}
					/>
				</label>
			</section>

			<section className="panel space-y-3 rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Composer And Notifications</h2>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Spell check</span>
						<p className="ui-text-muted mt-1 text-xs">
							Highlights misspelled words in editors and compose fields.
						</p>
					</div>
					<FormCheckbox
						checked={settings.spellcheckEnabled}
						onChange={(event) => void applySettingsPatch({spellcheckEnabled: event.target.checked})}
					/>
				</label>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Notification sound</span>
						<p className="ui-text-muted mt-1 text-xs">Plays an alert sound for new mail notifications.</p>
					</div>
					<FormCheckbox
						checked={settings.playNotificationSound}
						onChange={(event) => void applySettingsPatch({playNotificationSound: event.target.checked})}
					/>
				</label>
			</section>

			<section className="panel space-y-3 rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Performance</h2>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">Hardware acceleration</span>
						<p className="ui-text-muted mt-1 text-xs">
							Uses your GPU to render the app. Disable if you see flickering, blank windows, or driver
							issues.
						</p>
					</div>
					<FormCheckbox
						checked={effectiveHardwareAcceleration}
						onChange={(event) => void onHardwareAccelerationChange(event.target.checked)}
					/>
				</label>
				{settings.pendingHardwareAcceleration !== null && (
					<p className="notice-warning rounded-md px-2 py-1 text-xs">
						Restart queued: will switch to {settings.pendingHardwareAcceleration ? 'enabled' : 'disabled'}.
					</p>
				)}
			</section>

			{appStatus && <div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{appStatus}</div>}
		</div>
	);
}
