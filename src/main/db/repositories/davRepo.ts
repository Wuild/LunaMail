import {getDb} from '../drizzle.js';
import {randomUUID} from 'node:crypto';

export interface ContactRow {
    id: number;
    account_id: number;
    address_book_id: number | null;
    source: string;
    source_uid: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    organization: string | null;
    title: string | null;
    note: string | null;
    etag: string | null;
    last_seen_sync: string;
    created_at: string;
    updated_at: string;
}

export interface AddressBookRow {
    id: number;
    account_id: number;
    name: string;
    source: string;
    remote_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface CalendarEventRow {
    id: number;
    account_id: number;
    source: string;
    calendar_url: string;
    uid: string;
    summary: string | null;
    description: string | null;
    location: string | null;
    starts_at: string | null;
    ends_at: string | null;
    etag: string | null;
    raw_ics: string | null;
    last_seen_sync: string;
    created_at: string;
    updated_at: string;
}

export interface DavSettingsRow {
    account_id: number;
    carddav_url: string | null;
    caldav_url: string | null;
    updated_at: string;
}

export function getDavSettings(accountId: number): DavSettingsRow | null {
    const db = getDb();
    const row = db
        .prepare('SELECT * FROM account_dav_settings WHERE account_id = ?')
        .get(accountId) as DavSettingsRow | undefined;
    return row ?? null;
}

export function upsertDavSettings(accountId: number, carddavUrl?: string | null, caldavUrl?: string | null): DavSettingsRow {
    const db = getDb();
    db.prepare(
        `
            INSERT INTO account_dav_settings (account_id, carddav_url, caldav_url, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(account_id) DO
            UPDATE SET carddav_url = COALESCE(excluded.carddav_url, account_dav_settings.carddav_url),
                       caldav_url  = COALESCE(excluded.caldav_url, account_dav_settings.caldav_url),
                       updated_at  = CURRENT_TIMESTAMP
        `,
    ).run(accountId, carddavUrl ?? null, caldavUrl ?? null);

    return db
        .prepare('SELECT * FROM account_dav_settings WHERE account_id = ?')
        .get(accountId) as DavSettingsRow;
}

export function upsertContacts(
    accountId: number,
    rows: Array<{
        sourceUid: string;
        fullName: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
        etag?: string | null;
    }>,
    source: string = 'carddav',
): { upserted: number; removed: number } {
    const db = getDb();
    const seenAt = new Date().toISOString();
    const tx = db.transaction(() => {
        const upsert = db.prepare(
            `
                INSERT INTO contacts (
                    account_id, source, source_uid, full_name, email, phone, organization, title, note, etag, last_seen_sync, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(account_id, source, source_uid, email) DO
                UPDATE SET full_name      = excluded.full_name,
                           phone          = excluded.phone,
                           organization   = excluded.organization,
                           title          = excluded.title,
                           note           = excluded.note,
                           etag           = excluded.etag,
                           last_seen_sync = excluded.last_seen_sync,
                           updated_at     = CURRENT_TIMESTAMP
            `,
        );
        for (const row of rows) {
            upsert.run(
                accountId,
                source,
                row.sourceUid,
                row.fullName ?? null,
                row.email,
                normalizeContactText(row.phone),
                normalizeContactText(row.organization),
                normalizeContactText(row.title),
                normalizeContactText(row.note, 4000),
                row.etag ?? null,
                seenAt,
            );
        }
        const cleanup = db.prepare(
            `
                DELETE
                FROM contacts
                WHERE account_id = ?
                  AND source = ?
                  AND last_seen_sync <> ?
            `,
        ).run(accountId, source, seenAt);
        return {upserted: rows.length, removed: cleanup.changes};
    });
    return tx();
}

export function upsertCalendarEvents(
    accountId: number,
    rows: Array<{
        calendarUrl: string;
        uid: string;
        summary?: string | null;
        description?: string | null;
        location?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
        etag?: string | null;
        rawIcs?: string | null;
    }>,
    source: string = 'caldav',
): { upserted: number; removed: number } {
    const db = getDb();
    const seenAt = new Date().toISOString();
    const tx = db.transaction(() => {
        const upsert = db.prepare(
            `
                INSERT INTO calendar_events (
                    account_id, source, calendar_url, uid, summary, description, location,
                    starts_at, ends_at, etag, raw_ics, last_seen_sync, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(account_id, source, calendar_url, uid) DO
                UPDATE SET summary        = excluded.summary,
                           description    = excluded.description,
                           location       = excluded.location,
                           starts_at      = excluded.starts_at,
                           ends_at        = excluded.ends_at,
                           etag           = excluded.etag,
                           raw_ics        = excluded.raw_ics,
                           last_seen_sync = excluded.last_seen_sync,
                           updated_at     = CURRENT_TIMESTAMP
            `,
        );
        for (const row of rows) {
            upsert.run(
                accountId,
                source,
                row.calendarUrl,
                row.uid,
                row.summary ?? null,
                row.description ?? null,
                row.location ?? null,
                row.startsAt ?? null,
                row.endsAt ?? null,
                row.etag ?? null,
                row.rawIcs ?? null,
                seenAt,
            );
        }
        const cleanup = db.prepare(
            `
                DELETE
                FROM calendar_events
                WHERE account_id = ?
                  AND source = ?
                  AND last_seen_sync <> ?
            `,
        ).run(accountId, source, seenAt);
        return {upserted: rows.length, removed: cleanup.changes};
    });
    return tx();
}

export function listContacts(accountId: number, query?: string | null, limit: number = 200, addressBookId?: number | null): ContactRow[] {
    const db = getDb();
    const q = (query || '').trim();
    const hasBookFilter = typeof addressBookId === 'number' && Number.isFinite(addressBookId);
    if (!q) {
        if (hasBookFilter) {
            return db.prepare(
                `
                    SELECT *
                    FROM contacts
                    WHERE account_id = ?
                      AND address_book_id = ?
                    ORDER BY lower(coalesce(full_name, '')), lower(email)
                    LIMIT ?
                `,
            ).all(accountId, addressBookId, limit) as ContactRow[];
        }
        return db.prepare(
            `
                SELECT *
                FROM contacts
                WHERE account_id = ?
                ORDER BY lower(coalesce(full_name, '')), lower(email)
                LIMIT ?
            `,
        ).all(accountId, limit) as ContactRow[];
    }
    const pattern = `%${q.toLowerCase()}%`;
    if (hasBookFilter) {
        return db.prepare(
            `
                SELECT *
                FROM contacts
                WHERE account_id = ?
                  AND address_book_id = ?
                  AND (
                    lower(coalesce(full_name, '')) LIKE ?
                    OR lower(email) LIKE ?
                    OR lower(coalesce(phone, '')) LIKE ?
                    OR lower(coalesce(organization, '')) LIKE ?
                    OR lower(coalesce(title, '')) LIKE ?
                    OR lower(coalesce(note, '')) LIKE ?
                  )
                ORDER BY lower(coalesce(full_name, '')), lower(email)
                LIMIT ?
            `,
        ).all(accountId, addressBookId, pattern, pattern, pattern, pattern, pattern, pattern, limit) as ContactRow[];
    }
    return db.prepare(
        `
            SELECT *
            FROM contacts
            WHERE account_id = ?
              AND (
                lower(coalesce(full_name, '')) LIKE ?
                OR lower(email) LIKE ?
                OR lower(coalesce(phone, '')) LIKE ?
                OR lower(coalesce(organization, '')) LIKE ?
                OR lower(coalesce(title, '')) LIKE ?
                OR lower(coalesce(note, '')) LIKE ?
              )
            ORDER BY lower(coalesce(full_name, '')), lower(email)
            LIMIT ?
        `,
    ).all(accountId, pattern, pattern, pattern, pattern, pattern, pattern, limit) as ContactRow[];
}

export function listAddressBooks(accountId: number): AddressBookRow[] {
    const db = getDb();
    ensureDefaultLocalAddressBook(accountId);
    return db.prepare(
        `
            SELECT *
            FROM address_books
            WHERE account_id = ?
            ORDER BY lower(name), id
        `,
    ).all(accountId) as AddressBookRow[];
}

export function createAddressBook(accountId: number, name: string): AddressBookRow {
    const db = getDb();
    const normalized = normalizeBookName(name);
    if (!normalized) throw new Error('Address book name is required.');
    db.prepare(
        `
            INSERT INTO address_books (account_id, name, source, remote_url, created_at, updated_at)
            VALUES (?, ?, 'local', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
    ).run(accountId, normalized);
    return db.prepare(
        `
            SELECT *
            FROM address_books
            WHERE id = last_insert_rowid()
        `,
    ).get() as AddressBookRow;
}

export function deleteAddressBook(accountId: number, addressBookId: number): { removed: boolean } {
    const db = getDb();
    const existing = db.prepare(
        `
            SELECT *
            FROM address_books
            WHERE id = ?
              AND account_id = ?
            LIMIT 1
        `,
    ).get(addressBookId, accountId) as AddressBookRow | undefined;
    if (!existing) return {removed: false};
    if (existing.source !== 'local') {
        throw new Error('Only local address books can be deleted.');
    }

    const tx = db.transaction(() => {
        db.prepare(
            `
                DELETE FROM contacts
                WHERE account_id = ?
                  AND source = ?
            `,
        ).run(accountId, `local:${addressBookId}`);
        db.prepare(
            `
                UPDATE contacts
                SET address_book_id = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ?
                  AND address_book_id = ?
            `,
        ).run(accountId, addressBookId);
        const res = db.prepare(
            `
                DELETE FROM address_books
                WHERE id = ?
                  AND account_id = ?
            `,
        ).run(addressBookId, accountId);
        ensureDefaultLocalAddressBook(accountId);
        return {removed: res.changes > 0};
    });

    return tx();
}

export function createLocalContact(
    accountId: number,
    addressBookId: number | null,
    fullName: string | null,
    email: string,
    fields?: { phone?: string | null; organization?: string | null; title?: string | null; note?: string | null },
): ContactRow {
    const db = getDb();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error('A valid email is required.');
    const normalizedName = normalizeDisplayName(fullName);
    const bookId = ensureLocalBookForContact(accountId, addressBookId);
    const sourceUid = randomUUID();
    const source = `local:${bookId}`;
    const seenAt = new Date().toISOString();
    db.prepare(
        `
            INSERT INTO contacts (
                account_id, address_book_id, source, source_uid, full_name, email, phone, organization, title, note, etag, last_seen_sync, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
    ).run(
        accountId,
        bookId,
        source,
        sourceUid,
        normalizedName,
        normalizedEmail,
        normalizeContactText(fields?.phone),
        normalizeContactText(fields?.organization),
        normalizeContactText(fields?.title),
        normalizeContactText(fields?.note, 4000),
        seenAt,
    );
    return db.prepare(
        `
            SELECT *
            FROM contacts
            WHERE id = last_insert_rowid()
        `,
    ).get() as ContactRow;
}

export function upsertCardDavContact(
    accountId: number,
    payload: {
        sourceUid: string;
        fullName: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
        etag?: string | null;
        addressBookId?: number | null;
    },
): ContactRow {
    const db = getDb();
    const normalizedEmail = normalizeEmail(payload.email);
    if (!normalizedEmail) throw new Error('A valid email is required.');
    const normalizedName = normalizeDisplayName(payload.fullName);
    const seenAt = new Date().toISOString();
    const bookId = typeof payload.addressBookId === 'number' && Number.isFinite(payload.addressBookId)
        ? payload.addressBookId
        : null;

    db.prepare(
        `
            INSERT INTO contacts (
                account_id, address_book_id, source, source_uid, full_name, email, phone, organization, title, note, etag, last_seen_sync, created_at, updated_at
            )
            VALUES (?, ?, 'carddav', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(account_id, source, source_uid, email) DO
            UPDATE SET address_book_id = excluded.address_book_id,
                       full_name = excluded.full_name,
                       phone = excluded.phone,
                       organization = excluded.organization,
                       title = excluded.title,
                       note = excluded.note,
                       etag = excluded.etag,
                       last_seen_sync = excluded.last_seen_sync,
                       updated_at = CURRENT_TIMESTAMP
        `,
    ).run(
        accountId,
        bookId,
        payload.sourceUid,
        normalizedName,
        normalizedEmail,
        normalizeContactText(payload.phone),
        normalizeContactText(payload.organization),
        normalizeContactText(payload.title),
        normalizeContactText(payload.note, 4000),
        payload.etag ?? null,
        seenAt,
    );

    return db.prepare(
        `
            SELECT *
            FROM contacts
            WHERE account_id = ?
              AND source = 'carddav'
              AND source_uid = ?
              AND email = ?
            LIMIT 1
        `,
    ).get(accountId, payload.sourceUid, normalizedEmail) as ContactRow;
}

export function updateLocalContact(contactId: number, payload: {
    fullName?: string | null;
    email?: string;
    phone?: string | null;
    organization?: string | null;
    title?: string | null;
    note?: string | null;
    addressBookId?: number | null;
}): ContactRow {
    const db = getDb();
    const current = db.prepare(
        `
            SELECT *
            FROM contacts
            WHERE id = ?
        `,
    ).get(contactId) as ContactRow | undefined;
    if (!current) throw new Error('Contact not found.');
    if (!current.source.startsWith('local:')) {
        throw new Error('Only local contacts can be edited.');
    }

    const nextBookId = payload.addressBookId === undefined
        ? current.address_book_id
        : ensureLocalBookForContact(current.account_id, payload.addressBookId);
    const nextSource = `local:${nextBookId ?? 0}`;
    const nextEmail = payload.email === undefined ? current.email : normalizeEmail(payload.email);
    if (!nextEmail) throw new Error('A valid email is required.');
    const nextName = payload.fullName === undefined ? current.full_name : normalizeDisplayName(payload.fullName);
    const nextPhone = payload.phone === undefined ? current.phone : normalizeContactText(payload.phone);
    const nextOrganization = payload.organization === undefined ? current.organization : normalizeContactText(payload.organization);
    const nextTitle = payload.title === undefined ? current.title : normalizeContactText(payload.title);
    const nextNote = payload.note === undefined ? current.note : normalizeContactText(payload.note, 4000);

    db.prepare(
        `
            UPDATE contacts
            SET address_book_id = ?,
                source = ?,
                full_name = ?,
                email = ?,
                phone = ?,
                organization = ?,
                title = ?,
                note = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
    ).run(nextBookId, nextSource, nextName, nextEmail, nextPhone, nextOrganization, nextTitle, nextNote, contactId);

    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as ContactRow;
}

export function deleteLocalContact(contactId: number): { removed: boolean } {
    const db = getDb();
    const current = db.prepare('SELECT source FROM contacts WHERE id = ?').get(contactId) as {
        source: string
    } | undefined;
    if (!current) return {removed: false};
    if (!current.source.startsWith('local:')) {
        throw new Error('Only local contacts can be deleted.');
    }
    const res = db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
    return {removed: res.changes > 0};
}

export function listCalendarEvents(accountId: number, startIso?: string | null, endIso?: string | null, limit: number = 500): CalendarEventRow[] {
    const db = getDb();
    const start = (startIso || '').trim();
    const end = (endIso || '').trim();
    if (start && end) {
        return db.prepare(
            `
                SELECT *
                FROM calendar_events
                WHERE account_id = ?
                  AND coalesce(ends_at, starts_at, '') >= ?
                  AND coalesce(starts_at, ends_at, '') <= ?
                ORDER BY coalesce(starts_at, '') ASC
                LIMIT ?
            `,
        ).all(accountId, start, end, limit) as CalendarEventRow[];
    }
    return db.prepare(
        `
            SELECT *
            FROM calendar_events
            WHERE account_id = ?
            ORDER BY coalesce(starts_at, '') ASC
            LIMIT ?
        `,
    ).all(accountId, limit) as CalendarEventRow[];
}

export function createLocalCalendarEvent(accountId: number, payload: {
    summary?: string | null;
    description?: string | null;
    location?: string | null;
    startsAt: string;
    endsAt: string;
}): CalendarEventRow {
    const db = getDb();
    const startsAt = String(payload.startsAt || '').trim();
    const endsAt = String(payload.endsAt || '').trim();
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
        throw new Error('Event start date/time is required.');
    }
    if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
        throw new Error('Event end date/time is required.');
    }
    if (Date.parse(endsAt) < Date.parse(startsAt)) {
        throw new Error('Event end must be after start.');
    }

    const uid = randomUUID();
    const seenAt = new Date().toISOString();
    const summary = String(payload.summary || '').trim() || null;
    const description = String(payload.description || '').trim() || null;
    const location = String(payload.location || '').trim() || null;
    const calendarUrl = `local://${accountId}/default`;

    db.prepare(
        `
            INSERT INTO calendar_events (
                account_id, source, calendar_url, uid, summary, description, location,
                starts_at, ends_at, etag, raw_ics, last_seen_sync, created_at, updated_at
            )
            VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
    ).run(
        accountId,
        calendarUrl,
        uid,
        summary,
        description,
        location,
        startsAt,
        endsAt,
        seenAt,
    );

    return db.prepare('SELECT * FROM calendar_events WHERE id = last_insert_rowid()').get() as CalendarEventRow;
}

function ensureDefaultLocalAddressBook(accountId: number): number {
    const db = getDb();
    const existing = db.prepare(
        `
            SELECT id
            FROM address_books
            WHERE account_id = ?
              AND source = 'local'
            ORDER BY id
            LIMIT 1
        `,
    ).get(accountId) as { id: number } | undefined;
    if (existing) return existing.id;
    db.prepare(
        `
            INSERT INTO address_books (account_id, name, source, remote_url, created_at, updated_at)
            VALUES (?, 'Personal', 'local', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
    ).run(accountId);
    return Number(db.prepare('SELECT last_insert_rowid() as id').get().id);
}

function ensureLocalBookForContact(accountId: number, addressBookId: number | null): number {
    const db = getDb();
    if (typeof addressBookId === 'number' && Number.isFinite(addressBookId)) {
        const found = db.prepare(
            `
                SELECT id
                FROM address_books
                WHERE id = ?
                  AND account_id = ?
                  AND source = 'local'
            `,
        ).get(addressBookId, accountId) as { id: number } | undefined;
        if (found) return found.id;
        throw new Error('Address book not found.');
    }
    return ensureDefaultLocalAddressBook(accountId);
}

function normalizeBookName(value: string): string {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeDisplayName(value: string | null | undefined): string | null {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    return normalized || null;
}

function normalizeContactText(value: string | null | undefined, maxLength: number = 240): string | null {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
    return normalized || null;
}

function normalizeEmail(value: string | null | undefined): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '';
    return normalized;
}
