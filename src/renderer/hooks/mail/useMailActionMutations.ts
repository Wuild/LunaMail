import {useMutation} from '@tanstack/react-query';
import {ipcClient} from '../../lib/ipcClient';

export function useMailActionMutations() {
    const setMessageFlagMutation = useMutation({
        mutationFn: async ({messageId, isFlagged}: { messageId: number; isFlagged: number }) => {
            return await ipcClient.setMessageFlagged(messageId, isFlagged);
        },
    });
    const setMessageTagMutation = useMutation({
        mutationFn: async ({messageId, tag}: { messageId: number; tag: string | null }) => {
            return await ipcClient.setMessageTag(messageId, tag);
        },
    });
    const moveMessageMutation = useMutation({
        mutationFn: async ({messageId, targetFolderPath}: { messageId: number; targetFolderPath: string }) => {
            return await ipcClient.moveMessage(messageId, targetFolderPath);
        },
    });
    const archiveMessageMutation = useMutation({
        mutationFn: async ({messageId}: { messageId: number }) => {
            return await ipcClient.archiveMessage(messageId);
        },
    });
    const deleteMessageMutation = useMutation({
        mutationFn: async ({messageId}: { messageId: number }) => {
            return await ipcClient.deleteMessage(messageId);
        },
    });

    return {
        setMessageFlagMutation,
        setMessageTagMutation,
        moveMessageMutation,
        archiveMessageMutation,
        deleteMessageMutation,
    };
}
