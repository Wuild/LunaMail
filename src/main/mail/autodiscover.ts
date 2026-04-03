import {promises as dns} from 'dns';

export interface ServiceSettings {
    host: string;
    port: number;
    secure: boolean; // TLS from start
}

export interface DiscoveredSettings {
    provider?: string | null;
    imap?: ServiceSettings;
    pop3?: ServiceSettings;
    smtp?: ServiceSettings;
    candidates: { type: 'imap' | 'pop3' | 'smtp'; host: string; port: number; secure: boolean; source: string }[];
    mxPrimaryHost?: string;
}

const COMMON_PROVIDERS: Record<string, Partial<DiscoveredSettings> & { provider: string }> = {
    'gmail.com': {
        provider: 'gmail',
        imap: {host: 'imap.gmail.com', port: 993, secure: true},
        smtp: {host: 'smtp.gmail.com', port: 465, secure: true},
    },
    'outlook.com': {
        provider: 'outlook',
        imap: {host: 'outlook.office365.com', port: 993, secure: true},
        smtp: {host: 'smtp.office365.com', port: 587, secure: false},
    },
    'hotmail.com': {
        provider: 'outlook',
        imap: {host: 'outlook.office365.com', port: 993, secure: true},
        smtp: {host: 'smtp.office365.com', port: 587, secure: false},
    },
    'yahoo.com': {
        provider: 'yahoo',
        imap: {host: 'imap.mail.yahoo.com', port: 993, secure: true},
        smtp: {host: 'smtp.mail.yahoo.com', port: 465, secure: true},
    },
    'icloud.com': {
        provider: 'icloud',
        imap: {host: 'imap.mail.me.com', port: 993, secure: true},
        smtp: {host: 'smtp.mail.me.com', port: 587, secure: false},
    },
    'me.com': {
        provider: 'icloud',
        imap: {host: 'imap.mail.me.com', port: 993, secure: true},
        smtp: {host: 'smtp.mail.me.com', port: 587, secure: false},
    },
    'aol.com': {
        provider: 'aol',
        imap: {host: 'imap.aol.com', port: 993, secure: true},
        smtp: {host: 'smtp.aol.com', port: 465, secure: true},
    },
    'zoho.com': {
        provider: 'zoho',
        imap: {host: 'imap.zoho.com', port: 993, secure: true},
        smtp: {host: 'smtp.zoho.com', port: 465, secure: true},
    },
    'gmx.com': {
        provider: 'gmx',
        imap: {host: 'imap.gmx.com', port: 993, secure: true},
        smtp: {host: 'mail.gmx.com', port: 587, secure: false},
    },
};

export async function autodiscover(email: string): Promise<DiscoveredSettings> {
    const [, rawDomain] = email.trim().toLowerCase().split('@');
    const domain = rawDomain?.trim();
    const settings: DiscoveredSettings = {candidates: []};
    if (!domain) return settings;

    // Known provider presets
    const preset = COMMON_PROVIDERS[domain.toLowerCase()];
    if (preset) {
        settings.provider = preset.provider;
        settings.imap = preset.imap;
        settings.smtp = preset.smtp;
        if ('pop3' in preset) settings.pop3 = (preset as any).pop3;
    }

    // Try provider-published configs (Thunderbird + Exchange autodiscover style)
    const remote = await fetchAutoconfig(domain, email.trim()).catch(() => undefined);
    if (remote?.imap) settings.imap = settings.imap ?? remote.imap;
    if (remote?.pop3) settings.pop3 = settings.pop3 ?? remote.pop3;
    if (remote?.smtp) settings.smtp = settings.smtp ?? remote.smtp;
    if (remote?.provider && !settings.provider) settings.provider = remote.provider;

    // Try SRV records
    await trySrv(domain, settings, '_imaps._tcp', 'imap', 993);
    await trySrv(domain, settings, '_imap._tcp', 'imap', 143, false);
    await trySrv(domain, settings, '_pop3s._tcp', 'pop3', 995);
    await trySrv(domain, settings, '_pop3._tcp', 'pop3', 110, false);
    await trySrv(domain, settings, '_submission._tcp', 'smtp', 587, false);
    await trySrv(domain, settings, '_smtps._tcp', 'smtp', 465);

    // Use MX host as a high-confidence fallback for shared hosting providers.
    await tryMxHost(domain, settings);

    // Promote MX-derived settings for generic/self-hosted domains when no explicit preset exists.
    if (settings.mxPrimaryHost && !preset) {
        const mxHost = settings.mxPrimaryHost;

        if (!settings.imap || looksHeuristicDomainHost(settings.imap.host, domain)) {
            settings.imap = {host: mxHost, port: 993, secure: true};
        }

        if (!settings.smtp || looksHeuristicDomainHost(settings.smtp.host, domain)) {
            settings.smtp = {host: mxHost, port: 465, secure: true};
        }
    }

    // Heuristic fallbacks
    pushCandidate(settings, 'imap', `imap.${domain}`, 993, true, 'heuristic');
    pushCandidate(settings, 'imap', `mail.${domain}`, 993, true, 'heuristic');
    pushCandidate(settings, 'pop3', `pop.${domain}`, 995, true, 'heuristic');
    pushCandidate(settings, 'smtp', `smtp.${domain}`, 465, true, 'heuristic');
    pushCandidate(settings, 'smtp', `mail.${domain}`, 587, false, 'heuristic');

    // Pick first candidate for each type if missing
    if (!settings.imap) settings.imap = pickFirst(settings, 'imap');
    if (!settings.pop3) settings.pop3 = pickFirst(settings, 'pop3');
    if (!settings.smtp) settings.smtp = pickFirst(settings, 'smtp');

    return settings;
}

