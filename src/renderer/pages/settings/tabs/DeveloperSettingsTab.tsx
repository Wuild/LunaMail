import React from 'react';
import type {AppSettings, AutoUpdateState} from '../../../../preload';
import {Button} from '../../../components/ui/button';
import {FormCheckbox} from '../../../components/ui/FormControls';
import {Modal} from '../../../components/ui/Modal';
import {ipcClient} from '../../../lib/ipcClient';

type DeveloperSettingsTabProps = {
    settings: AppSettings;
    applySettingsPatch: (patch: Partial<AppSettings>) => Promise<boolean>;
    setDeveloperStatus: (status: string) => void;
    onTriggerTestNotification: () => Promise<void>;
    onPlayNotificationSound: () => Promise<void>;
    onShowUpdaterWindow: () => Promise<void>;
    showUpdaterModal: boolean;
    setShowUpdaterModal: (open: boolean) => void;
    autoUpdateState: AutoUpdateState;
    describeUpdatePhase: (state: AutoUpdateState) => string;
    updateActionBusy: boolean;
    onInstallUpdate: () => Promise<void>;
    onDownloadUpdate: () => Promise<void>;
    onCheckForUpdates: () => Promise<void>;
};

export default function DeveloperSettingsTab({
                                                 settings,
                                                 applySettingsPatch,
                                                 setDeveloperStatus,
                                                 onTriggerTestNotification,
                                                 onPlayNotificationSound,
                                                 onShowUpdaterWindow,
                                                 showUpdaterModal,
                                                 setShowUpdaterModal,
                                                 autoUpdateState,
                                                 describeUpdatePhase,
                                                 updateActionBusy,
                                                 onInstallUpdate,
                                                 onDownloadUpdate,
                                                 onCheckForUpdates,
                                             }: DeveloperSettingsTabProps) {
    return (
        <div className="mx-auto w-full max-w-5xl space-y-4">
            <section className="panel rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Developer Settings</h2>
                <p className="mt-1 ui-text-muted text-sm">
                    Enable runtime diagnostics for in-app overlays and debug features.
                </p>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <span className="ui-text-secondary">Developer mode</span>
                    <FormCheckbox
                        checked={settings.developerMode}
                        onChange={(e) => void applySettingsPatch({developerMode: e.target.checked})}
                    />
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show Debug in main nav</span>
                        <p className="mt-1 ui-text-muted text-xs">Adds or removes the Debug item from the left
                            navigation rail.</p>
                    </div>
                    <FormCheckbox
                        checked={settings.developerShowDebugNavItem}
                        disabled={!settings.developerMode}
                        onChange={(e) => void applySettingsPatch({developerShowDebugNavItem: e.target.checked})}
                    />
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show route overlay</span>
                        <p className="mt-1 ui-text-muted text-xs">
                            Displays current route hash in the bottom-right for navigation/debugging.
                        </p>
                    </div>
                    <FormCheckbox
                        checked={settings.developerShowRouteOverlay}
                        onChange={(e) => void applySettingsPatch({developerShowRouteOverlay: e.target.checked})}
                    />
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show send notifications</span>
                        <p className="mt-1 ui-text-muted text-xs">Shows bottom-right progress cards for background email
                            sending.</p>
                    </div>
                    <FormCheckbox
                        checked={settings.developerShowSendNotifications}
                        onChange={(e) => void applySettingsPatch({developerShowSendNotifications: e.target.checked})}
                    />
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Show system failure notifications</span>
                        <p className="mt-1 ui-text-muted text-xs">Shows bottom-right error cards for sync/authentication
                            failures.</p>
                    </div>
                    <FormCheckbox
                        checked={settings.developerShowSystemFailureNotifications}
                        onChange={(e) =>
                            void applySettingsPatch({developerShowSystemFailureNotifications: e.target.checked})
                        }
                    />
                </label>
                <label
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div className="pr-3">
                        <span className="ui-text-secondary">Demo mode</span>
                        <p className="mt-1 ui-text-muted text-xs">
                            Loads screenshot-friendly demo accounts and sample emails locally.
                        </p>
                    </div>
                    <FormCheckbox
                        checked={settings.developerDemoMode}
                        onChange={(e) => void applySettingsPatch({developerDemoMode: e.target.checked})}
                    />
                </label>
                <div
                    className="ui-border-default mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                    <div>
                        <p className="ui-text-secondary">Send notification preview</p>
                        <p className="mt-0.5 ui-text-muted text-xs">
                            Show a mock background send notification for design/debug.
                        </p>
                    </div>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-1.5 text-xs font-medium"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('llamamail:preview-send-notification'));
                            setDeveloperStatus('Previewing send notification in main window.');
                        }}
                    >
                        Preview
                    </Button>
                </div>
            </section>

            <section className="panel rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Test Actions</h2>
                <p className="mt-1 ui-text-muted text-sm">
                    Trigger desktop notifications, updater UI, and debugging tools.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('llamamail:preview-sync-failure'));
                            setDeveloperStatus('Previewing sync failure notification in main window.');
                        }}
                    >
                        Preview Sync Failure
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('llamamail:preview-auth-failure'));
                            setDeveloperStatus('Previewing authentication failure notification in main window.');
                        }}
                    >
                        Preview Auth Failure
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => void onTriggerTestNotification()}
                    >
                        Send Test Notification
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => void onPlayNotificationSound()}
                    >
                        Play Notification Sound
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => void onShowUpdaterWindow()}
                    >
                        Show Updater Window
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => void ipcClient.openDevTools()}
                    >
                        Open DevTools
                    </Button>
                    <Button
                        type="button"
                        className="button-secondary rounded-md px-3 py-2 text-sm"
                        onClick={() => {
                            window.location.hash = '/onboarding';
                            setDeveloperStatus('Opened onboarding route for testing.');
                        }}
                    >
                        Open Onboarding
                    </Button>
                </div>
            </section>

            {showUpdaterModal && (
                <Modal
                    open
                    onClose={() => setShowUpdaterModal(false)}
                    backdropClassName="z-[1200]"
                    contentClassName="max-w-xl p-4"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="ui-text-primary text-base font-semibold">Updater Window</h3>
                            <p className="mt-1 ui-text-muted text-xs">Current
                                version: {autoUpdateState.currentVersion}</p>
                            <p className="mt-1 ui-text-muted text-xs">
                                {autoUpdateState.message || describeUpdatePhase(autoUpdateState)}
                            </p>
                        </div>
                        <Button
                            type="button"
                            className="button-secondary rounded-md px-2 py-1 text-xs"
                            onClick={() => setShowUpdaterModal(false)}
                        >
                            Close
                        </Button>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
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
                </Modal>
            )}
        </div>
    );
}
