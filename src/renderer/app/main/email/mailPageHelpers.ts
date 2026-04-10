import mailFrameCss from '../../../styles/mail-frame.css?raw';

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
    const rawHtml = enrichAnchorTitles(renderedBodyHtml);
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
