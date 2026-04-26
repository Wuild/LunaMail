import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import {Download} from '@llamamail/ui/icon';
import {Button} from '@llamamail/ui/button';
import AppShell from '@renderer/components/AppShell';
import ShellLayout from '@renderer/layouts/ShellLayout';
import {APP_NAME} from '@llamamail/app/appConfig';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {AppContextProvider} from '@renderer/app/AppContext';
import MainNavRail from '@renderer/components/navigation/MainNavRail';
import {useI18n} from '@llamamail/app/i18n/renderer';

type TitlebarOverrides = {
	title?: string;
	titleActions?: ReactNode | null;
	onRequestClose?: (() => boolean) | null;
	showNavRail?: boolean;
};

export default function AppLayout() {
	const location = useLocation();
	const navigate = useNavigate();
	const {t} = useI18n();
	const {autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();
	const isWindowRoute = location.pathname.startsWith('/windows/');
	const [titlebarOverrides, setTitlebarOverrides] = useState<TitlebarOverrides>({});

	const defaultTitle = useMemo(() => {
		const path = location.pathname || '/';
		if (path.startsWith('/windows/compose')) return t('app.title.compose_email');
		if (path.startsWith('/windows/message')) return t('app.title.message');
		if (path.startsWith('/windows/add-account')) return t('app.title.add_account');
		if (path.startsWith('/windows/debug')) return t('app.title.debug_console');
		if (path.startsWith('/windows/splash')) return '';
		if (path.startsWith('/onboarding')) return t('app.title.onboarding');
		if (path.startsWith('/contacts')) return t('app.title.contacts');
		if (path.startsWith('/calendar')) return t('app.title.calendar');
		if (path.startsWith('/cloud')) return t('app.title.cloud');
		if (path.startsWith('/settings')) return t('app.title.settings');
		if (path.startsWith('/debug')) return t('app.title.debug');
		if (path.startsWith('/about')) return t('app.title.about');
		if (path.startsWith('/help')) return t('app.title.about');
		return t('app.title.mail');
	}, [location.pathname, t]);
	const hasDefaultUpdateIndicator =
		!isWindowRoute &&
		(autoUpdatePhase === 'available' || autoUpdatePhase === 'downloading' || autoUpdatePhase === 'downloaded');
	const defaultUpdateIndicatorTitle =
		autoUpdatePhase === 'downloaded'
			? t('app.update.ready_to_install')
			: autoUpdateMessage || t('app.update.available');
	const defaultTitleActions = hasDefaultUpdateIndicator ? (
		<Button
			type="button"
			className="titlebar-button-accent relative inline-flex h-7 w-7 items-center justify-center rounded"
			onClick={() => navigate('/settings/application')}
			title={defaultUpdateIndicatorTitle}
			aria-label={t('app.update.open_status')}
		>
			<Download size={13} />
			<span className="titlebar-button-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" />
		</Button>
	) : null;
	const title = titlebarOverrides.title ?? defaultTitle;
	const titleActions =
		titlebarOverrides.titleActions === undefined ? defaultTitleActions : titlebarOverrides.titleActions;
	const onRequestClose = titlebarOverrides.onRequestClose ?? undefined;
	const showNavRail = !isWindowRoute && Boolean(titlebarOverrides.showNavRail);

	const setTitle = useCallback((nextTitle?: string) => {
		setTitlebarOverrides((prev) => ({...prev, title: nextTitle}));
	}, []);

	const setTitleActions = useCallback((nextTitleActions?: ReactNode | null) => {
		setTitlebarOverrides((prev) => ({...prev, titleActions: nextTitleActions}));
	}, []);

	const setOnRequestClose = useCallback((nextOnRequestClose?: (() => boolean) | null) => {
		setTitlebarOverrides((prev) => ({...prev, onRequestClose: nextOnRequestClose}));
	}, []);

	const setShowNavRail = useCallback((nextShowNavRail?: boolean) => {
		setTitlebarOverrides((prev) => {
			if (prev.showNavRail === nextShowNavRail) return prev;
			return {...prev, showNavRail: nextShowNavRail};
		});
	}, []);

	const resetTitlebar = useCallback(() => {
		setTitlebarOverrides({});
	}, []);

	useEffect(() => {
		document.title = `${APP_NAME} - ${title}`;
	}, [title]);

	useEffect(() => {
		setTitlebarOverrides((prev) => ({
			showNavRail: prev.showNavRail,
		}));
	}, [location.pathname]);

	return (
		<ShellLayout>
			<AppContextProvider value={{setTitle, setTitleActions, setOnRequestClose, setShowNavRail, resetTitlebar}}>
				<AppShell
					title={title}
					titleActions={titleActions}
					onRequestClose={onRequestClose}
					navRail={showNavRail ? <MainNavRail /> : null}
					showNavRail={showNavRail}
				>
					<Outlet />
				</AppShell>
			</AppContextProvider>
		</ShellLayout>
	);
}
