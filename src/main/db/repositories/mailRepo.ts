import {and, desc, eq, inArray, ne, sql} from 'drizzle-orm';
import {getDb, getDrizzle} from '@main/db/drizzle.js';
import {folders, messages} from '@main/db/schema.js';

export interface FolderRow {
	id: number;
	account_id: number;
	name: string;
	custom_name: string | null;
	color: string | null;
	sort_order: number | null;
	path: string;
	type: string | null;
	unread_count: number;
	total_count: number;
}

export interface MessageRow {
	id: number;
	account_id: number;
	folder_id: number;
	thread_id: string | null;
	uid: number;
	seq: number;
	message_id: string | null;
	in_reply_to: string | null;
	references_text: string | null;
	subject: string | null;
	from_name: string | null;
	from_address: string | null;
	to_address: string | null;
	date: string | null;
	is_read: number;
	is_flagged: number;
	tag: string | null;
	size: number | null;
}

export interface MessageThreadRow extends MessageRow {
	thread_count: number;
	thread_unread_count: number;
	thread_latest_date: string | null;
}

export interface MessageBodyRow {
	message_id: number;
	text_content: string | null;
	html_content: string | null;
}

export interface MessageAttachmentRow {
	id: number;
	message_id: number;
	filename: string | null;
	content_type: string | null;
	size: number | null;
}

export interface RecentRecipientRow {
	email: string;
	display_name: string | null;
	last_used_at: string | null;
}

export interface MessageContextRow {
	messageId: number;
	accountId: number;
	folderPath: string;
	folderId: number;
	uid: number;
}

export interface UpsertLocalDraftSnapshotInput {
	accountId: number;
	draftMessageId?: number | null;
	messageId?: string | null;
	inReplyTo?: string | null;
	referencesText?: string | null;
	subject?: string | null;
	fromAddress?: string | null;
	toAddress?: string | null;
	dateIso?: string | null;
	textContent?: string | null;
	htmlContent?: string | null;
	attachments?: Array<{filename?: string | null; contentType?: string | null; size?: number | null}>;
}

export interface SetMessageReadResult {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	unreadCount: number;
	totalCount: number;
	isRead: number;
}

export interface SetMessageFlagResult {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	isFlagged: number;
}

export interface SetMessageTagResult {
	messageId: number;
	accountId: number;
	folderId: number;
	folderPath: string;
	tag: string | null;
}

export interface MoveMessageResult {
	messageId: number;
	accountId: number;
	sourceFolderId: number;
	sourceFolderPath: string;
	targetFolderId: number;
	targetFolderPath: string;
	uid: number;
	sourceUnreadCount: number;
	sourceTotalCount: number;
	targetUnreadCount: number;
	targetTotalCount: number;
}

export interface UpsertFolderInput {
	accountId: number;
	name: string;
	path: string;
	type?: string | null;
	unreadCount?: number;
	totalCount?: number;
}

export interface UpdateFolderSettingsInput {
	accountId: number;
	folderPath: string;
	customName?: string | null;
	color?: string | null;
	type?: string | null;
}

export interface UpsertMessageInput {
	accountId: number;
	folderId: number;
	uid: number;
	seq: number;
	threadId?: string | null;
	messageId?: string | null;
	inReplyTo?: string | null;
	referencesText?: string | null;
	subject?: string | null;
	fromName?: string | null;
	fromAddress?: string | null;
	toAddress?: string | null;
	date?: string | null;
	isRead?: number;
	isFlagged?: number;
	tag?: string | null;
	size?: number | null;
}

export function upsertFolder(input: UpsertFolderInput): number {
	const db = getDb();
	db.prepare(
		`
            INSERT INTO folders (account_id, name, path, type, unread_count, total_count)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, path) DO
            UPDATE SET
                name = excluded.name,
                type = excluded.type,
                unread_count = excluded.unread_count,
                total_count = excluded.total_count
        `,
	).run(input.accountId, input.name, input.path, input.type ?? null, input.unreadCount ?? 0, input.totalCount ?? 0);

	const row = db
		.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?')
		.get(input.accountId, input.path) as {
		id: number;
	};
	return row.id;
}

export function updateFolderCounts(accountId: number, path: string, unreadCount: number, totalCount: number): void {
	const db = getDb();
	db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE account_id = ? AND path = ?').run(
		unreadCount,
		totalCount,
		accountId,
		path,
	);
}

