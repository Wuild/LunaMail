import {Navigate, useLocation, useParams} from 'react-router-dom';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';

export default function SettingsTabPage() {
    const {tab} = useParams<{ tab?: string }>();
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const normalizedTab = String(tab || '').toLowerCase();
    const openUpdaterToken = useOpenUpdaterToken();
    if (normalizedTab === 'account') {
        const rawTarget = Number(query.get('accountId'));
        const targetAccountId = Number.isFinite(rawTarget) ? rawTarget : null;
        if (targetAccountId === null || targetAccountId <= 0) {
            return <Navigate to="/settings/application" replace/>;
        }
        const suffix = openUpdaterToken ? `?openUpdater=${encodeURIComponent(openUpdaterToken)}` : '';
        return <Navigate to={`/settings/account/${targetAccountId}/identity${suffix}`} replace/>;
    }
    return <Navigate to="/settings/application" replace/>;
}
