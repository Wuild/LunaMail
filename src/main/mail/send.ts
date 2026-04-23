import nodemailer from 'nodemailer';
import {ImapFlow} from 'imapflow';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
	getAccountSendCredentials,
	getAccountSyncCredentials,
	getLocalAccountVCardPath,
} from '@main/db/repositories/accountsRepo';
import {getMessageById, getMessageContext, upsertLocalDraftSnapshot} from '@main/db/repositories/mailRepo';
import {createMailDebugLogger} from '@main/debug/debugLog';
import {markdownToEmailHtml} from './markdown';
import {resolveImapSecurity, resolveSmtpSecurity} from './security';
import {providerManager} from './providerManager';

const DRAFT_SESSION_HEADER = 'X-LlamaMail-Draft-Session';

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
	draftSessionId?: string | null;
}

export interface SendEmailResult {
	ok: true;
	messageId: string;
}

export interface SaveDraftPayload {
	accountId: number;
	draftMessageId?: number | null;
	to?: string | null;
	cc?: string | null;
	bcc?: string | null;
	subject?: string | null;
	text?: string | null;
	html?: string | null;
	inReplyTo?: string | null;
	references?: string[] | string | null;
	attachments?: EmailAttachmentPayload[] | null;
	draftSessionId?: string | null;
}

export interface SaveDraftResult {
	ok: true;
	draftId: string;
	draftMessageId?: number | null;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
	if (!payload.accountId) throw new Error('Account is required');
	const to = normalizeRecipients(payload.to);
	if (!to) throw new Error('Recipient is required');

	const account = await getAccountSendCredentials(payload.accountId);
	const smtpAuth = await resolveAccountSmtpAuth(payload.accountId, account);
	const transporter = nodemailer.createTransport({
		host: account.smtp_host,
		port: account.smtp_port,
		...resolveSmtpSecurity(account.smtp_secure),
		auth: smtpAuth,
		logger: createMailDebugLogger('smtp', `send:${account.email}`),
		debug: true,
	});

