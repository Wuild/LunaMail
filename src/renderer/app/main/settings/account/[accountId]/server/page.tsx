import {useOutletContext} from 'react-router-dom';
import ServiceSettingsCard from '@renderer/components/settings/ServiceSettingsCard';
import {FormCheckbox} from '@renderer/components/ui/FormControls';
import {Button} from '@renderer/components/ui/button';
import {Field} from '@renderer/app/main/settings/formParts';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';

export default function SettingsAccountServerPage() {
	const {
		editor,
		setEditor,
		accountStatus,
		linkedCloudDrive,
		canLinkCloudDrive,
		cloudDriveBusy,
		onLinkCloudDrive,
		onUnlinkCloudDrive,
	} = useOutletContext<UseAccountSettingsRouteResult>();
	if (!editor) return null;
	const hasAnyModuleEnabled = !!editor.sync_emails || !!editor.sync_contacts || !!editor.sync_calendar;

	return (
		<>
			<section className="panel rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Included Modules</h2>
				<p className="mt-1 ui-text-muted text-sm">
					Control where this account appears and what sync jobs run for it.
				</p>
				<div className="mt-4 space-y-3">
					<label className="flex items-center justify-between gap-3 text-sm">
						<span className="ui-text-secondary">Email</span>
						<FormCheckbox
							checked={!!editor.sync_emails}
							onChange={(event) =>
								setEditor((prev) =>
									prev ? {...prev, sync_emails: event.target.checked ? 1 : 0} : prev,
								)
							}
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-sm">
						<span className="ui-text-secondary">Contacts</span>
						<FormCheckbox
							checked={!!editor.sync_contacts}
							onChange={(event) =>
								setEditor((prev) =>
									prev ? {...prev, sync_contacts: event.target.checked ? 1 : 0} : prev,
								)
							}
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-sm">
						<span className="ui-text-secondary">Calendar</span>
						<FormCheckbox
							checked={!!editor.sync_calendar}
							onChange={(event) =>
								setEditor((prev) =>
									prev ? {...prev, sync_calendar: event.target.checked ? 1 : 0} : prev,
								)
							}
						/>
					</label>
				</div>
				{!hasAnyModuleEnabled && (
					<p className="text-danger mt-3 text-xs">Enable at least one module before saving this account.</p>
				)}
				{hasAnyModuleEnabled && /Select at least one sync module/i.test(accountStatus || '') && (
					<p className="ui-text-muted mt-3 text-xs">Module selection is valid. You can save now.</p>
				)}
			</section>
			<section className="panel rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Server Settings</h2>
				<div className="mt-4 flex flex-col gap-4">
					<Field
						label="User"
						value={editor.user}
						onChange={(v) => setEditor((p) => (p ? {...p, user: v} : p))}
					/>
					<Field
						label="Provider"
						value={editor.provider || ''}
						onChange={(v) => setEditor((p) => (p ? {...p, provider: v} : p))}
					/>
					<Field
						type="password"
						label="New password (optional)"
						value={editor.password || ''}
						onChange={(v) => setEditor((p) => (p ? {...p, password: v} : p))}
					/>
				</div>
			</section>
			<section className="panel mt-4 rounded-xl p-4">
				<h2 className="ui-text-primary text-base font-semibold">Cloud Drive</h2>
				<p className="mt-1 ui-text-muted text-sm">
					Manage whether this account has a linked cloud drive integration.
				</p>
				<div className="mt-4 flex items-center justify-between gap-3">
					<div>
						<p className="ui-text-secondary text-sm">
							{linkedCloudDrive
								? `Connected: ${linkedCloudDrive.name}`
								: 'No cloud drive linked to this account.'}
						</p>
						{linkedCloudDrive?.user && (
							<p className="ui-text-muted mt-1 text-xs">
								{linkedCloudDrive.provider} · {linkedCloudDrive.user}
							</p>
						)}
					</div>
					<Button
						type="button"
						variant={linkedCloudDrive ? 'danger' : 'success'}
						size="sm"
						disabled={cloudDriveBusy || (!linkedCloudDrive && !canLinkCloudDrive)}
						onClick={() => void (linkedCloudDrive ? onUnlinkCloudDrive() : onLinkCloudDrive())}
					>
						{cloudDriveBusy
							? linkedCloudDrive
								? 'Disconnecting...'
								: 'Linking...'
							: linkedCloudDrive
								? 'Do Not Use Cloud Drive'
								: 'Link Cloud Drive'}
					</Button>
				</div>
				{!linkedCloudDrive && !canLinkCloudDrive && (
					<p className="ui-text-muted mt-2 text-xs">
						Cloud drive linking is available for OAuth Google and Microsoft accounts.
					</p>
				)}
			</section>
			<div className="mt-4">
				<ServiceSettingsCard
					title="IMAP Incoming"
					host={editor.imap_host}
					port={editor.imap_port}
					security={editor.imap_secure ? 'ssl' : 'starttls'}
					onHostChange={(value) => setEditor((p) => (p ? {...p, imap_host: value} : p))}
					onPortChange={(value) => setEditor((p) => (p ? {...p, imap_port: value} : p))}
					onSecurityChange={(value) =>
						setEditor((p) =>
							p
								? {
										...p,
										imap_secure: value === 'ssl' ? 1 : 0,
									}
								: p,
						)
					}
					controlVariant="subtle"
					controlSize="lg"
				/>
			</div>
			<div className="mt-4">
				<ServiceSettingsCard
					title="SMTP Outgoing"
					host={editor.smtp_host}
					port={editor.smtp_port}
					security={editor.smtp_secure ? 'ssl' : 'starttls'}
					onHostChange={(value) => setEditor((p) => (p ? {...p, smtp_host: value} : p))}
					onPortChange={(value) => setEditor((p) => (p ? {...p, smtp_port: value} : p))}
					onSecurityChange={(value) =>
						setEditor((p) =>
							p
								? {
										...p,
										smtp_secure: value === 'ssl' ? 1 : 0,
									}
								: p,
						)
					}
					controlVariant="subtle"
					controlSize="lg"
				/>
			</div>
		</>
	);
}