export function updateFolderSettings(input: UpdateFolderSettingsInput): FolderRow {
	const db = getDb();
	const row = db
		.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?')
		.get(input.accountId, input.folderPath) as {id: number} | undefined;
	if (!row?.id) {
		throw new Error(`Folder ${input.folderPath} not found`);
	}

	db.prepare(
		`
            UPDATE folders
            SET custom_name = ?,
                color       = ?,
                type        = ?
            WHERE account_id = ?
              AND path = ?
        `,
	).run(
		input.customName && input.customName.trim().length ? input.customName.trim() : null,
		input.color && input.color.trim().length ? input.color.trim() : null,
		input.type && input.type.trim().length ? input.type.trim().toLowerCase() : null,
		input.accountId,
		input.folderPath,
	);

	const updated = db
		.prepare('SELECT * FROM folders WHERE account_id = ? AND path = ?')
		.get(input.accountId, input.folderPath) as FolderRow | undefined;
	if (!updated) throw new Error(`Folder ${input.folderPath} not found after update`);
	return updated;
}

export function deleteFolderByPath(
	accountId: number,
	folderPath: string,
): {
	accountId: number;
	folderPath: string;
	removed: boolean;
} {
	const db = getDb();
	const result = db.prepare('DELETE FROM folders WHERE account_id = ? AND path = ?').run(accountId, folderPath);
	return {
		accountId,
		folderPath,
		removed: result.changes > 0,
	};
}

export function upsertMessage(input: UpsertMessageInput): void {
	const db = getDb();
	db.prepare(
		`
            INSERT INTO messages (account_id, folder_id, uid, seq, thread_id, message_id, in_reply_to, references_text,
                                  subject, from_name, from_address, to_address, date, is_read, is_flagged, tag, size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(folder_id, uid) DO
            UPDATE SET
                seq = excluded.seq,
                thread_id = excluded.thread_id,
                message_id = excluded.message_id,
                in_reply_to = excluded.in_reply_to,
                references_text = excluded.references_text,
                subject = excluded.subject,
                from_name = excluded.from_name,
                from_address = excluded.from_address,
                to_address = excluded.to_address,
                date = excluded.date,
                is_read = excluded.is_read,
                is_flagged = excluded.is_flagged,
                tag = COALESCE(messages.tag, excluded.tag),
                size = excluded.size
        `,
	).run(
		input.accountId,
		input.folderId,
		input.uid,
		input.seq,
		input.threadId ?? null,
		input.messageId ?? null,
		input.inReplyTo ?? null,
		input.referencesText ?? null,
		input.subject ?? null,
		input.fromName ?? null,
		input.fromAddress ?? null,
		input.toAddress ?? null,
		input.date ?? null,
		input.isRead ?? 0,
		input.isFlagged ?? 0,
		input.tag ?? null,
		input.size ?? null,
	);
}

export function reconcileFolderMessageUids(folderId: number, serverUids: number[]): void {
	const db = getDrizzle();
	const normalizedServerUids = Array.from(
		new Set(
			(Array.isArray(serverUids) ? serverUids : [])
				.map((value) => Number(value))
				.filter((value) => Number.isFinite(value) && value > 0)
				.map((value) => Math.floor(value)),
		),
	);
	const serverUidSet = new Set<number>(normalizedServerUids);
	const localRows = db
		.select({
			id: messages.id,
			uid: messages.uid,
		})
		.from(messages)
		.where(eq(messages.folderId, folderId))
		.all();
	const staleMessageIds = localRows.filter((row) => !serverUidSet.has(row.uid)).map((row) => row.id);
	if (staleMessageIds.length === 0) return;
	const chunkSize = 200;
	for (let index = 0; index < staleMessageIds.length; index += chunkSize) {
		const chunk = staleMessageIds.slice(index, index + chunkSize);
		db.delete(messages).where(inArray(messages.id, chunk)).run();
	}
}

export function upsertThread(threadId: string, subject: string | null, updatedAt: string): void {
	const db = getDb();
	db.prepare(
		`
            INSERT INTO threads (id, subject, updated_at)
            VALUES (?, ?, ?) ON CONFLICT(id) DO
            UPDATE SET
                subject = COALESCE(excluded.subject, threads.subject),
                updated_at = CASE
                                 WHEN excluded.updated_at > threads.updated_at THEN excluded.updated_at
                                 ELSE threads.updated_at
                    END
        `,
	).run(threadId, subject, updatedAt);
}

export function hasMessageByFolderAndUid(folderId: number, uid: number): boolean {
	const db = getDb();
	const row = db
		.prepare('SELECT 1 as ok FROM messages WHERE folder_id = ? AND uid = ? LIMIT 1')
		.get(folderId, uid) as
		| {
				ok: number;
		  }
		| undefined;
	return Boolean(row?.ok);
}

export function getMessageIdByFolderAndUid(folderId: number, uid: number): number | null {
	const db = getDb();
	const row = db.prepare('SELECT id FROM messages WHERE folder_id = ? AND uid = ? LIMIT 1').get(folderId, uid) as
		| {
				id: number;
		  }
		| undefined;
	return row?.id ?? null;
}

