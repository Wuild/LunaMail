import React from 'react';
import type {AppSettings, AutoUpdateState} from '../../preload';
import {Button} from '../components/ui/button';
import {FormCheckbox, FormSelect} from '../components/ui/FormControls';
import {normalizeSyncIntervalMinutes, parseAppLanguage} from '../../shared/settingsRules';
import {APP_LANGUAGE_OPTIONS, SYNC_INTERVAL_OPTIONS} from '../../shared/settingsOptions';

type AppSettingsGeneralPanelProps = {
	settings: AppSettings;
	autoUpdateState: AutoUpdateState;
	updateActionBusy: boolean;
	isDefaultEmailClient: boolean | null;
	defaultEmailClientBusy: boolean;
	effectiveHardwareAcceleration: boolean;
	describeUpdatePhase: (state: AutoUpdateState) => string;
	onInstallUpdate: () => Promise<void>;
	onDownloadUpdate: () => Promise<void>;
	onCheckForUpdates: () => Promise<void>;
	onSetDefaultEmailClient: () => Promise<void>;
	onHardwareAccelerationChange: (next: boolean) => void;
	applySettingsPatch: (patch: Partial<AppSettings>) => Promise<boolean>;
};

export default function AppSettingsGeneralPanel({
	settings,
	autoUpdateState,
	updateActionBusy,
	isDefaultEmailClient,
	defaultEmailClientBusy,
	effectiveHardwareAcceleration,
	describeUpdatePhase,
	onInstallUpdate,
	onDownloadUpdate,
	onCheckForUpdates,
	onSetDefaultEmailClient,
	onHardwareAccelerationChange,
	applySettingsPatch,
}: AppSettingsGeneralPanelProps) {
	return (
		<div className="mx-auto w-full max-w-5xl">
			<div className="lm-card mb-4 rounded-xl p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="lm-text-secondary text-sm font-medium">Updates</p>
						<p className="lm-text-muted mt-1 text-xs">
							Current version: {autoUpdateState.currentVersion}
						</p>
						<p className="lm-text-muted mt-1 text-xs">
							{autoUpdateState.message || describeUpdatePhase(autoUpdateState)}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{autoUpdateState.phase === 'downloaded' ? (
							<Button
								type="button"
								className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
								onClick={() => void onInstallUpdate()}
							>
								Restart to Update
							</Button>
						) : autoUpdateState.phase === 'available' || autoUpdateState.phase === 'downloading' ? (
							<Button
								type="button"
								className="lm-btn-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
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
								className="lm-btn-secondary rounded-md px-3 py-2 text-sm disabled:opacity-50"
								onClick={() => void onCheckForUpdates()}
								disabled={updateActionBusy || !autoUpdateState.enabled}
							>
								Check for Updates
							</Button>
						)}
					</div>
				</div>
				<label className="lm-border-default mt-3 flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="lm-text-secondary">Auto update</span>
						<p className="lm-text-muted mt-1 text-xs">
							Automatically checks for new versions and prepares update downloads.
						</p>
					</div>
					<FormCheckbox
						checked={settings.autoUpdateEnabled}
						onChange={(e) => void applySettingsPatch({autoUpdateEnabled: e.target.checked})}
					/>
				</label>
			</div>
			<div className="lm-card mb-4 rounded-xl p-4">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="lm-text-secondary text-sm font-medium">Default Email App</p>
						<p className="lm-text-muted mt-1 text-xs">
							Use LlamaMail for `mailto:` links from browsers and other apps.
						</p>
						{isDefaultEmailClient === true && (
							<p className="mt-1 text-xs text-emerald-700">
								LlamaMail is already your default email app.
							</p>
						)}
					</div>
					{isDefaultEmailClient !== true && (
						<Button
							type="button"
							className="lm-btn-secondary rounded-md px-3 py-2 text-sm disabled:opacity-60"
							onClick={() => void onSetDefaultEmailClient()}
							disabled={defaultEmailClientBusy}
						>
							{defaultEmailClientBusy ? 'Setting...' : 'Set as default'}
						</Button>
					)}
				</div>
			</div>
			<div className="space-y-4">
				<section className="lm-card space-y-3 rounded-xl p-4">
					<h2 className="lm-text-primary text-base font-semibold">General</h2>
					<label className="block text-sm">
						<span className="lm-text-secondary mb-1 block font-medium">Language</span>
						<p className="lm-text-muted mb-2 text-xs">
							Sets the app interface language for menus, labels, and settings.
						</p>
						<FormSelect
							className="lm-select h-10 w-full rounded-md px-3 text-sm"
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
						<span className="lm-text-secondary mb-1 block font-medium">
							Auto sync interval (minutes)
						</span>
						<p className="lm-text-muted mb-2 text-xs">
							How often the app checks mail and updates unread counts in the background.
						</p>
						<FormSelect
							className="lm-select h-10 w-full rounded-md px-3 text-sm"
							value={settings.syncIntervalMinutes}
							onChange={(e) =>
								void applySettingsPatch({
									syncIntervalMinutes: normalizeSyncIntervalMinutes(e.target.value),
								})
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

				<section className="lm-card space-y-3 rounded-xl p-4">
					<h2 className="lm-text-primary text-base font-semibold">Window And Startup</h2>
					<label className="lm-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
						<div className="pr-3">
							<span className="lm-text-secondary">Minimize to tray</span>
							<p className="lm-text-muted mt-1 text-xs">
								Keeps LunaMail running in the background when minimized.
							</p>
						</div>
						<FormCheckbox
							checked={settings.minimizeToTray}
							onChange={(e) => void applySettingsPatch({minimizeToTray: e.target.checked})}
						/>
					</label>
					<label className="lm-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
						<div className="pr-3">
							<span className="lm-text-secondary">Show unread in titlebar</span>
							<p className="lm-text-muted mt-1 text-xs">
								Adds unread count to the window title when new mail is available.
							</p>
						</div>
						<FormCheckbox
							checked={settings.showUnreadInTitleBar}
							onChange={(event) =>
								void applySettingsPatch({
									showUnreadInTitleBar: event.target.checked,
								})
							}
						/>
					</label>
				</section>

				<section className="lm-card space-y-3 rounded-xl p-4">
					<h2 className="lm-text-primary text-base font-semibold">
						Composer And Notifications
					</h2>
					<label className="lm-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
						<div className="pr-3">
							<span className="lm-text-secondary">Spell check</span>
							<p className="lm-text-muted mt-1 text-xs">
								Highlights misspelled words in editors and compose fields.
							</p>
						</div>
						<FormCheckbox
							checked={settings.spellcheckEnabled}
							onChange={(event) => void applySettingsPatch({spellcheckEnabled: event.target.checked})}
						/>
					</label>
					<label className="lm-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
						<div className="pr-3">
							<span className="lm-text-secondary">Notification sound</span>
							<p className="lm-text-muted mt-1 text-xs">
								Plays an alert sound for new mail notifications.
							</p>
						</div>
						<FormCheckbox
							checked={settings.playNotificationSound}
							onChange={(event) =>
								void applySettingsPatch({
									playNotificationSound: event.target.checked,
								})
							}
						/>
					</label>
				</section>

				<section className="lm-card space-y-3 rounded-xl p-4">
					<h2 className="lm-text-primary text-base font-semibold">Performance</h2>
					<label className="lm-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
						<div className="pr-3">
							<span className="lm-text-secondary">Hardware acceleration</span>
							<p className="lm-text-muted mt-1 text-xs">
								Uses your GPU to render the app. Disable if you see flickering, blank windows, or
								driver issues.
							</p>
						</div>
						<FormCheckbox
							checked={effectiveHardwareAcceleration}
							onChange={(event) => void onHardwareAccelerationChange(event.target.checked)}
						/>
					</label>
					{settings.pendingHardwareAcceleration !== null && (
						<p className="text-xs text-amber-700">
							Restart queued: will switch to{' '}
							{settings.pendingHardwareAcceleration ? 'enabled' : 'disabled'}.
						</p>
					)}
				</section>
			</div>
		</div>
	);
}
