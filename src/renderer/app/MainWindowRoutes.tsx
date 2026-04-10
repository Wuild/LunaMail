import {useMemo} from 'react';
import {useRoutes} from 'react-router-dom';
import {buildMainWindowRouteObjects} from './mainWindowRouteObjects';
import type {MainWindowRouteContext} from './mainWindowRouteContext';

export type MainWindowRoutesProps = MainWindowRouteContext & {
    showDebugNavItem: boolean;
};

export default function MainWindowRoutes({
                                             accountId,
                                             accounts,
                                             onSelectAccount,
                                             showDebugNavItem,
                                         }: MainWindowRoutesProps) {
    const routes = useMemo(
        () =>
            buildMainWindowRouteObjects(
                {
                    accountId,
                    accounts,
                    onSelectAccount,
                },
                showDebugNavItem,
            ),
        [accountId, accounts, onSelectAccount, showDebugNavItem],
    );
    return useRoutes(routes);
}
