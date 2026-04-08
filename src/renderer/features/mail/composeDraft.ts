import {formatSystemDateTime} from '../../lib/dateTime';

export interface ComposeMessageLike {
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    to_address: string | null;
    date: string | null;
    message_id: string | null;
    references_text: string | null;
}

export function ensurePrefixedSubject(subject: string | null, prefix: string): string {
    const raw = (subject || '').trim();
    if (!raw) return prefix;
    const lower = raw.toLowerCase();
    if (lower.startsWith(prefix.toLowerCase())) return raw;
    return `${prefix} ${raw}`;
}

export function formatFromDisplay(message: ComposeMessageLike): string {
    const name = (message.from_name || '').trim();
    const address = (message.from_address || '').trim();
    if (name && address) return `${name} <${address}>`;
    if (address) return address;
    if (name) return name;
    return 'Unknown';
}

export function buildReplyQuoteText(message: ComposeMessageLike, text: string | null, systemLocale?: string): string {
    const from = message.from_name || message.from_address || 'Unknown';
    const date = formatSystemDateTime(message.date, systemLocale);
    const body = (text || '')
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n');
    return `On ${date}, ${from} wrote:\n${body}`;
}

export function buildReplyQuoteHtml(
    message: ComposeMessageLike,
    html: string | null | undefined,
    text: string | null,
    systemLocale?: string,
): string {
    const from = escapeHtml(message.from_name || message.from_address || 'Unknown');
    const date = escapeHtml(formatSystemDateTime(message.date, systemLocale));
    const original = (html || '').trim() || textToHtmlBlock(text || '');
    return `<p><br/></p><div><p>On ${date}, ${from} wrote:</p><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #d0d7de;padding-left:1em;">${original}</blockquote></div>`;
}

export function buildForwardQuoteText(message: ComposeMessageLike, text: string | null, systemLocale?: string): string {
    const date = formatSystemDateTime(message.date, systemLocale);
    const from = message.from_name || message.from_address || 'Unknown';
    const to = message.to_address || '-';
    return (
        `---------- Forwarded message ----------\n` +
        `From: ${from}\n` +
        `Date: ${date}\n` +
        `Subject: ${message.subject || '(No subject)'}\n` +
        `To: ${to}\n\n` +
        `${text || ''}`
    );
}

export function buildForwardQuoteHtml(
    message: ComposeMessageLike,
    html: string | null | undefined,
    text: string | null,
    systemLocale?: string,
): string {
    const from = escapeHtml(formatFromDisplay(message));
    const to = escapeHtml(message.to_address || '-');
    const subject = escapeHtml(message.subject || '(No subject)');
    const date = escapeHtml(formatSystemDateTime(message.date, systemLocale));
    const original = (html || '').trim() || textToHtmlBlock(text || '');
    return `<p><br/></p><div><p>---------- Forwarded message ----------<br/>From: ${from}<br/>Date: ${date}<br/>Subject: ${subject}<br/>To: ${to}</p><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #d0d7de;padding-left:1em;">${original}</blockquote></div>`;
}

export function htmlToText(html: string | null | undefined): string {
    if (!html) return '';
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function inferReplyAddress(message: ComposeMessageLike): string {
    if (message.from_address?.trim()) return message.from_address.trim();
    const raw = message.from_name || '';
    const match = raw.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
    return '';
}

export function normalizeMessageId(value: string | null | undefined): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('<') && raw.endsWith('>')) return raw;
    return `<${raw.replace(/^<|>$/g, '')}>`;
}

export function buildReferences(existing: string | null | undefined, messageId: string | null | undefined): string[] {
    const refs = (existing || '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => normalizeMessageId(token))
        .filter((token): token is string => Boolean(token));
    const unique = Array.from(new Set(refs));
    const current = normalizeMessageId(messageId);
    if (current && !unique.includes(current)) unique.push(current);
    return unique;
}

function textToHtmlBlock(value: string): string {
    return `<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;margin:0;">${escapeHtml(value)}</pre>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
