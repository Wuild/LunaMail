import type {PublicAccount} from '@/preload';

export type MainWindowRouteContext = {
    accountId: number | null;
    accounts: PublicAccount[];
    onSelectAccount: (accountId: number | null) => void;
};