	const markdown = payload.markdown?.trim() ?? '';
	const inputText = payload.text?.trim() ?? '';
	const inputHtml = payload.html?.trim() || (markdown ? markdownToEmailHtml(markdown) : undefined);
	const signedBodies = appendAccountSignature(inputText, inputHtml ?? null);
	const regularAttachments = normalizeAttachments(payload.attachments);
	const attachmentsWithVCard = await withOptionalAccountVCardAttachment(account, regularAttachments);
	const inlineImagePrep = extractInlineDataImageAttachments(signedBodies.html);
	const messageId = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@llamamail.local>`;
	const date = new Date();
	const message = {
		from: account.email,
		to,
		cc: normalizeRecipients(payload.cc),
		bcc: normalizeRecipients(payload.bcc),
		subject: payload.subject?.trim() || '(No subject)',
		replyTo: normalizeRecipients(account.reply_to),
		text: signedBodies.text || undefined,
		html: inlineImagePrep.html || (signedBodies.text ? textToHtml(signedBodies.text) : undefined),
		inReplyTo: normalizeMessageId(payload.inReplyTo),
		references: normalizeReferences(payload.references),
		attachments: [
			...attachmentsWithVCard.map((attachment) => ({
				path: attachment.path,
				filename: attachment.filename,
				contentType: attachment.contentType,
			})),
			...inlineImagePrep.attachments.map((attachment) => ({
				filename: attachment.filename,
				contentType: attachment.contentType,
				content: attachment.content,
				cid: attachment.cid,
				contentDisposition: 'inline' as const,
			})),
		],
		messageId,
		date,
	};
	const info = await transporter.sendMail(message);
	try {
		const regularAttachmentBodies = await readAttachmentBodies(attachmentsWithVCard);
		const raw = await buildRawMessage({
			...message,
			attachments: [
				...regularAttachmentBodies,
				...inlineImagePrep.attachments.map((attachment) => ({
					filename: attachment.filename,
					contentType: attachment.contentType,
					content: attachment.content,
					cid: attachment.cid,
					contentDisposition: 'inline' as const,
				})),
			],
		});
		await appendToSentMailbox(payload.accountId, raw, date);
	} catch (error) {
		console.warn(`Sent email ${info.messageId} but failed to append to Sent mailbox:`, error);
	}
	if (payload.draftSessionId?.trim()) {
		void deleteDraftsBySession(payload.accountId, payload.draftSessionId.trim());
	}

	return {
		ok: true,
		messageId: info.messageId,
	};
}

function appendAccountSignature(text: string, html: string | null): {text: string; html: string | null} {
	return {text, html};
}

function htmlToText(html: string): string {
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

function withSignatureDivider(signatureHtml: string): string {
	const normalized = String(signatureHtml || '').trim();
	if (!normalized) return normalized;
	if (/<hr[\s/>]/i.test(normalized)) return normalized;
	return `<hr/>${normalized}`;
}

export async function saveDraftEmail(payload: SaveDraftPayload): Promise<SaveDraftResult> {
	if (!payload.accountId) throw new Error('Account is required');
	const text = payload.text?.trim() ?? '';
	const html = payload.html?.trim() ?? '';
	const subject = payload.subject?.trim() ?? '';
	const to = normalizeRecipients(payload.to);
	const effectiveDraftId =
		(payload.draftSessionId || '').trim() ||
		`draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	const cc = normalizeRecipients(payload.cc);
	const bcc = normalizeRecipients(payload.bcc);
	const normalizedInReplyTo = normalizeMessageId(payload.inReplyTo);
	const normalizedReferences = normalizeReferences(payload.references);
	const attachments = normalizeAttachments(payload.attachments);
	const hasContent = Boolean(
		to ||
			cc ||
			bcc ||
			subject ||
			hasMeaningfulDraftText(text) ||
			hasMeaningfulDraftHtml(html) ||
			attachments.length > 0,
	);
	const draftMessageId =
		typeof payload.draftMessageId === 'number' && Number.isFinite(payload.draftMessageId)
			? Math.floor(payload.draftMessageId)
			: null;
	if (!hasContent) {
		return {ok: true, draftId: effectiveDraftId, draftMessageId: draftMessageId ?? null};
	}

