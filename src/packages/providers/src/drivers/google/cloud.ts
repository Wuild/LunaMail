import type {
	CloudAccount,
	CloudItem,
	CloudItemStatus,
	CloudShareLinkResult,
	CloudStorageUsage,
	CloudUploadedItem,
	DownloadedCloudItem,
} from '../../types';

type GoogleTokenPayload = {
	accessToken?: string;
};

function parseGoogleAccessToken(secret: string): string {
	const raw = String(secret || '').trim();
	if (!raw.startsWith('{')) throw new Error('Google Drive account is not linked.');
	let payload: GoogleTokenPayload | null = null;
	try {
		payload = JSON.parse(raw) as GoogleTokenPayload;
	} catch {
		throw new Error('Google Drive OAuth payload is invalid. Reconnect this account.');
	}
	const token = String(payload?.accessToken || '').trim();
	if (!token) throw new Error('Google Drive access token missing. Reconnect this account.');
	return token;
}

async function googleFetch(account: CloudAccount, url: string, init?: RequestInit): Promise<Response> {
	const token = parseGoogleAccessToken(account.secret);
	const headers = new Headers(init?.headers ?? undefined);
	headers.set('Authorization', `Bearer ${token}`);
	headers.set('Accept', 'application/json');
	return await fetch(url, {...init, headers});
}

export class GoogleCloudProvider {
	async listItems(account: CloudAccount, pathOrToken?: string | null): Promise<{path: string; items: CloudItem[]}> {
		const parentId = String(pathOrToken || 'root').trim() || 'root';
		const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
		const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
		const response = await googleFetch(account, url);
		if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
		const payload = (await response.json()) as {
			files?: Array<{
				id?: string;
				name?: string;
				mimeType?: string;
				size?: string | number;
				createdTime?: string;
				modifiedTime?: string;
			}>;
		};
		const items: CloudItem[] = (payload.files || [])
			.filter((row) => Boolean(row.id))
			.map((row) => ({
				id: String(row.id),
				name: String(row.name || row.id),
				path: String(row.id),
				isFolder: row.mimeType === 'application/vnd.google-apps.folder',
				size: Number.isFinite(Number(row.size)) ? Number(row.size) : null,
				createdAt: row.createdTime || null,
				modifiedAt: row.modifiedTime || null,
				mimeType: row.mimeType || null,
			}));
		return {path: parentId, items};
	}

