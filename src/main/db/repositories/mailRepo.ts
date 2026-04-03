import {getDb} from '../drizzle.js';

export interface FolderRow {
    id: number;
    account_id: number;
    name: string;
    custom_name: string | null;
    color: string | null;
    path: string;
    type: string | null;
    unread_count: number;
    total_count: number;
}

export interface MessageRow {
    id: number;
    account_id: number;
    folder_id: number;
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
    size: number | null;
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

export interface MessageContextRow {
    messageId: number;
    accountId: number;
    folderPath: string;
    folderId: number;
    uid: number;
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
    ).run(
        input.accountId,
        input.name,
        input.path,
        input.type ?? null,
        input.unreadCount ?? 0,
        input.totalCount ?? 0,
    );

    const row = db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(input.accountId, input.path) as {
        id: number
    };
    return row.id;
}

export function updateFolderCounts(accountId: number, path: string, unreadCount: number, totalCount: number): void {
    const db = getDb();
    db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE account_id = ? AND path = ?')
        .run(unreadCount, totalCount, accountId, path);
}

export function updateFolderSettings(input: UpdateFolderSettingsInput): FolderRow {
    const db = getDb();
    const row = db
        .prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?')
        .get(input.accountId, input.folderPath) as { id: number } | undefined;
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

export function deleteFolderByPath(accountId: number, folderPath: string): {
    accountId: number;
    folderPath: string;
    removed: boolean
} {
    const db = getDb();
    const result = db
        .prepare('DELETE FROM folders WHERE account_id = ? AND path = ?')
        .run(accountId, folderPath);
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
                                  subject, from_name, from_address, to_address, date, is_read, is_flagged, size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(folder_id, uid) DO
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
        input.size ?? null,
    );
}

export function hasMessageByFolderAndUid(folderId: number, uid: number): boolean {
    const db = getDb();
    const row = db.prepare('SELECT 1 as ok FROM messages WHERE folder_id = ? AND uid = ? LIMIT 1').get(folderId, uid) as {
        ok: number
    } | undefined;
    return Boolean(row?.ok);
}

export function getMessageIdByFolderAndUid(folderId: number, uid: number): number | null {
    const db = getDb();
    const row = db.prepare('SELECT id FROM messages WHERE folder_id = ? AND uid = ? LIMIT 1').get(folderId, uid) as {
        id: number
    } | undefined;
    return row?.id ?? null;
}

export function listFoldersByAccount(accountId: number): FolderRow[] {
    const db = getDb();
    return db.prepare(
        `
            SELECT *
            FROM folders
            WHERE account_id = ?
            ORDER BY CASE
                         WHEN lower(path) = 'inbox' OR lower(type) = 'inbox' THEN 0
                         WHEN lower(type) = 'sent' OR lower(path) LIKE '%sent%' THEN 1
                         WHEN lower(type) = 'drafts' OR lower(path) LIKE '%draft%' THEN 2
                         WHEN lower(type) = 'archive' OR lower(path) LIKE '%archive%' THEN 3
                         WHEN lower(type) = 'junk' OR lower(path) LIKE '%spam%' OR lower(path) LIKE '%junk%' THEN 4
                         WHEN lower(type) = 'trash' OR lower(path) LIKE '%trash%' OR lower(path) LIKE '%deleted%' THEN 5
                         ELSE 100
                         END ASC,
                     lower(name) ASC,
                     lower(path) ASC
        `,
    ).all(accountId) as FolderRow[];
}

