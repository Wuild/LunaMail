import nodemailer from 'nodemailer';
import {ImapFlow} from 'imapflow';
import fs from 'node:fs/promises';
import path from 'node:path';
import {getAccountSendCredentials, getAccountSyncCredentials} from '../db/repositories/accountsRepo.js';
import {markdownToEmailHtml} from './markdown.js';

export interface EmailAttachmentPayload {
    path: string;
    filename?: string | null;
    contentType?: string | null;
}

export interface SendEmailPayload {
    accountId: number;
    to: string;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    markdown?: string | null;
    text?: string | null;
    html?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
    attachments?: EmailAttachmentPayload[] | null;
}

export interface SendEmailResult {
    ok: true;
    messageId: string;
}

export interface SaveDraftPayload {
    accountId: number;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    inReplyTo?: string | null;
    references?: string[] | string | null;
    attachments?: EmailAttachmentPayload[] | null;
}

export interface SaveDraftResult {
    ok: true;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    if (!payload.accountId) throw new Error('Account is required');
    const to = normalizeRecipients(payload.to);
    if (!to) throw new Error('Recipient is required');

    const account = await getAccountSendCredentials(payload.accountId);
    const transporter = nodemailer.createTransport({
        host: account.smtp_host,
        port: account.smtp_port,
        secure: !!account.smtp_secure,
        auth: {user: account.user, pass: account.password},
    });

