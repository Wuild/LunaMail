import {getAccountSyncCredentials} from '../db/repositories/accountsRepo.js';
import {
    createAddressBook,
    createLocalContact,
    deleteLocalContact,
    getDavSettings,
    listAddressBooks,
    listCalendarEvents,
    listContacts,
    updateLocalContact,
    upsertCalendarEvents,
    upsertCardDavContact,
    upsertContacts,
    upsertDavSettings,
} from '../db/repositories/davRepo.js';
import {randomUUID} from 'node:crypto';

type DavCredentials = {
    email: string;
    user: string;
    password: string;
    imapHost: string;
};

export interface DavDiscoveryResult {
    accountId: number;
    carddavUrl: string | null;
    caldavUrl: string | null;
}

export interface DavSyncSummary {
    accountId: number;
    discovered: DavDiscoveryResult;
    contacts: { upserted: number; removed: number; books: number };
    events: { upserted: number; removed: number; calendars: number };
}

export async function discoverDav(accountId: number): Promise<DavDiscoveryResult> {
    const creds = await resolveCredentials(accountId);
    const saved = getDavSettings(accountId);

    const carddavUrl = await discoverHomeUrl(
        creds,
        saved?.carddav_url || null,
        'carddav',
        'addressbook-home-set',
    );
    const caldavUrl = await discoverHomeUrl(
        creds,
        saved?.caldav_url || null,
        'caldav',
        'calendar-home-set',
    );

    if (carddavUrl || caldavUrl) {
        upsertDavSettings(accountId, carddavUrl, caldavUrl);
    }

    return {accountId, carddavUrl: carddavUrl ?? null, caldavUrl: caldavUrl ?? null};
}

export async function syncDav(accountId: number): Promise<DavSyncSummary> {
    const discovered = await discoverDav(accountId);
    const creds = await resolveCredentials(accountId);

    let contactsResult = {upserted: 0, removed: 0, books: 0};
    if (discovered.carddavUrl) {
        const books = await listCollections(creds, discovered.carddavUrl, 'addressbook');
        const contacts = await pullContacts(creds, books.length > 0 ? books : [discovered.carddavUrl]);
        const persisted = upsertContacts(accountId, contacts, 'carddav');
        contactsResult = {upserted: persisted.upserted, removed: persisted.removed, books: books.length || 1};
    }

    let eventsResult = {upserted: 0, removed: 0, calendars: 0};
    if (discovered.caldavUrl) {
        const calendars = await listCollections(creds, discovered.caldavUrl, 'calendar');
        const events = await pullEvents(creds, calendars.length > 0 ? calendars : [discovered.caldavUrl]);
        const persisted = upsertCalendarEvents(accountId, events, 'caldav');
        eventsResult = {upserted: persisted.upserted, removed: persisted.removed, calendars: calendars.length || 1};
    }

    return {
        accountId,
        discovered,
        contacts: contactsResult,
        events: eventsResult,
    };
}

export function getContacts(accountId: number, query?: string | null, limit: number = 200, addressBookId?: number | null) {
    return listContacts(accountId, query, limit, addressBookId);
}

export function getAddressBooks(accountId: number) {
    return listAddressBooks(accountId);
}

export function addAddressBook(accountId: number, name: string) {
    return createAddressBook(accountId, name);
}

export async function addContact(accountId: number, payload: {
    addressBookId?: number | null;
    fullName?: string | null;
    email: string
}) {
    const discovered = await discoverDav(accountId).catch(() => ({
        accountId,
        carddavUrl: null,
        caldavUrl: null,
    }));
    if (!discovered.carddavUrl) {
        return createLocalContact(accountId, payload.addressBookId ?? null, payload.fullName ?? null, payload.email);
    }

    const creds = await resolveCredentials(accountId);
    const books = await listCollections(creds, discovered.carddavUrl, 'addressbook').catch(() => []);
    const targetBookUrl = books[0] ?? discovered.carddavUrl;
    const sourceUid = randomUUID();
    const cardUrl = resolveUrl(ensureTrailingSlash(targetBookUrl), `${encodeURIComponent(sourceUid)}.vcf`);
    const cardBody = buildVCard({
        uid: sourceUid,
        fullName: payload.fullName ?? null,
        email: payload.email,
    });
    const etag = await putCardDavContact(creds, cardUrl, cardBody);

    return upsertCardDavContact(accountId, {
        sourceUid,
        fullName: payload.fullName ?? null,
        email: payload.email,
        etag,
        addressBookId: payload.addressBookId ?? null,
    });
}

