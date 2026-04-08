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
--> statement-breakpoint

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
    sort_order
    INTEGER,
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
--> statement-breakpoint

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
--> statement-breakpoint

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
    tag
    TEXT,
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
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS cloud_accounts
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    provider
    TEXT
    NOT
    NULL,
    name
    TEXT
    NOT
    NULL,
    base_url
    TEXT,
    user
    TEXT,
    created_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS account_dav_settings
(
    account_id
    INTEGER
    PRIMARY
    KEY,
    carddav_url
    TEXT,
    caldav_url
    TEXT,
    updated_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    FOREIGN
    KEY
(
    account_id
) REFERENCES accounts
(
    id
) ON DELETE CASCADE
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS contacts
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
    address_book_id
    INTEGER,
    source
    TEXT
    NOT
    NULL
    DEFAULT
    'carddav',
    source_uid
    TEXT
    NOT
    NULL,
    full_name
    TEXT,
    email
    TEXT
    NOT
    NULL,
    phone
    TEXT,
    organization
    TEXT,
    title
    TEXT,
    note
    TEXT,
    etag
    TEXT,
    last_seen_sync
    TEXT
    NOT
    NULL,
    created_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    updated_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
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
    source,
    source_uid,
    email
)
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS address_books
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
    source
    TEXT
    NOT
    NULL
    DEFAULT
    'local',
    remote_url
    TEXT,
    created_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    updated_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    UNIQUE
(
    account_id,
    source,
    name
)
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS calendar_events
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
    source
    TEXT
    NOT
    NULL
    DEFAULT
    'caldav',
    calendar_url
    TEXT
    NOT
    NULL,
    uid
    TEXT
    NOT
    NULL,
    summary
    TEXT,
    description
    TEXT,
    location
    TEXT,
    starts_at
    TEXT,
    ends_at
    TEXT,
    etag
    TEXT,
    raw_ics
    TEXT,
    last_seen_sync
    TEXT
    NOT
    NULL,
    created_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    updated_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
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
    source,
    calendar_url,
    uid
)
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS mail_filters
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
    enabled
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    run_on_incoming
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    match_mode
    TEXT
    NOT
    NULL
    DEFAULT
    'all',
    stop_processing
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    created_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    updated_at
    DATETIME
    DEFAULT
    CURRENT_TIMESTAMP,
    FOREIGN
    KEY
(
    account_id
) REFERENCES accounts
(
    id
) ON DELETE CASCADE
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS mail_filter_conditions
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    filter_id
    INTEGER
    NOT
    NULL,
    field
    TEXT
    NOT
    NULL,
    operator
    TEXT
    NOT
    NULL,
    value
    TEXT
    NOT
    NULL
    DEFAULT
    '',
    sort_order
    INTEGER
    NOT
    NULL
    DEFAULT
    0,
    FOREIGN
    KEY
(
    filter_id
) REFERENCES mail_filters
(
    id
) ON DELETE CASCADE
    );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS mail_filter_actions
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    filter_id
    INTEGER
    NOT
    NULL,
    type
    TEXT
    NOT
    NULL,
    value
    TEXT
    NOT
    NULL
    DEFAULT
    '',
    sort_order
    INTEGER
    NOT
    NULL
    DEFAULT
    0,
    FOREIGN
    KEY
(
    filter_id
) REFERENCES mail_filters
(
    id
) ON DELETE CASCADE
    );
