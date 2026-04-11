import mailFrameCss from '@renderer/styles/mail-frame.css?raw';

export function parseRouteNumber(value?: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

export function formatMessageTagLabel(tag: string | null): string {
    const normalized = String(tag || '')
        .trim()
        .toLowerCase();
    if (!normalized) return '';
    switch (normalized) {
        case 'important':
            return 'Important';
        case 'work':
            return 'Work';
        case 'personal':
            return 'Personal';
        case 'todo':
            return 'To Do';
        case 'later':
            return 'Later';
        default:
            return normalized;
    }
}

export function buildMessageIframeSrcDoc(
    renderedBodyHtml: string,
    allowRemoteForSelectedMessage: boolean,
    enrichAnchorTitles: (html: string) => string,
    buildSourceDocCsp: (allowRemote: boolean) => string,
): string {
    const sanitizedHtml = sanitizeRemoteMediaSources(renderedBodyHtml, allowRemoteForSelectedMessage);
    const rawHtml = enrichAnchorTitles(sanitizedHtml);
    const csp = buildSourceDocCsp(allowRemoteForSelectedMessage);
    const rootStyles = window.getComputedStyle(document.documentElement);
    const dark = document.documentElement.classList.contains('dark');
    const scrollbarTrack = rootStyles.getPropertyValue(
        dark ? '--sidebar-surface' : '--app-border',
    ).trim() || (dark ? '#2b2d31' : '#e2e8f0');
    const scrollbarThumb = rootStyles.getPropertyValue(
        dark ? '--scrollbar-thumb-dark' : '--scrollbar-thumb-light',
    ).trim() || (dark ? '#5b5e66' : '#94a3b8');
    const scrollbarThumbHover = rootStyles.getPropertyValue(
        dark ? '--scrollbar-thumb-dark-hover' : '--scrollbar-thumb-light-hover',
    ).trim() || (dark ? '#7a7e87' : '#64748b');
    const frameBackground = '#ffffff';
    const frameText = '#1f2937';
    const frameLink = '#0b57d0';
    const colorScheme = 'light';
    const themeCss = `:root { --llamamail-color-scheme: ${colorScheme}; --llamamail-frame-bg: ${frameBackground}; --llamamail-frame-text: ${frameText}; --llamamail-frame-link: ${frameLink}; --llamamail-scrollbar-track: ${scrollbarTrack}; --llamamail-scrollbar-thumb: ${scrollbarThumb}; --llamamail-scrollbar-thumb-hover: ${scrollbarThumbHover}; }`;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base target="_blank" />
    <style>
      ${themeCss}
      ${mailFrameCss}
    </style>
  </head>
  <body><div id="llamamail-frame-content">${rawHtml}</div></body>
</html>`;
}

function sanitizeRemoteMediaSources(html: string, allowRemote: boolean): string {
    if (allowRemote || !html || typeof window === 'undefined') return html;
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const urlAttrs = ['src', 'poster', 'background', 'data'] as const;
        for (const attr of urlAttrs) {
            const nodes = doc.querySelectorAll<HTMLElement>(`[${attr}]`);
            nodes.forEach((node) => {
                const value = String(node.getAttribute(attr) || '').trim();
                if (!value) return;
                if (isRemoteHttpUrl(value)) {
                    node.removeAttribute(attr);
                }
            });
        }
        const srcsetNodes = doc.querySelectorAll<HTMLElement>('[srcset]');
        srcsetNodes.forEach((node) => {
            const srcset = String(node.getAttribute('srcset') || '').trim();
            if (!srcset) return;
            const safeParts = srcset
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
                .filter((part) => {
                    const candidateUrl = part.split(/\s+/)[0] || '';
                    return !isRemoteHttpUrl(candidateUrl);
                });
            if (safeParts.length === 0) {
                node.removeAttribute('srcset');
                return;
            }
            node.setAttribute('srcset', safeParts.join(', '));
        });
        const styledNodes = doc.querySelectorAll<HTMLElement>('[style]');
        styledNodes.forEach((node) => {
            const styleValue = String(node.getAttribute('style') || '');
            if (!styleValue) return;
            const nextStyle = styleValue.replace(/url\(([^)]+)\)/gi, (full, rawUrl) => {
                const normalized = String(rawUrl || '').trim().replace(/^['"]|['"]$/g, '');
                if (isRemoteHttpUrl(normalized)) return 'none';
                return full;
            });
            node.setAttribute('style', nextStyle);
        });
        return doc.body.innerHTML || html;
    } catch {
        return html;
    }
}

function isRemoteHttpUrl(value: string): boolean {
    const raw = String(value || '').trim().toLowerCase();
    return raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//');
}