    const markdown = payload.markdown?.trim() ?? '';
    const text = payload.text?.trim() ?? '';
    const html = payload.html?.trim() || (markdown ? markdownToEmailHtml(markdown) : undefined);
    const attachments = normalizeAttachments(payload.attachments);
    const messageId = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@lunamail.local>`;
    const date = new Date();
    const message = {
        from: account.email,
        to,
        cc: normalizeRecipients(payload.cc),
        bcc: normalizeRecipients(payload.bcc),
        subject: payload.subject?.trim() || '(No subject)',
        text: text || undefined,
        html: html ?? (text ? textToHtml(text) : undefined),
        inReplyTo: normalizeMessageId(payload.inReplyTo),
        references: normalizeReferences(payload.references),
        attachments: attachments.map((attachment) => ({
            path: attachment.path,
            filename: attachment.filename,
            contentType: attachment.contentType,
        })),
        messageId,
        date,
    };
    const info = await transporter.sendMail(message);
    try {
        const raw = await buildRawMessage({
            ...message,
            attachments: await readAttachmentBodies(attachments),
        });
        await appendToSentMailbox(payload.accountId, raw, date);
    } catch (error) {
        console.warn(`Sent email ${info.messageId} but failed to append to Sent mailbox:`, error);
    }

    return {
        ok: true,
        messageId: info.messageId,
    };
}

export async function saveDraftEmail(payload: SaveDraftPayload): Promise<SaveDraftResult> {
    if (!payload.accountId) throw new Error('Account is required');
    const text = payload.text?.trim() ?? '';
    const html = payload.html?.trim() ?? '';
    const subject = payload.subject?.trim() ?? '';
    const to = normalizeRecipients(payload.to);
    const cc = normalizeRecipients(payload.cc);
    const bcc = normalizeRecipients(payload.bcc);
    const attachments = normalizeAttachments(payload.attachments);
    const hasContent = Boolean(to || cc || bcc || subject || text || html || attachments.length > 0);
    if (!hasContent) {
        return {ok: true};
    }

    const account = await getAccountSyncCredentials(payload.accountId);
    const message = {
        from: account.email,
        to,
        cc,
        bcc,
        subject: subject || '(No subject)',
        text: text || undefined,
        html: html || (text ? textToHtml(text) : undefined),
        inReplyTo: normalizeMessageId(payload.inReplyTo),
        references: normalizeReferences(payload.references),
        attachments: await readAttachmentBodies(attachments),
        messageId: `<draft.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@lunamail.local>`,
        date: new Date(),
    };
    const raw = await buildRawMessage(message);
    const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        secure: !!account.imap_secure,
        auth: {user: account.user, pass: account.password},
        logger: false,
    });

    try {
        await client.connect();
        const mailbox = await resolveDraftMailbox(client);
        if (!mailbox) throw new Error('Drafts mailbox not found');
        await client.append(mailbox, raw, ['\\Seen', '\\Draft'], message.date);
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore close errors
        }
    }

    return {ok: true};
}

async function buildRawMessage(message: {
    from: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: Array<{ filename: string; contentType: string; content: Buffer }>;
    messageId?: string;
    date: Date;
}): Promise<Buffer> {
    const headers = [
        `From: ${message.from}`,
        message.to ? `To: ${message.to}` : '',
        message.cc ? `Cc: ${message.cc}` : '',
        message.bcc ? `Bcc: ${message.bcc}` : '',
        `Subject: ${message.subject}`,
        `Date: ${message.date.toUTCString()}`,
        message.messageId ? `Message-ID: ${message.messageId}` : '',
        message.inReplyTo ? `In-Reply-To: ${message.inReplyTo}` : '',
        message.references && message.references.length ? `References: ${message.references.join(' ')}` : '',
        'MIME-Version: 1.0',
    ].filter(Boolean);

    const text = message.text?.trim() ?? '';
    const html = message.html?.trim() ?? '';
    const attachments = message.attachments ?? [];
    if (attachments.length > 0) {
        const mixedBoundary = `luna-mixed-${Math.random().toString(36).slice(2)}`;
        headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

        const parts: string[] = [];
        if (text && html) {
            const altBoundary = `luna-alt-${Math.random().toString(36).slice(2)}`;
            parts.push(`--${mixedBoundary}`);
            parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
            parts.push('');
            parts.push(`--${altBoundary}`);
            parts.push('Content-Type: text/plain; charset="UTF-8"');
            parts.push('Content-Transfer-Encoding: base64');
            parts.push('');
            parts.push(encodeBase64(text));
            parts.push('');
            parts.push(`--${altBoundary}`);
            parts.push('Content-Type: text/html; charset="UTF-8"');
            parts.push('Content-Transfer-Encoding: base64');
            parts.push('');
            parts.push(encodeBase64(html));
            parts.push('');
            parts.push(`--${altBoundary}--`);
            parts.push('');
        } else {
            const contentType = html ? 'text/html' : 'text/plain';
            const payload = html || text;
            parts.push(`--${mixedBoundary}`);
            parts.push(`Content-Type: ${contentType}; charset="UTF-8"`);
            parts.push('Content-Transfer-Encoding: base64');
            parts.push('');
            parts.push(encodeBase64(payload));
            parts.push('');
        }

        for (const attachment of attachments) {
            parts.push(`--${mixedBoundary}`);
            parts.push(`Content-Type: ${attachment.contentType}; name="${escapeMimeParam(attachment.filename)}"`);
            parts.push('Content-Transfer-Encoding: base64');
            parts.push(`Content-Disposition: attachment; filename="${escapeMimeParam(attachment.filename)}"`);
            parts.push('');
            parts.push(encodeBase64Buffer(attachment.content));
            parts.push('');
        }
        parts.push(`--${mixedBoundary}--`);
        parts.push('');

        return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`, 'utf8');
    }

    if (text && html) {
        const boundary = `luna-alt-${Math.random().toString(36).slice(2)}`;
        const body = [
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: base64',
            '',
            encodeBase64(text),
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset="UTF-8"',
            'Content-Transfer-Encoding: base64',
            '',
            encodeBase64(html),
            '',
            `--${boundary}--`,
            '',
        ].join('\r\n');
        return Buffer.from(`${headers.join('\r\n')}\r\n${body}`, 'utf8');
    }

    const contentType = html ? 'text/html' : 'text/plain';
    const payload = html || text;
    const body = [
        `Content-Type: ${contentType}; charset="UTF-8"`,
        'Content-Transfer-Encoding: base64',
        '',
        encodeBase64(payload),
        '',
    ].join('\r\n');
    return Buffer.from(`${headers.join('\r\n')}\r\n${body}`, 'utf8');
}

