import type {Dispatch, SetStateAction} from 'react';
import {useCallback, useEffect, useRef} from 'react';
import {useMutation} from '@tanstack/react-query';
import type {FolderItem, MessageItem} from '@/preload';
import {
	applyReadStateToAccountFoldersById,
	applyReadStateToMessages,
} from '@renderer/lib/optimisticMailState';
import {toErrorMessage} from '@renderer/lib/statusText';
import {ipcClient} from '@renderer/lib/ipcClient';
import {useRuntimeStore} from '@renderer/store/runtimeStore';

type UseOptimisticReadStateParams = {
	setMessages: Dispatch<SetStateAction<MessageItem[]>>;
	setAccountFoldersById: Dispatch<SetStateAction<Record<number, FolderItem[]>>>;
	setSyncStatusText: (text: string | null) => void;
};

export function useOptimisticReadState({
	setMessages,
	setAccountFoldersById,
	setSyncStatusText,
}: UseOptimisticReadStateParams) {
	const markOptimisticReadPending = useRuntimeStore((state) => state.markOptimisticReadPending);
	const markReadMutationAttempt = useRuntimeStore((state) => state.markReadMutationAttempt);
	const markOptimisticReadFailed = useRuntimeStore((state) => state.markOptimisticReadFailed);
	const clearOptimisticRead = useRuntimeStore((state) => state.clearOptimisticRead);
	const pendingReadStateRef = useRef<Map<number, {desiredRead: number; accountId: number}>>(new Map());
	const pendingReadTimeoutsRef = useRef<Map<number, number>>(new Map());
	const lastLocalReadMutationAtByAccountRef = useRef<Map<number, number>>(new Map());
	const readStateMutation = useMutation({
		mutationFn: async (variables: {message: MessageItem; nextRead: number}) => {
			return await ipcClient.setMessageRead(variables.message.id, variables.nextRead);
		},
	});

	const clearPendingReadState = useCallback((messageId: number): void => {
		pendingReadStateRef.current.delete(messageId);
		clearOptimisticRead(messageId);
		const timeoutId = pendingReadTimeoutsRef.current.get(messageId);
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
			pendingReadTimeoutsRef.current.delete(messageId);
		}
	}, [clearOptimisticRead]);

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

	const getPendingRead = useCallback((messageId: number): {desiredRead: number; accountId: number} | undefined => {
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
			setAccountFoldersById((prev) =>
				applyReadStateToAccountFoldersById(prev, message.account_id, folderPath, message.is_read, nextRead),
			);
		},
		[setAccountFoldersById, setMessages],
	);

	const syncReadState = useCallback(
		async (message: MessageItem, nextRead: number, folderPath: string | null): Promise<void> => {
			lastLocalReadMutationAtByAccountRef.current.set(message.account_id, Date.now());
			markReadMutationAttempt(message.account_id);
			pendingReadStateRef.current.set(message.id, {
				desiredRead: nextRead,
				accountId: message.account_id,
			});
			markOptimisticReadPending({
				messageId: message.id,
				accountId: message.account_id,
				desiredRead: nextRead,
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
				markOptimisticReadFailed({
					messageId: message.id,
					error: toErrorMessage(error),
				});
				applyReadOptimistic({...message, is_read: nextRead}, nextRead ? 0 : 1, folderPath);
				setSyncStatusText(`Read sync failed: ${toErrorMessage(error)}`);
			}
		},
		[
			applyReadOptimistic,
			clearPendingReadState,
			markOptimisticReadFailed,
			markOptimisticReadPending,
			markReadMutationAttempt,
			readStateMutation,
			setMessages,
			setSyncStatusText,
		],
	);

	useEffect(() => {
		const pendingTimeouts = pendingReadTimeoutsRef.current;
		const pendingReadState = pendingReadStateRef.current;
		return () => {
			for (const timeoutId of pendingTimeouts.values()) {
				window.clearTimeout(timeoutId);
			}
			pendingTimeouts.clear();
			pendingReadState.clear();
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
