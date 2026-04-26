import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import DynamicSidebar, {type DynamicSidebarSection} from '@renderer/components/navigation/DynamicSidebar';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {useAccounts} from '@renderer/hooks/ipc/useAccounts';
import {getAccountAvatarColorsForAccount, getAccountMonogram} from '@renderer/lib/accountAvatar';
import {cn} from '@llamamail/ui/utils';
import {Plus} from '@llamamail/ui/icon';
import {useMemo} from 'react';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsLayout() {
	const {t} = useI18n();
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
		if (location.pathname === '/settings/legal') return 'legal';
		if (location.pathname === '/settings/developer') return 'developer';
		return 'app';
	}, [location.pathname]);
	const isAccountSettingsRoute = /^\/settings\/account\/\d+/.test(location.pathname);

	const sidebarSections: DynamicSidebarSection[] = useMemo(
		() => [
			{
				id: 'primary',
				items: [
					{id: 'app', label: t('settings.sidebar.application'), to: '/settings/application'},
					{id: 'layout', label: t('settings.sidebar.appearance'), to: '/settings/layout'},
					{id: 'allowlist', label: t('settings.sidebar.whitelist'), to: '/settings/whitelist'},
					{id: 'legal', label: t('settings.sidebar.legal'), to: '/settings/legal'},
					{id: 'developer', label: t('settings.sidebar.developer'), to: '/settings/developer'},
				],
			},
			{
				id: 'accounts',
				title: t('settings.sidebar.accounts'),
				emptyLabel: t('settings.sidebar.no_accounts_available'),
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
						label: t('settings.sidebar.add_account'),
						description: t('settings.sidebar.open_account_setup'),
						icon: <Plus size={15} />,
					},
				],
			},
		],
		[accounts, t],
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
		if (itemId === 'legal') {
			navigate('/settings/legal');
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
			contentClassName={cn('p-0')}
		>
			<Outlet />
		</WorkspaceLayout>
	);
}
