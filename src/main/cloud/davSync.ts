import {createMailDebugLogger} from "../debug/debugLog.js";
import {type CloudAccountCredentials, cloudAccountToDavAccountId} from "../db/repositories/cloudRepo.js";
import {getDavSettings, upsertCalendarEvents, upsertContacts, upsertDavSettings} from "../db/repositories/davRepo.js";

type DavCredentials = {
    user: string;
    password: string;
    baseUrl: string;
};

export interface CloudDavSyncSummary {
    cloudAccountId: number;
    davAccountId: number;
    carddavUrl: string | null;
    caldavUrl: string | null;
    contacts: { upserted: number; removed: number; books: number };
    events: { upserted: number; removed: number; calendars: number };
}

export async function syncCloudDav(account: CloudAccountCredentials): Promise<CloudDavSyncSummary> {
    if (account.provider !== "nextcloud" && account.provider !== "webdav") {
        return {
            cloudAccountId: account.id,
            davAccountId: cloudAccountToDavAccountId(account.id),
            carddavUrl: null,
            caldavUrl: null,
            contacts: {upserted: 0, removed: 0, books: 0},
            events: {upserted: 0, removed: 0, calendars: 0},
        };
    }

    const user = String(account.user || "").trim();
    const baseUrl = String(account.base_url || "").trim();
    if (!user || !baseUrl) {
        throw new Error("Cloud DAV account missing username or base URL.");
    }

    const creds: DavCredentials = {
        user,
        password: account.secret,
        baseUrl,
    };
    const davAccountId = cloudAccountToDavAccountId(account.id);
    const loggerCarddav = createMailDebugLogger("carddav", `cloud:${account.id}`);
    const loggerCaldav = createMailDebugLogger("caldav", `cloud:${account.id}`);

    const saved = getDavSettings(davAccountId);
    const carddavUrl =
        saved?.carddav_url ?? (await discoverHomeUrl(creds, "carddav", "addressbook-home-set", loggerCarddav));
    const caldavUrl = saved?.caldav_url ?? (await discoverHomeUrl(creds, "caldav", "calendar-home-set", loggerCaldav));
    upsertDavSettings(davAccountId, carddavUrl, caldavUrl);

    let contactsResult = {upserted: 0, removed: 0, books: 0};
    if (carddavUrl) {
        const books = await listCollections(creds, carddavUrl, "addressbook", loggerCarddav);
        const sourceBooks = books.length > 0 ? books : [carddavUrl];
        const contacts = await pullContacts(creds, sourceBooks, loggerCarddav);
        contactsResult = {
            ...upsertContacts(davAccountId, contacts, "cloud-carddav"),
            books: sourceBooks.length,
        };
    }

    let eventsResult = {upserted: 0, removed: 0, calendars: 0};
    if (caldavUrl) {
        const calendars = await listCollections(creds, caldavUrl, "calendar", loggerCaldav);
        const sourceCalendars = calendars.length > 0 ? calendars : [caldavUrl];
        const events = await pullEvents(creds, sourceCalendars, loggerCaldav);
        eventsResult = {
            ...upsertCalendarEvents(davAccountId, events, "cloud-caldav"),
            calendars: sourceCalendars.length,
        };
    }

    return {
        cloudAccountId: account.id,
        davAccountId,
        carddavUrl: carddavUrl ?? null,
        caldavUrl: caldavUrl ?? null,
        contacts: contactsResult,
        events: eventsResult,
    };
}

async function discoverHomeUrl(
    creds: DavCredentials,
    kind: "carddav" | "caldav",
    homeProperty: "addressbook-home-set" | "calendar-home-set",
    logger: ReturnType<typeof createMailDebugLogger>
): Promise<string | null> {
    const origin = new URL(creds.baseUrl).origin;
    const candidates = dedupe([
        `${origin}/.well-known/${kind}`,
        `${origin}/remote.php/dav/`,
        `${origin}/dav/`,
        ensureTrailingSlash(creds.baseUrl),
    ]);
    for (const candidate of candidates) {
        try {
            const resolved = await resolveHomeFromEntry(creds, candidate, homeProperty, logger);
            if (resolved) return resolved;
        } catch {
            // continue trying candidates
        }
    }
    return null;
}