export function getFolderPositiveUidBounds(folderId: number): {minUid: number | null; maxUid: number | null} {
	const db = getDb();
	const row = db
		.prepare('SELECT MIN(uid) as minUid, MAX(uid) as maxUid FROM messages WHERE folder_id = ? AND uid > 0')
		.get(folderId) as
		| {
				minUid?: number | null;
				maxUid?: number | null;
		  }
		| undefined;
	return {
		minUid: typeof row?.minUid === 'number' ? row.minUid : null,
		maxUid: typeof row?.maxUid === 'number' ? row.maxUid : null,
	};
}

export function listFoldersByAccount(accountId: number): FolderRow[] {
	const db = getDrizzle();
	return db
		.select({
			id: folders.id,
			account_id: folders.accountId,
			name: folders.name,
			custom_name: folders.customName,
			color: folders.color,
			sort_order: folders.sortOrder,
			path: folders.path,
			type: folders.type,
			unread_count: folders.unreadCount,
			total_count: folders.totalCount,
		})
		.from(folders)
		.where(eq(folders.accountId, accountId))
		.orderBy(
			sql`CASE
                WHEN lower(${folders.path}) = 'inbox' OR lower(${folders.type}) = 'inbox' THEN 0
                WHEN lower(${folders.type}) = 'sent' OR lower(${folders.path}) LIKE '%sent%' THEN 1
                WHEN lower(${folders.type}) = 'drafts' OR lower(${folders.path}) LIKE '%draft%' THEN 2
                WHEN lower(${folders.type}) = 'archive' OR lower(${folders.path}) LIKE '%archive%' THEN 3
                WHEN lower(${folders.type}) = 'junk' OR lower(${folders.path}) LIKE '%spam%' OR lower(${folders.path}) LIKE '%junk%' THEN 4
                WHEN lower(${folders.type}) = 'trash' OR lower(${folders.path}) LIKE '%trash%' OR lower(${folders.path}) LIKE '%deleted%' THEN 5
                ELSE 100
            END ASC`,
			sql`CASE
                WHEN (
                    lower(${folders.path}) = 'inbox' OR lower(${folders.type}) = 'inbox'
                    OR lower(${folders.type}) = 'sent' OR lower(${folders.path}) LIKE '%sent%'
                    OR lower(${folders.type}) = 'drafts' OR lower(${folders.path}) LIKE '%draft%'
                    OR lower(${folders.type}) = 'archive' OR lower(${folders.path}) LIKE '%archive%'
                    OR lower(${folders.type}) = 'junk' OR lower(${folders.path}) LIKE '%spam%' OR lower(${folders.path}) LIKE '%junk%'
                    OR lower(${folders.type}) = 'trash' OR lower(${folders.path}) LIKE '%trash%' OR lower(${folders.path}) LIKE '%deleted%'
                ) THEN 0
                ELSE COALESCE(${folders.sortOrder}, 9999)
            END ASC`,
			sql`lower(${folders.name}) ASC`,
			sql`lower(${folders.path}) ASC`,
		)
		.all() as FolderRow[];
}

export function reorderCustomFolders(accountId: number, orderedFolderPaths: string[]): FolderRow[] {
	const db = getDb();
	const rows = db
		.prepare(
			`
            SELECT id, path, type
            FROM folders
            WHERE account_id = ?
        `,
		)
		.all(accountId) as Array<{id: number; path: string; type: string | null}>;

	const customRows = rows.filter((row) => !isSystemFolder(row.path, row.type));
	if (customRows.length <= 1) return listFoldersByAccount(accountId);

	const customPathSet = new Set(customRows.map((r) => r.path));
	const requested = orderedFolderPaths.filter((path) => customPathSet.has(path));
	const requestedSet = new Set(requested);
	const missing = customRows.map((r) => r.path).filter((path) => !requestedSet.has(path));
	const mergedOrder = [...requested, ...missing];

	const tx = db.transaction((paths: string[]) => {
		const stmt = db.prepare('UPDATE folders SET sort_order = ? WHERE account_id = ? AND path = ?');
		paths.forEach((path, index) => {
			stmt.run(index, accountId, path);
		});
	});
	tx(mergedOrder);

	return listFoldersByAccount(accountId);
}

function isSystemFolder(pathRaw: string | null | undefined, typeRaw: string | null | undefined): boolean {
	const path = (pathRaw || '').toLowerCase();
	const type = (typeRaw || '').toLowerCase();
	if (type === 'inbox' || path === 'inbox') return true;
	if (type === 'sent' || path.includes('sent')) return true;
	if (type === 'drafts' || path.includes('draft')) return true;
	if (type === 'archive' || path.includes('archive')) return true;
	if (type === 'junk' || path.includes('spam') || path.includes('junk')) return true;
	if (type === 'trash' || path.includes('trash') || path.includes('deleted')) return true;
	return false;
}

