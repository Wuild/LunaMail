import {app} from 'electron';
import type {ProgressInfo, UpdateDownloadedEvent, UpdateInfo} from 'electron-updater';
import electronUpdater from 'electron-updater';
import {createAppLogger} from '@main/debug/debugLog';
import type {AutoUpdateState} from '@llamamail/app/ipcTypes';
import {__} from '@llamamail/app/i18n/main';

export type {AutoUpdatePhase, AutoUpdateState} from '@llamamail/app/ipcTypes';

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
	message: __('updater.state.disabled_dev_mode'),
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
			message: __('updater.state.packaged_only'),
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
			message: __('updater.state.checking'),
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
			message: __('updater.state.available_version', {version: info.version}),
		});
	});

	autoUpdater.on('update-not-available', () => {
		logger.info('Update not available');
		setState({
			phase: 'not-available',
			latestVersion: null,
			message: __('updater.state.up_to_date'),
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
			message: __('updater.state.downloading_percent', {percent: Math.round(progress.percent)}),
		});
	});

	autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
		logger.info('Update downloaded version=%s', event.version);
		setState({
			phase: 'downloaded',
			downloadedVersion: event.version,
			latestVersion: event.version,
			percent: 100,
			message: __('updater.state.downloaded_restart', {version: event.version}),
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
			message: __('updater.state.packaged_only'),
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
			message: __('updater.state.disabled_settings'),
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
			message: __('updater.state.packaged_only'),
		});
		return getAutoUpdateState();
	}
	if (!autoUpdateEnabledByUser) {
		setState({
			enabled: false,
			phase: 'disabled',
			message: __('updater.state.disabled_settings'),
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
			message: __('updater.state.packaged_only'),
		});
		return getAutoUpdateState();
	}
	if (!autoUpdateEnabledByUser) {
		setState({
			enabled: false,
			phase: 'disabled',
			message: __('updater.state.disabled_settings'),
		});
		return getAutoUpdateState();
	}

	try {
		setState({
			phase: 'downloading',
			message: __('updater.state.starting_download'),
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
			message: __('updater.state.dev_build_skip'),
		});
		return 'proceed';
	}
	if (!autoUpdateEnabledByUser) {
		setState({
			enabled: false,
			phase: 'disabled',
			message: __('updater.state.disabled_settings'),
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
			message: __('updater.state.installing_restart'),
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
			message: __('updater.error.transient_retry', {operation}),
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
	const base = String((error as any)?.message || error || __('updater.error.operation_failed', {operation}));
	if (isNotFoundAssetError(error)) {
		return __('updater.error.asset_not_found');
	}
	if (!isTransientGatewayError(error)) return base;
	if (operation === 'download') {
		return __('updater.error.download_502');
	}
	return __('updater.error.check_502');
}

function isNotFoundAssetError(error: unknown): boolean {
	const message = String((error as any)?.message || error || '').toLowerCase();
	return message.includes('status code 404') || message.includes('status 404');
}
