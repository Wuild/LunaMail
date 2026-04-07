export function normalizeAllowlistEntry(entry: string): string | null {
    const value = String(entry || '')
        .trim()
        .toLowerCase();
    if (!value) return null;
    if (value.includes('@')) {
        const extracted = extractEmailAddress(value);
        if (!extracted) return null;
        return extracted;
    }
    return value.replace(/^@+/, '');
}

export function extractEmailAddress(raw: string | null | undefined): string | null {
    const value = String(raw || '')
        .trim()
        .toLowerCase();
    if (!value) return null;
    const angleMatch = value.match(/<([^>]+)>/);
    const candidate = angleMatch?.[1]?.trim() || value;
    if (!candidate.includes('@')) return null;
    const email = candidate.replace(/^mailto:/, '').trim();
    if (!email || !email.includes('@')) return null;
    return email;
}

export function isSenderAllowed(fromAddress: string | null | undefined, allowlist: string[]): boolean {
    const senderEmail = extractEmailAddress(fromAddress);
    if (!senderEmail) return false;
    const senderDomain = senderEmail.split('@')[1] || '';
    const normalized = new Set(
        (allowlist || [])
            .map((entry) => normalizeAllowlistEntry(entry))
            .filter((entry): entry is string => Boolean(entry)),
    );
    if (normalized.has(senderEmail)) return true;
    if (senderDomain && normalized.has(senderDomain)) return true;
    return false;
}

export function buildSourceDocCsp(allowRemote: boolean): string {
    const mediaSources = allowRemote ? 'data: blob: cid: https: http:' : 'data: blob: cid:';
    const fontSources = allowRemote ? 'data: https: http:' : 'data:';
    return [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "script-src 'none'",
        "connect-src 'none'",
        `img-src ${mediaSources}`,
        `media-src ${mediaSources}`,
        `font-src ${fontSources}`,
        "style-src 'unsafe-inline'",
    ].join('; ');
}

export function enrichAnchorTitles(rawHtml: string): string {
    if (!rawHtml || typeof window === 'undefined') return rawHtml;
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');
        const anchors = doc.querySelectorAll('a[href]');
        anchors.forEach((anchor) => {
            const href = String(anchor.getAttribute('href') || '').trim();
            if (!href) return;
            const hasTitle = String(anchor.getAttribute('title') || '').trim().length > 0;
            if (hasTitle) return;
            const text = String(anchor.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();
            anchor.setAttribute('title', text || href);
        });
        return doc.body.innerHTML || rawHtml;
    } catch {
        return rawHtml;
    }
}
