import React, {useCallback, useEffect, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {PublicAccount} from '@/preload';
import {ipcClient} from '@renderer/lib/ipcClient';
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
    const [foldersUnreadFallback, setFoldersUnreadFallback] = useState(0);
    const totalUnreadCount = Math.max(
        0,
        Math.max(Number(unreadCountQuery.data) || 0, Number(foldersUnreadFallback) || 0),
    );

    const refreshFoldersUnreadFallback = useCallback(async (rows: PublicAccount[]) => {
        if (!rows.length) {
            setFoldersUnreadFallback(0);
            return;
        }
        const results = await Promise.allSettled(rows.map((account) => ipcClient.getFolders(account.id)));
        const total = results.reduce((sum, result) => {
            if (result.status !== 'fulfilled') return sum;
            const next = result.value.reduce((acc, folder) => acc + Math.max(0, Number(folder.unread_count) || 0), 0);
            return sum + next;
        }, 0);
        setFoldersUnreadFallback(Math.max(0, total));
    }, []);

    useEffect(() => {
        setSelectedAccountId((prev) => {
            if (prev && accounts.some((account) => account.id === prev)) return prev;
            return accounts[0]?.id ?? null;
        });
    }, [accounts]);

    useEffect(() => {
        void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
    }, [accounts, refreshFoldersUnreadFallback]);

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
        void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
    });

    useIpcEvent(ipcClient.onMessageReadUpdated, () => {
        void ipcClient
            .getUnreadCount()
            .then((count) => {
                queryClient.setQueryData(['unread-count'], Math.max(0, Number(count) || 0));
                void refreshFoldersUnreadFallback(accounts).catch(() => undefined);
            })
            .catch(() => undefined);
    });

    return {
        accounts,
        setAccounts,
        selectedAccountId,
        setSelectedAccountId,
        totalUnreadCount,
    };
}
