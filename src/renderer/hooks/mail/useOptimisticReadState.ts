import {useCallback, useEffect, useRef} from 'react';
import {useMutation} from '@tanstack/react-query';
import type {Dispatch, SetStateAction} from 'react';
import type {FolderItem, MessageItem} from '../../../preload';
import {
    applyReadStateToAccountFoldersById,
    applyReadStateToFolders,
    applyReadStateToMessages,
} from '../../lib/optimisticMailState';
import {toErrorMessage} from '../../lib/statusText';
import {ipcClient} from '../../lib/ipcClient';

type UseOptimisticReadStateParams = {
    setMessages: Dispatch<SetStateAction<MessageItem[]>>;
    setFolders: Dispatch<SetStateAction<FolderItem[]>>;
    setAccountFoldersById: Dispatch<SetStateAction<Record<number, FolderItem[]>>>;
    setSyncStatusText: (text: string | null) => void;
};

export function useOptimisticReadState({
                                           setMessages,
                                           setFolders,
                                           setAccountFoldersById,
                                           setSyncStatusText,
                                       }: UseOptimisticReadStateParams) {
    const pendingReadStateRef = useRef<Map<number, { desiredRead: number; accountId: number }>>(new Map());
    const pendingReadTimeoutsRef = useRef<Map<number, number>>(new Map());
    const lastLocalReadMutationAtByAccountRef = useRef<Map<number, number>>(new Map());
    const readStateMutation = useMutation({
        mutationFn: async (variables: { message: MessageItem; nextRead: number }) => {
            return await ipcClient.setMessageRead(variables.message.id, variables.nextRead);
        },
    });

    const clearPendingReadState = useCallback((messageId: number): void => {
        pendingReadStateRef.current.delete(messageId);
        const timeoutId = pendingReadTimeoutsRef.current.get(messageId);
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
            pendingReadTimeoutsRef.current.delete(messageId);
        }
    }, []);

    const hasPendingReadForAccount = useCallback((accountId: number): boolean => {
        for (const pending of pendingReadStateRef.current.values()) {
            if (pending.accountId === accountId) return true;
        }
        return false;
    }, []);

    const hasRecentLocalReadMutation = useCallback((accountId: number, withinMs = 10000): boolean => {
        const lastAt = lastLocalReadMutationAtByAccountRef.current.get(accountId);
        if (!lastAt) return false;
        return Date.now() - lastAt < withinMs;
    }, []);

    const getPendingRead = useCallback((messageId: number): { desiredRead: number; accountId: number } | undefined => {
        return pendingReadStateRef.current.get(messageId);
    }, []);

    const applyPendingReadOverrides = useCallback(<T extends MessageItem>(rows: T[]): T[] => {
        if (pendingReadStateRef.current.size === 0) return rows;
        return rows.map((row) => {
            const pending = pendingReadStateRef.current.get(row.id);
            if (!pending) return row;
            return {...row, is_read: pending.desiredRead};
        }) as T[];
    }, []);

    const applyReadOptimistic = useCallback(
        (message: MessageItem, nextRead: number, folderPath: string | null): void => {
            if (message.is_read === nextRead) return;

            setMessages((prev) => applyReadStateToMessages(prev, message.id, nextRead));

            if (!folderPath) return;
            setFolders((prev) => applyReadStateToFolders(prev, folderPath, message.is_read, nextRead));
            setAccountFoldersById((prev) =>
                applyReadStateToAccountFoldersById(prev, message.account_id, folderPath, message.is_read, nextRead),
            );
        },
        [setAccountFoldersById, setFolders, setMessages],
    );

    const syncReadState = useCallback(
        async (message: MessageItem, nextRead: number, folderPath: string | null): Promise<void> => {
            lastLocalReadMutationAtByAccountRef.current.set(message.account_id, Date.now());
            pendingReadStateRef.current.set(message.id, {
                desiredRead: nextRead,
                accountId: message.account_id,
            });
            const existingTimeoutId = pendingReadTimeoutsRef.current.get(message.id);
            if (existingTimeoutId !== undefined) {
                window.clearTimeout(existingTimeoutId);
            }
            const timeoutId = window.setTimeout(() => {
                clearPendingReadState(message.id);
            }, 15000);
            pendingReadTimeoutsRef.current.set(message.id, timeoutId);
            try {
                const result = await readStateMutation.mutateAsync({message, nextRead});
                setMessages((prev) => applyReadStateToMessages(prev, message.id, result.isRead));
                if (Number(result.isRead) !== nextRead) {
                    clearPendingReadState(message.id);
                }
            } catch (error: unknown) {
                clearPendingReadState(message.id);
                applyReadOptimistic({...message, is_read: nextRead}, nextRead ? 0 : 1, folderPath);
                setSyncStatusText(`Read sync failed: ${toErrorMessage(error)}`);
            }
        },
        [applyReadOptimistic, clearPendingReadState, readStateMutation, setMessages, setSyncStatusText],
    );

    useEffect(() => {
        return () => {
            for (const timeoutId of pendingReadTimeoutsRef.current.values()) {
                window.clearTimeout(timeoutId);
            }
            pendingReadTimeoutsRef.current.clear();
            pendingReadStateRef.current.clear();
        };
    }, []);

    return {
        clearPendingReadState,
        hasPendingReadForAccount,
        hasRecentLocalReadMutation,
        getPendingRead,
        applyPendingReadOverrides,
        applyReadOptimistic,
        syncReadState,
    };
}
