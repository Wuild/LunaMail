import {Navigate, Outlet, useLocation} from 'react-router-dom';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {Button} from '@llamamail/ui/button';
import {cn} from '@llamamail/ui/utils';
import {useRouteAccountId} from './accountRouteHelpers';
import {useAccountSettingsRoute, type UseAccountSettingsRouteResult} from './useAccountSettingsRoute';
import type {AccountPanelSection} from '@renderer/app/main/settings/settingsTypes';
import {Card} from '@llamamail/ui/card';

type AccountSectionItem = {
	id: AccountPanelSection;
	label: string;
	description: string;
};

function resolveAccountSection(pathname: string): AccountPanelSection {
	if (pathname.endsWith('/server')) return 'email';
	if (pathname.endsWith('/email')) return 'email';
	if (pathname.endsWith('/carddav')) return 'carddav';
	if (pathname.endsWith('/caldav')) return 'caldav';
	if (pathname.endsWith('/mail')) return 'email';
	if (pathname.endsWith('/filters')) return 'filters';
	return 'identity';
}

export default function SettingsAccountLayout() {
	const location = useLocation();
	const accountId = useRouteAccountId();
	const controller = useAccountSettingsRoute(accountId ?? 0, resolveAccountSection(location.pathname));
	const {
		editor,
		accountSection,
		onAccountSectionNavigate,
		accountSectionSidebarWidth,
		onAccountSectionResizeStart,
		accountStatus,
		deletingAccount,
		savingAccount,
		onDeleteAccount,
		onSaveAccount,
	} = controller;

	if (accountId === null) return <Navigate to="/settings/application" replace />;

	const accountSections: AccountSectionItem[] = [
		{
			id: 'identity',
			label: 'Profile',
			description: 'Sender identity, reply address, and signature.',
		},
		{
			id: 'email',
			label: 'Email',
			description: 'Enable email sync and manage IMAP/SMTP.',
		},
		{
			id: 'carddav',
			label: 'Contacts',
			description: 'Enable contacts sync and manage CardDAV.',
		},
		{
			id: 'caldav',
			label: 'Calendar',
			description: 'Enable calendar sync and manage CalDAV.',
		},
		{
			id: 'filters',
			label: 'Rules',
			description: 'Automate incoming mail actions.',
		},
	];

	const accountDisplayName = editor?.display_name?.trim() || editor?.email || `Account ${accountId}`;
	const accountSecondaryLabel = editor?.display_name?.trim() ? editor.email : null;

	return (
		<div className="h-full min-h-0 w-full">
			{!editor && <div className="ui-text-muted text-sm">Select an account.</div>}
			{editor && (
				<div className="flex h-full flex-col">
					<WorkspaceLayout
						className="h-full bg-transparent"
						showMenuBar={false}
						showFooter={false}
						showStatusBar={false}
						sidebar={
							<aside className="sidebar h-full min-h-0 p-3">
								<p className="px-2 pb-2 ui-text-muted text-xs font-semibold uppercase tracking-wide">
									Account Settings
								</p>
								<Card variant="outline" size="sm" className="mb-3">
									<p className="ui-text-primary truncate text-sm font-semibold">{accountDisplayName}</p>
									{accountSecondaryLabel && (
										<p className="ui-text-muted truncate text-xs">{accountSecondaryLabel}</p>
									)}
								</Card>
								<div className="space-y-1">
									{accountSections.map((sectionItem) => (
										<Button
											key={sectionItem.id}
											type="button"
											className={cn(
												'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
												accountSection === sectionItem.id
													? 'ui-surface-active ui-text-primary'
													: 'account-item',
											)}
											onClick={() => onAccountSectionNavigate(sectionItem.id)}
										>
											{sectionItem.label}
											<span className="ui-text-muted block truncate text-[11px] font-normal">
												{sectionItem.description}
											</span>
										</Button>
									))}
								</div>
							</aside>
						}
						sidebarWidth={accountSectionSidebarWidth}
						onSidebarResizeStart={onAccountSectionResizeStart}
						contentClassName="min-h-0 flex-1 overflow-y-auto bg-transparent"
					>
						<div className="mx-auto w-full max-w-5xl p-4">
							<header className="mb-4">
								<h1 className="ui-text-primary text-xl font-semibold">{accountDisplayName}</h1>
								<p className="ui-text-muted mt-1 text-sm">
									Manage account identity, connectivity, sync behavior, and mail rules.
								</p>
							</header>
							<Outlet context={controller satisfies UseAccountSettingsRouteResult} />
						</div>
					</WorkspaceLayout>
					<div className="app-footer shrink-0 px-4 py-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								{Boolean((accountStatus || '').trim()) && (
									<span className="ui-text-muted text-xs">{accountStatus}</span>
								)}
							</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="danger"
									size="default"
									onClick={() => void onDeleteAccount()}
									disabled={!editor || deletingAccount}
									className="rounded-md font-medium"
								>
									{deletingAccount ? 'Deleting...' : 'Delete Account'}
								</Button>
								<Button
									type="button"
									variant="default"
									size="default"
									onClick={() => void onSaveAccount()}
									disabled={!editor || savingAccount}
									className="rounded-md font-medium"
								>
									{savingAccount ? 'Saving...' : 'Save'}
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
