export type MailTableColumnKey =
    | 'subject'
    | 'from'
    | 'recipient'
    | 'date'
    | 'read_status'
    | 'flagged'
    | 'tag'
    | 'account'
    | 'location'
    | 'size';

export const DEFAULT_TABLE_COLUMNS: MailTableColumnKey[] = ['subject', 'from', 'date'];

export const DEFAULT_TABLE_COLUMN_WIDTHS: Record<MailTableColumnKey, number> = {
    subject: 360,
    from: 220,
    recipient: 220,
    date: 170,
    read_status: 96,
    flagged: 72,
    tag: 120,
    account: 180,
    location: 180,
    size: 92,
};

export const MIN_TABLE_COLUMN_WIDTHS: Record<MailTableColumnKey, number> = {
    subject: 16,
    from: 16,
    recipient: 16,
    date: 16,
    read_status: 16,
    flagged: 16,
    tag: 16,
    account: 16,
    location: 16,
    size: 16,
};

export const TABLE_COLUMN_OPTIONS: Array<{ key: MailTableColumnKey; label: string }> = [
    {key: 'subject', label: 'Subject'},
    {key: 'from', label: 'From'},
    {key: 'recipient', label: 'Recipient'},
    {key: 'date', label: 'Date'},
    {key: 'read_status', label: 'Read status'},
    {key: 'flagged', label: 'Starred'},
    {key: 'tag', label: 'Tag'},
    {key: 'account', label: 'Account'},
    {key: 'location', label: 'Location'},
    {key: 'size', label: 'Size'},
];

export function normalizeColumnWidth(value: unknown, key: MailTableColumnKey): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_TABLE_COLUMN_WIDTHS[key];
    const min = MIN_TABLE_COLUMN_WIDTHS[key];
    return Math.max(min, Math.round(numeric));
}
