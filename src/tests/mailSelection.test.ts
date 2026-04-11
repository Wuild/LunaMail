import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeSelectionOnClick,
    computeSelectionOnNavigate,
    computeSelectionOnSelectAll,
    type MailSelectionState,
} from '@renderer/lib/mailSelection';

function baseState(): MailSelectionState {
    return {
        selectedMessageId: null,
        selectedMessageIds: [],
        pendingAutoReadMessageId: null,
        anchorIndex: null,
    };
}

test('computeSelectionOnClick sets single selection by default', () => {
    const next = computeSelectionOnClick({
        messageIds: [10, 11, 12],
        state: baseState(),
        selectedId: 11,
        selectedIndex: 1,
    });
    assert.deepEqual(next.selectedMessageIds, [11]);
    assert.equal(next.selectedMessageId, 11);
    assert.equal(next.pendingAutoReadMessageId, 11);
    assert.equal(next.anchorIndex, 1);
});

test('computeSelectionOnClick supports shift range selection', () => {
    const next = computeSelectionOnClick({
        messageIds: [10, 11, 12, 13],
        state: {
            ...baseState(),
            selectedMessageId: 10,
            selectedMessageIds: [10],
            anchorIndex: 0,
        },
        selectedId: 13,
        selectedIndex: 3,
        modifiers: {shiftKey: true},
    });
    assert.deepEqual(next.selectedMessageIds, [10, 11, 12, 13]);
    assert.equal(next.selectedMessageId, 10);
    assert.equal(next.pendingAutoReadMessageId, null);
});

test('computeSelectionOnClick supports ctrl/meta toggle', () => {
    const next = computeSelectionOnClick({
        messageIds: [10, 11, 12],
        state: {
            ...baseState(),
            selectedMessageId: 10,
            selectedMessageIds: [10],
            anchorIndex: 0,
        },
        selectedId: 12,
        selectedIndex: 2,
        modifiers: {ctrlKey: true},
    });
    assert.deepEqual(next.selectedMessageIds, [10, 12]);
    assert.equal(next.selectedMessageId, 10);
    assert.equal(next.pendingAutoReadMessageId, null);
    assert.equal(next.anchorIndex, 2);
});

test('computeSelectionOnNavigate moves selection and keeps range when extending', () => {
    const moved = computeSelectionOnNavigate({
        messageIds: [10, 11, 12],
        state: {
            ...baseState(),
            selectedMessageId: 10,
            selectedMessageIds: [10],
            anchorIndex: 0,
        },
        direction: 1,
    });
    assert.ok(moved);
    assert.deepEqual(moved!.selectedMessageIds, [11]);
    assert.equal(moved!.selectedMessageId, 11);

    const extended = computeSelectionOnNavigate({
        messageIds: [10, 11, 12],
        state: {
            ...baseState(),
            selectedMessageId: 11,
            selectedMessageIds: [11],
            anchorIndex: 0,
        },
        direction: 1,
        extendSelection: true,
    });
    assert.ok(extended);
    assert.deepEqual(extended!.selectedMessageIds, [10, 11, 12]);
    assert.equal(extended!.selectedMessageId, 12);
});

test('computeSelectionOnSelectAll keeps current selected id when present', () => {
    const next = computeSelectionOnSelectAll([10, 11, 12], 11);
    assert.deepEqual(next.selectedMessageIds, [10, 11, 12]);
    assert.equal(next.selectedMessageId, 11);
    assert.equal(next.anchorIndex, 1);
    assert.equal(next.pendingAutoReadMessageId, null);
});
