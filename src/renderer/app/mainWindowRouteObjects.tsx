import type {RouteObject} from 'react-router-dom';
import {Navigate} from 'react-router-dom';
import AddAccountPage from './add-account/page';
import AddAccountLayout from './add-account/layout';
import MainSectionLayout from './main/layout';
import CalendarPage from './main/calendar/page';
import CloudPage from './main/cloud/page';
import DebugPage from './main/debug/page';
import EmailPage from './main/email/page';
import EmailSectionLayout from './main/email/layout';
import AboutPage from './main/help/page';
import SettingsIndexPage from './main/settings/page';
import SettingsLayout from './main/settings/layout';
import SettingsTabPage from './main/settings/[tab]/page';
import SettingsAccountPage from './main/settings/account/[accountId]/page';
import SettingsAccountLayout from './main/settings/account/[accountId]/layout';
import SettingsAccountIdentityPage from './main/settings/account/[accountId]/identity/page';
import SettingsAccountServerPage from './main/settings/account/[accountId]/server/page';
import SettingsAccountFiltersPage from './main/settings/account/[accountId]/filters/page';
import SettingsApplicationPage from './main/settings/application/page';
import SettingsLayoutPage from './main/settings/layout/page';
import SettingsWhitelistPage from './main/settings/whitelist/page';
import SettingsLegalPage from './main/settings/legal/page';
import SettingsDeveloperPage from './main/settings/developer/page';
import ContactsPage from './main/contacts/page';
import OnboardingPage from './onboarding/page';
import type {MainWindowRouteContext} from './mainWindowRouteContext';
import {isAccountCalendarModuleEnabled, isAccountContactsModuleEnabled} from '@/shared/accountModules';
import {useAppSettings} from "@renderer/hooks/ipc/useAppSettings";
import {DEFAULT_APP_SETTINGS} from "@/shared/defaults";
import {useState} from "react";
import {
    MainNavContextItemId,
    normalizeTopNavOrder,
    TopNavItemId
} from "@renderer/components/navigation/MainNavRail";


function NavigateToFirstPage() {
    const {appSettings} = useAppSettings(DEFAULT_APP_SETTINGS);

    const topNavOrder = normalizeTopNavOrder(appSettings.navRailOrder);

    const routeMap: Record<MainNavContextItemId, string> = {
        email: '/email',
        cloud: '/cloud',
        contacts: '/contacts',
        calendar: '/calendar',
        settings: '/settings',
        debug: '/debug',
        about: '/about',
    };

    const firstItem = topNavOrder[0] ?? 'email';
    const target = routeMap[firstItem] ?? '/email';

    return <Navigate to={target} replace/>;
}

export function buildMainWindowRouteObjects(context: MainWindowRouteContext, showDebugNavItem: boolean): RouteObject[] {
    const hasAccounts = context.accounts.length > 0;
    const contactsAccounts = context.accounts.filter((account) => isAccountContactsModuleEnabled(account));
    const calendarAccounts = context.accounts.filter((account) => isAccountCalendarModuleEnabled(account));
    const contactsAccountId =
        context.accountId && contactsAccounts.some((account) => account.id === context.accountId)
            ? context.accountId
            : (contactsAccounts[0]?.id ?? null);
    const calendarAccountId =
        context.accountId && calendarAccounts.some((account) => account.id === context.accountId)
            ? context.accountId
            : (calendarAccounts[0]?.id ?? null);
    return [
        {
            path: '/onboarding',
            element: hasAccounts ? <Navigate to="/email" replace/> : <OnboardingPage/>,
        },
        {
            element: <AddAccountLayout/>,
            children: [{path: '/add-account', element: <AddAccountPage hasAccounts={hasAccounts}/>}],
        },
        {
            element: <MainSectionLayout/>,
            children: [
                {path: '/', element: <NavigateToFirstPage/>},
                {
                    element: <EmailSectionLayout/>,
                    children: [
                        {path: '/email', element: <EmailPage/>},
                        {path: '/email/:accountId', element: <EmailPage/>},
                        {path: '/email/:accountId/:folderId', element: <EmailPage/>},
                        {path: '/email/:accountId/:folderId/:emailId', element: <EmailPage/>},
                    ],
                },
                {path: '/mail/*', element: <Navigate to="/email" replace/>},
                {path: '/cloud', element: <CloudPage/>},
                {
                    path: '/contacts',
                    element: (
                        <ContactsPage
                            accountId={contactsAccountId}
                            accounts={contactsAccounts}
                            onSelectAccount={context.onSelectAccount}
                        />
                    ),
                },
                {
                    path: '/calendar',
                    element: (
                        <CalendarPage
                            accountId={calendarAccountId}
                            accounts={calendarAccounts}
                            onSelectAccount={context.onSelectAccount}
                        />
                    ),
                },
                {
                    element: <SettingsLayout/>,
                    children: [
                        {path: '/settings', element: <SettingsIndexPage/>},
                        {path: '/settings/application', element: <SettingsApplicationPage/>},
                        {path: '/settings/layout', element: <SettingsLayoutPage/>},
                        {path: '/settings/whitelist', element: <SettingsWhitelistPage/>},
                        {path: '/settings/legal', element: <SettingsLegalPage/>},
                        {path: '/settings/developer', element: <SettingsDeveloperPage/>},
                        {path: '/settings/:tab', element: <SettingsTabPage/>},
                        {
                            element: <SettingsAccountLayout/>,
                            children: [
                                {path: '/settings/account/:accountId', element: <SettingsAccountPage/>},
                                {
                                    path: '/settings/account/:accountId/identity',
                                    element: <SettingsAccountIdentityPage/>,
                                },
                                {
                                    path: '/settings/account/:accountId/server',
                                    element: <SettingsAccountServerPage/>,
                                },
                                {
                                    path: '/settings/account/:accountId/filters',
                                    element: <SettingsAccountFiltersPage/>,
                                },
                            ],
                        },
                    ],
                },
                {path: '/debug', element: <DebugPage showDebugNavItem={showDebugNavItem}/>},
                {path: '/about', element: <AboutPage/>},
                {path: '/help', element: <Navigate to="/about" replace/>},
                {path: '*', element: <Navigate to="/email" replace/>},
            ],
        },
    ];
}
