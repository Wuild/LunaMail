import test from 'node:test';
import assert from 'node:assert/strict';
import {
    composeLocalDateTimeValue,
    formatIsoDateForLocale,
    formatLocalDateTimeValueForLocale,
    getLocaleDatePlaceholder,
    parseLocalDateTimeValue,
    parseLocaleDateInput,
    splitLocalDateTimeValue,
} from '../renderer/lib/date/localeInput.js';

test('parseLocaleDateInput parses month-first dates for en-US', () => {
    assert.equal(parseLocaleDateInput('04/10/2026', 'en-US'), '2026-04-10');
});

test('parseLocaleDateInput parses day-first dates for de-DE', () => {
    assert.equal(parseLocaleDateInput('10.04.2026', 'de-DE'), '2026-04-10');
});

test('parseLocaleDateInput rejects invalid dates', () => {
    assert.equal(parseLocaleDateInput('31/31/2026', 'en-US'), null);
    assert.equal(parseLocaleDateInput('invalid', 'en-US'), null);
});

test('formatIsoDateForLocale returns empty for invalid value', () => {
    assert.equal(formatIsoDateForLocale('bad-date', 'en-US'), '');
});

test('formatIsoDateForLocale returns non-empty for valid value', () => {
    assert.ok(formatIsoDateForLocale('2026-04-10', 'en-US').length > 0);
});

test('getLocaleDatePlaceholder returns a non-empty locale pattern', () => {
    assert.ok(getLocaleDatePlaceholder('en-US').length > 0);
});

test('splitLocalDateTimeValue and composeLocalDateTimeValue keep local parts', () => {
    assert.deepEqual(splitLocalDateTimeValue('2026-04-10T09:30'), {date: '2026-04-10', time: '09:30'});
    assert.equal(composeLocalDateTimeValue('2026-04-10', '09:30'), '2026-04-10T09:30');
    assert.equal(composeLocalDateTimeValue('', '09:30'), '');
});

test('parseLocalDateTimeValue and formatter handle valid datetime values', () => {
    assert.ok(parseLocalDateTimeValue('2026-04-10T09:30') instanceof Date);
    assert.ok(formatLocalDateTimeValueForLocale('2026-04-10T09:30', 'en-US').length > 0);
    assert.equal(formatLocalDateTimeValueForLocale('bad-value', 'en-US'), '');
});
