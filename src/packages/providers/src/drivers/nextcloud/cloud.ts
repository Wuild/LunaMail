import type {
	CloudAccount,
	CloudItem,
	CloudItemStatus,
	CloudShareLinkResult,
	CloudStorageUsage,
	CloudUploadedItem,
	DownloadedCloudItem,
} from '../../types';

type WebDavEntry = {
	href: string;
	isFolder: boolean;
	size: number | null;
	createdAt: string | null;
	modifiedAt: string | null;
	mimeType: string | null;
};

function ensureCredentials(account: CloudAccount): {baseUrl: string; user: string; password: string} {
	const baseUrl = String(account.base_url || '').trim();
	const user = String(account.user || '').trim();
	const password = String(account.secret || '').trim();
	if (!baseUrl) throw new Error('Cloud account base URL is missing.');
	if (!user) throw new Error('Cloud account username is missing.');
	if (!password) throw new Error('Cloud account secret is missing.');
	return {baseUrl, user, password};
}

function normalizeToken(pathOrToken: string | null | undefined, isFolder = false): string {
	const raw = String(pathOrToken || '/').trim() || '/';
	const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
	if (withLeadingSlash === '/') return '/';
	return isFolder && !withLeadingSlash.endsWith('/') ? `${withLeadingSlash}/` : withLeadingSlash;
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith('/') ? value : `${value}/`;
}

function parseConfiguredUrl(rawBaseUrl: string): URL {
	const normalized = String(rawBaseUrl || '').trim();
	if (!normalized) throw new Error('Cloud account base URL is missing.');
	const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
	try {
		const parsed = new URL(candidate);
		parsed.pathname = ensureTrailingSlash(parsed.pathname || '/');
		return parsed;
	} catch {
		throw new Error('Cloud account base URL is invalid.');
	}
}

function splitPathSegments(token: string): string[] {
	return token
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function encodePathToken(token: string, isFolder = false): string {
	const normalized = normalizeToken(token, isFolder);
	if (normalized === '/') return '/';
	const encoded = splitPathSegments(normalized).map((segment) => encodeURIComponent(segment)).join('/');
	return `/${encoded}${isFolder ? '/' : ''}`;
}

function decodeHrefPathname(pathname: string): string {
	const segments = pathname
		.split('/')
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				return segment;
			}
		})
		.filter(Boolean);
	return `/${segments.join('/')}`;
}

