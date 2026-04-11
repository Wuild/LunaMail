import {Navigate, useParams} from 'react-router-dom';

export default function SettingsAccountPage() {
    const {accountId} = useParams<{ accountId?: string }>();
    const directAccountId = Number(accountId);

    if (!Number.isFinite(directAccountId) || directAccountId <= 0) {
        return <Navigate to="/settings/application" replace/>;
    }

    return <Navigate to={`/settings/account/${directAccountId}/identity`} replace/>;
}