	const account = await getAccountSyncCredentials(payload.accountId);
	const draftImapAuth = await resolveAccountImapAuth(payload.accountId, account);
	if (draftMessageId) {
		const existingDraftMessage = getMessageById(draftMessageId);
		const existingDraftRfcMessageId = normalizeMessageId(existingDraftMessage?.message_id ?? null);
		await deleteDraftByMessageId(payload.accountId, draftMessageId);
		if (existingDraftRfcMessageId) {
			await deleteDraftByRfcMessageId(payload.accountId, existingDraftRfcMessageId);
		}
	}
	await deleteDraftsBySession(payload.accountId, effectiveDraftId);
	const message = {
		from: account.email,
		to,
		cc,
		bcc,
		subject: subject || '(No subject)',
		text: text || undefined,
		html: html || (text ? textToHtml(text) : undefined),
		inReplyTo: normalizedInReplyTo,
		references: normalizedReferences,
		attachments: await readAttachmentBodies(attachments),
		messageId: `<draft.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@llamamail.local>`,
		date: new Date(),
		headers: {[DRAFT_SESSION_HEADER]: effectiveDraftId},
	};
	const raw = await buildRawMessage(message);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: draftImapAuth,
		logger: createMailDebugLogger('imap', `draft:${payload.accountId}`),
	});

	const appendedDraftUid = await (async () => {
		try {
			await client.connect();
			const mailbox = await resolveDraftMailbox(client);
			if (!mailbox) throw new Error('Drafts mailbox not found');
			const appendResult = await client.append(mailbox, raw, ['\\Seen', '\\Draft'], message.date);
			const appendUid = extractAppendUid(appendResult);
			if (appendUid) return appendUid;
			return await resolveDraftUidByMessageId(client, mailbox, message.messageId);
		} finally {
			try {
				await client.logout();
			} catch {
				// ignore close errors
			}
		}
	})();

	const localDraftMessageId = upsertLocalDraftSnapshot({
		accountId: payload.accountId,
		draftMessageId,
		draftUid: appendedDraftUid,
		messageId: message.messageId,
		inReplyTo: normalizedInReplyTo ?? null,
		referencesText: normalizedReferences?.join(' ') ?? null,
		subject: subject || '(No subject)',
		fromAddress: account.email,
		toAddress: to ?? null,
		dateIso: message.date.toISOString(),
		textContent: text || null,
		htmlContent: html || (text ? textToHtml(text) : null),
		attachments: attachments.map((attachment) => ({
			filename: attachment.filename,
			contentType: attachment.contentType,
			size: null,
		})),
	});

	return {
		ok: true,
		draftId: effectiveDraftId,
		draftMessageId: localDraftMessageId ?? draftMessageId ?? null,
	};
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
	headers?: Record<string, string>;
	attachments?: Array<{
		filename: string;
		contentType: string;
		content: Buffer;
		cid?: string;
		contentDisposition?: 'attachment' | 'inline';
	}>;
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
		...Object.entries(message.headers || {}).map(([key, value]) => `${key}: ${value}`),
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
			const disposition = attachment.contentDisposition === 'inline' ? 'inline' : 'attachment';
			parts.push(`Content-Disposition: ${disposition}; filename="${escapeMimeParam(attachment.filename)}"`);
			if (attachment.cid) {
				const cidValue = attachment.cid.replace(/^<|>$/g, '');
				parts.push(`Content-ID: <${cidValue}>`);
			}
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
	const sentImapAuth = await resolveAccountImapAuth(accountId, account);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: sentImapAuth,
		logger: createMailDebugLogger('imap', `sent-append:${accountId}`),
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

async function deleteDraftsBySession(accountId: number, draftSessionId: string): Promise<void> {
	const account = await getAccountSyncCredentials(accountId);
	const cleanupImapAuth = await resolveAccountImapAuth(accountId, account);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: cleanupImapAuth,
		logger: createMailDebugLogger('imap', `draft-cleanup:${accountId}`),
	});

	try {
		await client.connect();
		const mailbox = await resolveDraftMailbox(client);
		if (!mailbox) return;
		const lock = await client.getMailboxLock(mailbox);
		try {
			const uids = await client.search({header: {[DRAFT_SESSION_HEADER]: draftSessionId}}, {uid: true});
			if (!uids || uids.length === 0) return;
			await (client as any).messageDelete(uids, {uid: true});
		} finally {
			lock.release();
		}
	} finally {
		try {
			await client.logout();
		} catch {
			// ignore close errors
		}
	}
}

async function deleteDraftByMessageId(accountId: number, draftMessageId: number): Promise<void> {
	const context = getMessageContext(draftMessageId);
	if (!context) return;
	if (context.accountId !== accountId) return;

	const account = await getAccountSyncCredentials(accountId);
	const replaceDraftImapAuth = await resolveAccountImapAuth(accountId, account);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: replaceDraftImapAuth,
		logger: createMailDebugLogger('imap', `draft-replace:${accountId}`),
	});

	try {
		await client.connect();
		const lock = await client.getMailboxLock(context.folderPath);
		try {
			await (client as any).messageDelete(context.uid, {uid: true});
		} catch {
			// Ignore missing/expunged old draft rows during replacement.
		} finally {
			lock.release();
		}
	} finally {
		try {
			await client.logout();
		} catch {
			// ignore close errors
		}
	}
}

