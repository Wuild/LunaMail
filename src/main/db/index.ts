import Database from 'better-sqlite3';
import path from 'path';
import {app} from 'electron';

export const dbPath = path.join(app.getPath('userData'), 'lunamail.db');
export const db = new Database(dbPath);

export function initDb(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS accounts
        (
            id
            INTEGER
            PRIMARY
            KEY
            AUTOINCREMENT,
            email
            TEXT
            UNIQUE
            NOT
            NULL,
            provider
            TEXT,
            display_name
            TEXT,
            reply_to
            TEXT,
            organization
            TEXT,
            signature_text
            TEXT,
            signature_is_html
            INTEGER
            DEFAULT
            0,
            signature_file_path
            TEXT,
            attach_vcard
            INTEGER
            DEFAULT
            0,
            imap_host
            TEXT
            NOT
            NULL,
            imap_port
            INTEGER
            NOT
            NULL,
            imap_secure
            INTEGER
            DEFAULT
            1,
            pop3_host
            TEXT,
            pop3_port
            INTEGER,
            pop3_secure
            INTEGER
            DEFAULT
            1,
            smtp_host
            TEXT
            NOT
            NULL,
            smtp_port
            INTEGER
            NOT
            NULL,
            smtp_secure
            INTEGER
            DEFAULT
            1,
            user
            TEXT
            NOT
            NULL,
            created_at
            DATETIME
            DEFAULT
            CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS folders
        (
            id
            INTEGER
            PRIMARY
            KEY
            AUTOINCREMENT,
            account_id
            INTEGER
            NOT
            NULL,
            name
            TEXT
            NOT
            NULL,
            custom_name
            TEXT,
            color
            TEXT,
            path
            TEXT
            NOT
            NULL,
            type
            TEXT,
            unread_count
            INTEGER
            DEFAULT
            0,
            total_count
            INTEGER
            DEFAULT
            0,
            FOREIGN
            KEY
        (
            account_id
        ) REFERENCES accounts
        (
            id
        ) ON DELETE CASCADE,
            UNIQUE
        (
            account_id,
            path
        )
            );

        CREATE TABLE IF NOT EXISTS threads
        (
            id
            TEXT
            PRIMARY
            KEY,
            subject
            TEXT,
            updated_at
            DATETIME
            DEFAULT
            CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages
        (
            id
            INTEGER
            PRIMARY
            KEY
            AUTOINCREMENT,
            account_id
            INTEGER
            NOT
            NULL,
            folder_id
            INTEGER
            NOT
            NULL,
            thread_id
            TEXT,
            uid
            INTEGER
            NOT
            NULL,
            seq
            INTEGER
            NOT
            NULL,
            message_id
            TEXT,
            in_reply_to
            TEXT,
            references_text
            TEXT,
            subject
            TEXT,
            from_name
            TEXT,
            from_address
            TEXT,
            to_address
            TEXT,
            date
            DATETIME,
            is_read
            INTEGER
            DEFAULT
            0,
            is_flagged
            INTEGER
            DEFAULT
            0,
            size
            INTEGER,
            FOREIGN
            KEY
        (
            account_id
        ) REFERENCES accounts
        (
            id
        ) ON DELETE CASCADE,
            FOREIGN KEY
        (
            folder_id
        ) REFERENCES folders
        (
            id
        )
          ON DELETE CASCADE,
            FOREIGN KEY
        (
            thread_id
        ) REFERENCES threads
        (
            id
        )
          ON DELETE SET NULL,
            UNIQUE
        (
            folder_id,
            uid
        )
            );

        CREATE TABLE IF NOT EXISTS message_bodies
        (
            message_id
            INTEGER
            PRIMARY
            KEY,
            text_content
            TEXT,
            html_content
            TEXT,
            FOREIGN
            KEY
        (
            message_id
        ) REFERENCES messages
        (
            id
        ) ON DELETE CASCADE
            );

        CREATE TABLE IF NOT EXISTS attachments
        (
            id
            INTEGER
            PRIMARY
            KEY
            AUTOINCREMENT,
            message_id
            INTEGER
            NOT
            NULL,
            filename
            TEXT,
            content_type
            TEXT,
            size
            INTEGER,
            content
            BLOB,
            FOREIGN
            KEY
        (
            message_id
        ) REFERENCES messages
        (
            id
        ) ON DELETE CASCADE
            );
    `);

    // Ensure POP3 columns exist for older DBs created before POP3 support
    const cols = db.prepare("PRAGMA table_info('accounts')").all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('pop3_host')) {
        db.exec("ALTER TABLE accounts ADD COLUMN pop3_host TEXT");
    }
    if (!names.has('pop3_port')) {
        db.exec("ALTER TABLE accounts ADD COLUMN pop3_port INTEGER");
    }
    if (!names.has('pop3_secure')) {
        db.exec("ALTER TABLE accounts ADD COLUMN pop3_secure INTEGER DEFAULT 1");
    }
    if (!names.has('display_name')) {
        db.exec("ALTER TABLE accounts ADD COLUMN display_name TEXT");
    }
    if (!names.has('reply_to')) {
        db.exec("ALTER TABLE accounts ADD COLUMN reply_to TEXT");
    }
    if (!names.has('organization')) {
        db.exec("ALTER TABLE accounts ADD COLUMN organization TEXT");
    }
    if (!names.has('signature_text')) {
        db.exec("ALTER TABLE accounts ADD COLUMN signature_text TEXT");
    }
    if (!names.has('signature_is_html')) {
        db.exec("ALTER TABLE accounts ADD COLUMN signature_is_html INTEGER DEFAULT 0");
    }
    if (!names.has('signature_file_path')) {
        db.exec("ALTER TABLE accounts ADD COLUMN signature_file_path TEXT");
    }
    if (!names.has('attach_vcard')) {
        db.exec("ALTER TABLE accounts ADD COLUMN attach_vcard INTEGER DEFAULT 0");
    }

    // Ensure folder customization columns exist for older DBs
    const folderCols = db.prepare("PRAGMA table_info('folders')").all() as { name: string }[];
    const folderNames = new Set(folderCols.map((c) => c.name));
    if (!folderNames.has('custom_name')) {
        db.exec("ALTER TABLE folders ADD COLUMN custom_name TEXT");
    }
    if (!folderNames.has('color')) {
        db.exec("ALTER TABLE folders ADD COLUMN color TEXT");
    }
}
