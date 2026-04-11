import {app} from 'electron';
import fs from 'fs';
import path from 'path';
import {promises as dns} from 'dns';
import {createHash} from 'crypto';

const ICON_FETCH_TIMEOUT_MS = 4500;
const iconPathCache = new Map<string, string | null>();
const inflightByDomain = new Map<string, Promise<string | undefined>>();

function getSenderIconCacheDir(): string {
	return path.join(app.getPath('userData'), 'notification-sender-icons');
}

function normalizeDomain(value: string): string {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/^\.+|\.+$/g, '');
}

function extractSenderDomain(fromAddress: string | null | undefined): string | null {
	const raw = String(fromAddress || '')
		.trim()
		.toLowerCase();
	if (!raw) return null;
	const match = raw.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i);
	if (!match?.[2]) return null;
	const domain = normalizeDomain(match[2]);
	return domain || null;
}

function cacheBaseName(domain: string): string {
	const digest = createHash('sha1').update(domain).digest('hex').slice(0, 12);
	return `${domain.replace(/[^a-z0-9.-]/g, '-')}-${digest}`;
}

async function resolveBimiLogoUrl(domain: string): Promise<string | null> {
	try {
		const records = await dns.resolveTxt(`default._bimi.${domain}`);
		for (const row of records) {
			const value = row.join('').trim();
			if (!value) continue;
			const match = value.match(/(?:^|;)\s*l=([^;]+)/i);
			if (!match?.[1]) continue;
			const logoUrl = String(match[1]).trim();
			if (/^https:\/\//i.test(logoUrl)) return logoUrl;
		}
	} catch {
		// ignore DNS/BIMI lookup errors
	}
	return null;
}

async function fetchIconBuffer(url: string): Promise<{ buffer: Buffer; ext: string } | null> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'user-agent': 'LunaMail/notification-icon',
			},
		});
		clearTimeout(timeoutId);
		if (!response.ok) return null;
		const contentType = String(response.headers.get('content-type') || '').toLowerCase();
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.length < 64) return null;
		if (contentType.includes('png')) return {buffer: bytes, ext: 'png'};
		if (contentType.includes('jpeg') || contentType.includes('jpg')) return {buffer: bytes, ext: 'jpg'};
		if (contentType.includes('webp')) return {buffer: bytes, ext: 'webp'};
		if (contentType.includes('svg')) return null;
		// Fallback by signature.
		if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
			return {buffer: bytes, ext: 'png'};
		}
		if (bytes[0] === 0xff && bytes[1] === 0xd8) {
			return {buffer: bytes, ext: 'jpg'};
		}
		if (
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46 &&
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50
		) {
			return {buffer: bytes, ext: 'webp'};
		}
	} catch {
		// ignore remote fetch errors
	}
	return null;
}

async function fetchSenderDomainIcon(domain: string): Promise<{ buffer: Buffer; ext: string } | null> {
	const bimiUrl = await resolveBimiLogoUrl(domain);
	const urls = [
		bimiUrl,
		`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
		`https://logo.clearbit.com/${encodeURIComponent(domain)}?size=128`,
	].filter((value): value is string => Boolean(value));

	for (const url of urls) {
		const result = await fetchIconBuffer(url);
		if (result) return result;
	}
	return null;
}

export async function resolveSenderNotificationIconPath(
	fromAddress: string | null | undefined,
): Promise<string | undefined> {
	const domain = extractSenderDomain(fromAddress);
	if (!domain) return undefined;
	const cached = iconPathCache.get(domain);
	if (cached !== undefined) {
		return cached ?? undefined;
	}
	const inflight = inflightByDomain.get(domain);
	if (inflight) {
		return await inflight;
	}

	const promise = (async function (): Promise<string | undefined> {
		const iconDir = getSenderIconCacheDir();
		try {
			if (!fs.existsSync(iconDir)) {
				fs.mkdirSync(iconDir, {recursive: true});
			}
		} catch {
			iconPathCache.set(domain, null);
			return undefined;
		}

		const baseName = cacheBaseName(domain);
		const knownExts = ['png', 'jpg', 'webp'];
		for (const ext of knownExts) {
			const existingPath = path.join(iconDir, `${baseName}.${ext}`);
			if (fs.existsSync(existingPath)) {
				iconPathCache.set(domain, existingPath);
				return existingPath;
			}
		}

		const fetched = await fetchSenderDomainIcon(domain);
		if (!fetched) {
			iconPathCache.set(domain, null);
			return undefined;
		}
		const targetPath = path.join(iconDir, `${baseName}.${fetched.ext}`);
		try {
			fs.writeFileSync(targetPath, fetched.buffer);
			iconPathCache.set(domain, targetPath);
			return targetPath;
		} catch {
			iconPathCache.set(domain, null);
			return undefined;
		}
	})();

	inflightByDomain.set(domain, promise);
	try {
		return await promise;
	} finally {
		inflightByDomain.delete(domain);
	}
}
