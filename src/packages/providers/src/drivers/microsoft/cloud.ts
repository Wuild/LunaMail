import type {
	CloudAccount,
	CloudItem,
	CloudItemStatus,
	CloudShareLinkResult,
	CloudStorageUsage,
	CloudUploadedItem,
	DownloadedCloudItem,
} from '../../types';

type MicrosoftTokenPayload = {
	accessToken?: string;
};

function parseMicrosoftAccessToken(secret: string): string {
	const raw = String(secret || '').trim();
	if (!raw.startsWith('{')) throw new Error('OneDrive account is not linked.');
	let payload: MicrosoftTokenPayload | null = null;
	try {
		payload = JSON.parse(raw) as MicrosoftTokenPayload;
	} catch {
		throw new Error('OneDrive OAuth payload is invalid. Reconnect this account.');
	}
	const token = String(payload?.accessToken || '').trim();
	if (!token) throw new Error('OneDrive access token missing. Reconnect this account.');
	return token;
}

async function oneDriveFetch(account: CloudAccount, url: string, init?: RequestInit): Promise<Response> {
	const token = parseMicrosoftAccessToken(account.secret);
	const headers = new Headers(init?.headers ?? undefined);
	headers.set('Authorization', `Bearer ${token}`);
	headers.set('Accept', 'application/json');
	return await fetch(url, {...init, headers});
}

function toCloudItem(row: {
	id?: string;
	name?: string;
	folder?: unknown;
	size?: number;
	createdDateTime?: string;
	lastModifiedDateTime?: string;
	file?: {mimeType?: string};
}): CloudItem | null {
	const id = String(row.id || '').trim();
	if (!id) return null;
	return {
		id,
		name: String(row.name || id),
		path: id,
		isFolder: Boolean(row.folder),
		size: Number.isFinite(Number(row.size)) ? Number(row.size) : null,
		createdAt: row.createdDateTime || null,
		modifiedAt: row.lastModifiedDateTime || null,
		mimeType: row.file?.mimeType || null,
	};
}

export class MicrosoftCloudProvider {
	async listItems(account: CloudAccount, pathOrToken?: string | null): Promise<{path: string; items: CloudItem[]}> {
		const parentId = String(pathOrToken || 'root').trim() || 'root';
		const endpoint =
			parentId === 'root'
				? 'https://graph.microsoft.com/v1.0/me/drive/root/children'
				: `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children`;
		const response = await oneDriveFetch(account, endpoint);
		if (!response.ok) throw new Error(`OneDrive request failed (${response.status}).`);
		const payload = (await response.json()) as {
			value?: Array<{
				id?: string;
				name?: string;
				folder?: unknown;
				size?: number;
				createdDateTime?: string;
				lastModifiedDateTime?: string;
				file?: {mimeType?: string};
			}>;
		};
		const items = (payload.value || [])
			.map((row) => toCloudItem(row))
			.filter((row): row is CloudItem => Boolean(row));
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
		const endpoint =
			parentId === 'root'
				? 'https://graph.microsoft.com/v1.0/me/drive/root/children'
				: `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children`;
		const response = await oneDriveFetch(account, endpoint, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				name,
				folder: {},
				'@microsoft.graph.conflictBehavior': 'rename',
			}),
		});
		if (!response.ok) throw new Error(`OneDrive create folder failed (${response.status}).`);
		const created = (await response.json()) as {id?: string; name?: string};
		const id = String(created.id || '').trim();
		if (!id) throw new Error('OneDrive create folder did not return an item id.');
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
		const endpoint =
			parentId === 'root'
				? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`
				: `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(name)}:/content`;
		const response = await oneDriveFetch(account, endpoint, {
			method: 'PUT',
			headers: {'Content-Type': String(contentType || 'application/octet-stream')},
			body: new Uint8Array(content),
		});
		if (!response.ok) throw new Error(`OneDrive upload failed (${response.status}).`);
		const uploaded = (await response.json()) as {id?: string; name?: string};
		const id = String(uploaded.id || '').trim();
		if (!id) throw new Error('OneDrive upload did not return an item id.');
		return {id, path: id, name: String(uploaded.name || name).trim() || name};
	}

	async deleteItem(account: CloudAccount, itemPathOrToken: string): Promise<{removed: true}> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('Cannot delete this item.');
		const response = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`,
			{method: 'DELETE'},
		);
		if (!response.ok) throw new Error(`OneDrive delete failed (${response.status}).`);
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
		const payload =
			targetParentId === 'root'
				? {parentReference: {path: '/drive/root:'}}
				: {parentReference: {id: targetParentId}};
		const response = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`,
			{
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			},
		);
		if (!response.ok) throw new Error(`OneDrive move failed (${response.status}).`);
		return {moved: true};
	}

	async downloadItem(account: CloudAccount, itemPathOrToken: string): Promise<DownloadedCloudItem> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('This item cannot be downloaded.');
		const metadata = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,file`,
		);
		if (!metadata.ok) throw new Error(`OneDrive metadata request failed (${metadata.status}).`);
		const info = (await metadata.json()) as {name?: string; file?: {mimeType?: string}};
		const response = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/content`,
		);
		if (!response.ok) throw new Error(`OneDrive download failed (${response.status}).`);
		return {
			name: String(info.name || itemId),
			mimeType: info.file?.mimeType || null,
			content: Buffer.from(await response.arrayBuffer()),
		};
	}

	async getStorageUsage(account: CloudAccount): Promise<CloudStorageUsage> {
		const response = await oneDriveFetch(account, 'https://graph.microsoft.com/v1.0/me/drive?$select=quota');
		if (!response.ok) throw new Error(`OneDrive usage request failed (${response.status}).`);
		const payload = (await response.json()) as {quota?: {used?: number; total?: number}};
		return {
			usedBytes: Number.isFinite(Number(payload.quota?.used)) ? Number(payload.quota?.used) : null,
			totalBytes: Number.isFinite(Number(payload.quota?.total)) ? Number(payload.quota?.total) : null,
		};
	}

	async getItemStatus(account: CloudAccount, itemPathOrToken: string): Promise<CloudItemStatus> {
		const itemId = String(itemPathOrToken || '').trim();
		const checkedAt = new Date().toISOString();
		if (!itemId || itemId === 'root') return {exists: false, item: null, checkedAt};
		const response = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,folder,size,createdDateTime,lastModifiedDateTime,file`,
		);
		if (response.status === 404) return {exists: false, item: null, checkedAt};
		if (!response.ok) throw new Error(`OneDrive status request failed (${response.status}).`);
		const payload = (await response.json()) as {
			id?: string;
			name?: string;
			folder?: unknown;
			size?: number;
			createdDateTime?: string;
			lastModifiedDateTime?: string;
			file?: {mimeType?: string};
		};
		return {
			exists: true,
			item: toCloudItem(payload),
			checkedAt,
		};
	}

	async createShareLink(account: CloudAccount, itemPathOrToken: string): Promise<CloudShareLinkResult> {
		const itemId = String(itemPathOrToken || '').trim();
		if (!itemId || itemId === 'root') throw new Error('Share link is unavailable for this item.');
		const response = await oneDriveFetch(
			account,
			`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}?$select=webUrl`,
		);
		if (!response.ok) throw new Error(`OneDrive share request failed (${response.status}).`);
		const payload = (await response.json()) as {webUrl?: string};
		const url = String(payload.webUrl || '').trim();
		if (!url) throw new Error('Share link is unavailable for this item.');
		return {url};
	}
}