export function editContact(contactId: number, payload: {
    addressBookId?: number | null;
    fullName?: string | null;
    email?: string
}) {
    return updateLocalContact(contactId, payload);
}

export function removeContact(contactId: number) {
    return deleteLocalContact(contactId);
}

export function getCalendarEvents(accountId: number, startIso?: string | null, endIso?: string | null, limit: number = 500) {
    return listCalendarEvents(accountId, startIso, endIso, limit);
}

async function resolveCredentials(accountId: number): Promise<DavCredentials> {
    const creds = await getAccountSyncCredentials(accountId);
    return {
        email: creds.email,
        user: creds.user,
        password: creds.password,
        imapHost: creds.imap_host,
    };
}

async function discoverHomeUrl(
    creds: DavCredentials,
    preferredUrl: string | null,
    wellKnownKind: 'carddav' | 'caldav',
    homeProperty: 'addressbook-home-set' | 'calendar-home-set',
): Promise<string | null> {
    const candidates: string[] = [];
    if (preferredUrl) candidates.push(preferredUrl);
    const domain = extractEmailDomain(creds.email);
    if (domain) {
        candidates.push(`https://${domain}/.well-known/${wellKnownKind}`);
        candidates.push(`https://${wellKnownKind}.${domain}/`);
    }
    if (creds.imapHost) {
        candidates.push(`https://${creds.imapHost}/.well-known/${wellKnownKind}`);
    }

    for (const candidate of dedupe(candidates)) {
        try {
            const resolved = await resolveHomeFromEntry(creds, candidate, homeProperty);
            if (resolved) return resolved;
        } catch {
            // try next
        }
    }
    return null;
}

async function resolveHomeFromEntry(
    creds: DavCredentials,
    entryUrl: string,
    homeProperty: 'addressbook-home-set' | 'calendar-home-set',
): Promise<string | null> {
    const probe = await fetch(entryUrl, {
        method: 'GET',
        headers: {
            Authorization: authHeader(creds),
            Accept: '*/*',
        },
    });
    const baseUrl = probe.url || entryUrl;

    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
    const xml = await davRequest(creds, baseUrl, 'PROPFIND', body, '0');
    const root = firstResponse(xml);
    if (!root) return null;

    const directHome = extractTagValue(root, homeProperty);
    if (directHome) return resolveUrl(baseUrl, directHome);

    const principal = extractTagValue(root, 'current-user-principal');
    if (!principal) return null;
    const principalUrl = resolveUrl(baseUrl, principal);
    const principalBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
    const principalXml = await davRequest(creds, principalUrl, 'PROPFIND', principalBody, '0');
    const principalResp = firstResponse(principalXml);
    if (!principalResp) return null;
    const home = extractTagValue(principalResp, homeProperty);
    return home ? resolveUrl(principalUrl, home) : null;
}

async function listCollections(creds: DavCredentials, homeUrl: string, kind: 'addressbook' | 'calendar'): Promise<string[]> {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:displayname />
  </d:prop>
</d:propfind>`;
    const xml = await davRequest(creds, homeUrl, 'PROPFIND', body, '1');
    const responses = extractResponses(xml);
    const out: string[] = [];
    for (const response of responses) {
        if (!hasTag(response, kind)) continue;
        const href = extractTagValue(response, 'href');
        if (!href) continue;
        const absolute = resolveUrl(homeUrl, href);
        out.push(absolute);
    }
    return dedupe(out);
}

async function pullContacts(
    creds: DavCredentials,
    addressBooks: string[],
): Promise<Array<{ sourceUid: string; fullName: string | null; email: string; etag?: string | null }>> {
    const out: Array<{ sourceUid: string; fullName: string | null; email: string; etag?: string | null }> = [];
    const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <c:address-data />
  </d:prop>
</c:addressbook-query>`;

    for (const bookUrl of addressBooks) {
        const xml = await davRequest(creds, bookUrl, 'REPORT', reportBody, '1');
        const responses = extractResponses(xml);
        for (const response of responses) {
            const card = extractTagValue(response, 'address-data');
            if (!card) continue;
            const etag = extractTagValue(response, 'getetag') || null;
            const href = extractTagValue(response, 'href') || '';
            const parsed = parseVCard(card, href);
            for (const email of parsed.emails) {
                out.push({
                    sourceUid: parsed.uid,
                    fullName: parsed.fullName,
                    email,
                    etag,
                });
            }
        }
    }

    return dedupeBy(out, (row) => `${row.sourceUid}|${row.email.toLowerCase()}`);
}