export function listMessagesByFolder(accountId: number, folderPath: string, limit: number = 100): MessageRow[] {
	const db = getDrizzle();
	const folder = db
		.select({id: folders.id})
		.from(folders)
		.where(and(eq(folders.accountId, accountId), eq(folders.path, folderPath)))
		.get();
	if (!folder?.id) return [];

	return db
		.select({
			id: messages.id,
			account_id: messages.accountId,
			folder_id: messages.folderId,
			thread_id: messages.threadId,
			uid: messages.uid,
			seq: messages.seq,
			message_id: messages.messageId,
			in_reply_to: messages.inReplyTo,
			references_text: messages.referencesText,
			subject: messages.subject,
			from_name: messages.fromName,
			from_address: messages.fromAddress,
			to_address: messages.toAddress,
			date: messages.date,
			is_read: messages.isRead,
			is_flagged: messages.isFlagged,
			tag: messages.tag,
			size: messages.size,
		})
		.from(messages)
		.where(and(eq(messages.accountId, accountId), eq(messages.folderId, folder.id)))
		.orderBy(desc(sql`COALESCE(${messages.date}, '')`), desc(messages.id))
		.limit(limit)
		.all() as MessageRow[];
}

export function listThreadMessagesByFolder(
	accountId: number,
	folderPath: string,
	limit: number = 100,
): MessageThreadRow[] {
	const db = getDb();
	const folder = db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(accountId, folderPath) as
		| {
				id: number;
		  }
		| undefined;
	if (!folder?.id) return [];

	// Intentionally raw SQL: this query depends on multi-CTE + window-function ranking for thread collapse.
	// Keeping it in SQL preserves performance and readability better than assembling equivalent Drizzle fragments.
	return db
		.prepare(
			`
            WITH base AS (
                SELECT m.*,
                       CASE
                           WHEN COALESCE(NULLIF(trim(m.thread_id), ''), '') <> ''
                               AND m.thread_id NOT LIKE 'subj:%'
                               THEN m.thread_id
                           WHEN COALESCE(NULLIF(trim(m.in_reply_to), ''), '') <> ''
                               THEN 'mid:' || lower(replace(replace(trim(m.in_reply_to), '<', ''), '>', ''))
                           WHEN COALESCE(NULLIF(trim(m.message_id), ''), '') <> ''
                               THEN 'mid:' || lower(replace(replace(trim(m.message_id), '<', ''), '>', ''))
                           ELSE COALESCE(NULLIF(trim(m.thread_id), ''), printf('message-%d', m.id))
                           END AS thread_group
                FROM messages m
                WHERE m.account_id = ?
                  AND m.folder_id = ?
            ),
                 agg AS (
                     SELECT thread_group,
                            COUNT(*)                                     AS thread_count,
                            SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS thread_unread_count,
                            MAX(COALESCE(date, ''))                      AS thread_latest_date
                     FROM base
                     GROUP BY thread_group
                 ),
                 ranked AS (
                     SELECT b.*,
                            a.thread_count,
                            a.thread_unread_count,
                            a.thread_latest_date,
                            ROW_NUMBER() OVER (
                                PARTITION BY b.thread_group
                                ORDER BY COALESCE(b.date, '') DESC, b.id DESC
                                ) AS rn
                     FROM base b
                              JOIN agg a ON a.thread_group = b.thread_group
                 )
            SELECT id,
                   account_id,
                   folder_id,
                   thread_id,
                   uid,
                   seq,
                   message_id,
                   in_reply_to,
                   references_text,
                   subject,
                   from_name,
                   from_address,
                   to_address,
                   date,
                   is_read,
                   is_flagged,
                   tag,
                   size,
                   thread_count,
                   thread_unread_count,
                   NULLIF(thread_latest_date, '') AS thread_latest_date
            FROM ranked
            WHERE rn = 1
            ORDER BY COALESCE(thread_latest_date, '') DESC, id DESC
            LIMIT ?
        `,
		)
		.all(accountId, folder.id, limit) as MessageThreadRow[];
}

export function getMessageById(messageId: number): MessageRow | null {
	const db = getDb();
	const row = db
		.prepare(
			`
                SELECT *
                FROM messages
                WHERE id = ? LIMIT 1
            `,
		)
		.get(messageId) as MessageRow | undefined;
	return row ?? null;
}

