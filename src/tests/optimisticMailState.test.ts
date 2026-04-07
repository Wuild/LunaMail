import test from 'node:test';
import assert from 'node:assert/strict';
import type {FolderItem, MessageItem} from '../preload/index.js';
import {
    applyReadStateToAccountFoldersById,
    applyReadStateToFolders,
    applyReadStateToMessages,
} from '../renderer/lib/optimisticMailState.js';

function message(partial: Partial<MessageItem>): MessageItem {
    return {
        id: 1,
        account_id: 10,
        folder_id: 100,
        uid: 1,
        seq: 1,
        message_id: null,
        in_reply_to: null,
        references_text: null,
        subject: null,
        from_name: null,
        from_address: null,
        to_address: null,
        date: null,
        is_read: 0,
        is_flagged: 0,
        tag: null,
        size: null,
        ...partial,
    };
}

function folder(partial: Partial<FolderItem>): FolderItem {
    return {
        id: 100,
        account_id: 10,
        name: 'Inbox',
        custom_name: null,
        color: null,
        sort_order: null,
        path: 'INBOX',
        type: 'inbox',
        unread_count: 3,
        total_count: 10,
        ...partial,
    };
}

test('applyReadStateToMessages updates only target message', () => {
    const rows = [message({id: 1, is_read: 0}), message({id: 2, is_read: 0})];
    const next = applyReadStateToMessages(rows, 2, 1);
    assert.equal(next[0].is_read, 0);
    assert.equal(next[1].is_read, 1);
});

test('applyReadStateToFolders adjusts unread count with bounds', () => {
    const rows = [folder({path: 'INBOX', unread_count: 3}), folder({path: 'Archive', unread_count: 0})];
    const markedRead = applyReadStateToFolders(rows, 'INBOX', 0, 1);
    assert.equal(markedRead[0].unread_count, 2);
    const markedUnread = applyReadStateToFolders(markedRead, 'INBOX', 1, 0);
    assert.equal(markedUnread[0].unread_count, 3);
});

test('applyReadStateToAccountFoldersById updates only target account', () => {
    const byId: Record<number, FolderItem[]> = {
        10: [folder({path: 'INBOX', unread_count: 2})],
        11: [folder({account_id: 11, path: 'INBOX', unread_count: 5})],
    };
    const next = applyReadStateToAccountFoldersById(byId, 10, 'INBOX', 0, 1);
    assert.equal(next[10][0].unread_count, 1);
    assert.equal(next[11][0].unread_count, 5);
});
