import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSystemDate, formatSystemDateTime} from '../renderer/lib/dateTime.js';
import {clampToViewport, formatBytes} from '../renderer/lib/format.js';

test('formatSystemDate returns empty for invalid values', () => {
    assert.equal(formatSystemDate(null), '');
    assert.equal(formatSystemDate(undefined), '');
    assert.equal(formatSystemDate('not-a-date'), '');
});

test('formatSystemDate emits non-empty value for valid date', () => {
    const out = formatSystemDate('2026-04-07T09:30:00.000Z', 'en-US');
    assert.ok(out.length > 0);
});

test('formatSystemDateTime returns empty for invalid values', () => {
    assert.equal(formatSystemDateTime(null), '');
    assert.equal(formatSystemDateTime('not-a-date'), '');
});

test('formatSystemDateTime emits non-empty value for valid date-time', () => {
    const out = formatSystemDateTime('2026-04-07T09:30:00.000Z', 'en-US');
    assert.ok(out.length > 0);
});

test('formatBytes formats byte values predictably', () => {
    assert.equal(formatBytes(-1), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(10 * 1024), '10 KB');
});

test('clampToViewport keeps value in bounded range', () => {
    assert.equal(clampToViewport(4, 200, 1000), 8);
    assert.equal(clampToViewport(900, 200, 1000), 792);
    assert.equal(clampToViewport(400, 200, 1000), 400);
});