export async function autodiscoverBasic(email: string): Promise<DiscoveredSettings> {
    const [, rawDomain] = email.trim().toLowerCase().split('@');
    const domain = rawDomain?.trim();
    const settings: DiscoveredSettings = {candidates: []};
    if (!domain) return settings;

    await tryMxHost(domain, settings);

    if (settings.mxPrimaryHost) {
        settings.imap = {host: settings.mxPrimaryHost, port: 993, secure: true};
        settings.smtp = {host: settings.mxPrimaryHost, port: 465, secure: true};
    }

    if (!settings.imap) settings.imap = {host: `imap.${domain}`, port: 993, secure: true};
    if (!settings.smtp) settings.smtp = {host: `smtp.${domain}`, port: 465, secure: true};
    if (!settings.pop3) settings.pop3 = {host: `pop.${domain}`, port: 995, secure: true};

    return settings;
}

function pickFirst(s: DiscoveredSettings, type: 'imap' | 'pop3' | 'smtp'): ServiceSettings | undefined {
    const c = s.candidates.find((x) => x.type === type);
    return c ? {host: c.host, port: c.port, secure: c.secure} : undefined;
}

async function trySrv(
    domain: string,
    settings: DiscoveredSettings,
    record: string,
    type: 'imap' | 'pop3' | 'smtp',
    defaultPort: number,
    secure: boolean = true,
) {
    try {
        const res = await dns.resolveSrv(`${record}.${domain}`);
        // sort by priority/weight roughly
        res.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
        for (const r of res) {
            pushCandidate(settings, type, r.name, r.port || defaultPort, secure, `srv:${record}`);
        }
    } catch {
        // ignore
    }
}

async function tryMxHost(domain: string, settings: DiscoveredSettings) {
    try {
        const mx = await dns.resolveMx(domain);
        if (!mx.length) return;

        mx.sort((a, b) => a.priority - b.priority);
        const primaryMx = mx[0]?.exchange?.replace(/\.$/, '').toLowerCase();
        if (!primaryMx) return;
        settings.mxPrimaryHost = primaryMx;

        // Avoid clearly irrelevant providers where mailbox service does not match MX hostname.
        if (primaryMx.includes('google.com') || primaryMx.includes('outlook.com') || primaryMx.includes('protection.outlook.com')) {
            return;
        }

        pushCandidate(settings, 'imap', primaryMx, 993, true, 'mx');
        pushCandidate(settings, 'smtp', primaryMx, 465, true, 'mx');
        pushCandidate(settings, 'smtp', primaryMx, 587, false, 'mx');
    } catch {
        // Ignore MX lookup failure.
    }
}

function looksHeuristicDomainHost(host: string, domain: string): boolean {
    const h = host.toLowerCase();
    const d = domain.toLowerCase();
    return h === d || h.endsWith(`.${d}`);
}

function pushCandidate(
    s: DiscoveredSettings,
    type: 'imap' | 'pop3' | 'smtp',
    host: string,
    port: number,
    secure: boolean,
    source: string,
) {
    s.candidates.push({type, host, port, secure, source});
}

async function fetchAutoconfig(domain: string, email: string): Promise<Partial<DiscoveredSettings>> {
    const urls = [
        `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`,
        `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
        `https://autodiscover.${domain}/autodiscover/autodiscover.xml`,
    ];

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {Accept: 'application/xml,text/xml,*/*'}
            });
            clearTimeout(timeout);
            if (!res.ok) continue;
            const xml = await res.text();
            const parsed = parseConfigXml(xml);
            if (parsed.imap || parsed.smtp || parsed.pop3) return parsed;
        } catch {
            // Ignore and try next URL.
        }
    }

    return {};
}

function parseConfigXml(xml: string): Partial<DiscoveredSettings> {
    const clean = xml.replace(/\r?\n/g, ' ');
    const result: Partial<DiscoveredSettings> = {};

    const providerMatch = clean.match(/<displayName>([^<]+)<\/displayName>/i) || clean.match(/<domain>([^<]+)<\/domain>/i);
    if (providerMatch?.[1]) result.provider = providerMatch[1].trim().toLowerCase();

    const incoming = [...clean.matchAll(/<incomingServer[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/incomingServer>/gi)];
    for (const match of incoming) {
        const type = (match[1] || '').toLowerCase();
        const block = match[2] || '';
        const host = extractTag(block, 'hostname');
        const port = Number(extractTag(block, 'port'));
        const socketType = extractTag(block, 'socketType').toUpperCase();
        const secure = socketType === 'SSL' || socketType === 'TLS';
        if (!host || !port) continue;
        if (type === 'imap') result.imap = {host, port, secure};
        if (type === 'pop3') result.pop3 = {host, port, secure};
    }

    const outgoing = [...clean.matchAll(/<outgoingServer[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/outgoingServer>/gi)];
    for (const match of outgoing) {
        const type = (match[1] || '').toLowerCase();
        const block = match[2] || '';
        if (type !== 'smtp') continue;
        const host = extractTag(block, 'hostname');
        const port = Number(extractTag(block, 'port'));
        const socketType = extractTag(block, 'socketType').toUpperCase();
        const secure = socketType === 'SSL' || socketType === 'TLS';
        if (!host || !port) continue;
        result.smtp = {host, port, secure};
        break;
    }

    return result;
}

function extractTag(block: string, tag: string): string {
    const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i');
    return block.match(re)?.[1]?.trim() ?? '';
}
