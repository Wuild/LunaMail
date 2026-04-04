export function buildSpoofHints(message: {
    from_address: string | null;
    from_name: string | null;
    message_id: string | null;
}): string[] {
    const hints: string[] = [];
    const fromAddress = (message.from_address || '').trim().toLowerCase();
    const embeddedFrom = extractEmailFromText(message.from_name || '');
    if (embeddedFrom && fromAddress && embeddedFrom.toLowerCase() !== fromAddress) {
        hints.push(`Display name contains a different email (${embeddedFrom}) than the actual sender (${fromAddress}).`);
    }

    const fromDomain = extractDomain(fromAddress);
    const messageIdDomain = extractDomainFromMessageId(message.message_id || '');
    if (
        fromDomain &&
        messageIdDomain &&
        toBaseDomain(fromDomain) !== toBaseDomain(messageIdDomain)
    ) {
        hints.push(`Message-ID domain (${messageIdDomain}) differs from sender domain (${fromDomain}).`);
    }
    return hints;
}

function extractEmailFromText(value: string): string | null {
    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? null;
}

function extractDomain(address: string): string | null {
    const email = (address || '').trim();
    const idx = email.lastIndexOf('@');
    if (idx <= 0 || idx >= email.length - 1) return null;
    return email.slice(idx + 1).toLowerCase();
}

function extractDomainFromMessageId(messageId: string): string | null {
    const normalized = normalizeMessageId(messageId);
    if (!normalized) return null;
    const inner = normalized.replace(/^<|>$/g, '');
    const idx = inner.lastIndexOf('@');
    if (idx <= 0 || idx >= inner.length - 1) return null;
    return inner.slice(idx + 1).toLowerCase();
}

function toBaseDomain(domain: string): string {
    const value = (domain || '').toLowerCase().trim().replace(/\.+$/, '');
    if (!value) return '';
    const parts = value.split('.').filter(Boolean);
    if (parts.length <= 2) return value;
    return parts.slice(-2).join('.');
}

function normalizeMessageId(value: string | null | undefined): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('<') && raw.endsWith('>')) return raw;
    return `<${raw.replace(/^<|>$/g, '')}>`;
}