async function deleteDraftByRfcMessageId(accountId: number, messageId: string): Promise<void> {
	const account = await getAccountSyncCredentials(accountId);
	const replaceByMessageIdImapAuth = await resolveAccountImapAuth(accountId, account);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: replaceByMessageIdImapAuth,
		logger: createMailDebugLogger('imap', `draft-replace-message-id:${accountId}`),
	});

	try {
		await client.connect();
		const mailbox = await resolveDraftMailbox(client);
		if (!mailbox) return;
		const normalizedMessageId = messageId.trim().replace(/^<|>$/g, '');
		if (!normalizedMessageId) return;
		const lock = await client.getMailboxLock(mailbox);
		try {
			const uids = await client.search({header: {'Message-ID': normalizedMessageId}}, {uid: true});
			if (!uids || uids.length === 0) return;
			await (client as any).messageDelete(uids, {uid: true});
		} catch {
			// Ignore lookup/deletion failures and rely on session cleanup/local snapshot reconciliation.
		} finally {
			lock.release();
		}
	} finally {
		try {
			await client.logout();
		} catch {
			// ignore close errors
		}
	}
}

async function resolveAccountImapAuth(
	accountId: number,
	credentials: {
		id: number;
		user: string;
		auth_method: 'password' | 'app_password' | 'oauth2';
		oauth_provider: 'google' | 'microsoft' | null;
		password: string | null;
		oauth_session: any | null;
	},
): Promise<{user: string; pass?: string; accessToken?: string}> {
	const driver = await providerManager.resolveDriverForAccount(accountId);
	return driver.resolveImapAuth(credentials);
}

