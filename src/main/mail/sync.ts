import {ImapFlow} from 'imapflow';
import {simpleParser} from 'mailparser';
import {createMailDebugLogger} from '@main/debug/debugLog.js';
import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo.js';
import type {OAuthSession} from '@/shared/ipcTypes.js';
import {resolveImapSecurity} from './security.js';
import {resolveImapAuth} from './auth.js';
import {
	getFolderPositiveUidBounds,
	getMessageBody,
	getMessageContext,
	getMessageIdByFolderAndUid,
	hasMessageByFolderAndUid,
	listFoldersByAccount,
	listMessageAttachments,
	reconcileFolderMessageUids,
	replaceMessageAttachments,
	updateFolderCounts,
	upsertFolder,
	upsertMessage,
	upsertMessageBody,
	upsertThread,
} from '@main/db/repositories/mailRepo.js';
import {buildThreadId, stringifyReferences} from './threading.js';
import {providerManager} from './providers/providerManager.js';

const IMAP_RECENT_SYNC_WINDOW = 250;
const IMAP_BACKFILL_BATCH_SIZE = 250;
const EXCHANGE_IMAP_PLACEHOLDER_SUBJECT_PREFIX = 'retrieval using the imap4 protocol failed for the following message:';

export interface SyncSummary {
	accountId: number;
	folders: number;
	messages: number;
	newMessages: number;
	newMessageIds: number[];
	newestMessageTarget: {accountId: number; folderPath: string; messageId: number} | null;
}

export interface MessageBodyResult {
	messageId: number;
	text: string | null;
	html: string | null;
	attachments: Array<{
		filename: string | null;
		contentType: string | null;
		size: number | null;
	}>;
	cached: boolean;
}

export interface MessageSourceResult {
	messageId: number;
	source: string;
}

export interface MessageBodySyncOptions {
	isCancelled?: () => boolean;
	onClient?: (client: ImapFlow) => void;
}

export interface AccountSyncOptions {
	isCancelled?: () => boolean;
	onClient?: (client: ImapFlow) => void;
}

export interface MessageAttachmentFile {
	filename: string;
	contentType: string;
	size: number | null;
	content: Buffer;
}

export async function syncAccountMailbox(accountId: number, options?: AccountSyncOptions): Promise<SyncSummary> {
	const driver = await providerManager.resolveDriverForAccount(accountId);
	if (!driver.supports('emails') || !driver.canRunIncrementalSync()) {
		throw new Error(`Provider ${driver.key()} does not support email sync for account ${accountId}`);
	}
	const account = await driver.resolveSyncCredentials(accountId);
	return syncAccountMailboxWithCredentials(account, options);
}

