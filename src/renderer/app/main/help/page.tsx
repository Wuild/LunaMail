import {Button} from '@renderer/components/ui/button';
import React, {useEffect, useState} from 'react';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';

export default function SupportPage() {
	useAppTheme();
	const [version, setVersion] = useState('unknown');
	const repoUrl = 'https://github.com/wuild/LlamaMail';
	const patreonUrl = 'https://patreon.com/wuild';
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
		<div className="workspace-content h-full w-full overflow-hidden">
			<div className="flex h-full flex-col">
				<main className="min-h-0 flex-1 overflow-auto p-5">
					<div className="mx-auto w-full max-w-5xl space-y-4">
						<section className="support-hero-surface ui-border-default relative overflow-hidden rounded-2xl border p-5">
							<div className="grid gap-5 md:grid-cols-[1.25fr_1fr] md:items-center">
								<div className="min-w-0">
									<h1 className="ui-text-primary text-2xl font-bold tracking-tight">
										Meet LlamaMail
									</h1>
									<p className="ui-text-secondary mt-2 max-w-2xl text-sm">
										A fast, offline-first desktop mail app built for focus: multi-account inboxes,
										quick local search, and safe system boundaries by design.
									</p>
									<div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
										<span className="chip-info rounded-full px-2.5 py-1 font-medium">
											Version {version}
										</span>
										<a
											href={repoUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="button-secondary rounded-full px-2.5 py-1 font-medium"
										>
											View Project
										</a>
									</div>
								</div>
								<div className="flex justify-center md:justify-end">
									<div className="panel relative overflow-hidden rounded-2xl p-2 shadow-lg">
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
						<section className="panel mb-4 break-inside-avoid rounded-xl p-4 text-sm">
							<h2 className="ui-text-primary font-semibold">Project Snapshot</h2>
							<div className="ui-text-secondary mt-2 grid gap-2">
									<div>
										<span className="ui-text-muted font-medium">App version:</span> {version}
									</div>
									<div>
										<span className="ui-text-muted font-medium">Built by:</span> {author}
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<span className="ui-text-muted font-medium">Source:</span>
										<a
											href={repoUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="link-primary-emphasis ui-surface-hover rounded px-1.5 py-0.5 text-xs"
										>
											{repoUrl}
										</a>
									</div>
									<a
										href={patreonUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="ui-surface-hover ui-border-default mt-2 inline-flex w-fit items-center rounded-lg border px-2.5 py-2"
										aria-label="Support LlamaMail on Patreon"
										title="Support on Patreon"
									>
										<span className="inline-flex items-center gap-2">
											<span aria-hidden className="relative h-5 w-5">
												<span className="absolute bottom-0 left-0 h-5 w-3 rounded-full bg-[#FF424D]" />
												<span className="absolute left-3.5 top-0 h-5 w-1.5 rounded-sm bg-[#052D49]" />
											</span>
											<span className="ui-text-primary text-sm font-semibold tracking-tight">
												Patreon
											</span>
										</span>
									</a>
							</div>
						</section>

						<section className="panel mb-4 break-inside-avoid rounded-xl p-4 text-sm">
							<h2 className="ui-text-primary font-semibold">How It Works</h2>
								<div className="ui-text-secondary mt-2 space-y-2">
									<p>
										<span className="ui-text-secondary font-medium">Accounts & sync:</span> Each
										account syncs over IMAP and is cached locally for fast browsing, even when
										network conditions are poor.
									</p>
									<p>
										<span className="ui-text-secondary font-medium">Message actions:</span> Read,
										move, archive, and flag updates are applied instantly in the UI and synced in
										the background.
									</p>
									<p>
										<span className="ui-text-secondary font-medium">Search:</span> Local indexing
										keeps search fast across accounts, folders, read state, date, and more.
									</p>
									<p>
										<span className="ui-text-secondary font-medium">Security:</span> The renderer
										has no direct Node access. Sensitive operations are isolated behind preload IPC
										and the Electron main process.
									</p>
									<p>
										<span className="ui-text-secondary font-medium">Privacy controls:</span> Remote
										content can be blocked by default, then allowed once or permanently for trusted
										senders/domains.
									</p>
								</div>
							</section>

							<section className="panel mb-4 break-inside-avoid rounded-xl p-4 text-sm">
								<h2 className="ui-text-primary font-semibold">Safety Tips</h2>
								<ul className="ui-text-secondary mt-2 list-disc space-y-1 pl-5">
									<li>Open message details to confirm the full sender address and Message-ID.</li>
									<li>Be cautious when the display name does not match the actual sender address.</li>
									<li>Avoid opening links from unexpected or suspicious domains.</li>
								</ul>
							</section>
						</div>
					</div>
				</main>

				<footer className="app-footer flex items-center justify-end px-5 py-3">
					<Button
						type="button"
						className="button-secondary rounded-md px-3 py-2 text-sm"
						onClick={() => window.close()}
					>
						Close
					</Button>
				</footer>
			</div>
		</div>
	);
}