async function pullEvents(
    creds: DavCredentials,
    calendars: string[],
): Promise<Array<{
    calendarUrl: string;
    uid: string;
    summary?: string | null;
    description?: string | null;
    location?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    etag?: string | null;
    rawIcs?: string | null;
}>> {
    const now = new Date();
    const past = new Date(now);
    past.setDate(now.getDate() - 30);
    const future = new Date(now);
    future.setDate(now.getDate() + 365);

    const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavDate(past)}" end="${toCalDavDate(future)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

    const out: Array<{
        calendarUrl: string;
        uid: string;
        summary?: string | null;
        description?: string | null;
        location?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
        etag?: string | null;
        rawIcs?: string | null;
    }> = [];

    for (const calendarUrl of calendars) {
        const xml = await davRequest(creds, calendarUrl, 'REPORT', reportBody, '1');
        const responses = extractResponses(xml);
        for (const response of responses) {
            const ics = extractTagValue(response, 'calendar-data');
            if (!ics) continue;
            const etag = extractTagValue(response, 'getetag') || null;
            const events = parseIcsEvents(ics);
            for (const event of events) {
                out.push({
                    calendarUrl,
                    uid: event.uid,
                    summary: event.summary ?? null,
                    description: event.description ?? null,
                    location: event.location ?? null,
                    startsAt: event.startsAt ?? null,
                    endsAt: event.endsAt ?? null,
                    etag,
                    rawIcs: ics,
                });
            }
        }
    }
    return dedupeBy(out, (row) => `${row.calendarUrl}|${row.uid}`);
}

async function davRequest(
    creds: DavCredentials,
    url: string,
    method: 'PROPFIND' | 'REPORT',
    body: string,
    depth: '0' | '1',
): Promise<string> {
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: authHeader(creds),
            Depth: depth,
            'Content-Type': 'application/xml; charset=utf-8',
            Accept: 'application/xml, text/xml, */*',
        },
        body,
    });
    if (!response.ok && response.status !== 207) {
        throw new Error(`DAV ${method} failed (${response.status}) for ${url}`);
    }
    return await response.text();
}

function authHeader(creds: DavCredentials): string {
    const raw = `${creds.user}:${creds.password}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function putCardDavContact(
    creds: DavCredentials,
    url: string,
    vcard: string,
): Promise<string | null> {
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: authHeader(creds),
            'Content-Type': 'text/vcard; charset=utf-8',
            Accept: '*/*',
        },
        body: vcard,
    });
    if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`CardDAV PUT failed (${response.status}) for ${url}`);
    }
    const etag = response.headers.get('etag');
    return etag ? etag.trim() : null;
}

function extractEmailDomain(email: string): string | null {
    const idx = email.indexOf('@');
    if (idx < 0) return null;
    const domain = email.slice(idx + 1).trim();
    return domain || null;
}

function normalizeXml(xml: string): string {
    return xml
        .replace(/<\/?[A-Za-z0-9_-]+:/g, (m) => m.replace(/([<\/]?)[A-Za-z0-9_-]+:/, '$1'))
        .replace(/\r/g, '');
}

function extractResponses(xml: string): string[] {
    const normalized = normalizeXml(xml);
    const matches = normalized.match(/<response\b[\s\S]*?<\/response>/g);
    return matches ?? [];
}

function firstResponse(xml: string): string | null {
    const responses = extractResponses(xml);
    return responses[0] ?? null;
}

function extractTagValue(xmlFragment: string, tag: string): string | null {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = xmlFragment.match(re);
    if (!m) return null;
    return decodeXmlEntities(m[1]).trim();
}

function hasTag(xmlFragment: string, tag: string): boolean {
    const re = new RegExp(`<${tag}(\\s|\\/|>)`, 'i');
    return re.test(xmlFragment);
}

function resolveUrl(baseUrl: string, href: string): string {
    return new URL(href, baseUrl).toString();
}

function ensureTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function escapeVCardValue(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function buildVCard(payload: { uid: string; fullName: string | null; email: string }): string {
    const fullName = (payload.fullName || '').trim();
    const displayName = fullName || payload.email.trim();
    const safeName = escapeVCardValue(displayName);
    const safeEmail = escapeVCardValue(payload.email.trim().toLowerCase());
    return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:${escapeVCardValue(payload.uid)}`,
        `FN:${safeName}`,
        `N:${safeName};;;;`,
        `EMAIL;TYPE=INTERNET:${safeEmail}`,
        'END:VCARD',
        '',
    ].join('\r\n');
}