	async createFolder(
		account: CloudAccount,
		parentPathOrToken: string | null | undefined,
		folderName: string,
	): Promise<CloudUploadedItem> {
		const name = String(folderName || '').trim();
		if (!name) throw new Error('Folder name is required.');
		const parentId = String(parentPathOrToken || 'root').trim() || 'root';
		const response = await googleFetch(account, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				name,
				mimeType: 'application/vnd.google-apps.folder',
				parents: [parentId],
			}),
		});
		if (!response.ok) throw new Error(`Google Drive create folder failed (${response.status}).`);
		const created = (await response.json()) as {id?: string; name?: string};
		const id = String(created.id || '').trim();
		if (!id) throw new Error('Google Drive create folder did not return an item id.');
		return {id, path: id, name: String(created.name || name).trim() || name};
	}

	async uploadFile(
		account: CloudAccount,
		parentPathOrToken: string | null | undefined,
		fileName: string,
		content: Buffer,
		contentType?: string | null,
	): Promise<CloudUploadedItem> {
		const name = String(fileName || '').trim();
		if (!name) throw new Error('File name is required.');
		const parentId = String(parentPathOrToken || 'root').trim() || 'root';
		const boundary = `llamamail-${Date.now()}`;
		const metadata = JSON.stringify({name, parents: [parentId]});
		const body = Buffer.concat([
			Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
			Buffer.from(`--${boundary}\r\nContent-Type: ${String(contentType || 'application/octet-stream')}\r\n\r\n`),
			content,
			Buffer.from(`\r\n--${boundary}--\r\n`),
		]);
		const response = await googleFetch(
			account,
			'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
			{
				method: 'POST',
				headers: {'Content-Type': `multipart/related; boundary=${boundary}`},
				body,
			},
		);
		if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}).`);
		const uploaded = (await response.json()) as {id?: string; name?: string};
		const id = String(uploaded.id || '').trim();
		if (!id) throw new Error('Google Drive upload did not return an item id.');
		return {id, path: id, name: String(uploaded.name || name).trim() || name};
	}

	async deleteItem(account: CloudAccount, itemPathOrToken: string): Promise<{removed: true}> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('Cannot delete this item.');
		const response = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?supportsAllDrives=true`,
			{method: 'DELETE'},
		);
		if (!response.ok) throw new Error(`Google Drive delete failed (${response.status}).`);
		return {removed: true};
	}

	async moveItem(
		account: CloudAccount,
		itemPathOrToken: string,
		targetParentPathOrToken: string | null | undefined,
	): Promise<{moved: true}> {
		const itemId = String(itemPathOrToken || '').trim();
		const targetParentId = String(targetParentPathOrToken || 'root').trim() || 'root';
		if (!itemId || itemId === 'root') throw new Error('Cannot move this item.');
		const current = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=parents&supportsAllDrives=true`,
		);
		if (!current.ok) throw new Error(`Google Drive move lookup failed (${current.status}).`);
		const currentPayload = (await current.json()) as {parents?: string[]};
		const removeParents = (currentPayload.parents || []).join(',');
		const query = new URLSearchParams({addParents: targetParentId, supportsAllDrives: 'true'});
		if (removeParents) query.set('removeParents', removeParents);
		const response = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?${query.toString()}`,
			{method: 'PATCH'},
		);
		if (!response.ok) throw new Error(`Google Drive move failed (${response.status}).`);
		return {moved: true};
	}

	async downloadItem(account: CloudAccount, itemPathOrToken: string): Promise<DownloadedCloudItem> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('This item cannot be downloaded.');
		const metaResponse = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=id,name,mimeType&supportsAllDrives=true`,
		);
		if (!metaResponse.ok) throw new Error(`Google Drive metadata request failed (${metaResponse.status}).`);
		const meta = (await metaResponse.json()) as {name?: string; mimeType?: string};
		const response = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?alt=media&supportsAllDrives=true`,
		);
		if (!response.ok) throw new Error(`Google Drive download failed (${response.status}).`);
		const content = Buffer.from(await response.arrayBuffer());
		return {
			name: String(meta.name || itemId),
			mimeType: String(meta.mimeType || '').trim() || null,
			content,
		};
	}

	async getStorageUsage(account: CloudAccount): Promise<CloudStorageUsage> {
		const response = await googleFetch(account, 'https://www.googleapis.com/drive/v3/about?fields=storageQuota');
		if (!response.ok) throw new Error(`Google Drive usage request failed (${response.status}).`);
		const payload = (await response.json()) as {storageQuota?: {usage?: string; limit?: string}};
		return {
			usedBytes: Number.isFinite(Number(payload.storageQuota?.usage)) ? Number(payload.storageQuota?.usage) : null,
			totalBytes: Number.isFinite(Number(payload.storageQuota?.limit)) ? Number(payload.storageQuota?.limit) : null,
		};
	}

	async getItemStatus(account: CloudAccount, itemPathOrToken: string): Promise<CloudItemStatus> {
		const itemId = String(itemPathOrToken || '').trim();
		const checkedAt = new Date().toISOString();
		if (!itemId || itemId === 'root') return {exists: false, item: null, checkedAt};
		const response = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=id,name,mimeType,size,createdTime,modifiedTime&supportsAllDrives=true`,
		);
		if (response.status === 404) return {exists: false, item: null, checkedAt};
		if (!response.ok) throw new Error(`Google Drive status request failed (${response.status}).`);
		const row = (await response.json()) as {
			id?: string;
			name?: string;
			mimeType?: string;
			size?: string | number;
			createdTime?: string;
			modifiedTime?: string;
		};
		return {
			exists: true,
			item: {
				id: String(row.id || itemId),
				name: String(row.name || row.id || itemId),
				path: String(row.id || itemId),
				isFolder: row.mimeType === 'application/vnd.google-apps.folder',
				size: Number.isFinite(Number(row.size)) ? Number(row.size) : null,
				createdAt: row.createdTime || null,
				modifiedAt: row.modifiedTime || null,
				mimeType: row.mimeType || null,
			},
			checkedAt,
		};
	}

	async createShareLink(account: CloudAccount, itemPathOrToken: string): Promise<CloudShareLinkResult> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('Share link is unavailable for this item.');
		const response = await googleFetch(
			account,
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=webViewLink,webContentLink&supportsAllDrives=true`,
		);
		if (!response.ok) throw new Error(`Google Drive share request failed (${response.status}).`);
		const payload = (await response.json()) as {webViewLink?: string; webContentLink?: string};
		const url = String(payload.webViewLink || payload.webContentLink || '').trim();
		if (!url) throw new Error('Share link is unavailable for this item.');
		return {url};
	}
}
