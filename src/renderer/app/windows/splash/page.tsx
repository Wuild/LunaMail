import React, {useEffect, useState} from 'react';
import type {AutoUpdateState} from '@preload';
import llamaLogo from '@resource/llamarun.png';
import {useIpcEvent} from '@renderer/hooks/ipc/useIpcEvent';
import {ipcClient} from '@renderer/lib/ipcClient';
import {SPLASH_BOOT_AUTO_UPDATE_STATE} from '@renderer/lib/autoUpdateState';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SplashScreenPage() {
	const {t} = useI18n();
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

	const progressText = getProgressText(state, t);
	const isDownloading = state.phase === 'downloading';

	return (
		<div className="splash-screen h-full w-full overflow-hidden">
			<div className="relative flex h-full items-center justify-center overflow-hidden p-8">
				<div className="splash-screen-glow pointer-events-none absolute inset-0" />
				<div className="mx-auto flex w-full max-w-[360px] flex-col items-center">
					<img src={llamaLogo} alt="" className="h-80 w-80 object-contain" draggable={false} />
					<p className="splash-brand text-center text-[22px] font-semibold tracking-wide">LlamaMail</p>
					<p className="splash-muted mt-2 text-center text-[11px] font-medium uppercase tracking-wide">
						{progressText}
					</p>
					{isDownloading && (
						<div className="splash-progress-track mt-3 h-2 w-full overflow-hidden rounded-full">
							<div
								className="splash-progress-fill h-full rounded-full bg-[length:200%_100%] transition-all duration-300 animate-pulse"
								style={{width: `${resolveProgress(state)}%`}}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function getProgressText(state: AutoUpdateState, t: (key: string, params?: Record<string, string | number>) => string): string {
	if (state.phase === 'downloading') {
		return t('splash.progress.downloading_update_percent', {percent: Math.round(state.percent ?? 0)});
	}
	if (state.phase === 'checking') return t('splash.progress.checking_for_updates');
	if (state.phase === 'available') return t('splash.progress.update_found');
	if (state.phase === 'downloaded') return t('splash.progress.download_complete');
	if (state.phase === 'not-available') return t('splash.progress.up_to_date');
	if (state.phase === 'disabled') return t('splash.progress.updater_disabled');
	if (state.phase === 'error') return t('splash.progress.update_failed_continuing');
	return state.message || t('splash.progress.preparing_application');
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
