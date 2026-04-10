import type {RouteObject} from 'react-router-dom';
import {Navigate} from 'react-router-dom';
import AddAccountPage from './add-account/page';
import AddAccountLayout from './add-account/layout';
import AppLayout from './layout';
import MainSectionLayout from './main/layout';
import CalendarPage from './main/calendar/page';
import CloudPage from './main/cloud/page';
import DebugPage from './main/debug/page';
import EmailPage from './main/email/page';
import EmailSectionLayout from './main/email/layout';
import AccountEmailPage from './main/email/[accountId]/page';
import AccountFolderEmailPage from './main/email/[accountId]/[folderId]/page';
import AccountFolderMessageEmailPage from './main/email/[accountId]/[folderId]/[emailId]/page';
import HelpPage from './main/help/page';
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
import SettingsDeveloperPage from './main/settings/developer/page';
import ContactsPage from './main/contacts/page';
import OnboardingPage from './onboarding/page';
import OnboardingLayout from './onboarding/layout';
import type {MainWindowRouteContext} from '../routes/mainWindowRouteContext';

export function buildMainWindowRouteObjects(
    context: MainWindowRouteContext,
    showDebugNavItem: boolean,
): RouteObject[] {
    const hasAccounts = context.accounts.length > 0;
    if (!hasAccounts) {
        return [
            {
                element: <AppLayout/>,
                children: [
                    {path: '/', element: <Navigate to="/onboarding" replace/>},
                    {
                        element: <OnboardingLayout/>,
                        children: [{path: '/onboarding', element: <OnboardingPage hasAccounts={false}/>}],
                    },
                    {
                        element: <AddAccountLayout/>,
                        children: [{path: '/add-account', element: <AddAccountPage hasAccounts={false}/>}],
                    },
                    {path: '*', element: <Navigate to="/onboarding" replace/>},
                ],
            },
        ];
    }

    return [
        {
            element: <AppLayout/>,
            children: [
                {path: '/onboarding', element: <Navigate to="/email" replace/>},
                {
                    element: <AddAccountLayout/>,
                    children: [{path: '/add-account', element: <AddAccountPage hasAccounts/>}],
                },
                {
                    element: <MainSectionLayout/>,
                    children: [
                        {path: '/', element: <Navigate to="/email" replace/>},
                        {
                            element: <EmailSectionLayout/>,
                            children: [
                                {path: '/email', element: <EmailPage/>},
                                {path: '/email/:accountId', element: <AccountEmailPage/>},
                                {path: '/email/:accountId/:folderId', element: <AccountFolderEmailPage/>},
                                {
                                    path: '/email/:accountId/:folderId/:emailId',
                                    element: <AccountFolderMessageEmailPage/>
                                },
                            ],
                        },
                        {path: '/mail/*', element: <Navigate to="/email" replace/>},
                        {path: '/cloud', element: <CloudPage/>},
                        {
                            path: '/contacts',
                            element: (
                                <ContactsPage
                                    accountId={context.accountId}
                                    accounts={context.accounts}
                                    onSelectAccount={context.onSelectAccount}
                                />
                            ),
                        },
                        {
                            path: '/calendar',
                            element: (
                                <CalendarPage
                                    accountId={context.accountId}
                                    accounts={context.accounts}
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
                                {path: '/settings/developer', element: <SettingsDeveloperPage/>},
                                {path: '/settings/:tab', element: <SettingsTabPage/>},
                                {
                                    element: <SettingsAccountLayout/>,
                                    children: [
                                        {path: '/settings/account/:accountId', element: <SettingsAccountPage/>},
                                        {
                                            path: '/settings/account/:accountId/identity',
                                            element: <SettingsAccountIdentityPage/>
                                        },
                                        {
                                            path: '/settings/account/:accountId/server',
                                            element: <SettingsAccountServerPage/>
                                        },
                                        {
                                            path: '/settings/account/:accountId/filters',
                                            element: <SettingsAccountFiltersPage/>
                                        },
                                    ],
                                },
                            ],
                        },
                        {path: '/debug', element: <DebugPage showDebugNavItem={showDebugNavItem}/>},
                        {path: '/help', element: <HelpPage/>},
                        {path: '*', element: <Navigate to="/email" replace/>},
                    ],
                },
            ],
        },
    ];
}
