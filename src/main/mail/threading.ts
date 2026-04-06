import {createHash} from 'node:crypto';

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function normalizeMessageIdentifier(value: string | null | undefined): string | null {
    const raw = normalizeWhitespace(String(value || ''));
    if (!raw) return null;

    const angleMatch = raw.match(/<([^>]+)>/);
    const normalized = normalizeWhitespace(angleMatch ? angleMatch[1] : raw)
        .replace(/^<|>$/g, '')
        .toLowerCase();

    return normalized || null;
}

export function parseReferenceIdentifiers(value: unknown): string[] {
    if (!value) return [];

    const text = Array.isArray(value)
        ? value.map((item) => String(item || '')).join(' ')
        : String(value);

    const matches = text.match(/<[^>]+>/g) || text.split(/\s+/g);
    const normalized = matches
        .map((token) => normalizeMessageIdentifier(token))
        .filter((token): token is string => Boolean(token));

    return Array.from(new Set(normalized));
}

export function normalizeSubjectForThreading(subject: string | null | undefined): string {
    let value = normalizeWhitespace(String(subject || ''));
    if (!value) return '';

    // Strip common reply/forward prefixes repeatedly (Re:, Fwd:, Sv:, etc.).
    const prefixPattern = /^(?:(?:re|fw|fwd|sv)\s*(?:\[\d+])?\s*:\s*)+/i;
    value = value.replace(prefixPattern, '');
    value = normalizeWhitespace(value).toLowerCase();
    return value;
}

export function buildThreadId(input: {
    messageId?: string | null;
    inReplyTo?: string | null;
    references?: unknown;
    subject?: string | null;
}): string {
    const inReplyTo = normalizeMessageIdentifier(input.inReplyTo);
    if (inReplyTo) return `mid:${inReplyTo}`;

    const refs = parseReferenceIdentifiers(input.references);
    if (refs.length > 0) return `mid:${refs[refs.length - 1]}`;

    const messageId = normalizeMessageIdentifier(input.messageId);
    if (messageId) return `mid:${messageId}`;

    const normalizedSubject = normalizeSubjectForThreading(input.subject);
    const hash = createHash('sha1')
        .update(normalizedSubject || '(no-subject)')
        .digest('hex');
    return `subj:${hash}`;
}

export function stringifyReferences(value: unknown): string | null {
    const refs = parseReferenceIdentifiers(value);
    if (refs.length === 0) return null;
    return refs.map((id) => `<${id}>`).join(' ');
}
