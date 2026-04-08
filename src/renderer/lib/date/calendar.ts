import {formatSystemDateTime} from '../dateTime';

export function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfWeekMonday(date: Date): Date {
    const out = new Date(date);
    const day = out.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    out.setDate(out.getDate() + diff);
    out.setHours(0, 0, 0, 0);
    return out;
}

export function endOfWeekMonday(date: Date): Date {
    const out = startOfWeekMonday(date);
    out.setDate(out.getDate() + 6);
    out.setHours(23, 59, 59, 999);
    return out;
}

export function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function nextRoundedHour(): Date {
    const now = new Date();
    const rounded = new Date(now);
    rounded.setMinutes(0, 0, 0);
    rounded.setHours(rounded.getHours() + 1);
    return rounded;
}

export function addHours(date: Date, hours: number): Date {
    const out = new Date(date);
    out.setHours(out.getHours() + hours);
    return out;
}

export function toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function toTimeInputValue(date: Date): string {
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    return `${hour}:${minute}`;
}

export function composeLocalDateTime(dateValue: string, timeValue: string): Date | null {
    const date = String(dateValue || '').trim();
    const time = String(timeValue || '').trim();
    if (!date || !time) return null;
    const composed = new Date(`${date}T${time}`);
    return Number.isNaN(composed.getTime()) ? null : composed;
}

export function formatLocalDateTimePreview(dateValue: string, timeValue: string, locale: string): string {
    const composed = composeLocalDateTime(dateValue, timeValue);
    if (!composed) return 'Invalid date/time';
    return formatSystemDateTime(composed.toISOString(), locale);
}

export function formatEventTime(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    return `${hour}:${minute}`;
}
