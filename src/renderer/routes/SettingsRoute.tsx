import React from 'react';
import {Navigate, useLocation, useParams} from 'react-router-dom';
import AppSettingsPage from '../pages/AppSettingsPage';

export default function SettingsRoute() {
    const {tab, accountId} = useParams<{ tab?: string; accountId?: string }>();
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const normalizedTab = String(tab || '').toLowerCase();
    if (location.pathname.startsWith('/settings/account/')) {
        const directAccountId = Number(accountId);
        if (!Number.isFinite(directAccountId) || directAccountId <= 0) {
            return <Navigate to="/settings/application" replace/>;
        }
        return (
            <AppSettingsPage
                embedded
                targetAccountId={directAccountId}
                initialPanel="app"
                openUpdaterToken={query.get('openUpdater')}
            />
        );
    }
    const validTabs = new Set(['application', 'layout', 'developer', 'account']);
    if (!validTabs.has(normalizedTab)) {
        return <Navigate to="/settings/application" replace/>;
    }
    const rawTarget = Number(query.get('accountId'));
    const targetAccountId = normalizedTab === 'account' && Number.isFinite(rawTarget) ? rawTarget : null;
    if (normalizedTab === 'account' && targetAccountId === null) {
        return <Navigate to="/settings/application" replace/>;
    }
    const panel = normalizedTab === 'developer' ? 'developer' : normalizedTab === 'layout' ? 'layout' : 'app';
    const openUpdaterToken = query.get('openUpdater');
    return (
        <AppSettingsPage
            embedded
            targetAccountId={targetAccountId}
            initialPanel={panel}
            openUpdaterToken={openUpdaterToken}
        />
    );
}
