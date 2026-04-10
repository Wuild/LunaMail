import {useEffect, useState} from 'react';
import type {AppSettings} from '@/preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@/shared/defaults';
import {describeUpdatePhase} from '../mailFilterHelpers';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';
import {Button} from '@renderer/components/ui/button';
import {FormCheckbox} from '@renderer/components/ui/FormControls';
import {Modal} from '@renderer/components/ui/Modal';

export default function SettingsDeveloperPage() {
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
        setSettings((prev) => ({...prev, ...patch}));
        setDeveloperStatus('Saving...');
        try {
            const saved = await ipcClient.updateAppSettings(patch);
            setSettings(saved);
            setDeveloperStatus('Settings saved.');
            return true;
        } catch (e: any) {
            const latest = await ipcClient.getAppSettings().catch(() => null);
            if (latest) setSettings(latest);
            setDeveloperStatus(`Save failed: ${e?.message || String(e)}`);
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
        setDeveloperStatus('Sending test notification...');
        try {
            const result = await ipcClient.devShowNotification();
            if (!result.supported) {
                setDeveloperStatus('System notifications are not supported in this environment.');
                return;
            }
            setDeveloperStatus(
                result.hasTarget
                    ? 'Test notification sent for first account/folder/message.'
                    : 'Notification sent, but no message exists in first account/folder.',
            );
        } catch (e: any) {
            setDeveloperStatus(`Notification failed: ${e?.message || String(e)}`);
        }
    }

    async function onPlayNotificationSound() {
        setDeveloperStatus('Playing notification sound...');
        try {
            const result = await ipcClient.devPlayNotificationSound();
            setDeveloperStatus(result.played ? 'Notification sound played.' : 'Could not play notification sound.');
        } catch (e: any) {
            setDeveloperStatus(`Sound failed: ${e?.message || String(e)}`);
        }
    }

    async function onShowUpdaterWindow() {
        setDeveloperStatus('Opening updater window in first app window...');
        try {
            const result = await ipcClient.devOpenUpdaterWindow();
            if (result.opened) {
                setDeveloperStatus('Updater window opened in first app window.');
                return;
            }
            setDeveloperStatus('No app window available to open updater window.');
        } catch (e: any) {
            setDeveloperStatus(`Failed to open updater window: ${e?.message || String(e)}`);
        }
    }

    return (
        <div className="mx-auto h-full min-h-0 w-full max-w-5xl space-y-4">
            <section className="panel rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Developer Settings</h2>
                <p className="mt-1 ui-text-muted text-sm">Enable runtime diagnostics for in-app overlays and debug
                    features.</p>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <span className="ui-text-secondary">Developer mode</span>
                    <FormCheckbox checked={settings.developerMode}
                                  onChange={(e) => void applySettingsPatch({developerMode: e.target.checked})}/>
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show Debug in main nav</span>
                        <p className="mt-1 ui-text-muted text-xs">Adds or removes the Debug item from the left
                            navigation rail.</p>
                    </div>
                    <FormCheckbox checked={settings.developerShowDebugNavItem} disabled={!settings.developerMode}
                                  onChange={(e) => void applySettingsPatch({developerShowDebugNavItem: e.target.checked})}/>
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show route overlay</span>
                        <p className="mt-1 ui-text-muted text-xs">Displays current route hash in the bottom-right for
                            navigation/debugging.</p>
                    </div>
                    <FormCheckbox checked={settings.developerShowRouteOverlay}
                                  onChange={(e) => void applySettingsPatch({developerShowRouteOverlay: e.target.checked})}/>
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show send notifications</span>
                        <p className="mt-1 ui-text-muted text-xs">Shows bottom-right progress cards for background email
                            sending.</p>
                    </div>
                    <FormCheckbox checked={settings.developerShowSendNotifications}
                                  onChange={(e) => void applySettingsPatch({developerShowSendNotifications: e.target.checked})}/>
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show system failure notifications</span>
                        <p className="mt-1 ui-text-muted text-xs">Shows bottom-right error cards for sync/authentication
                            failures.</p>
                    </div>
                    <FormCheckbox checked={settings.developerShowSystemFailureNotifications}
                                  onChange={(e) => void applySettingsPatch({developerShowSystemFailureNotifications: e.target.checked})}/>
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Demo mode</span>
                        <p className="mt-1 ui-text-muted text-xs">Loads screenshot-friendly demo accounts and sample
                            emails locally.</p>
                    </div>
                    <FormCheckbox checked={settings.developerDemoMode}
                                  onChange={(e) => void applySettingsPatch({developerDemoMode: e.target.checked})}/>
                </label>
                <div
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div>
                        <p className="ui-text-secondary">Send notification preview</p>
                        <p className="mt-0.5 ui-text-muted text-xs">Show a mock background send notification for
                            design/debug.</p>
                    </div>
                    <Button type="button" className="button-secondary rounded-md px-3 py-1.5 text-xs font-medium"
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('llamamail:preview-send-notification'));
                                setDeveloperStatus('Previewing send notification in main window.');
                            }}>
                        Preview
                    </Button>
                </div>
            </section>

            <section className="panel rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Test Actions</h2>
                <p className="mt-1 ui-text-muted text-sm">Trigger desktop notifications, updater UI, and debugging
                    tools.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm" onClick={() => {
                        window.dispatchEvent(new CustomEvent('llamamail:preview-sync-failure'));
                        setDeveloperStatus('Previewing sync failure notification in main window.');
                    }}>
                        Preview Sync Failure
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm" onClick={() => {
                        window.dispatchEvent(new CustomEvent('llamamail:preview-auth-failure'));
                        setDeveloperStatus('Previewing authentication failure notification in main window.');
                    }}>
                        Preview Auth Failure
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm"
                            onClick={() => void onTriggerTestNotification()}>
                        Test Notification
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm"
                            onClick={() => void onPlayNotificationSound()}>
                        Play Notification Sound
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm"
                            onClick={() => void onShowUpdaterWindow()}>
                        Open Updater Window
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm"
                            onClick={() => ipcClient.openDevTools()}>
                        Open DevTools
                    </Button>
                    <Button type="button" className="button-secondary rounded-md px-3 py-2 text-sm"
                            onClick={() => setShowUpdaterModal(true)}>
                        Updater Controls
                    </Button>
                </div>
            </section>

            {showUpdaterModal && (
                <Modal open onClose={() => setShowUpdaterModal(false)} contentClassName="max-w-xl p-0">
                    <header className="ui-border-default border-b px-5 py-4">
                        <h3 className="ui-text-primary text-base font-semibold">Updater Controls</h3>
                        <p className="ui-text-muted mt-1 text-xs">{autoUpdateState.message || describeUpdatePhase(autoUpdateState)}</p>
                    </header>
                    <div className="space-y-3 px-5 py-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="ui-text-secondary">Current version</span>
                            <span className="ui-text-primary font-medium">{autoUpdateState.currentVersion}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="ui-text-secondary">Latest version</span>
                            <span className="ui-text-primary font-medium">{autoUpdateState.latestVersion || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="ui-text-secondary">Phase</span>
                            <span className="ui-text-primary font-medium">{autoUpdateState.phase}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="ui-text-secondary">Progress</span>
                            <span
                                className="ui-text-primary font-medium">{autoUpdateState.percent !== null ? `${Math.round(autoUpdateState.percent)}%` : '-'}</span>
                        </div>
                    </div>
                    <footer className="ui-border-default flex items-center justify-end gap-2 border-t px-5 py-4">
                        <Button type="button" variant="secondary" className="rounded-md px-3 py-2 text-sm"
                                onClick={() => setShowUpdaterModal(false)}>
                            Close
                        </Button>
                        {autoUpdateState.phase === 'downloaded' ? (
                            <Button type="button" variant="success" className="rounded-md px-3 py-2 text-sm"
                                    onClick={() => void onInstallUpdate()}>
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
                    </footer>
                </Modal>
            )}

            {developerStatus &&
                <div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{developerStatus}</div>}
        </div>
    );
}