export async function syncAccountMailboxWithCredentials(
	account: {
		id: number;
		imap_host: string;
		imap_port: number;
		imap_secure: number;
		user: string;
		auth_method: 'password' | 'app_password' | 'oauth2';
		password: string | null;
		oauth_session: OAuthSession | null;
	},
	options?: AccountSyncOptions,
): Promise<SyncSummary> {
	const accountId = account.id;
	const folderLogger = createMailDebugLogger('imap', `sync:account:${accountId}:folders`);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: resolveImapAuth(account),
		logger: createMailDebugLogger('imap', `sync:account:${accountId}`),
	});
	options?.onClient?.(client);

	let totalMessages = 0;
	let newMessages = 0;
	const newMessageIds: number[] = [];
	let newestMessageTarget: {accountId: number; folderPath: string; messageId: number} | null = null;
	try {
		if (options?.isCancelled?.()) throw new Error('Mailbox sync cancelled');
		await client.connect();
		if (options?.isCancelled?.()) throw new Error('Mailbox sync cancelled');
		const mailboxes = await client.list();

		for (const box of mailboxes) {
			if (options?.isCancelled?.()) throw new Error('Mailbox sync cancelled');
			const mailboxFlags = box.flags instanceof Set ? box.flags : new Set<string>();
			if (mailboxFlags.has('\\Noselect')) {
				folderLogger.debug('Skipping non-selectable mailbox path=%s', box.path);
				continue;
			}
			const rawSpecialUse = String(box.specialUse || '').toLowerCase();
			const inferredType = box.specialUse ?? inferFolderType(box.path);
			const isInboxFolder =
				rawSpecialUse === '\\inbox' ||
				String(inferredType || '').toLowerCase() === 'inbox' ||
				box.path.toLowerCase() === 'inbox';
			const isDraftFolder =
				rawSpecialUse === '\\drafts' ||
				String(inferredType || '').toLowerCase() === 'drafts' ||
				box.path.toLowerCase().includes('draft');
			const folderId = upsertFolder({
				accountId,
				name: box.name || box.path,
				path: box.path,
				type: box.specialUse ?? inferFolderType(box.path),
			});

			try {
				const lock = await client.getMailboxLock(box.path);
				try {
					if (options?.isCancelled?.()) throw new Error('Mailbox sync cancelled');
					const status = await client.status(box.path, {messages: true, unseen: true});
					const total = status.messages ?? 0;
					const unseen = status.unseen ?? 0;
					updateFolderCounts(accountId, box.path, unseen, total);

					if (isDraftFolder) {
						const draftUids = await client.search({}, {uid: true});
						reconcileFolderMessageUids(folderId, Array.isArray(draftUids) ? draftUids : []);
					}

					if (total === 0) continue;
					const fetchedUids = new Set<number>();
					const upsertRange = async (range: string): Promise<void> => {
						for await (const msg of client.fetch(range, {
							uid: true,
							envelope: true,
							flags: true,
							size: true,
							internalDate: true,
						})) {
							if (options?.isCancelled?.()) throw new Error('Mailbox sync cancelled');
							if (fetchedUids.has(msg.uid)) continue;
							fetchedUids.add(msg.uid);
							if (isExchangeImapPlaceholderEnvelope(msg.envelope)) {
								folderLogger.debug(
									'Skipping Exchange placeholder message path=%s uid=%s',
									box.path,
									String(msg.uid),
								);
								continue;
							}
							totalMessages += 1;
							const existed = hasMessageByFolderAndUid(folderId, msg.uid);
							const isRead = msg.flags?.has('\\Seen') ? 1 : 0;
							const messageDate = msg.internalDate ? new Date(msg.internalDate).toISOString() : null;
							const envelopeWithRefs = msg.envelope as
								| (typeof msg.envelope & {
										references?: unknown;
								  })
								| undefined;
							const referencesText = stringifyReferences(envelopeWithRefs?.references);
							const threadId = buildThreadId({
								messageId: msg.envelope?.messageId ?? null,
								inReplyTo: msg.envelope?.inReplyTo ?? null,
								references: envelopeWithRefs?.references,
								subject: msg.envelope?.subject ?? null,
								fromAddress: msg.envelope?.from?.[0]?.address ?? null,
								toAddress:
									msg.envelope?.to
										?.map((a) => a.address)
										.filter(Boolean)
										.join(', ') ?? null,
							});
							upsertThread(
								threadId,
								msg.envelope?.subject ?? null,
								messageDate ?? new Date().toISOString(),
							);
							upsertMessage({
								accountId,
								folderId,
								uid: msg.uid,
								seq: (msg.seq as number) ?? 0,
								threadId,
								messageId: msg.envelope?.messageId ?? null,
								inReplyTo: msg.envelope?.inReplyTo ?? null,
								referencesText,
								subject: msg.envelope?.subject ?? null,
								fromName: msg.envelope?.from?.[0]?.name ?? null,
								fromAddress: msg.envelope?.from?.[0]?.address ?? null,
								toAddress:
									msg.envelope?.to
										?.map((a) => a.address)
										.filter(Boolean)
										.join(', ') ?? null,
								date: messageDate,
								isRead,
								isFlagged: msg.flags?.has('\\Flagged') ? 1 : 0,
								size: msg.size ?? null,
							});
							if (!existed && isInboxFolder && !isRead) {
								const messageId = getMessageIdByFolderAndUid(folderId, msg.uid);
								if (!messageId) continue;
								newMessages += 1;
								newMessageIds.push(messageId);
								if (!newestMessageTarget) {
									newestMessageTarget = {
										accountId,
										folderPath: box.path,
										messageId,
									};
								}
							}
						}
					};

					const recentStart = Math.max(1, total - IMAP_RECENT_SYNC_WINDOW + 1);
					await upsertRange(`${recentStart}:*`);

					const uidBounds = getFolderPositiveUidBounds(folderId);
					if (uidBounds.minUid && uidBounds.minUid > 1) {
						const backfillEnd = uidBounds.minUid - 1;
						const backfillStart = Math.max(1, backfillEnd - IMAP_BACKFILL_BATCH_SIZE + 1);
						if (backfillStart <= backfillEnd) {
							await upsertRange(`${backfillStart}:${backfillEnd}`);
						}
					}
				} finally {
					lock.release();
				}
			} catch (folderError) {
				const message = (folderError as any)?.message || String(folderError);
				folderLogger.warn('Skipping mailbox path=%s reason=%s', box.path, message);
				continue;
			}
		}
	} catch (error: any) {
		throw new Error(formatMailboxSyncError(error));
	} finally {
		try {
			await client.logout();
		} catch {
			// ignore close errors
		}
	}

	const folders = listFoldersByAccount(accountId).length;
	return {accountId, folders, messages: totalMessages, newMessages, newMessageIds, newestMessageTarget};
}

