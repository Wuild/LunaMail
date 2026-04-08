const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSystemDate(value: string | Date | null | undefined, locale?: string): string {
    const date = parseDate(value);
    if (!date) return "";
    const key = locale || "system";
    const formatter = dateFormatters.get(key) ?? new Intl.DateTimeFormat(locale || undefined);
    if (!dateFormatters.has(key)) {
        dateFormatters.set(key, formatter);
    }
    return formatter.format(date);
}

export function formatSystemDateTime(value: string | Date | null | undefined, locale?: string): string {
    const date = parseDate(value);
    if (!date) return "";
    const key = locale || "system";
    const dateFormatter = dateTimeFormatters.get(key) ?? new Intl.DateTimeFormat(locale || undefined);
    if (!dateTimeFormatters.has(key)) {
        dateTimeFormatters.set(key, dateFormatter);
    }
    const timeFormatter =
        timeFormatters.get(key) ??
        new Intl.DateTimeFormat(locale || undefined, {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        });
    if (!timeFormatters.has(key)) {
        timeFormatters.set(key, timeFormatter);
    }
    return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`.trim();
}