export function searchMessages(
	accountId: number,
	query: string,
	folderPath?: string | null,
	limit: number = 200,
): MessageRow[] {
	const db = getDb();
	const trimmed = (query || '').trim();
	if (!trimmed) return [];

	const normalizedLimit = Math.max(1, Math.min(500, Math.round(Number(limit) || 200)));
	const pattern = `%${trimmed.toLowerCase()}%`;
	const folder = folderPath
		? (db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(accountId, folderPath) as
				| {
						id: number;
				  }
				| undefined)
		: undefined;
	if (folderPath && !folder?.id) return [];

	// Intentionally raw SQL: this flexible search spans message headers + optional body tables with dynamic folder scope.
	// Drizzle would require significantly more branching while producing the same SQL plan.
	const sql = folder?.id
		? `
                SELECT m.*
                FROM messages m
                         LEFT JOIN message_bodies mb ON mb.message_id = m.id
                WHERE m.account_id = ?
                  AND m.folder_id = ?
                  AND (
                    lower(COALESCE(m.from_name, '')) LIKE ?
                        OR lower(COALESCE(m.from_address, '')) LIKE ?
                        OR lower(COALESCE(m.subject, '')) LIKE ?
                        OR lower(COALESCE(mb.text_content, '')) LIKE ?
                        OR lower(COALESCE(mb.html_content, '')) LIKE ?
                    )
                ORDER BY COALESCE(m.date, '') DESC, m.id DESC LIMIT ?
        `
		: `
                SELECT m.*
                FROM messages m
                         LEFT JOIN message_bodies mb ON mb.message_id = m.id
                WHERE m.account_id = ?
                  AND (
                    lower(COALESCE(m.from_name, '')) LIKE ?
                        OR lower(COALESCE(m.from_address, '')) LIKE ?
                        OR lower(COALESCE(m.subject, '')) LIKE ?
                        OR lower(COALESCE(mb.text_content, '')) LIKE ?
                        OR lower(COALESCE(mb.html_content, '')) LIKE ?
                    )
                ORDER BY COALESCE(m.date, '') DESC, m.id DESC LIMIT ?
        `;

	const params = folder?.id
		? [accountId, folder.id, pattern, pattern, pattern, pattern, pattern, normalizedLimit]
		: [accountId, pattern, pattern, pattern, pattern, pattern, normalizedLimit];

	return db.prepare(sql).all(...params) as MessageRow[];
}

export function listRecentRecipients(
	accountId: number,
	query?: string | null,
	limit: number = 20,
): RecentRecipientRow[] {
	const db = getDb();
	const normalizedLimit = Math.max(1, Math.min(100, Math.round(Number(limit) || 20)));
	const rows = db
		.prepare(
			`
            SELECT m.to_address AS toAddress, m.date AS date
            FROM messages m
                     JOIN folders f ON f.id = m.folder_id
            WHERE m.account_id = ?
              AND m.to_address IS NOT NULL
              AND trim(m.to_address) <> ''
              AND (
                lower(COALESCE(f.type, '')) = 'sent'
                    OR lower(COALESCE(f.path, '')) LIKE '%sent%'
                )
            ORDER BY COALESCE(m.date, '') DESC, m.id DESC
            LIMIT 800
        `,
		)
		.all(accountId) as Array<{toAddress: string; date: string | null}>;

	const queryValue = (query || '').trim().toLowerCase();
	const byEmail = new Map<string, {email: string; displayName: string | null; lastUsedAt: string | null}>();

	for (const row of rows) {
		const parsed = parseRecipientHeaderList(row.toAddress || '');
		for (const item of parsed) {
			const email = item.email.toLowerCase();
			if (!email) continue;
			if (queryValue) {
				const haystack = `${item.displayName || ''} ${email}`.toLowerCase();
				if (!haystack.includes(queryValue)) continue;
			}
			const existing = byEmail.get(email);
			if (!existing) {
				byEmail.set(email, {
					email,
					displayName: item.displayName,
					lastUsedAt: row.date ?? null,
				});
				continue;
			}
			const existingDate = Date.parse(existing.lastUsedAt || '');
			const nextDate = Date.parse(row.date || '');
			if (Number.isFinite(nextDate) && (!Number.isFinite(existingDate) || nextDate > existingDate)) {
				existing.lastUsedAt = row.date ?? null;
				if (item.displayName) existing.displayName = item.displayName;
			} else if (!existing.displayName && item.displayName) {
				existing.displayName = item.displayName;
			}
		}
	}

	return Array.from(byEmail.values())
		.sort((a, b) => {
			const ad = Date.parse(a.lastUsedAt || '');
			const bd = Date.parse(b.lastUsedAt || '');
			if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;
			if (Number.isFinite(ad) && !Number.isFinite(bd)) return -1;
			if (!Number.isFinite(ad) && Number.isFinite(bd)) return 1;
			return a.email.localeCompare(b.email);
		})
		.slice(0, normalizedLimit)
		.map((item) => ({
			email: item.email,
			display_name: item.displayName || null,
			last_used_at: item.lastUsedAt ?? null,
		}));
}

export function getTotalUnreadCount(): number {
	const db = getDb();
	const foldersRow = db.prepare('SELECT COALESCE(SUM(unread_count), 0) as unread FROM folders').get() as
		| {
				unread: number;
		  }
		| undefined;
	const messagesRow = db
		.prepare('SELECT COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread FROM messages')
		.get() as
		| {
				unread: number;
		  }
		| undefined;
	const folderUnread = Math.max(0, Number(foldersRow?.unread ?? 0));
	const messageUnread = Math.max(0, Number(messagesRow?.unread ?? 0));
	return Math.max(folderUnread, messageUnread);
}

