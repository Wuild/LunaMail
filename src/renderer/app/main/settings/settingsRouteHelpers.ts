import {useLocation} from 'react-router-dom';

export function useOpenUpdaterToken(): string | null {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    return query.get('openUpdater');
}
