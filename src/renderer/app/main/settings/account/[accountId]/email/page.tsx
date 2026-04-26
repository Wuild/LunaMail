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

export default function SettingsAccountEmailPage() {
	const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
	if (!editor) return null;

	const isManagedOAuthProvider =
		editor.auth_method === 'oauth2' && (editor.oauth_provider === 'google' || editor.oauth_provider === 'microsoft');

	return (
		<div className="space-y-4">
			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">Email Module</h2>
						<p className="mt-1 ui-text-muted text-sm">
							Enable mailbox sync for this account and configure IMAP/SMTP endpoints.
						</p>
					</div>
				}
			>
				<label className="ui-border-default flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
					<div>
						<span className="ui-text-secondary">Enable Email</span>
						<p className="ui-text-muted mt-1 text-xs">Disable to hide inbox and pause email sync jobs.</p>
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
						<h2 className="ui-text-primary text-base font-semibold">Inbox & Sync</h2>
						<p className="mt-1 ui-text-muted text-sm">
							Control mailbox sync behavior and message list ordering.
						</p>
					</div>
				}
			>
				{!editor.sync_emails ? (
					<p className="ui-text-muted text-sm">
						Enable Email above to configure sync interval, history, and list ordering.
					</p>
				) : (
					<div className="space-y-4">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label className="block text-sm">
								<Label>Sync interval</Label>
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
											Every {minutes} minute{minutes === 1 ? '' : 's'}
										</option>
									))}
								</FormSelect>
							</label>
							<label className="block text-sm">
								<Label>Sync history</Label>
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
											Last {months} month{months === 1 ? '' : 's'}
										</option>
									))}
									<option value="0">No limit</option>
								</FormSelect>
							</label>
						</div>
						<label className="block text-sm">
							<Label>Message list order</Label>
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
										{option.label}
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
							<h2 className="ui-text-primary text-base font-semibold">Connection</h2>
							<p className="mt-1 ui-text-muted text-sm">
								This account uses {editor.oauth_provider === 'microsoft' ? 'Microsoft' : 'Google'} OAuth.
							</p>
						</div>
					}
				>
					<p className="ui-text-muted text-sm">
						Incoming and outgoing server credentials are managed by your provider.
					</p>
				</Card>
			) : (
				<>
					<ServiceSettingsCard
						title="IMAP Incoming"
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
								label="IMAP Username"
								value={editor.imap_user || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, imap_user: v} : p))}
							/>
							<Field
								type="password"
								label="IMAP Password"
								value={editor.imap_password || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, imap_password: v} : p))}
							/>
						</div>
					</ServiceSettingsCard>
					<ServiceSettingsCard
						title="SMTP Outgoing"
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
								label="SMTP Username"
								value={editor.smtp_user || ''}
								onChange={(v) => setEditor((p) => (p ? {...p, smtp_user: v} : p))}
							/>
							<Field
								type="password"
								label="SMTP Password"
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
