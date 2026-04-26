import {Button} from '@llamamail/ui/button';
import React, {useEffect, useState} from 'react';
import {useAppTheme} from '@renderer/hooks/useAppTheme';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';
import {Card} from '@llamamail/ui/card';
import {Container} from '@llamamail/ui/container';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SupportPage() {
	useAppTheme();
	const {t} = useI18n();
	const [version, setVersion] = useState(() => t('help.unknown_version'));
	const repoUrl = 'https://github.com/wuild/LlamaMail';
	const patreonUrl = 'https://patreon.com/wuild';

	useEffect(() => {
		let active = true;
		void ipcClient
			.getAutoUpdateState()
			.then((state) => {
				if (!active) return;
				setVersion(state.currentVersion || t('help.unknown_version'));
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);

	return (
		<Container>
			<Card>
				<div className="grid gap-5 md:grid-cols-[1.25fr_1fr] md:items-center">
					<div className="min-w-0">
						<h1 className="ui-text-primary text-2xl font-bold tracking-tight">{t('help.hero.title')}</h1>
						<p className="ui-text-secondary mt-2 max-w-2xl text-sm">
							{t('help.hero.subtitle')}
						</p>
						<div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
							<span className="chip-info rounded-full px-2.5 py-1 font-medium">
								{t('help.version_chip', {version})}
							</span>
							<a
								href={repoUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="button-secondary rounded-full px-2.5 py-1 font-medium"
							>
								{t('help.view_project')}
							</a>
						</div>
					</div>
					<div className="flex justify-center md:justify-end">
						<div className=" relative overflow-hidden p-2">
							<img
								src={llamaArt}
								alt={t('help.mascot_alt')}
								className="h-40 w-40 rounded-xl object-cover md:h-48 md:w-48"
								draggable={false}
							/>
						</div>
					</div>
				</div>
			</Card>

			<Card className="text-sm" title={t('help.snapshot.title')}>
				<div className="ui-text-secondary grid gap-2">
					<div>
						<span className="ui-text-muted font-medium">{t('help.snapshot.app_version_label')}</span> {version}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span className="ui-text-muted font-medium">{t('help.snapshot.source_label')}</span>
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
						aria-label={t('help.patreon.aria')}
						title={t('help.patreon.title')}
					>
							<span className="inline-flex items-center gap-2">
								<span aria-hidden className="relative h-5 w-5">
									<span className="absolute bottom-0 left-0 h-5 w-3 rounded-full bg-[#FF424D]" />
									<span className="absolute left-3.5 top-0 h-5 w-1.5 rounded-sm bg-[#052D49]" />
								</span>
								<span className="ui-text-primary text-sm font-semibold tracking-tight">{t('help.patreon.label')}</span>
							</span>
					</a>
				</div>
			</Card>
		</Container>
	);
}
