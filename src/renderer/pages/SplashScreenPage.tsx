import React, {useEffect, useState} from 'react';
import type {AutoUpdateState} from '../../preload';
import WindowTitleBar from '../components/WindowTitleBar';
import lunaLogo from '../../resources/luna.png';
import {formatBytes} from '../lib/format';

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
    const latestLabel = state.latestVersion || state.downloadedVersion || 'n/a';
    const transferLabel =
        state.phase === 'downloading' && state.transferred !== null && state.total !== null
            ? `${formatBytes(state.transferred)} / ${formatBytes(state.total)}`
            : 'n/a';
    const phaseBadge = getPhaseBadge(state.phase);

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-950">
            <div className="flex h-full flex-col text-slate-100">
                <WindowTitleBar
                    title="LunaMail Updater"
                    className="border-slate-800 bg-slate-950/95 text-slate-200 dark:border-slate-800 dark:bg-slate-950/95"
                    showMinimize={false}
                    showClose={false}
                />
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8">
                    <div
                        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl"/>
                    <div
                        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl"/>

                    <div
                        className="w-full max-w-lg rounded-3xl border border-slate-700/70 bg-slate-900/75 p-8 shadow-2xl backdrop-blur">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <img src={lunaLogo} alt="" className="h-8 w-8 rounded-md object-contain"
                                     draggable={false}/>
                                <div>
                                    <p className="text-sm font-semibold text-white">LunaMail</p>
                                    <p className="text-xs text-slate-400">Startup & Auto Update</p>
                                </div>
                            </div>
                            <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${phaseBadge.className}`}>
                                {phaseBadge.label}
                            </span>
                        </div>

                        <h1 className="mt-5 text-2xl font-semibold text-white">Getting things ready</h1>
                        <p className="mt-2 text-sm text-slate-300">{state.message || fallbackMessage(state)}</p>

                        <div className="mt-6">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className={`h-2.5 rounded-full bg-sky-500 transition-all duration-300 ${state.phase === 'downloading' ? 'bg-[linear-gradient(90deg,#38bdf8,#0ea5e9,#38bdf8)] bg-[length:200%_100%] animate-pulse' : ''}`}
                                    style={{width: `${resolveProgress(state)}%`}}
                                />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                                <span>Version {state.currentVersion}</span>
                                <span>{progressText || `${resolveProgress(state)}%`}</span>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-3">
                            <StatusTile label="Phase" value={phaseBadge.label}/>
                            <StatusTile label="Latest" value={latestLabel}/>
                            <StatusTile label="Transfer" value={transferLabel}/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusTile({label, value}: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-700/80 bg-slate-800/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 truncate text-sm font-medium text-slate-200">{value}</p>
        </div>
    );
}

function getPhaseBadge(phase: AutoUpdateState['phase']): { label: string; className: string } {
    if (phase === 'error') return {label: 'Error', className: 'border-red-500/40 bg-red-500/10 text-red-300'};
    if (phase === 'downloaded') return {
        label: 'Ready',
        className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    };
    if (phase === 'downloading') return {
        label: 'Downloading',
        className: 'border-sky-500/40 bg-sky-500/10 text-sky-200'
    };
    if (phase === 'checking') return {label: 'Checking', className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'};
    if (phase === 'available') return {label: 'Available', className: 'border-sky-500/40 bg-sky-500/10 text-sky-200'};
    if (phase === 'not-available') return {
        label: 'Up to date',
        className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    };
    if (phase === 'disabled') return {
        label: 'Disabled',
        className: 'border-slate-500/40 bg-slate-500/10 text-slate-300'
    };
    return {label: 'Starting', className: 'border-slate-500/40 bg-slate-500/10 text-slate-300'};
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
