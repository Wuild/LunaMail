import {app} from 'electron';
import type {ProgressInfo, UpdateDownloadedEvent, UpdateInfo} from 'electron-updater';
import electronUpdater from 'electron-updater';

const {autoUpdater} = electronUpdater;

export type AutoUpdatePhase =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';

export interface AutoUpdateState {
    enabled: boolean;
    phase: AutoUpdatePhase;
    currentVersion: string;
    latestVersion: string | null;
    downloadedVersion: string | null;
    percent: number | null;
    transferred: number | null;
    total: number | null;
    message: string | null;
}

const updateState: AutoUpdateState = {
    enabled: false,
    phase: 'disabled',
    currentVersion: app.getVersion(),
    latestVersion: null,
    downloadedVersion: null,
    percent: null,
    transferred: null,
    total: null,
    message: 'Auto-update is disabled in development mode.',
};

let initialized = false;
let notifyRenderer: ((state: AutoUpdateState) => void) | null = null;

function setState(patch: Partial<AutoUpdateState>): void {
    Object.assign(updateState, patch);
    notifyRenderer?.({...updateState});
}

export function initAutoUpdater(onState: (state: AutoUpdateState) => void): void {
    notifyRenderer = onState;
    if (initialized) {
        notifyRenderer({...updateState});
        return;
    }
    initialized = true;

    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return;
    }

    setState({
        enabled: true,
        phase: 'idle',
        message: null,
    });

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        setState({
            phase: 'checking',
            message: 'Checking for updates...',
            percent: null,
            transferred: null,
            total: null,
        });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        setState({
            phase: 'available',
            latestVersion: info.version,
            message: `Version ${info.version} is available.`,
        });
    });

    autoUpdater.on('update-not-available', () => {
        setState({
            phase: 'not-available',
            latestVersion: null,
            message: 'You are up to date.',
        });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        setState({
            phase: 'downloading',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            message: `Downloading update (${Math.round(progress.percent)}%)...`,
        });
    });

    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
        setState({
            phase: 'downloaded',
            downloadedVersion: event.version,
            latestVersion: event.version,
            percent: 100,
            message: `Version ${event.version} downloaded. Restart to install.`,
        });
    });

    autoUpdater.on('error', (error: Error) => {
        setState({
            phase: 'error',
            message: error.message || String(error),
        });
    });
}

export function getAutoUpdateState(): AutoUpdateState {
    return {...updateState};
}

export async function checkForUpdates(): Promise<AutoUpdateState> {
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return getAutoUpdateState();
    }

    try {
        await autoUpdater.checkForUpdates();
    } catch (error: any) {
        setState({
            phase: 'error',
            message: error?.message || String(error),
        });
    }

    return getAutoUpdateState();
}

export async function downloadUpdate(): Promise<AutoUpdateState> {
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return getAutoUpdateState();
    }

    try {
        setState({
            phase: 'downloading',
            message: 'Starting update download...',
        });
        await autoUpdater.downloadUpdate();
    } catch (error: any) {
        setState({
            phase: 'error',
            message: error?.message || String(error),
        });
    }
    return getAutoUpdateState();
}

export function quitAndInstallUpdate(): void {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall();
}

export async function runStartupUpdateFlow(): Promise<'proceed' | 'installing'> {
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Development build detected. Skipping update check.',
        });
        return 'proceed';
    }

    await checkForUpdates();
    const afterCheck = getAutoUpdateState();
    if (afterCheck.phase === 'available') {
        await downloadUpdate();
    }

    const afterDownload = getAutoUpdateState();
    if (afterDownload.phase === 'downloaded') {
        setState({
            message: 'Installing update and restarting...',
        });
        await new Promise((resolve) => setTimeout(resolve, 900));
        quitAndInstallUpdate();
        return 'installing';
    }

    return 'proceed';
}