async function resolveHomeFromEntry(
    creds: DavCredentials,
    entryUrl: string,
    homeProperty: "addressbook-home-set" | "calendar-home-set",
    logger: ReturnType<typeof createMailDebugLogger>
): Promise<string | null> {
    const probe = await fetch(entryUrl, {
        method: "GET",
        headers: {
            Authorization: authHeader(creds),
            Accept: "*/*",
        },
    });
    const baseUrl = probe.url || entryUrl;
    logger.debug("Cloud DAV probe url=%s status=%d", baseUrl, probe.status);
    if (!probe.ok && probe.status >= 400) {
        throw new Error(`Probe failed (${probe.status})`);
    }
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
    const xml = await davRequest(creds, baseUrl, "PROPFIND", body, "0");
    const root = firstResponse(xml);
    if (!root) return null;
    const directHome = extractPropertyHref(root, homeProperty) ?? extractTagValue(root, homeProperty);
    if (directHome) return resolveUrl(baseUrl, directHome);

    const principal =
        extractPropertyHref(root, "current-user-principal") ?? extractTagValue(root, "current-user-principal");
    if (!principal) return null;
    const principalUrl = resolveUrl(baseUrl, principal);
    const principalBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:${homeProperty} />
  </d:prop>
</d:propfind>`;
    const principalXml = await davRequest(creds, principalUrl, "PROPFIND", principalBody, "0");
    const principalResp = firstResponse(principalXml);
    if (!principalResp) return null;
    const home = extractPropertyHref(principalResp, homeProperty) ?? extractTagValue(principalResp, homeProperty);
    return home ? resolveUrl(principalUrl, home) : null;
}

async function listCollections(
    creds: DavCredentials,
    homeUrl: string,
    kind: "addressbook" | "calendar",
    logger: ReturnType<typeof createMailDebugLogger>
): Promise<string[]> {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
  </d:prop>
</d:propfind>`;
    const xml = await davRequest(creds, homeUrl, "PROPFIND", body, "1");
    const responses = extractResponses(xml);
    const out: string[] = [];
    for (const response of responses) {
        if (!hasTag(response, kind)) continue;
        const href = extractTagValue(response, "href");
        if (!href) continue;
        out.push(resolveUrl(homeUrl, href));
    }
    const deduped = dedupe(out);
    logger.debug("Cloud DAV collections kind=%s count=%d", kind, deduped.length);
    return deduped;
}

async function pullContacts(
    creds: DavCredentials,
    addressBooks: string[],
    logger: ReturnType<typeof createMailDebugLogger>
): Promise<
    Array<{
        sourceUid: string;
        fullName: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
        etag?: string | null;
    }>
