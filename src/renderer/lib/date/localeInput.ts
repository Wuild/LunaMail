type DatePart = 'year' | 'month' | 'day';

type LocaleDateMeta = {
    order: DatePart[];
    placeholder: string;
};

const localeDateMetaCache = new Map<string, LocaleDateMeta>();
const localeDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocaleKey(locale?: string): string {
    return String(locale || 'system');
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (!isValidDateParts(year, month, day)) return null;
    return {year, month, day};
}

function isValidDateParts(year: number, month: number, day: number): boolean {
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function buildLocaleDateMeta(locale?: string): LocaleDateMeta {
    const formatter = new Intl.DateTimeFormat(locale || undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const sample = new Date(2006, 10, 22);
    const parts = formatter.formatToParts(sample);
    const order: DatePart[] = [];
    const placeholder = parts
        .map((part) => {
            if (part.type === 'year') {
                order.push('year');
                return 'YYYY';
            }
            if (part.type === 'month') {
                order.push('month');
                return 'MM';
            }
            if (part.type === 'day') {
                order.push('day');
                return 'DD';
            }
            return part.value;
        })
        .join('');
    if (order.length !== 3) {
        return {
            order: ['year', 'month', 'day'],
            placeholder: 'YYYY-MM-DD',
        };
    }
    return {
        order,
        placeholder,
    };
}

export function getLocaleDateMeta(locale?: string): LocaleDateMeta {
    const key = getLocaleKey(locale);
    const cached = localeDateMetaCache.get(key);
    if (cached) return cached;
    const built = buildLocaleDateMeta(locale);
    localeDateMetaCache.set(key, built);
    return built;
}

export function getLocaleDatePlaceholder(locale?: string): string {
    return getLocaleDateMeta(locale).placeholder;
}

export function formatIsoDateForLocale(value: string, locale?: string): string {
    const parsed = parseIsoDate(value);
    if (!parsed) return '';
    const key = getLocaleKey(locale);
    const formatter =
        localeDateFormatterCache.get(key) ??
        new Intl.DateTimeFormat(locale || undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    if (!localeDateFormatterCache.has(key)) {
        localeDateFormatterCache.set(key, formatter);
    }
    return formatter.format(new Date(parsed.year, parsed.month - 1, parsed.day));
}

export function parseLocaleDateInput(rawValue: string, locale?: string): string | null {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;
    const numericParts = raw.match(/\d+/g);
    if (!numericParts || numericParts.length < 3) return null;
    const first = Number(numericParts[0]);
    const second = Number(numericParts[1]);
    const third = Number(numericParts[2]);
    if (![first, second, third].every((entry) => Number.isFinite(entry))) return null;
    const [firstPart, secondPart, thirdPart] = [first, second, third];
    const {order} = getLocaleDateMeta(locale);
    const map = new Map<DatePart, number>([
        [order[0], firstPart],
        [order[1], secondPart],
        [order[2], thirdPart],
    ]);
    const year = map.get('year') ?? 0;
    const month = map.get('month') ?? 0;
    const day = map.get('day') ?? 0;
    if (year < 1000) return null;
    if (!isValidDateParts(year, month, day)) return null;
    const isoYear = `${year}`.padStart(4, '0');
    const isoMonth = `${month}`.padStart(2, '0');
    const isoDay = `${day}`.padStart(2, '0');
    return `${isoYear}-${isoMonth}-${isoDay}`;
}

export function splitLocalDateTimeValue(value: string): { date: string; time: string } {
    const raw = String(value || '').trim();
    if (!raw) return {date: '', time: ''};
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(raw);
    if (!match) return {date: '', time: ''};
    return {
        date: match[1] || '',
        time: match[2] || '',
    };
}

export function composeLocalDateTimeValue(date: string, time: string): string {
    const normalizedDate = String(date || '').trim();
    const normalizedTime = String(time || '').trim();
    if (!normalizedDate || !normalizedTime) return '';
    if (!parseIsoDate(normalizedDate)) return '';
    if (!/^\d{2}:\d{2}$/.test(normalizedTime)) return '';
    return `${normalizedDate}T${normalizedTime}`;
}

export function parseLocalDateTimeValue(value: string): Date | null {
    const {date, time} = splitLocalDateTimeValue(value);
    if (!date || !time) return null;
    const composed = new Date(`${date}T${time}`);
    return Number.isNaN(composed.getTime()) ? null : composed;
}

export function formatLocalDateTimeValueForLocale(value: string, locale?: string): string {
    const parsed = parseLocalDateTimeValue(value);
    if (!parsed) return '';
    return new Intl.DateTimeFormat(locale || undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
    }).format(parsed);
}
