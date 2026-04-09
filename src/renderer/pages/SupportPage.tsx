import {Button} from '../components/ui/button';
import React, {useEffect, useState} from 'react';
import WindowTitleBar from '../components/WindowTitleBar';
import {useAppTheme} from '../hooks/useAppTheme';
import {ipcClient} from '../lib/ipcClient';
import llamaArt from '../../resources/llama.png';

export default function SupportPage({embedded = false}: { embedded?: boolean }) {
	useAppTheme();
	const [version, setVersion] = useState('unknown');
	const repoUrl = 'https://github.com/wuild/LlamaMail';
	const author = 'wuild';

	useEffect(() => {
		let active = true;
		void ipcClient
			.getAutoUpdateState()
			.then((state) => {
				if (!active) return;
				setVersion(state.currentVersion || 'unknown');
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="h-full w-full overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
			<div className="flex h-full flex-col">
				{!embedded && <WindowTitleBar title="Support"/>}
				<main className="min-h-0 flex-1 overflow-auto p-5">
					<div className="mx-auto w-full max-w-5xl space-y-4">
						<section className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-100 via-white to-emerald-100 p-5 dark:border-[#3a3d44] dark:from-[#1e2838] dark:via-[#24262d] dark:to-[#1f2c26]">
							<div className="grid gap-5 md:grid-cols-[1.25fr_1fr] md:items-center">
								<div className="min-w-0">
									<h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
										Meet LlamaMail
									</h1>
									<p className="mt-2 max-w-2xl text-sm text-slate-700 dark:text-slate-300">
										A fast, offline-first desktop mail app built for focus: multi-account inboxes,
										quick local search, and safe system boundaries by design.
									</p>
									<div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
										<span className="rounded-full border border-sky-300 bg-sky-100 px-2.5 py-1 font-medium text-sky-800 dark:border-sky-700/70 dark:bg-sky-900/35 dark:text-sky-200">
											Version {version}
										</span>
										<span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/35 dark:text-emerald-200">
											By {author}
										</span>
										<a
											href={repoUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-[#4a4d55] dark:bg-[#1f2125] dark:text-slate-200 dark:hover:bg-[#2b2d31]"
										>
											View Project
										</a>
									</div>
								</div>
								<div className="flex justify-center md:justify-end">
									<div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-2 shadow-lg dark:border-[#4a4d55] dark:bg-[#1b1d22]/80">
										<img
											src={llamaArt}
											alt="LlamaMail mascot"
											className="h-40 w-40 rounded-xl object-cover md:h-48 md:w-48"
											draggable={false}
										/>
									</div>
								</div>
							</div>
						</section>

						<div className="columns-1 gap-4 md:columns-2">
						<section
							className="mb-4 break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">Project Snapshot</h2>
							<div className="mt-2 grid gap-2 text-slate-700 dark:text-slate-200">
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">
										App version:
									</span>{' '}
									{version}
								</div>
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">Built by:</span>{' '}
									{author}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-slate-500 dark:text-slate-400">Source:</span>
									<a
										href={repoUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-sky-700 underline decoration-sky-400/70 underline-offset-2 hover:text-sky-800 dark:bg-[#1f2125] dark:text-sky-300 dark:hover:text-sky-200"
									>
										{repoUrl}
									</a>
								</div>
							</div>
						</section>

						<section
							className="mb-4 break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">How It Works</h2>
							<div className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Accounts & sync:
									</span>{' '}
									Each account syncs over IMAP and is cached locally for fast browsing, even when
									network conditions are poor.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Message actions:
									</span>{' '}
									Read, move, archive, and flag updates are applied instantly in the UI and synced in
									the background.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">Search:</span>{' '} 
									Local indexing keeps search fast across accounts, folders, read state, date, and more.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Security:
									</span>{' '}
									The renderer has no direct Node access. Sensitive operations are isolated behind
									preload IPC and the Electron main process.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Privacy controls:
									</span>{' '}
									Remote content can be blocked by default, then allowed once or permanently for
									trusted senders/domains.
								</p>
							</div>
						</section>

						<section
							className="mb-4 break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">Safety Tips</h2>
							<ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
								<li>Open message details to confirm the full sender address and Message-ID.</li>
								<li>Be cautious when the display name does not match the actual sender address.</li>
								<li>Avoid opening links from unexpected or suspicious domains.</li>
							</ul>
						</section>
						</div>
					</div>
				</main>

				{!embedded && (
					<footer
						className="flex items-center justify-end border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
						<Button
							type="button"
							className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
							onClick={() => window.close()}
						>
							Close
						</Button>
					</footer>
				)}
			</div>
		</div>
	);
}