function parseRecipientHeaderList(value: string): Array<{email: string; displayName: string | null}> {
	const out: Array<{email: string; displayName: string | null}> = [];
	const tokens = value.split(/[;,]+/);
	for (const tokenRaw of tokens) {
		const token = tokenRaw.trim();
		if (!token) continue;
		const angleMatch = token.match(/^(.*)<([^>]+)>$/);
		if (angleMatch) {
			const displayName = normalizeRecipientName(angleMatch[1] || '');
			const email = normalizeRecipientEmail(angleMatch[2] || '');
			if (email) out.push({email, displayName});
			continue;
		}
		const email = normalizeRecipientEmail(token);
		if (email) {
			out.push({email, displayName: null});
		}
	}
	return out;
}

function normalizeRecipientEmail(value: string): string {
	const cleaned = String(value || '')
		.trim()
		.replace(/^<|>$/g, '')
		.toLowerCase();
	if (!cleaned) return '';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return '';
	return cleaned;
}

function normalizeRecipientName(value: string): string | null {
	const cleaned = String(value || '')
		.trim()
		.replace(/^"+|"+$/g, '')
		.replace(/\s+/g, ' ');
	return cleaned || null;
}

export function getMessageBody(messageId: number): MessageBodyRow | null {
	const db = getDb();
	const row = db
		.prepare('SELECT message_id, text_content, html_content FROM message_bodies WHERE message_id = ?')
		.get(messageId) as MessageBodyRow | undefined;
	return row ?? null;
}

export function upsertMessageBody(messageId: number, textContent: string | null, htmlContent: string | null): void {
	const db = getDb();
	db.prepare(
		`
            INSERT INTO message_bodies (message_id, text_content, html_content)
            VALUES (?, ?, ?) ON CONFLICT(message_id) DO
            UPDATE SET
                text_content = excluded.text_content,
                html_content = excluded.html_content
        `,
	).run(messageId, textContent, htmlContent);
}

export function replaceMessageAttachments(
	messageId: number,
	attachments: Array<{filename?: string | null; contentType?: string | null; size?: number | null}>,
): void {
	const db = getDb();
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM attachments WHERE message_id = ?').run(messageId);
		const insert = db.prepare(
			`
                INSERT INTO attachments (message_id, filename, content_type, size, content)
                VALUES (?, ?, ?, ?, NULL)
            `,
		);
		for (const attachment of attachments) {
			insert.run(messageId, attachment.filename ?? null, attachment.contentType ?? null, attachment.size ?? null);
		}
	});
	tx();
}

export function listMessageAttachments(messageId: number): MessageAttachmentRow[] {
	const db = getDb();
	return db
		.prepare(
			`
                SELECT id, message_id, filename, content_type, size
                FROM attachments
                WHERE message_id = ?
                ORDER BY id ASC
            `,
		)
		.all(messageId) as MessageAttachmentRow[];
}

export function getMessageContext(messageId: number): MessageContextRow | null {
	const db = getDb();
	const row = db
		.prepare(
			`
            SELECT m.id         AS messageId,
                   m.account_id AS accountId,
                   f.id         AS folderId,
                   f.path       AS folderPath,
                   m.uid        AS uid
            FROM messages m
                     JOIN folders f ON f.id = m.folder_id
            WHERE m.id = ?
        `,
		)
		.get(messageId) as MessageContextRow | undefined;
	return row ?? null;
}

