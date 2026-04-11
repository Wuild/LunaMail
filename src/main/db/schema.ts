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

export const cloudAccounts = sqliteTable('cloud_accounts', {
    id: integer('id').primaryKey({autoIncrement: true}),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url'),
    user: text('user'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const folders = sqliteTable('folders', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    name: text('name').notNull(),
    customName: text('custom_name'),
    color: text('color'),
    sortOrder: integer('sort_order'),
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
    tag: text('tag'),
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

export const accountDavSettings = sqliteTable('account_dav_settings', {
    accountId: integer('account_id').primaryKey(),
    carddavUrl: text('carddav_url'),
    caldavUrl: text('caldav_url'),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const contacts = sqliteTable('contacts', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    addressBookId: integer('address_book_id'),
    source: text('source').notNull(),
    sourceUid: text('source_uid').notNull(),
    fullName: text('full_name'),
    email: text('email').notNull(),
    phone: text('phone'),
    organization: text('organization'),
    title: text('title'),
    note: text('note'),
    etag: text('etag'),
    lastSeenSync: text('last_seen_sync').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const addressBooks = sqliteTable('address_books', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    name: text('name').notNull(),
    source: text('source').notNull().default('local'),
    remoteUrl: text('remote_url'),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const calendarEvents = sqliteTable('calendar_events', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    source: text('source').notNull(),
    calendarUrl: text('calendar_url').notNull(),
    uid: text('uid').notNull(),
    summary: text('summary'),
    description: text('description'),
    location: text('location'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    etag: text('etag'),
    rawIcs: text('raw_ics'),
    lastSeenSync: text('last_seen_sync').notNull(),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const mailFilters = sqliteTable('mail_filters', {
    id: integer('id').primaryKey({autoIncrement: true}),
    accountId: integer('account_id').notNull(),
    name: text('name').notNull(),
    enabled: integer('enabled').notNull().default(1),
    runOnIncoming: integer('run_on_incoming').notNull().default(1),
    matchMode: text('match_mode').notNull().default('all'),
    stopProcessing: integer('stop_processing').notNull().default(1),
    createdAt: text('created_at').default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: text('updated_at').default('CURRENT_TIMESTAMP').notNull(),
});

export const mailFilterConditions = sqliteTable('mail_filter_conditions', {
    id: integer('id').primaryKey({autoIncrement: true}),
    filterId: integer('filter_id').notNull(),
    field: text('field').notNull(),
    operator: text('operator').notNull(),
    value: text('value').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
});

export const mailFilterActions = sqliteTable('mail_filter_actions', {
    id: integer('id').primaryKey({autoIncrement: true}),
    filterId: integer('filter_id').notNull(),
    type: text('type').notNull(),
    value: text('value').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
});

export type AccountRow = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
export type CloudAccountRow = typeof cloudAccounts.$inferSelect;
export type InsertCloudAccount = typeof cloudAccounts.$inferInsert;