function toIsoOrNull(value: string | null): string | null {
	const normalized = String(value || '').trim();
	if (!normalized) return null;
	const ms = Date.parse(normalized);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function getTagValue(fragment: string, tag: string): string | null {
	const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
	const match = fragment.match(regex);
	if (!match) return null;
	return decodeXmlEntities(match[1]).trim();
}

function decodeXmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

function extractResponses(xml: string): string[] {
	const normalized = xml.replace(/<\/?[A-Za-z0-9_-]+:/g, (part) => part.replace(/([<\/]?)[A-Za-z0-9_-]+:/, '$1'));
	return normalized.match(/<response\b[\s\S]*?<\/response>/g) || [];
}

function parseWebDavResponse(responseXml: string): WebDavEntry | null {
	const href = getTagValue(responseXml, 'href');
	if (!href) return null;
	const resourceType = getTagValue(responseXml, 'resourcetype') || '';
	const isFolder = /<collection\b/i.test(resourceType);
	const sizeRaw = getTagValue(responseXml, 'getcontentlength');
	const size = Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : null;
	const modifiedAt = toIsoOrNull(getTagValue(responseXml, 'getlastmodified'));
	const createdAt = toIsoOrNull(getTagValue(responseXml, 'creationdate'));
	const mimeType = getTagValue(responseXml, 'getcontenttype');
	return {
		href,
		isFolder,
		size,
		createdAt,
		modifiedAt,
		mimeType: mimeType || null,
	};
}

function getNameFromToken(token: string): string {
	const normalized = normalizeToken(token);
	if (normalized === '/') return 'Root';
	const segments = splitPathSegments(normalized);
	return segments[segments.length - 1] || normalized;
}

function resolveDavRoot(account: CloudAccount): URL {
	const {baseUrl, user} = ensureCredentials(account);
	const parsed = parseConfiguredUrl(baseUrl);
	const basePath = ensureTrailingSlash(parsed.pathname || '/');
	const lowerPath = basePath.toLowerCase();
	if (lowerPath.includes('/remote.php/dav/files/')) {
		parsed.pathname = ensureTrailingSlash(parsed.pathname || '/');
		return parsed;
	}
	if (lowerPath.endsWith('/remote.php/dav/') || lowerPath.endsWith('/dav/')) {
		parsed.pathname = `${basePath}files/${encodeURIComponent(user)}/`;
		return parsed;
	}
	parsed.pathname = `${basePath}remote.php/dav/files/${encodeURIComponent(user)}/`;
	return parsed;
}

function resolveDavUrl(account: CloudAccount, token: string, isFolder = false): URL {
	const rootUrl = resolveDavRoot(account);
	const encodedToken = encodePathToken(token, isFolder);
	const relative = encodedToken === '/' ? '' : encodedToken.slice(1);
	return new URL(relative, rootUrl);
}

function relativeTokenFromHref(account: CloudAccount, href: string, isFolder: boolean): string {
	let hrefUrl: URL;
	try {
		hrefUrl = new URL(href, resolveDavRoot(account));
	} catch {
		return '/';
	}
	const rootPath = ensureTrailingSlash(resolveDavRoot(account).pathname);
	const decodedPath = decodeHrefPathname(hrefUrl.pathname);
	if (!decodedPath.startsWith(rootPath)) return normalizeToken(decodedPath, isFolder);
	const relative = decodedPath.slice(rootPath.length - 1);
	return normalizeToken(relative, isFolder);
}

function resolveNextcloudInstallPath(rootUrl: URL): string {
	const normalizedPath = ensureTrailingSlash(rootUrl.pathname || '/');
	const marker = '/remote.php/dav/files/';
	const index = normalizedPath.toLowerCase().indexOf(marker);
	if (index < 0) return '/';
	const base = normalizedPath.slice(0, index) || '/';
	return ensureTrailingSlash(base);
}

async function davFetch(
	account: CloudAccount,
	url: URL,
	init: RequestInit & {headers?: HeadersInit},
): Promise<Response> {
	const {user, password} = ensureCredentials(account);
	const headers = new Headers(init.headers ?? undefined);
	headers.set('Authorization', `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`);
	headers.set('Accept', '*/*');
	return await fetch(url.toString(), {...init, headers});
}

async function propfind(account: CloudAccount, token: string, depth: '0' | '1'): Promise<WebDavEntry[]> {
	const url = resolveDavUrl(account, token, true);
	const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
    <d:getcontenttype />
    <d:creationdate />
    <d:getlastmodified />
  </d:prop>
</d:propfind>`;
	const response = await davFetch(account, url, {
		method: 'PROPFIND',
		headers: {
			Depth: depth,
			'Content-Type': 'application/xml; charset=utf-8',
		},
		body,
	});
	if (!response.ok && response.status !== 207) {
		throw new Error(`WebDAV request failed (${response.status}).`);
	}
	const xml = await response.text();
	return extractResponses(xml)
		.map((fragment) => parseWebDavResponse(fragment))
		.filter((entry): entry is WebDavEntry => Boolean(entry));
}

export class NextcloudCloudProvider {
	async listItems(account: CloudAccount, pathOrToken?: string | null): Promise<{path: string; items: CloudItem[]}> {
		const parentToken = normalizeToken(pathOrToken, true);
		const rows = await propfind(account, parentToken, '1');
		const parentUrl = resolveDavUrl(account, parentToken, true).toString();
		const items: CloudItem[] = rows
			.filter((entry) => {
				const entryUrl = new URL(entry.href, parentUrl).toString();
				return entryUrl !== parentUrl;
			})
			.map((entry) => {
				const token = relativeTokenFromHref(account, entry.href, entry.isFolder);
				return {
					id: token,
					name: getNameFromToken(token),
					path: token,
					isFolder: entry.isFolder,
					size: entry.isFolder ? null : entry.size,
					createdAt: entry.createdAt,
					modifiedAt: entry.modifiedAt,
					mimeType: entry.mimeType,
				};
			})
			.sort((a, b) => {
				if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
				return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
			});
		return {path: parentToken, items};
	}

	async createFolder(
		account: CloudAccount,
		parentPathOrToken: string | null | undefined,
		folderName: string,
	): Promise<CloudUploadedItem> {
		const parentToken = normalizeToken(parentPathOrToken, true);
		const name = String(folderName || '').trim();
		if (!name) throw new Error('Folder name is required.');
		const folderToken = normalizeToken(`${parentToken}${parentToken.endsWith('/') ? '' : '/'}${name}`, true);
		const response = await davFetch(account, resolveDavUrl(account, folderToken, true), {method: 'MKCOL'});
		if (response.status !== 201 && response.status !== 405) {
			throw new Error(`WebDAV create folder failed (${response.status}).`);
		}
		return {id: folderToken, path: folderToken, name};
	}

	async uploadFile(
		account: CloudAccount,
		parentPathOrToken: string | null | undefined,
		fileName: string,
		content: Buffer,
		contentType?: string | null,
	): Promise<CloudUploadedItem> {
		const parentToken = normalizeToken(parentPathOrToken, true);
		const name = String(fileName || '').trim();
		if (!name) throw new Error('File name is required.');
		const fileToken = normalizeToken(`${parentToken}${parentToken.endsWith('/') ? '' : '/'}${name}`);
		const response = await davFetch(account, resolveDavUrl(account, fileToken), {
			method: 'PUT',
			headers: {'Content-Type': String(contentType || 'application/octet-stream')},
			body: new Uint8Array(content),
		});
		if (!response.ok) throw new Error(`WebDAV upload failed (${response.status}).`);
		return {id: fileToken, path: fileToken, name};
	}

	async deleteItem(account: CloudAccount, itemPathOrToken: string): Promise<{removed: true}> {
		const token = normalizeToken(itemPathOrToken);
		if (token === '/') throw new Error('Cannot delete the root folder.');
		const response = await davFetch(account, resolveDavUrl(account, token), {method: 'DELETE'});
		if (!response.ok && response.status !== 404) {
			throw new Error(`WebDAV delete failed (${response.status}).`);
		}
		return {removed: true};
	}

	async moveItem(
		account: CloudAccount,
		itemPathOrToken: string,
		targetParentPathOrToken: string | null | undefined,
	): Promise<{moved: true}> {
		const sourceToken = normalizeToken(itemPathOrToken);
		if (sourceToken === '/') throw new Error('Cannot move the root folder.');
		const targetParentToken = normalizeToken(targetParentPathOrToken, true);
		const itemName = getNameFromToken(sourceToken);
		const destinationToken = normalizeToken(`${targetParentToken}${targetParentToken.endsWith('/') ? '' : '/'}${itemName}`);
		const response = await davFetch(account, resolveDavUrl(account, sourceToken), {
			method: 'MOVE',
			headers: {
				Destination: resolveDavUrl(account, destinationToken).toString(),
				Overwrite: 'F',
			},
		});
		if (!response.ok) throw new Error(`WebDAV move failed (${response.status}).`);
		return {moved: true};
	}

	async downloadItem(account: CloudAccount, itemPathOrToken: string): Promise<DownloadedCloudItem> {
		const token = normalizeToken(itemPathOrToken);
		if (token === '/') throw new Error('This item cannot be downloaded.');
		const response = await davFetch(account, resolveDavUrl(account, token), {method: 'GET'});
		if (!response.ok) throw new Error(`WebDAV download failed (${response.status}).`);
		return {
			name: getNameFromToken(token),
			mimeType: String(response.headers.get('content-type') || '').trim() || null,
			content: Buffer.from(await response.arrayBuffer()),
		};
	}

	async getStorageUsage(_account: CloudAccount): Promise<CloudStorageUsage> {
		return {
			usedBytes: null,
			totalBytes: null,
		};
	}

	async getItemStatus(account: CloudAccount, itemPathOrToken: string): Promise<CloudItemStatus> {
		const token = normalizeToken(itemPathOrToken);
		const checkedAt = new Date().toISOString();
		if (token === '/') {
			return {
				exists: true,
				item: {
					id: '/',
					name: 'Root',
					path: '/',
					isFolder: true,
					size: null,
					createdAt: null,
					modifiedAt: null,
					mimeType: null,
				},
				checkedAt,
			};
		}
		const entries = await propfind(account, token, '0').catch(() => []);
		if (entries.length === 0) return {exists: false, item: null, checkedAt};
		const entry = entries[0];
		const path = relativeTokenFromHref(account, entry.href, entry.isFolder);
		return {
			exists: true,
			item: {
				id: path,
				name: getNameFromToken(path),
				path,
				isFolder: entry.isFolder,
				size: entry.isFolder ? null : entry.size,
				createdAt: entry.createdAt,
				modifiedAt: entry.modifiedAt,
				mimeType: entry.mimeType,
			},
			checkedAt,
		};
	}

	async createShareLink(account: CloudAccount, itemPathOrToken: string): Promise<CloudShareLinkResult> {
		const token = normalizeToken(itemPathOrToken);
		if (token === '/') throw new Error('Share link is unavailable for this item.');
		const directUrl = resolveDavUrl(account, token).toString();
		if (String(account.provider || '').trim() !== 'nextcloud') {
			return {url: directUrl};
		}

		try {
			const root = resolveDavRoot(account);
			const relative = token.startsWith('/') ? token : `/${token}`;
			const installPath = resolveNextcloudInstallPath(root);
			const response = await davFetch(account, new URL(`${installPath}ocs/v2.php/apps/files_sharing/api/v1/shares`, root.origin), {
				method: 'POST',
				headers: {
					'OCS-APIRequest': 'true',
						'Content-Type': 'application/x-www-form-urlencoded',
						Accept: 'application/json',
					},
				body: new URLSearchParams({
					path: relative,
					shareType: '3',
					permissions: '1',
				}).toString(),
			});
			if (!response.ok) return {url: directUrl};
			const payload = (await response.json().catch(() => null)) as
				| {ocs?: {data?: {url?: string}}}
				| null;
			const shareUrl = String(payload?.ocs?.data?.url || '').trim();
			return {url: shareUrl || directUrl};
		} catch {
			return {url: directUrl};
		}
	}
}
