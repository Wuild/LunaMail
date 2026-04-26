import {useEffect, useState} from 'react';
import {useOutletContext} from 'react-router-dom';
import {FormCheckbox, FormInput, FormSelect} from '@llamamail/ui/form';
import {Button} from '@llamamail/ui/button';
import {Card} from '@llamamail/ui/card';
import {Field, Label} from '@renderer/app/main/settings/formParts';
import {ipcClient} from '@renderer/lib/ipcClient';
import {
	DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
	normalizeAccountCalendarSyncIntervalMinutes,
} from '@llamamail/app/settingsRules';
import {ACCOUNT_CALENDAR_SYNC_INTERVAL_OPTIONS} from '@llamamail/app/settingsOptions';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsAccountCalDavPage() {
	const {t} = useI18n();
	const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
	const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
	const [discovering, setDiscovering] = useState(false);
	if (!editor) return null;

	const isManagedOAuthProvider =
		editor.auth_method === 'oauth2' && (editor.oauth_provider === 'google' || editor.oauth_provider === 'microsoft');

	const detectUrl = async (): Promise<void> => {
		if (discovering) return;
		setDiscovering(true);
		try {
			const discovered = await ipcClient.discoverDav(editor.id);
			let nextUrl = discovered?.caldavUrl ?? null;
			if (!nextUrl) {
				const events = await ipcClient.getCalendarEvents(editor.id, null, null, 500);
				const caldavEvent = events.find((event) => String(event.source || '').toLowerCase() === 'caldav');
				nextUrl = String(caldavEvent?.calendar_url || '').trim() || null;
			}
			setDetectedUrl(nextUrl);
		} catch {
			try {
				const events = await ipcClient.getCalendarEvents(editor.id, null, null, 500);
				const caldavEvent = events.find((event) => String(event.source || '').toLowerCase() === 'caldav');
				const fallbackUrl = String(caldavEvent?.calendar_url || '').trim() || null;
				if (fallbackUrl) setDetectedUrl(fallbackUrl);
			} catch {
				// Keep last known URL visible when fallback lookup fails.
			}
		} finally {
			setDiscovering(false);
		}
	};

	useEffect(() => {
		if (isManagedOAuthProvider) {
			setDetectedUrl(null);
			return;
		}
		void detectUrl();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor.id, isManagedOAuthProvider]);

	return (
		<div className="space-y-4">
			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_calendar.module_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_calendar.module_description')}
						</p>
					</div>
				}
			>
				<div className="space-y-3">
					<label className="ui-border-default flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
						<div>
							<span className="ui-text-secondary">{t('settings.account_calendar.enable_calendar')}</span>
							<p className="ui-text-muted mt-1 text-xs">{t('settings.account_calendar.enable_calendar_description')}</p>
						</div>
						<FormCheckbox
							checked={!!editor.sync_calendar}
							onChange={(event) =>
								setEditor((prev) =>
									prev ? {...prev, sync_calendar: event.target.checked ? 1 : 0} : prev,
								)
							}
						/>
					</label>
					<label className="block text-sm md:max-w-xs">
						<Label>{t('settings.account_calendar.sync_interval')}</Label>
						<FormSelect
							value={String(
								normalizeAccountCalendarSyncIntervalMinutes(
									editor.calendar_sync_interval_minutes,
									DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
								),
							)}
							onChange={(event) =>
								setEditor((prev) =>
									prev
										? {
												...prev,
												calendar_sync_interval_minutes: normalizeAccountCalendarSyncIntervalMinutes(
													event.target.value,
													DEFAULT_ACCOUNT_CALENDAR_SYNC_INTERVAL_MINUTES,
												),
											}
										: prev,
								)
							}
						>
							{ACCOUNT_CALENDAR_SYNC_INTERVAL_OPTIONS.map((minutes) => (
								<option key={minutes} value={minutes}>
									{minutes === 1
										? t('settings.account_calendar.every_minute', {minutes})
										: t('settings.account_calendar.every_minutes', {minutes})}
								</option>
							))}
						</FormSelect>
					</label>
				</div>
			</Card>

			{isManagedOAuthProvider ? (
				<Card>
					<p className="ui-text-muted text-sm">
						{t('settings.account_calendar.oauth_managed')}
					</p>
				</Card>
			) : (
				<Card
					header={
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 className="ui-text-primary text-sm font-semibold">{t('settings.account_calendar.connection_title')}</h3>
								<p className="ui-text-muted mt-1 text-xs">{t('settings.account_calendar.connection_subtitle')}</p>
							</div>
							<Button type="button" variant="secondary" size="sm" onClick={() => void detectUrl()} disabled={discovering}>
								{discovering ? t('settings.account_calendar.detecting') : t('settings.account_calendar.detect_url')}
							</Button>
						</div>
					}
				>
					<div className="space-y-3">
						<label className="block text-sm">
							<span className="ui-text-secondary mb-1 block font-medium">{t('settings.account_calendar.detected_url')}</span>
							<FormInput
								value={detectedUrl || ''}
								readOnly
								placeholder={t('settings.account_calendar.not_detected_yet')}
								variant="subtle"
							/>
						</label>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<Field
								label={t('settings.account_calendar.caldav_username')}
								value={editor.caldav_user || ''}
								onChange={(value) => setEditor((prev) => (prev ? {...prev, caldav_user: value} : prev))}
								placeholder={t('settings.account_calendar.defaults_to_account_username')}
							/>
							<Field
								type="password"
								label={t('settings.account_calendar.caldav_password')}
								value={editor.caldav_password || ''}
								onChange={(value) =>
									setEditor((prev) => (prev ? {...prev, caldav_password: value} : prev))
								}
								placeholder={t('settings.account_calendar.defaults_to_account_password')}
							/>
						</div>
					</div>
				</Card>
			)}
		</div>
	);
}
