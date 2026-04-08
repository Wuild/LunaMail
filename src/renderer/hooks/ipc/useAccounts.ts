import React, {useCallback, useEffect, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {PublicAccount} from '../../../preload';
import {ipcClient} from '../../lib/ipcClient';
import {useIpcEvent} from './useIpcEvent';

export function useAccounts() {
    const queryClient = useQueryClient();
    const accountsQuery = useQuery({
        queryKey: ['accounts'],
        queryFn: () => ipcClient.getAccounts(),
        initialData: [] as PublicAccount[],
        refetchOnMount: 'always',
    });
    const unreadCountQuery = useQuery({
        queryKey: ['unread-count'],
        queryFn: async () => Math.max(0, Number(await ipcClient.getUnreadCount()) || 0),
        initialData: 0,
    });
    const accounts = accountsQuery.data;
    const setAccounts = useCallback(
        (value: React.SetStateAction<PublicAccount[]>) => {
            queryClient.setQueryData<PublicAccount[]>(['accounts'], (prev) =>
                typeof value === 'function'
                    ? (value as (current: PublicAccount[]) => PublicAccount[])(prev ?? [])
                    : value,
            );
        },
        [queryClient],
    );
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const totalUnreadCount = unreadCountQuery.data;

    useEffect(() => {
        setSelectedAccountId((prev) => {
            if (prev && accounts.some((account) => account.id === prev)) return prev;
            return accounts[0]?.id ?? null;
        });
    }, [accounts]);

    useIpcEvent(ipcClient.onAccountAdded, () => {
        void ipcClient
            .getAccounts()
            .then((rows) => {
                queryClient.setQueryData(['accounts'], rows);
            })
            .catch(() => undefined);
    });

    useIpcEvent(ipcClient.onAccountUpdated, (updated) => {
        setAccounts((prev) => prev.map((account) => (account.id === updated.id ? updated : account)));
    });

    useIpcEvent(ipcClient.onAccountDeleted, (deleted) => {
        setAccounts((prev) => prev.filter((account) => account.id !== deleted.id));
        setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
    });

    useIpcEvent(ipcClient.onUnreadCountUpdated, (count) => {
        queryClient.setQueryData(['unread-count'], Math.max(0, Number(count) || 0));
    });

    return {
        accounts,
        setAccounts,
        selectedAccountId,
        setSelectedAccountId,
        totalUnreadCount,
    };
}