async function resolveAccountSmtpAuth(
	accountId: number,
	credentials: {
		id: number;
		user: string;
		auth_method: 'password' | 'app_password' | 'oauth2';
		oauth_provider: 'google' | 'microsoft' | null;
		password: string | null;
		oauth_session: any | null;
	},
): Promise<{user: string; pass: string} | {type: 'OAuth2'; user: string; accessToken: string}> {
	const driver = await providerManager.resolveDriverForAccount(accountId);
	return driver.resolveSmtpAuth(credentials);
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

function extractAppendUid(result: unknown): number | null {
	if (typeof result === 'number' && Number.isFinite(result) && result > 0) {
		return Math.floor(result);
	}
	if (!result || typeof result !== 'object') return null;
	const row = result as Record<string, unknown>;
	const directUid = Number(row.uid);
	if (Number.isFinite(directUid) && directUid > 0) {
		return Math.floor(directUid);
	}
	const uidSet = row.uidSet;
	if (Array.isArray(uidSet)) {
		const first = Number(uidSet[0]);
		if (Number.isFinite(first) && first > 0) return Math.floor(first);
	}
	return null;
}

async function resolveDraftUidByMessageId(client: ImapFlow, mailbox: string, messageId: string): Promise<number | null> {
	const normalizedMessageId = String(messageId || '').trim().replace(/^<|>$/g, '');
	if (!normalizedMessageId) return null;
	const lock = await client.getMailboxLock(mailbox);
	try {
		const uids = await client.search({header: {'Message-ID': normalizedMessageId}}, {uid: true});
		if (!uids || uids.length === 0) return null;
		const highest = Math.max(...uids.map((uid) => Number(uid)).filter((uid) => Number.isFinite(uid) && uid > 0));
		return Number.isFinite(highest) && highest > 0 ? Math.floor(highest) : null;
	} catch {
		return null;
	} finally {
		lock.release();
	}
}

function textToHtml(text: string): string {
	return `<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;margin:0;">${escapeHtml(text)}</pre>`;
}

function hasMeaningfulDraftText(value: string | null | undefined): boolean {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim().length > 0;
}

function hasMeaningfulDraftHtml(value: string | null | undefined): boolean {
	const html = String(value || '').trim();
	if (!html) return false;
	if (/<img[\s>]/i.test(html)) return true;
	if (/<hr[\s/>]/i.test(html)) return true;
	const textOnly = html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
	return textOnly.length > 0;
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
	const refs = list.map((v) => normalizeMessageId(v)).filter((v): v is string => Boolean(v));
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

function normalizeSignatureCompare(value: string): string {
	return String(value || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function extensionFromImageMime(contentType: string): string {
	if (contentType === 'image/jpeg') return 'jpg';
	if (contentType === 'image/gif') return 'gif';
	if (contentType === 'image/webp') return 'webp';
	if (contentType === 'image/svg+xml') return 'svg';
	return 'png';
}

function extractInlineDataImageAttachments(inputHtml: string | null): {
	html: string | null;
	attachments: Array<{filename: string; contentType: string; content: Buffer; cid: string}>;
} {
	const html = (inputHtml || '').trim();
	if (!html) return {html: inputHtml, attachments: []};

	const dataUrlRegex = /data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)/g;
	const replacements = new Map<string, string>();
	const attachments: Array<{filename: string; contentType: string; content: Buffer; cid: string}> = [];
	let match: RegExpExecArray | null;
	let nextIndex = 1;

	while ((match = dataUrlRegex.exec(html)) !== null) {
		const fullDataUrl = match[0];
		if (replacements.has(fullDataUrl)) continue;

		const contentType = String(match[1] || '').toLowerCase() || 'image/png';
		const encoded = String(match[2] || '').replace(/\s+/g, '');
		if (!encoded) continue;

		let content: Buffer;
		try {
			content = Buffer.from(encoded, 'base64');
		} catch {
			continue;
		}
		if (content.length === 0) continue;

		const cid = `inline-image-${Date.now().toString(36)}-${nextIndex}@llamamail.local`;
		const filename = `inline-image-${nextIndex}.${extensionFromImageMime(contentType)}`;
		nextIndex += 1;

		replacements.set(fullDataUrl, `cid:${cid}`);
		attachments.push({
			filename,
			contentType,
			content,
			cid,
		});
	}

	if (attachments.length === 0) return {html: inputHtml, attachments};

	let nextHtml = html;
	for (const [from, to] of replacements) {
		nextHtml = nextHtml.split(from).join(to);
	}
	return {html: nextHtml, attachments};
}

function normalizeAttachments(
	input?: EmailAttachmentPayload[] | null,
): Array<{filename: string; contentType: string; path: string}> {
	if (!input || !Array.isArray(input) || input.length === 0) return [];
	return input
		.map((attachment) => {
			const filePath = String(attachment?.path || '').trim();
			if (!filePath) return null;
			const filename = (attachment?.filename || '').trim() || path.basename(filePath);
			const contentType = (attachment?.contentType || '').trim() || 'application/octet-stream';
			return {path: filePath, filename, contentType};
		})
		.filter((item): item is {path: string; filename: string; contentType: string} => Boolean(item));
}

async function withOptionalAccountVCardAttachment(
	account: {
		id: number;
		email: string;
		display_name: string | null;
		attach_vcard: number;
	},
	attachments: Array<{filename: string; contentType: string; path: string}>,
): Promise<Array<{filename: string; contentType: string; path: string}>> {
	if (!account.attach_vcard) return attachments;
	const vcardPath = getLocalAccountVCardPath(account.id, account.email);
	try {
		await fs.access(vcardPath);
	} catch {
		return attachments;
	}

	const normalizedVCardPath = path.resolve(vcardPath);
	const alreadyAttached = attachments.some((attachment) => path.resolve(attachment.path) === normalizedVCardPath);
	if (alreadyAttached) return attachments;

	const displayName = String(account.display_name || '').trim();
	const fallbackName = path.basename(vcardPath, '.vcf');
	const safeBaseName = (displayName || fallbackName).replace(/[\\/:*?"<>|]+/g, '_').trim() || fallbackName;
	return [
		...attachments,
		{
			path: vcardPath,
			filename: `${safeBaseName}.vcf`,
			contentType: 'text/vcard',
		},
	];
}

async function readAttachmentBodies(
	attachments: Array<{filename: string; contentType: string; path: string}>,
): Promise<Array<{filename: string; contentType: string; content: Buffer}>> {
	const out: Array<{filename: string; contentType: string; content: Buffer}> = [];
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
