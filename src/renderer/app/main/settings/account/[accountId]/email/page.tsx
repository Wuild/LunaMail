import {useOutletContext} from 'react-router-dom';
import {FormCheckbox, FormSelect} from '@llamamail/ui/form';
import {Card} from '@llamamail/ui/card';
import ServiceSettingsCard from '@renderer/components/settings/ServiceSettingsCard';
import {Field, Label} from '@renderer/app/main/settings/formParts';
import {
	ACCOUNT_EMAIL_SYNC_INTERVAL_OPTIONS,
	ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTH_OPTIONS,
	MAIL_LIST_SORT_OPTIONS,
} from '@llamamail/app/settingsOptions';
import {
	DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
	DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
	normalizeAccountEmailSyncIntervalMinutes,
	normalizeAccountEmailSyncLookbackMonths,
	parseMailListSort,
} from '@llamamail/app/settingsRules';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsAccountEmailPage() {
	const {t} = useI18n();
	const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
	if (!editor) return null;

	const isManagedOAuthProvider =
		editor.auth_method === 'oauth2' && (editor.oauth_provider === 'google' || editor.oauth_provider === 'microsoft');

	return (
		<div className="space-y-4">
			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_email.email_module_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_email.email_module_description')}
						</p>
					</div>
				}
			>
				<label className="ui-border-default flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
					<div>
						<span className="ui-text-secondary">{t('settings.account_email.enable_email')}</span>
						<p className="ui-text-muted mt-1 text-xs">{t('settings.account_email.enable_email_description')}</p>
					</div>
					<FormCheckbox
						checked={!!editor.sync_emails}
						onChange={(event) =>
							setEditor((prev) => (prev ? {...prev, sync_emails: event.target.checked ? 1 : 0} : prev))
						}
					/>
				</label>
			</Card>

			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_email.inbox_sync_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_email.inbox_sync_description')}
						</p>
					</div>
				}
			>
				{!editor.sync_emails ? (
					<p className="ui-text-muted text-sm">
						{t('settings.account_email.enable_email_above')}
					</p>
				) : (
					<div className="space-y-4">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label className="block text-sm">
								<Label>{t('settings.account_email.sync_interval')}</Label>
								<FormSelect
									value={String(
										normalizeAccountEmailSyncIntervalMinutes(
											editor.email_sync_interval_minutes,
											DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
										),
									)}
									onChange={(event) =>
										setEditor((prev) =>
											prev
												? {
														...prev,
														email_sync_interval_minutes: normalizeAccountEmailSyncIntervalMinutes(
															event.target.value,
															DEFAULT_ACCOUNT_EMAIL_SYNC_INTERVAL_MINUTES,
														),
													}
												: prev,
										)
									}
								>
									{ACCOUNT_EMAIL_SYNC_INTERVAL_OPTIONS.map((minutes) => (
										<option key={minutes} value={minutes}>
											{minutes === 1
												? t('settings.account_email.every_minute', {minutes})
												: t('settings.account_email.every_minutes', {minutes})}
										</option>
									))}
								</FormSelect>
							</label>
							<label className="block text-sm">
								<Label>{t('settings.account_email.sync_history')}</Label>
								<FormSelect
									value={String(
										normalizeAccountEmailSyncLookbackMonths(
											editor.email_sync_lookback_months,
											DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
										) ?? 0,
									)}
									onChange={(event) =>
										setEditor((prev) =>
											prev
												? {
														...prev,
														email_sync_lookback_months:
															event.target.value === '0'
																? null
																: normalizeAccountEmailSyncLookbackMonths(
																		event.target.value,
																		DEFAULT_ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTHS,
																	),
													}
												: prev,
										)
									}
								>
									{ACCOUNT_EMAIL_SYNC_LOOKBACK_MONTH_OPTIONS.map((months) => (
										<option key={months} value={months}>
											{months === 1
												? t('settings.account_email.last_month', {months})
												: t('settings.account_email.last_months', {months})}
										</option>
									))}
									<option value="0">{t('settings.account_email.no_limit')}</option>
								</FormSelect>
							</label>
						</div>
						<label className="block text-sm">
							<Label>{t('settings.account_email.message_list_order')}</Label>
							<FormSelect
								value={editor.email_list_sort || 'unread_then_arrived_desc'}
								onChange={(event) =>
									setEditor((prev) =>
										prev
											? {
													...prev,
													email_list_sort: parseMailListSort(event.target.value),
												}
											: prev,
									)
								}
							>
								{MAIL_LIST_SORT_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.value === 'unread_then_arrived_desc'
											? t('settings.account_email.message_order_unread_first')
											: t('settings.account_email.message_order_newest_first')}
									</option>
								))}
							</FormSelect>
						</label>
					</div>
				)}
			</Card>

			{isManagedOAuthProvider ? (
				<Card
					header={
						<div>
							<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_email.connection_title')}</h2>
							<p className="mt-1 ui-text-muted text-sm">
								{t('settings.account_email.connection_oauth_description', {
									provider: editor.oauth_provider === 'microsoft' ? 'Microsoft' : 'Google',
								})}
							</p>
						</div>
					}
				>
					<p className="ui-text-muted text-sm">
						{t('settings.account_email.connection_oauth_managed')}
					</p>
				</Card>
			) : (
				<>
					<ServiceSettingsCard
						title={t('settings.account_email.imap_incoming')}
						host={editor.imap_host}
						port={editor.imap_port}
						security={editor.imap_secure ? 'ssl' : 'starttls'}
						onHostChange={(value) => setEditor((p) => (p ? {...p, imap_host: value} : p))}
						onPortChange={(value) => setEditor((p) => (p ? {...p, imap_port: value} : p))}
						onSecurityChange={(value) =>
							setEditor((p) => (p ? {...p, imap_secure: value === 'ssl' ? 1 : 0} : p))
						}
						controlVariant="subtle"
						controlSize="lg"
					>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<Field
								label={t('settings.account_email.imap_username')}
								value={editor.imap_user || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, imap_user: v} : p))}
							/>
							<Field
								type="password"
								label={t('settings.account_email.imap_password')}
								value={editor.imap_password || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, imap_password: v} : p))}
							/>
						</div>
					</ServiceSettingsCard>
					<ServiceSettingsCard
						title={t('settings.account_email.smtp_outgoing')}
						host={editor.smtp_host}
						port={editor.smtp_port}
						security={editor.smtp_secure ? 'ssl' : 'starttls'}
						onHostChange={(value) => setEditor((p) => (p ? {...p, smtp_host: value} : p))}
						onPortChange={(value) => setEditor((p) => (p ? {...p, smtp_port: value} : p))}
						onSecurityChange={(value) =>
							setEditor((p) => (p ? {...p, smtp_secure: value === 'ssl' ? 1 : 0} : p))
						}
						controlVariant="subtle"
						controlSize="lg"
					>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<Field
								label={t('settings.account_email.smtp_username')}
								value={editor.smtp_user || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, smtp_user: v} : p))}
							/>
							<Field
								type="password"
								label={t('settings.account_email.smtp_password')}
								value={editor.smtp_password || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, smtp_password: v} : p))}
							/>
						</div>
					</ServiceSettingsCard>
				</>
			)}
		</div>
	);
}