async function appendToSentMailbox(accountId: number, raw: Buffer, date: Date): Promise<void> {
    const account = await getAccountSyncCredentials(accountId);
    const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        secure: !!account.imap_secure,
        auth: {user: account.user, pass: account.password},
        logger: false,
    });

    try {
        await client.connect();
        const mailbox = await resolveSentMailbox(client);
        if (!mailbox) throw new Error('Sent mailbox not found');
        await client.append(mailbox, raw, ['\\Seen'], date);
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore close errors
        }
    }
}

async function resolveSentMailbox(client: ImapFlow): Promise<string | null> {
    const mailboxes = await client.list();
    const bySpecialUse = mailboxes.find((box) => String(box.specialUse || '').toLowerCase() === '\\sent');
    if (bySpecialUse?.path) return bySpecialUse.path;

    const byPath = mailboxes.find((box) => /(^|[\/. _-])sent($|[\/. _-])/i.test(box.path));
    if (byPath?.path) return byPath.path;

    const byName = mailboxes.find((box) => /sent/i.test(box.name || ''));
    if (byName?.path) return byName.path;

    return null;
}

async function resolveDraftMailbox(client: ImapFlow): Promise<string | null> {
    const mailboxes = await client.list();
    const bySpecialUse = mailboxes.find((box) => String(box.specialUse || '').toLowerCase() === '\\drafts');
    if (bySpecialUse?.path) return bySpecialUse.path;

    const byPath = mailboxes.find((box) => /(^|[\/. _-])drafts?($|[\/. _-])/i.test(box.path));
    if (byPath?.path) return byPath.path;

    const byName = mailboxes.find((box) => /draft/i.test(box.name || ''));
    if (byName?.path) return byName.path;

    return null;
}

function normalizeRecipients(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    const parts = raw
        .split(/[;,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.join(', ');
}

function textToHtml(text: string): string {
    return `<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;margin:0;">${escapeHtml(text)}</pre>`;
}

function normalizeMessageId(value?: string | null): string | undefined {
    const raw = (value || '').trim();
    if (!raw) return undefined;
    if (raw.startsWith('<') && raw.endsWith('>')) return raw;
    return `<${raw.replace(/^<|>$/g, '')}>`;
}

function normalizeReferences(value?: string[] | string | null): string[] | undefined {
    if (!value) return undefined;
    const list = Array.isArray(value) ? value : value.split(/\s+/g);
    const refs = list
        .map((v) => normalizeMessageId(v))
        .filter((v): v is string => Boolean(v));
    return refs.length ? refs : undefined;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function encodeBase64(value: string): string {
    const b64 = Buffer.from(value, 'utf8').toString('base64');
    return b64.replace(/(.{1,76})/g, '$1\r\n').trimEnd();
}

function encodeBase64Buffer(value: Buffer): string {
    const b64 = value.toString('base64');
    return b64.replace(/(.{1,76})/g, '$1\r\n').trimEnd();
}

function escapeMimeParam(value: string): string {
    return value.replace(/["\r\n]/g, '_');
}

function normalizeAttachments(
    input?: EmailAttachmentPayload[] | null,
): Array<{ filename: string; contentType: string; path: string }> {
    if (!input || !Array.isArray(input) || input.length === 0) return [];
    return input
        .map((attachment) => {
            const filePath = String(attachment?.path || '').trim();
            if (!filePath) return null;
            const filename = (attachment?.filename || '').trim() || path.basename(filePath);
            const contentType = (attachment?.contentType || '').trim() || 'application/octet-stream';
            return {path: filePath, filename, contentType};
        })
        .filter((item): item is { path: string; filename: string; contentType: string } => Boolean(item));
}

async function readAttachmentBodies(
    attachments: Array<{ filename: string; contentType: string; path: string }>,
): Promise<Array<{ filename: string; contentType: string; content: Buffer }>> {
    const out: Array<{ filename: string; contentType: string; content: Buffer }> = [];
    for (const attachment of attachments) {
        const content = await fs.readFile(attachment.path);
        out.push({
            filename: attachment.filename,
            contentType: attachment.contentType,
            content,
        });
    }
    return out;
}
