import {Navigate, useLocation} from 'react-router-dom';
import AppSettingsPage from '../../../../../../pages/AppSettingsPage';
import {useRouteAccountId} from '../accountRouteHelpers';

export default function SettingsAccountIdentityPage() {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const accountId = useRouteAccountId();
    if (accountId === null) return <Navigate to="/settings/application" replace/>;
    return (
        <AppSettingsPage
            embedded
            targetAccountId={accountId}
            initialPanel="app"
            initialAccountSection="identity"
            openUpdaterToken={query.get('openUpdater')}
        />
    );
}