function formatMailboxSyncError(error: any): string {
	const message = String(error?.message || '').trim();
	const responseText = String(error?.responseText || '').trim();
	const serverResponse = String(error?.serverResponse || '').trim();
	const executedCommand = String(error?.executedCommand || error?.command || '').trim();
	const merged = [message, responseText, serverResponse, executedCommand]
		.filter(Boolean)
		.join(' | ')
		.toLowerCase();

	if (merged.includes('noaduserbysid')) {
		return 'Microsoft OAuth authenticated, but this account has no Exchange mailbox (NoAdUserBySid).';
	}
	if (/^command failed$/i.test(message)) {
		if (responseText) return responseText;
		if (serverResponse) return serverResponse;
	}
	if (responseText) return responseText;
	if (serverResponse) return serverResponse;
	if (message) return message;
	return 'Mailbox sync failed.';
}

function inferFolderType(path: string): string | null {
	const p = path.toLowerCase();
	if (p === 'inbox') return 'inbox';
	if (p.includes('sent')) return 'sent';
	if (p.includes('draft')) return 'drafts';
	if (p.includes('trash') || p.includes('deleted')) return 'trash';
	if (p.includes('archive')) return 'archive';
	if (p.includes('spam') || p.includes('junk')) return 'junk';
	return null;
}

function isExchangeImapPlaceholderEnvelope(envelope: unknown): boolean {
	if (!envelope || typeof envelope !== 'object') return false;
	const unsafeEnvelope = envelope as any;
	const subject = String(unsafeEnvelope?.subject ?? '')
		.trim()
		.toLowerCase();
	const fromList = Array.isArray(unsafeEnvelope?.from) ? unsafeEnvelope.from : [];
	const hasMissingHostMarker = fromList.some((entry: any) => {
		if (!entry || typeof entry !== 'object') return false;
		const host = String(entry.host ?? '')
			.trim()
			.toLowerCase();
		const address = String(entry.address ?? '')
			.trim()
			.toLowerCase();
		return host === '.missing-host-name.' || address.includes('.missing-host-name.');
	});
	return subject.startsWith(EXCHANGE_IMAP_PLACEHOLDER_SUBJECT_PREFIX) || hasMissingHostMarker;
}

