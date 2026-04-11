import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import DynamicSidebar, {type DynamicSidebarSection} from '@renderer/components/navigation/DynamicSidebar';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '@renderer/lib/accountAvatar';
import {cn} from '@renderer/lib/utils';
import {Plus} from 'lucide-react';
import {useMemo} from 'react';

export default function SettingsLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const {accounts} = useAccounts();
	const {sidebarWidth: settingsSidebarWidth, onResizeStart: onSettingsSidebarResizeStart} = useResizableSidebar({
		defaultWidth: 320,
		minWidth: 240,
		maxWidth: 460,
		storageKey: 'llamamail.settings.sidebar.width',
	});

	const selectedSidebarItemId = useMemo(() => {
		const accountMatch = location.pathname.match(/^\/settings\/account\/(\d+)/);
		if (accountMatch) return `account:${accountMatch[1]}`;
		if (location.pathname === '/settings/layout') return 'layout';
		if (location.pathname === '/settings/whitelist') return 'allowlist';
		if (location.pathname === '/settings/developer') return 'developer';
		return 'app';
	}, [location.pathname]);
	const isAccountSettingsRoute = /^\/settings\/account\/\d+/.test(location.pathname);

	const sidebarSections: DynamicSidebarSection[] = useMemo(
		() => [
			{
				id: 'primary',
				items: [
					{id: 'app', label: 'Application', to: '/settings/application'},
					{id: 'layout', label: 'Appearance', to: '/settings/layout'},
					{id: 'allowlist', label: 'Whitelist', to: '/settings/whitelist'},
					{id: 'developer', label: 'Developer', to: '/settings/developer'},
				],
			},
			{
				id: 'accounts',
				title: 'Accounts',
				emptyLabel: 'No accounts available.',
				items: [
					...accounts.map((account) => ({
						id: `account:${account.id}`,
						label: account.display_name?.trim() || account.email,
						description: account.display_name?.trim() ? account.email : null,
						to: `/settings/account/${account.id}`,
						avatar: (() => {
							const colors = getAccountAvatarColorsForAccount(account);
							return (
								<span
									className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold"
									style={{backgroundColor: colors.background, color: colors.foreground}}
									aria-hidden
								>
									{getAccountMonogram(account)}
								</span>
							);
						})(),
					})),
					{
						id: 'account:add',
						label: 'Add account',
						description: 'Open account setup',
						icon: <Plus size={15}/>,
					},
				],
			},
		],
		[accounts],
	);

	const onSidebarSelect = (itemId: string) => {
		if (itemId === 'account:add') {
			navigate('/add-account');
			return;
		}
		if (itemId === 'app') {
			navigate('/settings/application');
			return;
		}
		if (itemId === 'layout') {
			navigate('/settings/layout');
			return;
		}
		if (itemId === 'allowlist') {
			navigate('/settings/whitelist');
			return;
		}
		if (itemId === 'developer') {
			navigate('/settings/developer');
			return;
		}
		if (itemId.startsWith('account:')) {
			const accountId = Number(itemId.slice('account:'.length));
			if (Number.isFinite(accountId) && accountId > 0) {
				navigate(`/settings/account/${accountId}`);
			}
		}
	};

	return (
		<WorkspaceLayout
			className="h-full"
			showMenuBar={false}
			showFooter={false}
			showStatusBar={false}
			sidebar={
				<DynamicSidebar
					sections={sidebarSections}
					selectedItemId={selectedSidebarItemId}
					onSelectItem={onSidebarSelect}
				/>
			}
			sidebarWidth={settingsSidebarWidth}
			onSidebarResizeStart={onSettingsSidebarResizeStart}
			contentClassName={cn('min-h-0 flex-1 overflow-y-auto', isAccountSettingsRoute && 'p-0')}
		>
			<Outlet/>
		</WorkspaceLayout>
	);
}