export function upsertLocalDraftSnapshot(input: UpsertLocalDraftSnapshotInput): number | null {
	const db = getDb();
	const targetDate = input.dateIso ?? new Date().toISOString();
	const targetSubject = input.subject ?? null;
	const targetFromAddress = input.fromAddress ?? null;
	const targetToAddress = input.toAddress ?? null;
	const targetMessageId = input.messageId ?? null;
	const targetInReplyTo = input.inReplyTo ?? null;
	const targetReferencesText = input.referencesText ?? null;
	const attachmentRows = input.attachments ?? [];
	const localDraftContext =
		typeof input.draftMessageId === 'number' && Number.isFinite(input.draftMessageId)
			? getMessageContext(Math.floor(input.draftMessageId))
			: null;
	const targetFolder =
		localDraftContext && localDraftContext.accountId === input.accountId
			? {
					id: localDraftContext.folderId,
					path: localDraftContext.folderPath,
				}
			: listFoldersByAccount(input.accountId).find((folder) => {
					const type = String(folder.type || '').toLowerCase();
					const path = String(folder.path || '').toLowerCase();
					return type === 'drafts' || path.includes('draft');
				});
	if (!targetFolder) return null;

	if (localDraftContext && localDraftContext.accountId === input.accountId) {
		db.prepare(
			`
                UPDATE messages
                SET message_id = ?,
                    in_reply_to = ?,
                    references_text = ?,
                    subject = ?,
                    from_address = ?,
                    to_address = ?,
                    date = ?,
                    is_read = 1
                WHERE id = ?
            `,
		).run(
			targetMessageId,
			targetInReplyTo,
			targetReferencesText,
			targetSubject,
			targetFromAddress,
			targetToAddress,
			targetDate,
			localDraftContext.messageId,
		);
		upsertMessageBody(localDraftContext.messageId, input.textContent ?? null, input.htmlContent ?? null);
		replaceMessageAttachments(localDraftContext.messageId, attachmentRows);
		const unreadRow = db
			.prepare('SELECT count(*) as c FROM messages WHERE folder_id = ? AND is_read = 0')
			.get(targetFolder.id) as {c: number} | undefined;
		const totalRow = db.prepare('SELECT count(*) as c FROM messages WHERE folder_id = ?').get(targetFolder.id) as
			| {c: number}
			| undefined;
		db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?').run(
			unreadRow?.c ?? 0,
			totalRow?.c ?? 0,
			targetFolder.id,
		);
		return localDraftContext.messageId;
	}

	const minUidRow = db.prepare('SELECT MIN(uid) as minUid FROM messages WHERE folder_id = ?').get(targetFolder.id) as
		| {minUid?: number | null}
		| undefined;
	const minUid = Number(minUidRow?.minUid ?? 0);
	const nextTempUid = Number.isFinite(minUid) && minUid <= 0 ? Math.floor(minUid) - 1 : -1;
	upsertMessage({
		accountId: input.accountId,
		folderId: targetFolder.id,
		uid: nextTempUid,
		seq: 0,
		messageId: targetMessageId,
		inReplyTo: targetInReplyTo,
		referencesText: targetReferencesText,
		subject: targetSubject,
		fromAddress: targetFromAddress,
		toAddress: targetToAddress,
		date: targetDate,
		isRead: 1,
		isFlagged: 0,
		size: null,
	});
	const newMessageId = getMessageIdByFolderAndUid(targetFolder.id, nextTempUid);
	if (!newMessageId) return null;
	upsertMessageBody(newMessageId, input.textContent ?? null, input.htmlContent ?? null);
	replaceMessageAttachments(newMessageId, attachmentRows);
	const unreadRow = db
		.prepare('SELECT count(*) as c FROM messages WHERE folder_id = ? AND is_read = 0')
		.get(targetFolder.id) as {c: number} | undefined;
	const totalRow = db.prepare('SELECT count(*) as c FROM messages WHERE folder_id = ?').get(targetFolder.id) as
		| {c: number}
		| undefined;
	db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?').run(
		unreadRow?.c ?? 0,
		totalRow?.c ?? 0,
		targetFolder.id,
	);
	return newMessageId;
}

export function setMessageRead(messageId: number, isRead: number): SetMessageReadResult {
	const db = getDrizzle();
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	db.update(messages)
		.set({isRead: isRead ? 1 : 0})
		.where(eq(messages.id, messageId))
		.run();

	const unreadRow = db
		.select({c: sql<number>`count(*)`})
		.from(messages)
		.where(and(eq(messages.folderId, ctx.folderId), eq(messages.isRead, 0)))
		.get();
	const totalRow = db
		.select({c: sql<number>`count(*)`})
		.from(messages)
		.where(eq(messages.folderId, ctx.folderId))
		.get();

	const unreadCount = unreadRow?.c ?? 0;
	const totalCount = totalRow?.c ?? 0;
	db.update(folders).set({unreadCount, totalCount}).where(eq(folders.id, ctx.folderId)).run();

	return {
		messageId,
		accountId: ctx.accountId,
		folderId: ctx.folderId,
		folderPath: ctx.folderPath,
		unreadCount,
		totalCount,
		isRead: isRead ? 1 : 0,
	};
}

export function setMessageFlagged(messageId: number, isFlagged: number): SetMessageFlagResult {
	const db = getDrizzle();
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	db.update(messages)
		.set({isFlagged: isFlagged ? 1 : 0})
		.where(eq(messages.id, messageId))
		.run();
	return {
		messageId,
		accountId: ctx.accountId,
		folderId: ctx.folderId,
		folderPath: ctx.folderPath,
		isFlagged: isFlagged ? 1 : 0,
	};
}

export function setMessageTag(messageId: number, tag: string | null): SetMessageTagResult {
	const db = getDrizzle();
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	const normalized = String(tag || '').trim();
	db.update(messages)
		.set({tag: normalized.length ? normalized : null})
		.where(eq(messages.id, messageId))
		.run();
	return {
		messageId,
		accountId: ctx.accountId,
		folderId: ctx.folderId,
		folderPath: ctx.folderPath,
		tag: normalized.length ? normalized : null,
	};
}

