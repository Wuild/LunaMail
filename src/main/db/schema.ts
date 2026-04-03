import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
    id: integer('id').primaryKey({autoIncrement: true}),
    email: text('email').notNull().unique(),
    provider: text('provider'),
    displayName: text('display_name'),
    replyTo: text('reply_to'),
    organization: text('organization'),
    signatureText: text('signature_text'),
    signatureIsHtml: integer('signature_is_html').default(0).notNull(),
    signatureFilePath: text('signature_file_path'),
    attachVcard: integer('attach_vcard').default(0).notNull(),
    imapHost: text('imap_host').notNull(),
    imapPort: integer('imap_port').notNull(),
    imapSecure: integer('imap_secure').default(1).notNull(),
    pop3Host: text('pop3_host'),
    pop3Port: integer('pop3_port'),
    pop3Secure: integer('pop3_secure').default(1),
    smtpHost: text('smtp_host').notNull(),
    smtpPort: integer('smtp_port').notNull(),
    smtpSecure: integer('smtp_secure').default(1).notNull(),
    user: text('user').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const folders = sqliteTable('folders', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    name: text('name').notNull(),
    customName: text('custom_name'),
    color: text('color'),
    path: text('path').notNull(),
    type: text('type'),
    unreadCount: integer('unread_count').default(0).notNull(),
    totalCount: integer('total_count').default(0).notNull(),
});

export const threads = sqliteTable('threads', {
    id: text('id').primaryKey(),
    subject: text('subject'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const messages = sqliteTable('messages', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    folderId: integer('folder_id').notNull(),
    threadId: text('thread_id'),
    uid: integer('uid').notNull(),
    seq: integer('seq').notNull(),
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    referencesText: text('references_text'),
    subject: text('subject'),
    fromName: text('from_name'),
    fromAddress: text('from_address'),
    toAddress: text('to_address'),
    date: text('date'),
    isRead: integer('is_read').default(0).notNull(),
    isFlagged: integer('is_flagged').default(0).notNull(),
    size: integer('size'),
});

export const messageBodies = sqliteTable('message_bodies', {
    messageId: integer('message_id').primaryKey(),
    textContent: text('text_content'),
    htmlContent: text('html_content'),
});

export const attachments = sqliteTable('attachments', {
    id: integer('id').primaryKey({autoIncrement: true}),
    messageId: integer('message_id').notNull(),
    filename: text('filename'),
    contentType: text('content_type'),
    size: integer('size'),
    content: text('content'),
});

export type AccountRow = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