function parseVCard(rawCard: string, fallbackUid: string): { uid: string; fullName: string | null; emails: string[] } {
    const lines = unfoldIcs(rawCard);
    let uid = '';
    let fullName: string | null = null;
    const emails: string[] = [];
    for (const line of lines) {
        const [keyRaw, ...rest] = line.split(':');
        if (!keyRaw || rest.length === 0) continue;
        const key = keyRaw.split(';')[0].toUpperCase();
        const value = rest.join(':').trim();
        if (!value) continue;
        if (key === 'UID') uid = value;
        if (key === 'FN') fullName = value;
        if (key === 'EMAIL') emails.push(value.toLowerCase());
    }
    if (emails.length === 0) return {uid: uid || fallbackUid, fullName, emails: []};
    return {
        uid: uid || fallbackUid,
        fullName,
        emails: dedupe(emails),
    };
}

function parseIcsEvents(rawIcs: string): Array<{
    uid: string;
    summary?: string | null;
    description?: string | null;
    location?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
}> {
    const unfolded = unfoldIcs(rawIcs).join('\n');
    const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
    const out: Array<{
        uid: string;
        summary?: string | null;
        description?: string | null;
        location?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
    }> = [];
    for (const block of blocks) {
        let uid = '';
        let summary: string | null = null;
        let description: string | null = null;
        let location: string | null = null;
        let startsAt: string | null = null;
        let endsAt: string | null = null;

        const lines = block.split('\n');
        for (const line of lines) {
            const [keyRaw, ...rest] = line.split(':');
            if (!keyRaw || rest.length === 0) continue;
            const key = keyRaw.split(';')[0].toUpperCase();
            const value = rest.join(':').trim();
            if (!value) continue;
            if (key === 'UID') uid = value;
            if (key === 'SUMMARY') summary = value;
            if (key === 'DESCRIPTION') description = value.replace(/\\n/g, '\n');
            if (key === 'LOCATION') location = value;
            if (key === 'DTSTART') startsAt = parseIcsDate(value);
            if (key === 'DTEND') endsAt = parseIcsDate(value);
        }
        if (!uid) continue;
        out.push({uid, summary, description, location, startsAt, endsAt});
    }
    return out;
}

function unfoldIcs(input: string): string[] {
    const source = input.replace(/\r/g, '').split('\n');
    const lines: string[] = [];
    for (const line of source) {
        if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
            lines[lines.length - 1] += line.slice(1);
        } else {
            lines.push(line);
        }
    }
    return lines.filter((line) => line.length > 0);
}

function parseIcsDate(value: string): string | null {
    const v = value.trim();
    if (/^\d{8}T\d{6}Z$/.test(v)) {
        const y = Number(v.slice(0, 4));
        const m = Number(v.slice(4, 6)) - 1;
        const d = Number(v.slice(6, 8));
        const hh = Number(v.slice(9, 11));
        const mm = Number(v.slice(11, 13));
        const ss = Number(v.slice(13, 15));
        return new Date(Date.UTC(y, m, d, hh, mm, ss)).toISOString();
    }
    if (/^\d{8}$/.test(v)) {
        const y = Number(v.slice(0, 4));
        const m = Number(v.slice(4, 6)) - 1;
        const d = Number(v.slice(6, 8));
        return new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
    }
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toCalDavDate(d: Date): string {
    const y = d.getUTCFullYear().toString().padStart(4, '0');
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    const hh = d.getUTCHours().toString().padStart(2, '0');
    const mm = d.getUTCMinutes().toString().padStart(2, '0');
    const ss = d.getUTCSeconds().toString().padStart(2, '0');
    return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function dedupe<T>(items: T[]): T[] {
    return Array.from(new Set(items));
}

function dedupeBy<T>(items: T[], keyFn: (value: T) => string): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}
