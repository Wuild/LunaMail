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
    warnOnExternalLinks: boolean,
    enrichAnchorTitles: (html: string) => string,
    buildSourceDocCsp: (allowRemote: boolean) => string,
): string {
    const sanitizedHtml = sanitizeRemoteMediaSources(
        renderedBodyHtml,
        allowRemoteForSelectedMessage,
        warnOnExternalLinks,
    );
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

function sanitizeRemoteMediaSources(html: string, allowRemote: boolean, warnOnExternalLinks: boolean): string {
    if (!html || typeof window === 'undefined') return html;
    try {
        const shouldBlockMedia = !allowRemote;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const activeNodes = doc.querySelectorAll('script, noscript, iframe, frame, object, embed, portal, svg');
        activeNodes.forEach((node) => node.remove());
        const allNodes = doc.querySelectorAll<HTMLElement>('*');
        allNodes.forEach((node) => {
            const tagName = node.tagName.toLowerCase();
            const attrs = Array.from(node.attributes);
            attrs.forEach((attr) => {
                const name = attr.name.toLowerCase();
                const value = String(attr.value || '').trim();
                if (name.startsWith('on')) {
                    node.removeAttribute(attr.name);
                    return;
                }
                if (
                    (name === 'action' || name === 'formaction') &&
                    isUnsafeNavigableUrl(value)
                ) {
                    node.removeAttribute(attr.name);
                    return;
                }
                if (
                    (name === 'href' || name === 'xlink:href') &&
                    tagName !== 'a' &&
                    isUnsafeNavigableUrl(value)
                ) {
                    node.removeAttribute(attr.name);
                    return;
                }
                if (
                    (name === 'href' || name === 'xlink:href') &&
                    tagName !== 'a' &&
                    isRemoteHttpUrl(value)
                ) {
                    node.removeAttribute(attr.name);
                }
            });
        });
        const urlAttrs = ['src', 'poster', 'background', 'data'] as const;
        for (const attr of urlAttrs) {
            const nodes = doc.querySelectorAll<HTMLElement>(`[${attr}]`);
            nodes.forEach((node) => {
                const value = String(node.getAttribute(attr) || '').trim();
                if (!value) return;
                if (shouldBlockMedia && isBlockedMediaUrl(value)) {
                    node.removeAttribute(attr);
                }
            });
        }
        const sourceLikeNodes = doc.querySelectorAll<HTMLElement>('source[src], track[src], embed[src], link[href], meta[http-equiv="refresh"]');
        sourceLikeNodes.forEach((node) => {
            if (node.tagName.toLowerCase() === 'link') {
                const rel = String(node.getAttribute('rel') || '').toLowerCase();
                const shouldStripHref =
                    rel.includes('stylesheet') ||
                    rel.includes('preload') ||
                    rel.includes('prefetch') ||
                    rel.includes('icon');
                if (!shouldStripHref) return;
                const href = String(node.getAttribute('href') || '').trim();
                if (shouldBlockMedia && isBlockedMediaUrl(href)) {
                    node.removeAttribute('href');
                }
                return;
            }
            if (node.tagName.toLowerCase() === 'meta') {
                const content = String(node.getAttribute('content') || '');
                const nextContent = content.replace(/url\s*=\s*([^;]+)/i, (full, rawUrl) => {
                    const normalized = String(rawUrl || '').trim().replace(/^['"]|['"]$/g, '');
                    return isRemoteHttpUrl(normalized) ? 'url=about:blank' : full;
                });
                node.setAttribute('content', nextContent);
                return;
            }
            const src = String(node.getAttribute('src') || '').trim();
            if (shouldBlockMedia && isBlockedMediaUrl(src)) {
                node.removeAttribute('src');
            }
        });
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
                    return !shouldBlockMedia || !isBlockedMediaUrl(candidateUrl);
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
                if (shouldBlockMedia && isBlockedMediaUrl(normalized)) return 'none';
                return full;
            });
            node.setAttribute('style', nextStyle);
        });
        const styleTags = doc.querySelectorAll('style');
        styleTags.forEach((styleTag) => {
            const css = String(styleTag.textContent || '');
            if (!css) return;
            const withoutImports = css.replace(/@import\s+url\(([^)]+)\)\s*;?/gi, (full, rawUrl) => {
                const normalized = String(rawUrl || '').trim().replace(/^['"]|['"]$/g, '');
                return shouldBlockMedia && isBlockedMediaUrl(normalized) ? '' : full;
            }).replace(/@import\s+['"]([^'"]+)['"]\s*;?/gi, (full, rawUrl) => {
                return shouldBlockMedia && isBlockedMediaUrl(rawUrl) ? '' : full;
            });
            const nextCss = withoutImports.replace(/url\(([^)]+)\)/gi, (full, rawUrl) => {
                const normalized = String(rawUrl || '').trim().replace(/^['"]|['"]$/g, '');
                if (shouldBlockMedia && isBlockedMediaUrl(normalized)) return 'none';
                return full;
            });
            styleTag.textContent = nextCss;
        });
        if (warnOnExternalLinks) {
            const anchors = doc.querySelectorAll<HTMLAnchorElement>('a[href]');
            anchors.forEach((anchor) => {
                const href = String(anchor.getAttribute('href') || '').trim();
                if (!href) return;
                if (shouldWrapAnchorHref(href)) {
                    anchor.setAttribute('href', buildUnsafeSenderWarningLink(href));
                }
            });
        }
        return doc.body.innerHTML || html;
    } catch {
        return html;
    }
}

function isRemoteHttpUrl(value: string): boolean {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('//')) return true;
    if (raw.startsWith('http:') || raw.startsWith('https:')) return true;
    return false;
}

function isUnsafeNavigableUrl(value: string): boolean {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('javascript:')) return true;
    if (raw.startsWith('vbscript:')) return true;
    if (raw.startsWith('data:')) return true;
    return false;
}

function isSvgResourceUrl(value: string): boolean {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('data:image/svg+xml')) return true;
    if (raw.includes('image/svg+xml')) return true;
    const withoutHash = raw.split('#')[0] || raw;
    const withoutQuery = withoutHash.split('?')[0] || withoutHash;
    return withoutQuery.endsWith('.svg') || withoutQuery.endsWith('.svgz');
}

function isInlineMediaUrl(value: string): boolean {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('cid:')) return true;
    if (raw.startsWith('data:')) return true;
    if (raw.startsWith('blob:')) return true;
    return false;
}

function isBlockedMediaUrl(value: string): boolean {
    return isRemoteHttpUrl(value) || isSvgResourceUrl(value) || isInlineMediaUrl(value);
}

function shouldWrapAnchorHref(value: string): boolean {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (raw.startsWith('#')) return false;
    if (/^llamamail-link:/i.test(raw)) return false;
    if (/^\/\//.test(raw)) return true;
    return /^[a-z][a-z0-9+.-]*:/i.test(raw);
}

function buildUnsafeSenderWarningLink(targetUrl: string): string {
    return `llamamail-link://open?target=${encodeURIComponent(targetUrl)}&sender=untrusted`;
}
