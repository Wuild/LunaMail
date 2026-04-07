import {app} from 'electron';
import type {ProgressInfo, UpdateDownloadedEvent, UpdateInfo} from 'electron-updater';
import electronUpdater from 'electron-updater';
import {createAppLogger} from '../debug/debugLog.js';
import type {AutoUpdateState} from '../../shared/ipcTypes.js';

export type {AutoUpdatePhase, AutoUpdateState} from '../../shared/ipcTypes.js';

const {autoUpdater} = electronUpdater;

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
let autoUpdateEnabledByUser = true;
const TRANSIENT_RETRY_DELAY_MS = 1500;
const logger = createAppLogger('updater');
let lastProgressBucket = -1;

function setState(patch: Partial<AutoUpdateState>): void {
    Object.assign(updateState, patch);
    logger.debug(
        'State update phase=%s enabled=%s message=%s',
        updateState.phase,
        updateState.enabled,
        updateState.message ?? '',
    );
    notifyRenderer?.({...updateState});
}

export function initAutoUpdater(onState: (state: AutoUpdateState) => void): void {
    logger.info('Initializing auto updater packaged=%s', app.isPackaged);
    notifyRenderer = onState;
    if (initialized) {
        logger.debug('Auto updater already initialized');
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

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = false;

    autoUpdater.on('checking-for-update', () => {
        logger.info('Checking for updates');
        setState({
            phase: 'checking',
            message: 'Checking for updates...',
            percent: null,
            transferred: null,
            total: null,
        });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        logger.info('Update available version=%s', info.version);
        setState({
            phase: 'available',
            latestVersion: info.version,
            message: `Version ${info.version} is available.`,
        });
    });

    autoUpdater.on('update-not-available', () => {
        logger.info('Update not available');
        setState({
            phase: 'not-available',
            latestVersion: null,
            message: 'You are up to date.',
        });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        const bucket = Math.floor((progress.percent || 0) / 5);
        if (bucket !== lastProgressBucket) {
            lastProgressBucket = bucket;
            logger.debug(
                'Download progress percent=%d transferred=%d total=%d',
                Math.round(progress.percent || 0),
                progress.transferred || 0,
                progress.total || 0,
            );
        }
        setState({
            phase: 'downloading',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            message: `Downloading update (${Math.round(progress.percent)}%)...`,
        });
    });

    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
        logger.info('Update downloaded version=%s', event.version);
        setState({
            phase: 'downloaded',
            downloadedVersion: event.version,
            latestVersion: event.version,
            percent: 100,
            message: `Version ${event.version} downloaded. Restart to install.`,
        });
    });

    autoUpdater.on('error', (error: Error) => {
        logger.error('Auto updater error: %s', error.message || String(error));
        setState({
            phase: 'error',
            message: error.message || String(error),
        });
    });

    setAutoUpdateEnabled(autoUpdateEnabledByUser);
}

export function getAutoUpdateState(): AutoUpdateState {
    return {...updateState};
}

export function setAutoUpdateEnabled(enabled: boolean): void {
    autoUpdateEnabledByUser = Boolean(enabled);
    logger.info('Set auto-update enabled=%s', autoUpdateEnabledByUser);
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return;
    }
    if (!autoUpdateEnabledByUser) {
        setState({
            enabled: false,
            phase: 'disabled',
            latestVersion: null,
            downloadedVersion: null,
            percent: null,
            transferred: null,
            total: null,
            message: 'Auto-update is disabled in settings.',
        });
        return;
    }
    setState({
        enabled: true,
        phase: 'idle',
        message: null,
        latestVersion: null,
        downloadedVersion: null,
        percent: null,
        transferred: null,
        total: null,
    });
}

export async function checkForUpdates(): Promise<AutoUpdateState> {
    logger.info('checkForUpdates requested');
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return getAutoUpdateState();
    }
    if (!autoUpdateEnabledByUser) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is disabled in settings.',
        });
        return getAutoUpdateState();
    }

    try {
        await runWithTransientRetry('check', () => autoUpdater.checkForUpdates());
        logger.info('checkForUpdates finished phase=%s', updateState.phase);
    } catch (error: any) {
        logger.error('checkForUpdates failed: %s', (error as any)?.message || String(error));
        setState({
            phase: 'error',
            message: getUpdateErrorMessage(error, 'check'),
        });
    }

    return getAutoUpdateState();
}

export async function downloadUpdate(): Promise<AutoUpdateState> {
    logger.info('downloadUpdate requested');
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is available only in packaged builds.',
        });
        return getAutoUpdateState();
    }
    if (!autoUpdateEnabledByUser) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is disabled in settings.',
        });
        return getAutoUpdateState();
    }

    try {
        setState({
            phase: 'downloading',
            message: 'Starting update download...',
        });
        lastProgressBucket = -1;
        await runWithTransientRetry('download', () => autoUpdater.downloadUpdate());
        logger.info('downloadUpdate finished phase=%s', updateState.phase);
    } catch (error: any) {
        logger.error('downloadUpdate failed: %s', (error as any)?.message || String(error));
        setState({
            phase: 'error',
            message: getUpdateErrorMessage(error, 'download'),
        });
    }
    return getAutoUpdateState();
}

export function quitAndInstallUpdate(): void {
    if (!app.isPackaged) return;
    logger.warn('quitAndInstallUpdate requested');
    autoUpdater.quitAndInstall();
}

export async function runStartupUpdateFlow(): Promise<'proceed' | 'installing'> {
    logger.info('runStartupUpdateFlow started');
    if (!app.isPackaged) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Development build detected. Skipping update check.',
        });
        return 'proceed';
    }
    if (!autoUpdateEnabledByUser) {
        setState({
            enabled: false,
            phase: 'disabled',
            message: 'Auto-update is disabled in settings.',
        });
        return 'proceed';
    }

    await checkForUpdates();
    const afterCheck = getAutoUpdateState();
    if (afterCheck.phase === 'available') {
        logger.info('Startup flow found update version=%s, downloading', afterCheck.latestVersion ?? '');
        await downloadUpdate();
    }

    const afterDownload = getAutoUpdateState();
    if (afterDownload.phase === 'downloaded') {
        logger.warn('Startup flow installing downloaded update version=%s', afterDownload.downloadedVersion ?? '');
        setState({
            message: 'Installing update and restarting...',
        });
        await new Promise((resolve) => setTimeout(resolve, 900));
        quitAndInstallUpdate();
        return 'installing';
    }

    return 'proceed';
}

async function runWithTransientRetry<T>(operation: 'check' | 'download', fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (!isTransientGatewayError(error)) throw error;
        logger.warn('Transient update %s error detected, retrying once', operation);
        setState({
            message: `Update ${operation} failed with 502. Retrying...`,
        });
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
        return await fn();
    }
}

function isTransientGatewayError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return message.includes('status code 502') || message.includes('status 502') || message.includes('bad gateway');
}

function getUpdateErrorMessage(error: unknown, operation: 'check' | 'download'): string {
    const base = String((error as any)?.message || error || `Update ${operation} failed.`);
    if (isNotFoundAssetError(error)) {
        return 'Update asset not found (404). Release files and latest.yml filename do not match.';
    }
    if (!isTransientGatewayError(error)) return base;
    if (operation === 'download') {
        return 'Update server returned 502 (Bad Gateway). Please retry in a moment.';
    }
    return 'Update check failed with 502 (Bad Gateway). Please try again shortly.';
}

function isNotFoundAssetError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return message.includes('status code 404') || message.includes('status 404');
}
