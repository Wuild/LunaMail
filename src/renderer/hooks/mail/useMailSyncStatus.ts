import {useCallback, useState} from 'react';

type UseMailSyncStatusResult = {
    syncStatusText: string | null;
    setSyncStatusText: (text: string | null) => void;
    syncingAccountIds: Set<number>;
    markAccountSyncing: (accountId: number) => void;
    clearAccountSyncing: (accountId: number) => void;
    pruneSyncingAccounts: (validAccountIds: number[]) => void;
};

export function useMailSyncStatus(): UseMailSyncStatusResult {
    const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
    const [syncingAccountIds, setSyncingAccountIds] = useState<Set<number>>(new Set());

    const markAccountSyncing = useCallback((accountId: number): void => {
        setSyncingAccountIds((prev) => {
            if (prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.add(accountId);
            return next;
        });
    }, []);

    const clearAccountSyncing = useCallback((accountId: number): void => {
        setSyncingAccountIds((prev) => {
            if (!prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.delete(accountId);
            return next;
        });
    }, []);

    const pruneSyncingAccounts = useCallback((validAccountIds: number[]): void => {
        const valid = new Set(validAccountIds);
        setSyncingAccountIds((prev) => {
            let changed = false;
            const next = new Set<number>();
            prev.forEach((accountId) => {
                if (valid.has(accountId)) {
                    next.add(accountId);
                    return;
                }
                changed = true;
            });
            return changed ? next : prev;
        });
    }, []);

    return {
        syncStatusText,
        setSyncStatusText,
        syncingAccountIds,
        markAccountSyncing,
        clearAccountSyncing,
        pruneSyncingAccounts,
    };
}
