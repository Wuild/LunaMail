import {useEffect, useState} from 'react';
import {useOutletContext} from 'react-router-dom';
import {FormCheckbox, FormInput, FormSelect} from '@llamamail/ui/form';
import {Button} from '@llamamail/ui/button';
import {Card} from '@llamamail/ui/card';
import {Field, Label} from '@renderer/app/main/settings/formParts';
import {ipcClient} from '@renderer/lib/ipcClient';
import {
	DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
	normalizeAccountContactsSyncIntervalMinutes,
} from '@llamamail/app/settingsRules';
import {ACCOUNT_CONTACTS_SYNC_INTERVAL_OPTIONS} from '@llamamail/app/settingsOptions';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsAccountCardDavPage() {
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
			let nextUrl = discovered?.carddavUrl ?? null;
			if (!nextUrl) {
				const books = await ipcClient.getAddressBooks(editor.id);
				const carddavBook = books.find((book) => String(book.source || '').toLowerCase() === 'carddav');
				nextUrl = String(carddavBook?.remote_url || '').trim() || null;
			}
			setDetectedUrl(nextUrl);
		} catch {
			try {
				const books = await ipcClient.getAddressBooks(editor.id);
				const carddavBook = books.find((book) => String(book.source || '').toLowerCase() === 'carddav');
				const fallbackUrl = String(carddavBook?.remote_url || '').trim() || null;
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
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_contacts.module_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_contacts.module_description')}
						</p>
					</div>
				}
			>
				<div className="space-y-3">
					<label className="ui-border-default flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
						<div>
							<span className="ui-text-secondary">{t('settings.account_contacts.enable_contacts')}</span>
							<p className="ui-text-muted mt-1 text-xs">{t('settings.account_contacts.enable_contacts_description')}</p>
						</div>
						<FormCheckbox
							checked={!!editor.sync_contacts}
							onChange={(event) =>
								setEditor((prev) =>
									prev ? {...prev, sync_contacts: event.target.checked ? 1 : 0} : prev,
								)
							}
						/>
					</label>
					<label className="block text-sm md:max-w-xs">
						<Label>{t('settings.account_contacts.sync_interval')}</Label>
						<FormSelect
							value={String(
								normalizeAccountContactsSyncIntervalMinutes(
									editor.contacts_sync_interval_minutes,
									DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
								),
							)}
							onChange={(event) =>
								setEditor((prev) =>
									prev
										? {
												...prev,
												contacts_sync_interval_minutes: normalizeAccountContactsSyncIntervalMinutes(
													event.target.value,
													DEFAULT_ACCOUNT_CONTACTS_SYNC_INTERVAL_MINUTES,
												),
											}
										: prev,
								)
							}
						>
							{ACCOUNT_CONTACTS_SYNC_INTERVAL_OPTIONS.map((minutes) => (
								<option key={minutes} value={minutes}>
									{minutes === 1
										? t('settings.account_contacts.every_minute', {minutes})
										: t('settings.account_contacts.every_minutes', {minutes})}
								</option>
							))}
						</FormSelect>
					</label>
				</div>
			</Card>

			{isManagedOAuthProvider ? (
				<Card>
					<p className="ui-text-muted text-sm">
						{t('settings.account_contacts.oauth_managed')}
					</p>
				</Card>
			) : (
				<Card
					header={
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 className="ui-text-primary text-sm font-semibold">{t('settings.account_contacts.connection_title')}</h3>
								<p className="ui-text-muted mt-1 text-xs">{t('settings.account_contacts.connection_subtitle')}</p>
							</div>
							<Button type="button" variant="secondary" size="sm" onClick={() => void detectUrl()} disabled={discovering}>
								{discovering ? t('settings.account_contacts.detecting') : t('settings.account_contacts.detect_url')}
							</Button>
						</div>
					}
				>
					<div className="space-y-3">
						<label className="block text-sm">
							<span className="ui-text-secondary mb-1 block font-medium">{t('settings.account_contacts.detected_url')}</span>
							<FormInput
								value={detectedUrl || ''}
								readOnly
								placeholder={t('settings.account_contacts.not_detected_yet')}
								variant="subtle"
							/>
						</label>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<Field
								label={t('settings.account_contacts.carddav_username')}
								value={editor.carddav_user || ''}
								onChange={(value) => setEditor((prev) => (prev ? {...prev, carddav_user: value} : prev))}
								placeholder={t('settings.account_contacts.defaults_to_account_username')}
							/>
							<Field
								type="password"
								label={t('settings.account_contacts.carddav_password')}
								value={editor.carddav_password || ''}
								onChange={(value) =>
									setEditor((prev) => (prev ? {...prev, carddav_password: value} : prev))
								}
								placeholder={t('settings.account_contacts.defaults_to_account_password')}
							/>
						</div>
					</div>
				</Card>
			)}
		</div>
	);
}
