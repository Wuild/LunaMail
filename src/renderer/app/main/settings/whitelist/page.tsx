import {useState} from 'react';
import type {AppSettings} from '@preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {normalizeAllowlistEntry} from '@renderer/features/mail/remoteContent';
import {Button} from '@llamamail/ui/button';
import {FormCheckbox, FormInput} from '@llamamail/ui/form';
import {Container} from '@llamamail/ui/container';
import {Card} from '@llamamail/ui';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsWhitelistPage() {
	const {t} = useI18n();
	const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
	const [status, setStatus] = useState<string | null>(null);
	const [remoteAllowlistInput, setRemoteAllowlistInput] = useState('');

	async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
		setSettings((prev : AppSettings) => ({...prev, ...patch}));
		setStatus(t('settings.status.saving'));
		try {
			const saved = await ipcClient.updateAppSettings(patch);
			setSettings(saved);
			setStatus(t('settings.status.saved'));
			return true;
		} catch (e: any) {
			const latest = await ipcClient.getAppSettings().catch(() => null);
			if (latest) setSettings(latest);
			setStatus(t('settings.status.save_failed', {error: e?.message || String(e)}));
			return false;
		}
	}

	async function onAddRemoteAllowlistEntry(): Promise<void> {
		const normalized = normalizeAllowlistEntry(remoteAllowlistInput);
		if (!normalized) {
			setStatus(t('settings.whitelist.invalid_entry'));
			return;
		}
		const merged = [...new Set([...(settings.remoteContentAllowlist || []), normalized])];
		setRemoteAllowlistInput('');
		await applySettingsPatch({remoteContentAllowlist: merged});
	}

	async function onRemoveRemoteAllowlistEntry(entry: string): Promise<void> {
		const next = (settings.remoteContentAllowlist || []).filter((item : string) => item !== entry);
		await applySettingsPatch({remoteContentAllowlist: next});
	}

	return (
		<Container>
			<Card>
				<h2 className="ui-text-primary text-base font-semibold">{t('settings.whitelist.title')}</h2>
				<p className="ui-text-muted text-sm">
					{t('settings.whitelist.subtitle')}
				</p>
				<label className="ui-border-default flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
					<div className="pr-3">
						<span className="ui-text-secondary">{t('settings.whitelist.block_remote_content')}</span>
						<p className="ui-text-muted mt-1 text-xs">
							{t('settings.whitelist.block_remote_content_description')}
						</p>
					</div>
					<FormCheckbox
						checked={settings.blockRemoteContent}
						onChange={(event) => void applySettingsPatch({blockRemoteContent: event.target.checked})}
					/>
				</label>
			</Card>

			<Card>
				<div className="pt-1">
					<span className="ui-text-muted mb-1 block text-xs font-medium uppercase tracking-wide">
						{t('settings.whitelist.allowlist_label')}
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<FormInput
							type="text"
							value={remoteAllowlistInput}
							onChange={(event) => setRemoteAllowlistInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' || event.key === ',') {
									event.preventDefault();
									void onAddRemoteAllowlistEntry();
								}
							}}
							placeholder={t('settings.whitelist.allowlist_placeholder')}
							className="h-9 min-w-[260px] flex-1"
						/>
						<Button
							type="button"
							onClick={() => void onAddRemoteAllowlistEntry()}
							className="button-primary rounded-md px-3 py-2 text-xs font-medium"
						>
							{t('settings.whitelist.add')}
						</Button>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{(settings.remoteContentAllowlist || []).length === 0 && (
							<p className="ui-text-muted text-xs">{t('settings.whitelist.no_entries')}</p>
						)}
						{(settings.remoteContentAllowlist || []).map((entry: string, index: number) => (
							<Button
								key={entry}
								type="button"
								className="button-secondary inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
								onClick={() => void onRemoveRemoteAllowlistEntry(entry)}
								title={t('settings.whitelist.remove_from_allowlist')}
							>
								<span>{entry}</span>
								<span aria-hidden>×</span>
							</Button>
						))}
					</div>
				</div>
			</Card>

			{status && <div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{status}</div>}
		</Container>
	);
}