> {
    const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <c:address-data />
  </d:prop>
</c:addressbook-query>`;

    const out: Array<{
        sourceUid: string;
        fullName: string | null;
        email: string;
        phone?: string | null;
        organization?: string | null;
        title?: string | null;
        note?: string | null;
        etag?: string | null;
    }> = [];
    for (const bookUrl of addressBooks) {
        const xml = await davRequest(creds, bookUrl, "REPORT", reportBody, "1");
        const responses = extractResponses(xml);
        for (const response of responses) {
            const card = extractTagValue(response, "address-data");
            if (!card) continue;
            const etag = extractTagValue(response, "getetag") || null;
            const href = extractTagValue(response, "href") || "";
            const parsed = parseVCard(card, href);
            for (const email of parsed.emails) {
                out.push({
                    sourceUid: parsed.uid,
                    fullName: parsed.fullName,
                    email,
                    phone: parsed.phone ?? null,
                    organization: parsed.organization ?? null,
                    title: parsed.title ?? null,
                    note: parsed.note ?? null,
                    etag,
                });
            }
        }
    }
    const deduped = dedupeBy(out, (row) => `${row.sourceUid}|${row.email.toLowerCase()}`);
    logger.info("Cloud CardDAV contacts=%d raw=%d", deduped.length, out.length);
    return deduped;
}

async function pullEvents(
    creds: DavCredentials,
    calendars: string[],
    logger: ReturnType<typeof createMailDebugLogger>
): Promise<
    Array<{
        calendarUrl: string;
        uid: string;
        summary?: string | null;
        description?: string | null;
        location?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
        etag?: string | null;
        rawIcs?: string | null;
    }>
> {
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
        const xml = await davRequest(creds, calendarUrl, "REPORT", reportBody, "1");
        const responses = extractResponses(xml);
        for (const response of responses) {
            const ics = extractTagValue(response, "calendar-data");
            if (!ics) continue;
            const etag = extractTagValue(response, "getetag") || null;
            const parsedEvents = parseIcsEvents(ics);
            for (const event of parsedEvents) {
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
    const deduped = dedupeBy(out, (row) => `${row.calendarUrl}|${row.uid}`);
    logger.info("Cloud CalDAV events=%d raw=%d", deduped.length, out.length);
    return deduped;
}

async function davRequest(
    creds: DavCredentials,
    url: string,
    method: "PROPFIND" | "REPORT",
    body: string,
    depth: "0" | "1"
): Promise<string> {
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: authHeader(creds),
            Depth: depth,
            "Content-Type": "application/xml; charset=utf-8",
            Accept: "application/xml, text/xml, */*",
        },
        body,
    });
    if (!response.ok && response.status !== 207) {
        throw new Error(`DAV ${method} failed (${response.status}) for ${url}`);
    }
    return await response.text();
}

function authHeader(creds: DavCredentials): string {
    return `Basic ${Buffer.from(`${creds.user}:${creds.password}`).toString("base64")}`;
}

function normalizeXml(xml: string): string {
    return xml.replace(/<\/?[A-Za-z0-9_-]+:/g, (m) => m.replace(/([<\/]?)[A-Za-z0-9_-]+:/, "$1")).replace(/\r/g, "");
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
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = xmlFragment.match(re);
    if (!m) return null;
    return decodeXmlEntities(m[1]).trim();
}

function extractPropertyHref(xmlFragment: string, propertyTag: string): string | null {
    const propertyRe = new RegExp(`<${propertyTag}\\b[^>]*>([\\s\\S]*?)<\\/${propertyTag}>`, "i");
    const propertyMatch = xmlFragment.match(propertyRe);
    if (!propertyMatch) return null;
    const hrefMatch = propertyMatch[1].match(/<href\b[^>]*>([\s\S]*?)<\/href>/i);
    if (!hrefMatch) return null;
    return decodeXmlEntities(hrefMatch[1]).trim();
}

function hasTag(xmlFragment: string, tag: string): boolean {
    const re = new RegExp(`<${tag}(\\s|\\/|>)`, "i");
    return re.test(xmlFragment);
}

function resolveUrl(baseUrl: string, href: string): string {
    return new URL(href, baseUrl).toString();
}

function ensureTrailingSlash(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function dedupe<T>(rows: T[]): T[] {
    return Array.from(new Set(rows));
}

function dedupeBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
        const key = keyFn(row);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function parseVCard(
    card: string,
    hrefFallback: string
): {
    uid: string;
    fullName: string | null;
    emails: string[];
    phone: string | null;
    organization: string | null;
    title: string | null;
    note: string | null;
} {
    const unfolded = unfoldIcsLines(card);
    const lines = unfolded
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    let uid = "";
    let fullName: string | null = null;
    const emails: string[] = [];
    let phone: string | null = null;
    let organization: string | null = null;
    let title: string | null = null;
    let note: string | null = null;

    for (const line of lines) {
        const [left, ...rest] = line.split(":");
        if (!left || rest.length === 0) continue;
        const value = unescapeVCardValue(rest.join(":").trim());
        const name = left.split(";")[0]?.toUpperCase() ?? "";
        if (name === "UID") uid = value;
        if (name === "FN" && value) fullName = value;
        if (name === "EMAIL" && value) emails.push(value.toLowerCase());
        if (name === "TEL" && value) phone = value;
        if (name === "ORG" && value) organization = value;
        if (name === "TITLE" && value) title = value;
        if (name === "NOTE" && value) note = value;
    }

    if (!uid) {
        uid = hrefFallback || `card-${Math.random().toString(36).slice(2)}`;
    }
    const validEmails = dedupe(emails.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
    return {
        uid,
        fullName,
        emails: validEmails,
        phone,
        organization,
        title,
        note,
    };
}

function parseIcsEvents(ics: string): Array<{
    uid: string;
    summary: string | null;
    description: string | null;
    location: string | null;
    startsAt: string | null;
    endsAt: string | null;
}> {
    const out: Array<{
        uid: string;
        summary: string | null;
        description: string | null;
        location: string | null;
        startsAt: string | null;
        endsAt: string | null;
    }> = [];
    const normalized = unfoldIcsLines(ics);
    const eventBlocks = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    for (const block of eventBlocks) {
        const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        let uid = "";
        let summary: string | null = null;
        let description: string | null = null;
        let location: string | null = null;
        let startsAt: string | null = null;
        let endsAt: string | null = null;
        for (const line of lines) {
            const [left, ...rest] = line.split(":");
            if (!left || rest.length === 0) continue;
            const value = rest.join(":").trim();
            const name = left.split(";")[0]?.toUpperCase() ?? "";
            if (name === "UID") uid = value;
            if (name === "SUMMARY") summary = unescapeIcsText(value);
            if (name === "DESCRIPTION") description = unescapeIcsText(value);
            if (name === "LOCATION") location = unescapeIcsText(value);
            if (name === "DTSTART") startsAt = parseIcsDate(value);
            if (name === "DTEND") endsAt = parseIcsDate(value);
        }
        if (!uid) continue;
        out.push({uid, summary, description, location, startsAt, endsAt});
    }
    return out;
}

function unfoldIcsLines(value: string): string {
    return value.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
}

function unescapeIcsText(value: string): string {
    return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function unescapeVCardValue(value: string): string {
    return unescapeIcsText(value);
}

function parseIcsDate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{8}T\d{6}Z$/.test(trimmed)) {
        const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(9, 11)}:${trimmed.slice(11, 13)}:${trimmed.slice(13, 15)}Z`;
        return Number.isNaN(Date.parse(iso)) ? null : iso;
    }
    if (/^\d{8}T\d{6}$/.test(trimmed)) {
        const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(9, 11)}:${trimmed.slice(11, 13)}:${trimmed.slice(13, 15)}`;
        return Number.isNaN(Date.parse(iso)) ? null : iso;
    }
    if (/^\d{8}$/.test(trimmed)) {
        const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
        return Number.isNaN(Date.parse(iso)) ? null : `${iso}T00:00:00`;
    }
    return Number.isNaN(Date.parse(trimmed)) ? null : new Date(trimmed).toISOString();
}

function toCalDavDate(value: Date): string {
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(value.getUTCDate()).padStart(2, "0");
    const hh = String(value.getUTCHours()).padStart(2, "0");
    const mi = String(value.getUTCMinutes()).padStart(2, "0");
    const ss = String(value.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}
