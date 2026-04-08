function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(raw: string): string {
    const value = raw.trim();
    if (/^(https?:|mailto:|data:image\/|cid:)/i.test(value)) return value;
    if (/^www\./i.test(value)) return `https://${value}`;
    return '#';
}

function renderInline(text: string): string {
    let out = escapeHtml(text);

    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, src: string) => {
        const safeSrc = sanitizeUrl(src);
        if (safeSrc === '#') return _m;
        return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:8px 0;" />`;
    });

    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
        const safeHref = sanitizeUrl(href);
        if (safeHref === '#') return label;
        return `<a href="${escapeHtml(safeHref)}" style="color:#2563eb;text-decoration:underline;">${label}</a>`;
    });

    out = out.replace(/`([^`]+)`/g, '<code style="background:#eef2f7;padding:1px 4px;border-radius:4px;">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\n/g, '<br/>');
    return out;
}

export function markdownToEmailHtml(markdown: string): string {
    const source = (markdown || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';

    const lines = source.split('\n');
    const parts: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i] ?? '';
        const trimmed = line.trim();
        if (!trimmed) {
            i += 1;
            continue;
        }

        if (trimmed.startsWith('```')) {
            i += 1;
            const codeLines: string[] = [];
            while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
                codeLines.push(lines[i] ?? '');
                i += 1;
            }
            if (i < lines.length) i += 1;
            parts.push(
                `<pre style="background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:8px;overflow:auto;"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
            );
            continue;
        }

        const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
        if (heading) {
            const level = Math.min(6, Math.max(1, heading[1]?.length ?? 1));
            parts.push(`<h${level} style="margin:0 0 10px 0;">${renderInline(heading[2] ?? '')}</h${level}>`);
            i += 1;
            continue;
        }

        if (/^[-*_]{3,}$/.test(trimmed)) {
            parts.push('<hr style="border:none;border-top:1px solid #cbd5e1;margin:12px 0;" />');
            i += 1;
            continue;
        }

        if (/^>\s?/.test(trimmed)) {
            const quoteLines: string[] = [];
            while (i < lines.length && /^>\s?/.test((lines[i] ?? '').trim())) {
                quoteLines.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
                i += 1;
            }
            parts.push(
                `<blockquote style="margin:0 0 10px 0;padding:0 0 0 10px;border-left:3px solid #94a3b8;color:#475569;">${renderInline(quoteLines.join('\n'))}</blockquote>`,
            );
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
                items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
                i += 1;
            }
            parts.push(
                `<ul style="margin:0 0 10px 18px;padding:0;">${items.map((item) => `<li style="margin:2px 0;">${renderInline(item)}</li>`).join('')}</ul>`,
            );
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
                items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
                i += 1;
            }
            parts.push(
                `<ol style="margin:0 0 10px 18px;padding:0;">${items.map((item) => `<li style="margin:2px 0;">${renderInline(item)}</li>`).join('')}</ol>`,
            );
            continue;
        }

        const paragraph: string[] = [];
        while (i < lines.length) {
            const current = lines[i] ?? '';
            const currentTrimmed = current.trim();
            if (!currentTrimmed) break;
            if (
                currentTrimmed.startsWith('```') ||
                /^(#{1,6})\s+/.test(currentTrimmed) ||
                /^>\s?/.test(currentTrimmed) ||
                /^\s*[-*+]\s+/.test(current) ||
                /^\s*\d+\.\s+/.test(current) ||
                /^[-*_]{3,}$/.test(currentTrimmed)
            ) {
                break;
            }
            paragraph.push(current);
            i += 1;
        }
        if (paragraph.length) {
            parts.push(`<p style="margin:0 0 10px 0;">${renderInline(paragraph.join('\n'))}</p>`);
        } else {
            i += 1;
        }
    }

    const content = parts.join('');
    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.55;color:#0f172a;word-break:break-word;overflow-wrap:anywhere;">${content}</div>`;
}
