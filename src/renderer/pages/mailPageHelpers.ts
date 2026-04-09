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
    const hasExplicitStyles = /<style[\s>]|font-family\s*:/i.test(rawHtml);
    const csp = buildSourceDocCsp(allowRemoteForSelectedMessage);
    const defaultReadableCss = hasExplicitStyles
        ? ''
        : `
      body {
        padding: 16px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #111827;
      }
      `;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base target="_blank" />
    <style>
      html, body { width: 100%; margin: 0; }
      body { box-sizing: border-box; }
      #llamamail-frame-content { box-sizing: border-box; padding: 16px; }
      ${defaultReadableCss}
    </style>
  </head>
  <body><div id="llamamail-frame-content">${rawHtml}</div></body>
</html>`;
}
