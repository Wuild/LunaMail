import type {AutoUpdateState} from '../../preload';

export const DEFAULT_AUTO_UPDATE_STATE: AutoUpdateState = {
    enabled: false,
    phase: 'idle',
    currentVersion: 'unknown',
    latestVersion: null,
    downloadedVersion: null,
    percent: null,
    transferred: null,
    total: null,
    message: null,
};

export const SPLASH_BOOT_AUTO_UPDATE_STATE: AutoUpdateState = {
    ...DEFAULT_AUTO_UPDATE_STATE,
    phase: 'disabled',
    message: 'Preparing startup...',
};
