import React, {useEffect, useState} from 'react';
import WindowTitleBar from '../components/WindowTitleBar';
import {useAppTheme} from '../hooks/useAppTheme';
import {ipcClient} from '../lib/ipcClient';

const shortcuts = [
	{action: 'Compose new email', keys: 'Ctrl/Cmd + N'},
	{action: 'Reply', keys: 'Ctrl/Cmd + R'},
	{action: 'Reply all', keys: 'Ctrl/Cmd + Shift + R'},
	{action: 'Forward', keys: 'Ctrl/Cmd + Shift + F'},
	{action: 'Sync account', keys: 'Ctrl/Cmd + Shift + S'},
	{action: 'Close child window', keys: 'Escape'},
];

export default function SupportPage({embedded = false}: { embedded?: boolean }) {
	useAppTheme();
	const [version, setVersion] = useState('unknown');
	const repoUrl = 'https://github.com/wuild/LunaMail';
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
				<header
					className="border-b border-slate-200 bg-white px-5 py-4 dark:border-[#3a3d44] dark:bg-[#1f2125]">
					<h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Support</h1>
					<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Keyboard shortcuts, metadata, and how LunaMail works
					</p>
				</header>

				<main className="min-h-0 flex-1 overflow-auto p-5">
					<div
						className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]/70">
						<section
							className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">Project Info</h2>
							<div className="mt-2 grid gap-2 text-slate-700 dark:text-slate-200">
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">
										Current version:
									</span>{' '}
									{version}
								</div>
								<div>
									<span className="font-medium text-slate-500 dark:text-slate-400">Author:</span>{' '}
									{author}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-slate-500 dark:text-slate-400">GitHub:</span>
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
							className="rounded-xl border border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<div
								className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-[#3a3d44] dark:text-slate-100">
								Keyboard Shortcuts
							</div>
							<div className="divide-y divide-slate-200 dark:divide-[#3a3d44]">
								{shortcuts.map((shortcut) => (
									<div
										key={shortcut.action}
										className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
									>
										<span className="text-slate-700 dark:text-slate-200">{shortcut.action}</span>
										<kbd
											className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-[#4a4d55] dark:bg-[#1f2125] dark:text-slate-200">
											{shortcut.keys}
										</kbd>
									</div>
								))}
							</div>
						</section>

						<section
							className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">How LunaMail Works</h2>
							<div className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Accounts and sync:
									</span>{' '}
									each account syncs through IMAP and caches messages locally for fast browsing and
									offline-first behavior.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Read/unread and message actions:
									</span>{' '}
									actions apply optimistically in the UI first, then sync to server in the background.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">Search:</span>{' '}
									search runs across cached data for quick results, with filters for account, folder,
									read state, starred state, date, and size.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Security model:
									</span>{' '}
									renderer has no direct Node access; all sensitive operations go through preload IPC
									and Electron main process.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Remote content privacy:
									</span>{' '}
									remote content can be blocked by default; you can load once or allowlist
									senders/domains.
								</p>
								<p>
									<span className="font-medium text-slate-700 dark:text-slate-200">
										Debug console:
									</span>{' '}
									use the Debug page to inspect IMAP/SMTP/DAV/app logs for sync behavior and
									troubleshooting.
								</p>
							</div>
						</section>

						<section
							className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-[#3a3d44] dark:bg-[#2b2d31]">
							<h2 className="font-semibold text-slate-800 dark:text-slate-100">Anti-spoof check tips</h2>
							<ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
								<li>Open Message Details in preview to inspect full sender address and Message-ID.</li>
								<li>Be careful when display name email and actual sender email are different.</li>
								<li>Do not trust links from suspicious sender domains.</li>
							</ul>
						</section>
					</div>
				</main>

				{!embedded && (
					<footer
						className="flex items-center justify-end border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
						<button
							type="button"
							className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
							onClick={() => window.close()}
						>
							Close
						</button>
					</footer>
				)}
			</div>
		</div>
	);
}
