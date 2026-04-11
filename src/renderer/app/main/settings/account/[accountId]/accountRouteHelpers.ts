import {useParams} from 'react-router-dom';

export function useRouteAccountId(): number | null {
    const {accountId} = useParams<{ accountId?: string }>();
    const value = Number(accountId);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}
