import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import {Download} from 'lucide-react';
import {Button} from '@renderer/components/ui/button';
import AppShell from '@renderer/components/AppShell';
import ShellLayout from '@renderer/layouts/ShellLayout';
import {APP_NAME} from '@/shared/appConfig';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {AppContextProvider} from '@renderer/app/AppContext';
import MainNavRail from '@renderer/components/navigation/MainNavRail';

type TitlebarOverrides = {
    title?: string;
    titleActions?: ReactNode | null;
    onRequestClose?: (() => boolean) | null;
    showNavRail?: boolean;
};

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const {autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();
    const isWindowRoute = location.pathname.startsWith('/windows/');
    const [titlebarOverrides, setTitlebarOverrides] = useState<TitlebarOverrides>({});

    const defaultTitle = useMemo(() => {
        const path = location.pathname || '/';
        if (path.startsWith('/windows/compose')) return 'Compose Email';
        if (path.startsWith('/windows/message')) return 'Message';
        if (path.startsWith('/windows/add-account')) return 'Add Account';
        if (path.startsWith('/windows/debug')) return 'Debug Console';
        if (path.startsWith('/windows/splash')) return 'Splash';
        if (path.startsWith('/onboarding')) return 'Onboarding';
        if (path.startsWith('/contacts')) return 'Contacts';
        if (path.startsWith('/calendar')) return 'Calendar';
        if (path.startsWith('/cloud')) return 'Cloud';
        if (path.startsWith('/settings')) return 'Settings';
        if (path.startsWith('/debug')) return 'Debug';
        if (path.startsWith('/help')) return 'Help';
        return 'Mail';
    }, [location.pathname]);
    const hasDefaultUpdateIndicator = !isWindowRoute && (
        autoUpdatePhase === 'available' || autoUpdatePhase === 'downloading' || autoUpdatePhase === 'downloaded'
    );
    const defaultUpdateIndicatorTitle =
        autoUpdatePhase === 'downloaded' ? 'Update ready to install' : autoUpdateMessage || 'Update available';
    const defaultTitleActions = hasDefaultUpdateIndicator ? (
        <Button
            type="button"
            className="titlebar-button-accent relative inline-flex h-7 w-7 items-center justify-center rounded"
            onClick={() => navigate('/settings/application')}
            title={defaultUpdateIndicatorTitle}
            aria-label="Open update status"
        >
            <Download size={13}/>
            <span className="titlebar-button-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"/>
        </Button>
    ) : null;
    const title = titlebarOverrides.title ?? defaultTitle;
    const titleActions = titlebarOverrides.titleActions === undefined
        ? defaultTitleActions
        : titlebarOverrides.titleActions;
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
            <AppContextProvider
                value={{setTitle, setTitleActions, setOnRequestClose, setShowNavRail, resetTitlebar}}
            >
                <AppShell
                    title={title}
                    titleActions={titleActions}
                    onRequestClose={onRequestClose}
                    navRail={showNavRail ? <MainNavRail/> : null}
                    showNavRail={showNavRail}
                >
                    <Outlet/>
                </AppShell>
            </AppContextProvider>
        </ShellLayout>
    );
}
