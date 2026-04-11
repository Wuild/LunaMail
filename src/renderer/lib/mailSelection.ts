export type MailSelectionState = {
    selectedMessageId: number | null;
    selectedMessageIds: number[];
    pendingAutoReadMessageId: number | null;
    anchorIndex: number | null;
};

export type MailSelectionClickModifiers = {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
};

type ComputeSelectionOnClickArgs = {
    messageIds: number[];
    state: MailSelectionState;
    selectedId: number;
    selectedIndex: number;
    modifiers?: MailSelectionClickModifiers;
};

type ComputeSelectionOnNavigateArgs = {
    messageIds: number[];
    state: MailSelectionState;
    direction: 1 | -1;
    extendSelection?: boolean;
};

export function computeSelectionOnClick({
                                            messageIds,
                                            state,
                                            selectedId,
                                            selectedIndex,
                                            modifiers,
                                        }: ComputeSelectionOnClickArgs): MailSelectionState {
    const shiftKey = Boolean(modifiers?.shiftKey);
    const toggleKey = Boolean(modifiers?.ctrlKey || modifiers?.metaKey);

    if (shiftKey && messageIds.length > 0) {
        const anchor = state.anchorIndex ?? selectedIndex;
        const start = Math.min(anchor, selectedIndex);
        const end = Math.max(anchor, selectedIndex);
        const rangeIds = messageIds.slice(start, end + 1);
        return {
            selectedMessageId: selectedId,
            selectedMessageIds: rangeIds,
            pendingAutoReadMessageId: selectedId,
            anchorIndex: state.anchorIndex,
        };
    }

    if (toggleKey) {
        const exists = state.selectedMessageIds.includes(selectedId);
        const nextIds = exists
            ? state.selectedMessageIds.filter((messageId) => messageId !== selectedId)
            : [...state.selectedMessageIds, selectedId];

        if (exists) {
            if (state.selectedMessageId === selectedId) {
                const fallbackId = nextIds[nextIds.length - 1] ?? null;
                return {
                    selectedMessageId: fallbackId,
                    selectedMessageIds: nextIds,
                    pendingAutoReadMessageId: fallbackId,
                    anchorIndex: selectedIndex,
                };
            }
            return {
                selectedMessageId: state.selectedMessageId,
                selectedMessageIds: nextIds,
                pendingAutoReadMessageId: null,
                anchorIndex: selectedIndex,
            };
        }

        return {
            selectedMessageId: selectedId,
            selectedMessageIds: nextIds,
            pendingAutoReadMessageId: selectedId,
            anchorIndex: selectedIndex,
        };
    }

    return {
        selectedMessageId: selectedId,
        selectedMessageIds: [selectedId],
        pendingAutoReadMessageId: selectedId,
        anchorIndex: selectedIndex,
    };
}

export function computeSelectionOnNavigate({
                                               messageIds,
                                               state,
                                               direction,
                                               extendSelection = false,
                                           }: ComputeSelectionOnNavigateArgs): MailSelectionState | null {
    if (messageIds.length === 0) return null;
    const currentIndex = state.selectedMessageId
        ? messageIds.findIndex((messageId) => messageId === state.selectedMessageId)
        : -1;
    const fallbackIndex = direction > 0 ? 0 : messageIds.length - 1;
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextIndex = Math.min(messageIds.length - 1, Math.max(0, baseIndex + (currentIndex >= 0 ? direction : 0)));
    const nextMessageId = messageIds[nextIndex];
    if (!nextMessageId) return null;

    if (extendSelection) {
        const anchor = state.anchorIndex ?? (currentIndex >= 0 ? currentIndex : nextIndex);
        const start = Math.min(anchor, nextIndex);
        const end = Math.max(anchor, nextIndex);
        const rangeIds = messageIds.slice(start, end + 1);
        return {
            selectedMessageId: nextMessageId,
            selectedMessageIds: rangeIds,
            pendingAutoReadMessageId: nextMessageId,
            anchorIndex: state.anchorIndex,
        };
    }

    return {
        selectedMessageId: nextMessageId,
        selectedMessageIds: [nextMessageId],
        pendingAutoReadMessageId: nextMessageId,
        anchorIndex: nextIndex,
    };
}

export function computeSelectionOnSelectAll(
    messageIds: number[],
    selectedMessageId: number | null,
): MailSelectionState {
    if (messageIds.length === 0) {
        return {
            selectedMessageId: null,
            selectedMessageIds: [],
            pendingAutoReadMessageId: null,
            anchorIndex: null,
        };
    }

    const selectedIndex = selectedMessageId ? messageIds.findIndex((messageId) => messageId === selectedMessageId) : -1;

    if (selectedIndex >= 0) {
        return {
            selectedMessageId,
            selectedMessageIds: messageIds,
            pendingAutoReadMessageId: null,
            anchorIndex: selectedIndex,
        };
    }

    return {
        selectedMessageId: messageIds[0],
        selectedMessageIds: messageIds,
        pendingAutoReadMessageId: null,
        anchorIndex: 0,
    };
}
