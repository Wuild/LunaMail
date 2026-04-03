import React, {useEffect, useState} from 'react';
import type {AutoUpdateState} from '../../preload';

const defaultState: AutoUpdateState = {
    enabled: false,
    phase: 'disabled',
    currentVersion: 'unknown',
    latestVersion: null,
    downloadedVersion: null,
    percent: null,
    transferred: null,
    total: null,
    message: 'Preparing startup...',
};

export default function SplashScreenPage() {
    const [state, setState] = useState<AutoUpdateState>(defaultState);

    useEffect(() => {
        window.electronAPI.getAutoUpdateState?.()
            .then((next) => setState(next))
            .catch(() => undefined);
        const off = window.electronAPI.onAutoUpdateStatus?.((next) => {
            setState(next);
        });
        return () => {
            if (typeof off === 'function') off();
        };
    }, []);

    const progressText =
        state.phase === 'downloading'
            ? `${Math.round(state.percent ?? 0)}%`
            : state.phase === 'checking'
                ? 'Checking...'
                : state.phase === 'downloaded'
                    ? 'Ready'
                    : '';

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-900">
            <div className="flex h-full flex-col items-center justify-center px-8 text-slate-100">
                <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/70 p-8 shadow-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">LunaMail</p>
                    <h1 className="mt-2 text-2xl font-semibold text-white">Starting up</h1>
                    <p className="mt-3 text-sm text-slate-300">{state.message || fallbackMessage(state)}</p>
                    <div className="mt-5 h-2 w-full rounded-full bg-slate-700">
                        <div
                            className="h-2 rounded-full bg-sky-500 transition-all duration-300"
                            style={{width: `${resolveProgress(state)}%`}}
                        />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span>Version {state.currentVersion}</span>
                        <span>{progressText}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function resolveProgress(state: AutoUpdateState): number {
    if (state.phase === 'downloading') return Math.max(8, Math.min(99, Math.round(state.percent ?? 0)));
    if (state.phase === 'checking') return 30;
    if (state.phase === 'available') return 45;
    if (state.phase === 'downloaded') return 100;
    if (state.phase === 'not-available') return 100;
    if (state.phase === 'disabled') return 100;
    if (state.phase === 'error') return 100;
    return 20;
}

function fallbackMessage(state: AutoUpdateState): string {
    if (state.phase === 'checking') return 'Checking for updates...';
    if (state.phase === 'available') return `Update ${state.latestVersion ?? ''} found. Downloading...`;
    if (state.phase === 'downloading') return 'Downloading update package...';
    if (state.phase === 'downloaded') return 'Update downloaded. Restarting...';
    if (state.phase === 'not-available') return 'You are up to date.';
    if (state.phase === 'disabled') return 'Development mode. Skipping updates.';
    if (state.phase === 'error') return 'Update check failed. Continuing startup.';
    return 'Preparing application...';
}
