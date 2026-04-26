import {useState} from 'react';
import type {AppSettings} from '@preload';
import {useAppSettings as useIpcAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {ipcClient} from '@renderer/lib/ipcClient';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {APP_THEME_OPTIONS, MAIL_VIEW_OPTIONS} from '@llamamail/app/settingsOptions';
import {Container} from '@llamamail/ui/container';
import {Card} from '@llamamail/ui';
import {FormRadioGroup} from '@llamamail/ui/form';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsLayoutPage() {
	const {t} = useI18n();
	const {appSettings: settings, setAppSettings: setSettings} = useIpcAppSettings(DEFAULT_APP_SETTINGS);
	const [status, setStatus] = useState<string | null>(null);

	async function applySettingsPatch(patch: Partial<AppSettings>): Promise<boolean> {
		setSettings((prev: AppSettings) => ({...prev, ...patch}));
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

	async function onTitlebarModeChange(useNativeTitleBar: boolean): Promise<void> {
		const pendingValue = useNativeTitleBar === settings.useNativeTitleBar ? null : useNativeTitleBar;
		const saved = await applySettingsPatch({pendingUseNativeTitleBar: pendingValue});
		if (!saved) return;
		setStatus(
			pendingValue === null
				? t('settings.layout.status.titlebar_restart_change_cleared')
				: t('settings.layout.status.titlebar_change_queued'),
		);
	}

	const effectiveUseNativeTitleBar =
		typeof settings.pendingUseNativeTitleBar === 'boolean'
			? settings.pendingUseNativeTitleBar
			: settings.useNativeTitleBar;

	return (
		<Container>
			<Card title={t('settings.layout.theme_title')}>
				<div className="block text-sm">
					<FormRadioGroup
						aria-label={t('settings.layout.theme_aria')}
						value={settings.theme}
						options={APP_THEME_OPTIONS.map((option) => ({
							value: option.value,
							label:
								option.value === 'light'
									? t('settings.layout.theme_light')
									: option.value === 'dark'
										? t('settings.layout.theme_dark')
										: t('settings.layout.theme_system'),
						}))}
						onChange={(value) => void applySettingsPatch({theme: value as AppSettings['theme']})}
					/>
				</div>
			</Card>

			<Card title={t('settings.layout.titlebar_title')}>
				<div className="block text-sm">
					<FormRadioGroup
						aria-label={t('settings.layout.titlebar_aria')}
						value={effectiveUseNativeTitleBar ? 'native' : 'custom'}
						options={[
							{value: 'custom', label: t('settings.layout.titlebar_custom')},
							{value: 'native', label: t('settings.layout.titlebar_native')},
						]}
						onChange={(value) => void onTitlebarModeChange(value === 'native')}
					/>
					<p className="mt-2 ui-text-muted text-xs">{t('settings.layout.titlebar_restart_required')}</p>
					{settings.pendingUseNativeTitleBar !== null && (
						<p className="notice-warning mt-2 rounded px-2 py-1 text-xs">
							{t('settings.layout.titlebar_restart_queued', {
								mode: settings.pendingUseNativeTitleBar
									? t('settings.layout.titlebar_native_lower')
									: t('settings.layout.titlebar_custom_lower'),
							})}
						</p>
					)}
				</div>
			</Card>

			<Card title={t('settings.layout.mail_view_title')}>
				<div className="block text-sm">
					<FormRadioGroup
						aria-label={t('settings.layout.mail_view_aria')}
						value={settings.mailView}
						options={MAIL_VIEW_OPTIONS.map((option) => ({
							value: option.value,
							label:
								option.value === 'side-list'
									? t('onboarding.mail_layout_side_list')
									: t('onboarding.mail_layout_top_table'),
						}))}
						onChange={(value) => void applySettingsPatch({mailView: value as AppSettings['mailView']})}
					/>
					<p className="mt-2 ui-text-muted text-xs">
						{t('settings.layout.mail_view_description')}
					</p>
				</div>
			</Card>
			{status && <div className="app-footer rounded-md px-3 py-2 text-xs ui-text-muted">{status}</div>}
		</Container>
	);
}
