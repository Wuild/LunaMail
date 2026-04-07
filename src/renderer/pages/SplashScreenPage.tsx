import React, {useEffect, useState} from 'react';
import type {AutoUpdateState} from '../../preload';
import lunaLogo from '../../resources/luna.png';
import {useIpcEvent} from '../hooks/ipc/useIpcEvent';
import {ipcClient} from '../lib/ipcClient';
import {SPLASH_BOOT_AUTO_UPDATE_STATE} from '../lib/autoUpdateState';

export default function SplashScreenPage() {
	const [state, setState] = useState<AutoUpdateState>(SPLASH_BOOT_AUTO_UPDATE_STATE);

	useEffect(() => {
		ipcClient
			.getAutoUpdateState()
			.then((next) => setState(next))
			.catch(() => undefined);
	}, []);

	useIpcEvent(ipcClient.onAutoUpdateStatus, (next) => {
		setState(next);
	});

	const progressText = getProgressText(state);
	const isDownloading = state.phase === 'downloading';

	return (
		<div className="h-screen w-screen overflow-hidden bg-[#1f232b] text-slate-100">
			<div className="relative flex h-full items-center justify-center overflow-hidden p-8">
				<div
					className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.05),transparent_55%)]"/>
				<div className="mx-auto flex w-full max-w-[360px] flex-col items-center">
					<img src={lunaLogo} alt="" className="h-24 w-24 object-contain opacity-95" draggable={false}/>
					<p className="mt-5 text-center text-[22px] font-semibold tracking-wide text-white/90">LunaMail</p>
					<p className="mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
						{progressText}
					</p>
					{isDownloading && (
						<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#171a20]">
							<div
								className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-400 to-sky-400 bg-[length:200%_100%] transition-all duration-300 animate-pulse"
								style={{width: `${resolveProgress(state)}%`}}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function getProgressText(state: AutoUpdateState): string {
	if (state.phase === 'downloading') {
		return `Downloading update ${Math.round(state.percent ?? 0)}%`;
	}
	if (state.phase === 'checking') return 'Checking for updates';
	if (state.phase === 'available') return 'Update found';
	if (state.phase === 'downloaded') return 'Download complete';
	if (state.phase === 'not-available') return 'You are up to date';
	if (state.phase === 'disabled') return 'Updater disabled';
	if (state.phase === 'error') return 'Update failed, continuing startup';
	return state.message || 'Preparing application';
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