export function moveMessageToFolder(messageId: number, targetFolderPath: string, nextUid?: number): MoveMessageResult {
	const db = getDrizzle();
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);
	if (!targetFolderPath) throw new Error('Target folder path is required');
	if (ctx.folderPath === targetFolderPath) {
		const sourceUnread = db
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(and(eq(messages.folderId, ctx.folderId), eq(messages.isRead, 0)))
			.get();
		const sourceTotal = db
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(eq(messages.folderId, ctx.folderId))
			.get();
		return {
			messageId,
			accountId: ctx.accountId,
			sourceFolderId: ctx.folderId,
			sourceFolderPath: ctx.folderPath,
			targetFolderId: ctx.folderId,
			targetFolderPath: ctx.folderPath,
			uid: ctx.uid,
			sourceUnreadCount: sourceUnread?.c ?? 0,
			sourceTotalCount: sourceTotal?.c ?? 0,
			targetUnreadCount: sourceUnread?.c ?? 0,
			targetTotalCount: sourceTotal?.c ?? 0,
		};
	}

	const targetFolder = db
		.select({id: folders.id})
		.from(folders)
		.where(and(eq(folders.accountId, ctx.accountId), eq(folders.path, targetFolderPath)))
		.get();
	if (!targetFolder?.id) throw new Error(`Target folder ${targetFolderPath} not found`);

	const current = db.select({uid: messages.uid}).from(messages).where(eq(messages.id, messageId)).get();
	if (!current) throw new Error(`Message ${messageId} not found`);
	const requestedUid = typeof nextUid === 'number' && Number.isFinite(nextUid) ? nextUid : current.uid;

	return db.transaction((trx) => {
		let uidToStore = requestedUid;
		const conflict = trx
			.select({id: messages.id})
			.from(messages)
			.where(
				and(eq(messages.folderId, targetFolder.id), eq(messages.uid, uidToStore), ne(messages.id, messageId)),
			)
			.limit(1)
			.get();
		if (conflict?.id) {
			// Keep local operations resilient when target folder already has this UID.
			const maxUidRow = trx
				.select({maxUid: sql<number | null>`max(${messages.uid})`})
				.from(messages)
				.where(eq(messages.folderId, targetFolder.id))
				.get();
			const maxUid = Number(maxUidRow?.maxUid ?? 0);
			uidToStore = Math.max(uidToStore, maxUid + 1);
		}

		trx.update(messages).set({folderId: targetFolder.id, uid: uidToStore}).where(eq(messages.id, messageId)).run();

		const sourceUnread = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(and(eq(messages.folderId, ctx.folderId), eq(messages.isRead, 0)))
			.get();
		const sourceTotal = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(eq(messages.folderId, ctx.folderId))
			.get();
		const targetUnread = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(and(eq(messages.folderId, targetFolder.id), eq(messages.isRead, 0)))
			.get();
		const targetTotal = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(eq(messages.folderId, targetFolder.id))
			.get();

		trx.update(folders)
			.set({
				unreadCount: sourceUnread?.c ?? 0,
				totalCount: sourceTotal?.c ?? 0,
			})
			.where(eq(folders.id, ctx.folderId))
			.run();
		trx.update(folders)
			.set({
				unreadCount: targetUnread?.c ?? 0,
				totalCount: targetTotal?.c ?? 0,
			})
			.where(eq(folders.id, targetFolder.id))
			.run();

		return {
			messageId,
			accountId: ctx.accountId,
			sourceFolderId: ctx.folderId,
			sourceFolderPath: ctx.folderPath,
			targetFolderId: targetFolder.id,
			targetFolderPath,
			uid: uidToStore,
			sourceUnreadCount: sourceUnread?.c ?? 0,
			sourceTotalCount: sourceTotal?.c ?? 0,
			targetUnreadCount: targetUnread?.c ?? 0,
			targetTotalCount: targetTotal?.c ?? 0,
		} satisfies MoveMessageResult;
	});
}

export function deleteMessageLocally(messageId: number): {accountId: number} {
	const db = getDrizzle();
	const ctx = getMessageContext(messageId);
	if (!ctx) throw new Error(`Message ${messageId} not found`);

	const accountFolders = listFoldersByAccount(ctx.accountId);
	const trash =
		accountFolders.find((f) => (f.type ?? '').toLowerCase() === 'trash') ??
		accountFolders.find((f) => /trash|deleted/i.test(f.path));

	if (trash && trash.path !== ctx.folderPath) {
		moveMessageToFolder(messageId, trash.path);
		return {accountId: ctx.accountId};
	}

	db.transaction((trx) => {
		trx.delete(messages).where(eq(messages.id, messageId)).run();

		const sourceUnread = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(and(eq(messages.folderId, ctx.folderId), eq(messages.isRead, 0)))
			.get();
		const sourceTotal = trx
			.select({c: sql<number>`count(*)`})
			.from(messages)
			.where(eq(messages.folderId, ctx.folderId))
			.get();
		trx.update(folders)
			.set({
				unreadCount: sourceUnread?.c ?? 0,
				totalCount: sourceTotal?.c ?? 0,
			})
			.where(eq(folders.id, ctx.folderId))
			.run();
	});

	return {accountId: ctx.accountId};
}