export function listMessagesByFolder(accountId: number, folderPath: string, limit: number = 100): MessageRow[] {
    const db = getDb();
    const folder = db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(accountId, folderPath) as {
        id: number
    } | undefined;
    if (!folder?.id) return [];

    return db.prepare(
        `
            SELECT *
            FROM messages
            WHERE account_id = ?
              AND folder_id = ?
            ORDER BY COALESCE(date, '') DESC, id DESC LIMIT ?
        `,
    ).all(accountId, folder.id, limit) as MessageRow[];
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

export function searchMessages(accountId: number, query: string, folderPath?: string | null, limit: number = 200): MessageRow[] {
    const db = getDb();
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const normalizedLimit = Math.max(1, Math.min(500, Math.round(Number(limit) || 200)));
    const pattern = `%${trimmed.toLowerCase()}%`;
    const folder = folderPath
        ? (db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(accountId, folderPath) as {
            id: number
        } | undefined)
        : undefined;
    if (folderPath && !folder?.id) return [];

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

export function getTotalUnreadCount(): number {
    const db = getDb();
    const row = db.prepare('SELECT COALESCE(SUM(unread_count), 0) as unread FROM folders').get() as {
        unread: number
    } | undefined;
    return Number(row?.unread ?? 0);
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
    attachments: Array<{ filename?: string | null; contentType?: string | null; size?: number | null }>,
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
            insert.run(
                messageId,
                attachment.filename ?? null,
                attachment.contentType ?? null,
                attachment.size ?? null,
            );
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
    const row = db.prepare(
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
    ).get(messageId) as MessageContextRow | undefined;
    return row ?? null;
}

export function setMessageRead(messageId: number, isRead: number): SetMessageReadResult {
    const db = getDb();
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);

    db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, messageId);

    const unreadRow = db
        .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ? AND is_read = 0')
        .get(ctx.folderId) as { c: number };
    const totalRow = db
        .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ?')
        .get(ctx.folderId) as { c: number };

    const unreadCount = unreadRow?.c ?? 0;
    const totalCount = totalRow?.c ?? 0;
    db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?')
        .run(unreadCount, totalCount, ctx.folderId);

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
    const db = getDb();
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);

    db.prepare('UPDATE messages SET is_flagged = ? WHERE id = ?').run(isFlagged ? 1 : 0, messageId);
    return {
        messageId,
        accountId: ctx.accountId,
        folderId: ctx.folderId,
        folderPath: ctx.folderPath,
        isFlagged: isFlagged ? 1 : 0,
    };
}

export function moveMessageToFolder(messageId: number, targetFolderPath: string, nextUid?: number): MoveMessageResult {
    const db = getDb();
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);
    if (!targetFolderPath) throw new Error('Target folder path is required');
    if (ctx.folderPath === targetFolderPath) {
        const sourceUnread = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ? AND is_read = 0')
            .get(ctx.folderId) as { c: number };
        const sourceTotal = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ?')
            .get(ctx.folderId) as { c: number };
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
        .prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?')
        .get(ctx.accountId, targetFolderPath) as { id: number } | undefined;
    if (!targetFolder?.id) throw new Error(`Target folder ${targetFolderPath} not found`);

    const current = db.prepare('SELECT uid FROM messages WHERE id = ?').get(messageId) as { uid: number } | undefined;
    if (!current) throw new Error(`Message ${messageId} not found`);
    const uidToStore = typeof nextUid === 'number' && Number.isFinite(nextUid) ? nextUid : current.uid;

    const tx = db.transaction(() => {
        db.prepare('UPDATE messages SET folder_id = ?, uid = ? WHERE id = ?')
            .run(targetFolder.id, uidToStore, messageId);

        const sourceUnread = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ? AND is_read = 0')
            .get(ctx.folderId) as { c: number };
        const sourceTotal = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ?')
            .get(ctx.folderId) as { c: number };
        const targetUnread = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ? AND is_read = 0')
            .get(targetFolder.id) as { c: number };
        const targetTotal = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ?')
            .get(targetFolder.id) as { c: number };

        db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?')
            .run(sourceUnread?.c ?? 0, sourceTotal?.c ?? 0, ctx.folderId);
        db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?')
            .run(targetUnread?.c ?? 0, targetTotal?.c ?? 0, targetFolder.id);

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

    return tx();
}

export function deleteMessageLocally(messageId: number): { accountId: number } {
    const db = getDb();
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);

    const folders = listFoldersByAccount(ctx.accountId);
    const trash = folders.find((f) => (f.type ?? '').toLowerCase() === 'trash')
        ?? folders.find((f) => /trash|deleted/i.test(f.path));

    if (trash && trash.path !== ctx.folderPath) {
        moveMessageToFolder(messageId, trash.path);
        return {accountId: ctx.accountId};
    }

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

        const sourceUnread = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ? AND is_read = 0')
            .get(ctx.folderId) as { c: number };
        const sourceTotal = db
            .prepare('SELECT COUNT(*) AS c FROM messages WHERE folder_id = ?')
            .get(ctx.folderId) as { c: number };
        db.prepare('UPDATE folders SET unread_count = ?, total_count = ? WHERE id = ?')
            .run(sourceUnread?.c ?? 0, sourceTotal?.c ?? 0, ctx.folderId);
    });
    tx();

    return {accountId: ctx.accountId};
}