export async function syncMessageBody(messageId: number, options?: MessageBodySyncOptions): Promise<MessageBodyResult> {
	const cached = getMessageBody(messageId);
	if (cached && (cached.text_content || cached.html_content)) {
		const attachments = listMessageAttachments(messageId).map((attachment) => ({
			filename: attachment.filename ?? null,
			contentType: attachment.content_type ?? null,
			size: attachment.size ?? null,
		}));
		return {
			messageId,
			text: cached.text_content,
			html: cached.html_content,
			attachments,
			cached: true,
		};
	}

	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	const account = await getAccountSyncCredentials(ctx.accountId);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: resolveImapAuth(account),
		logger: createMailDebugLogger('imap', `body:message:${messageId}`),
	});
	options?.onClient?.(client);

	try {
		if (options?.isCancelled?.()) throw new Error('Message body request cancelled');
		await client.connect();
		if (options?.isCancelled?.()) throw new Error('Message body request cancelled');
		const lock = await client.getMailboxLock(ctx.folderPath);
		try {
			if (options?.isCancelled?.()) throw new Error('Message body request cancelled');
			const fetched = await client.fetchOne(ctx.uid, {source: true}, {uid: true});
			if (options?.isCancelled?.()) throw new Error('Message body request cancelled');
			const src = fetched && typeof fetched === 'object' ? (fetched as any).source : null;
			if (!src) throw new Error('Could not fetch message body from server');

			const parsed = await simpleParser(src);
			const text = parsed.text ? String(parsed.text) : null;
			const html = parsed.html ? String(parsed.html) : null;
			upsertMessageBody(messageId, text, html);
			const attachments = (parsed.attachments ?? []).map((attachment: any) => ({
				filename: attachment.filename ?? null,
				contentType: attachment.contentType ?? null,
				size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : null,
			}));
			replaceMessageAttachments(messageId, attachments);

			return {messageId, text, html, attachments, cached: false};
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

export async function syncMessageSource(
	messageId: number,
	options?: MessageBodySyncOptions,
): Promise<MessageSourceResult> {
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	const account = await getAccountSyncCredentials(ctx.accountId);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: resolveImapAuth(account),
		logger: createMailDebugLogger('imap', `source:message:${messageId}`),
	});
	options?.onClient?.(client);

	try {
		if (options?.isCancelled?.()) throw new Error('Message source request cancelled');
		await client.connect();
		if (options?.isCancelled?.()) throw new Error('Message source request cancelled');
		const lock = await client.getMailboxLock(ctx.folderPath);
		try {
			if (options?.isCancelled?.()) throw new Error('Message source request cancelled');
			const fetched = await client.fetchOne(ctx.uid, {source: true}, {uid: true});
			if (options?.isCancelled?.()) throw new Error('Message source request cancelled');
			const src = fetched && typeof fetched === 'object' ? (fetched as any).source : null;
			if (!src) throw new Error('Could not fetch message source from server');
			const source = Buffer.isBuffer(src) ? src.toString('utf8') : String(src);
			return {messageId, source};
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

export async function downloadMessageAttachment(
	messageId: number,
	attachmentIndex: number,
	options?: MessageBodySyncOptions,
): Promise<MessageAttachmentFile> {
	if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
		throw new Error('Invalid attachment index');
	}
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	const account = await getAccountSyncCredentials(ctx.accountId);
	const client = new ImapFlow({
		host: account.imap_host,
		port: account.imap_port,
		...resolveImapSecurity(account.imap_secure),
		auth: resolveImapAuth(account),
		logger: createMailDebugLogger('imap', `attachment:message:${messageId}`),
	});
	options?.onClient?.(client);

	try {
		if (options?.isCancelled?.()) throw new Error('Attachment request cancelled');
		await client.connect();
		if (options?.isCancelled?.()) throw new Error('Attachment request cancelled');
		const lock = await client.getMailboxLock(ctx.folderPath);
		try {
			if (options?.isCancelled?.()) throw new Error('Attachment request cancelled');
			const fetched = await client.fetchOne(ctx.uid, {source: true}, {uid: true});
			if (options?.isCancelled?.()) throw new Error('Attachment request cancelled');
			const src = fetched && typeof fetched === 'object' ? (fetched as any).source : null;
			if (!src) throw new Error('Could not fetch message source for attachment');

			const parsed = await simpleParser(src);
			const attachments = parsed.attachments ?? [];
			const target = attachments[attachmentIndex] as any;
			if (!target) throw new Error('Attachment not found');

			const filename = String(target.filename || '').trim() || `attachment-${attachmentIndex + 1}.bin`;
			const contentType = String(target.contentType || '').trim() || 'application/octet-stream';
			const size = Number.isFinite(Number(target.size)) ? Number(target.size) : null;
			const content = Buffer.isBuffer(target.content) ? target.content : Buffer.from(target.content || '');

			return {filename, contentType, size, content};
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
