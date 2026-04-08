import {useCallback, useRef, useState} from 'react';
import type {MessageItem} from '../../../preload';
import {
    computeSelectionOnClick,
    computeSelectionOnNavigate,
    computeSelectionOnSelectAll,
} from '../../lib/mailSelection';

type MailSelectionModifiers = {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
};

type UseMailSelectionParams = {
    messages: MessageItem[];
    navigate: (to: string) => void;
    locationPathname: string;
    onSelectMail: () => void;
};

export function useMailSelection({messages, navigate, locationPathname, onSelectMail}: UseMailSelectionParams) {
    const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
    const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
    const [pendingAutoReadMessageId, setPendingAutoReadMessageId] = useState<number | null>(null);
    const selectionAnchorIndexRef = useRef<number | null>(null);

    const openMessageInCurrentRoute = useCallback(
        (message: MessageItem): void => {
            const targetPath = `/email/${message.account_id}/${message.folder_id}/${message.id}`;
            if (locationPathname !== targetPath) {
                navigate(targetPath);
            }
        },
        [locationPathname, navigate],
    );

    const handleSelectMessage = useCallback(
        (id: number, index: number, modifiers?: MailSelectionModifiers): void => {
            const next = computeSelectionOnClick({
                messageIds: messages.map((message) => message.id),
                state: {
                    selectedMessageId,
                    selectedMessageIds,
                    pendingAutoReadMessageId,
                    anchorIndex: selectionAnchorIndexRef.current,
                },
                selectedId: id,
                selectedIndex: index,
                modifiers,
            });
            setSelectedMessageIds(next.selectedMessageIds);
            setSelectedMessageId(next.selectedMessageId);
            setPendingAutoReadMessageId(next.pendingAutoReadMessageId);
            selectionAnchorIndexRef.current = next.anchorIndex;
            onSelectMail();
        },
        [messages, onSelectMail, pendingAutoReadMessageId, selectedMessageId, selectedMessageIds],
    );

    const navigateMessageSelection = useCallback(
        (direction: 1 | -1, extendSelection = false): void => {
            const messageIds = messages.map((message) => message.id);
            const next = computeSelectionOnNavigate({
                messageIds,
                state: {
                    selectedMessageId,
                    selectedMessageIds,
                    pendingAutoReadMessageId,
                    anchorIndex: selectionAnchorIndexRef.current,
                },
                direction,
                extendSelection,
            });
            if (!next) return;
            const nextMessage = messages.find((message) => message.id === next.selectedMessageId);
            if (!nextMessage) return;

            setSelectedMessageIds(next.selectedMessageIds);
            setSelectedMessageId(next.selectedMessageId);
            setPendingAutoReadMessageId(next.pendingAutoReadMessageId);
            selectionAnchorIndexRef.current = next.anchorIndex;
            onSelectMail();
            openMessageInCurrentRoute(nextMessage);
        },
        [
            messages,
            onSelectMail,
            openMessageInCurrentRoute,
            pendingAutoReadMessageId,
            selectedMessageId,
            selectedMessageIds,
        ],
    );

    const selectAllMessages = useCallback((): void => {
        const allIds = messages.map((message) => message.id);
        const next = computeSelectionOnSelectAll(allIds, selectedMessageId);
        setSelectedMessageIds(next.selectedMessageIds);
        setSelectedMessageId(next.selectedMessageId);
        setPendingAutoReadMessageId(next.pendingAutoReadMessageId);
        selectionAnchorIndexRef.current = next.anchorIndex;
        onSelectMail();
    }, [messages, onSelectMail, selectedMessageId]);

    const clearSelection = useCallback((): void => {
        setSelectedMessageIds([]);
        selectionAnchorIndexRef.current = null;
    }, []);

    return {
        selectedMessageId,
        setSelectedMessageId,
        selectedMessageIds,
        setSelectedMessageIds,
        pendingAutoReadMessageId,
        setPendingAutoReadMessageId,
        selectionAnchorIndexRef,
        handleSelectMessage,
        navigateMessageSelection,
        selectAllMessages,
        clearSelection,
    };
}
