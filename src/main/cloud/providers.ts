import {type CloudAccountCredentials, setCloudAccountSecret} from "../db/repositories/cloudRepo.js";
import {createMailDebugLogger} from "../debug/debugLog.js";

export interface CloudItem {
    id: string;
    name: string;
    path: string;
    isFolder: boolean;
    size: number | null;
    createdAt: string | null;
    modifiedAt: string | null;
    mimeType: string | null;
}

export interface CloudUploadedItem {
    id: string;
    path: string;
    name: string;
}

export interface DownloadedCloudItem {
    name: string;
    mimeType: string | null;
    content: Buffer;
}

export interface CloudStorageUsage {
    usedBytes: number | null;
    totalBytes: number | null;
}

export interface CloudItemStatus {
    exists: boolean;
    item: CloudItem | null;
    checkedAt: string;
}

export interface CloudShareLinkResult {
    url: string;
}

type OAuthSecretPayload = {
    accessToken?: string;
    refreshToken?: string | null;
    expiresAt?: number | null;
    tokenType?: string | null;
    scope?: string | null;
    provider?: string | null;
    clientId?: string | null;
    tenantId?: string | null;
};

const logger = createMailDebugLogger("cloud", "providers");

export async function listCloudItems(
    account: CloudAccountCredentials,
    pathOrToken?: string | null
): Promise<{ path: string; items: CloudItem[] }> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return listWebDavItems(account, pathOrToken);
    }
    if (account.provider === "google-drive") {
        return listGoogleDriveItems(account, pathOrToken);
    }
    if (account.provider === "onedrive") {
        return listOneDriveItems(account, pathOrToken);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function createCloudFolder(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    folderName: string
): Promise<CloudUploadedItem> {
    const normalizedFolderName = String(folderName || "").trim();
    if (!normalizedFolderName) throw new Error("Folder name is required.");
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return createWebDavFolder(account, parentPathOrToken, normalizedFolderName);
    }
    if (account.provider === "google-drive") {
        return createGoogleDriveFolder(account, parentPathOrToken, normalizedFolderName);
    }
    if (account.provider === "onedrive") {
        return createOneDriveFolder(account, parentPathOrToken, normalizedFolderName);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function uploadCloudFile(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    fileName: string,
    content: Buffer,
    contentType?: string | null
): Promise<CloudUploadedItem> {
    const normalizedFileName = String(fileName || "").trim();
    if (!normalizedFileName) throw new Error("File name is required.");
    if (!Buffer.isBuffer(content) || content.length === 0) {
        throw new Error("File content is empty.");
    }
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return uploadWebDavFile(account, parentPathOrToken, normalizedFileName, content, contentType);
    }
    if (account.provider === "google-drive") {
        return uploadGoogleDriveFile(account, parentPathOrToken, normalizedFileName, content, contentType);
    }
    if (account.provider === "onedrive") {
        return uploadOneDriveFile(account, parentPathOrToken, normalizedFileName, content, contentType);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function deleteCloudItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<{ removed: true }> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return deleteWebDavItem(account, itemPathOrToken);
    }
    if (account.provider === "google-drive") {
        return deleteGoogleDriveItem(account, itemPathOrToken);
    }
    if (account.provider === "onedrive") {
        return deleteOneDriveItem(account, itemPathOrToken);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function downloadCloudItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<DownloadedCloudItem> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return downloadWebDavItem(account, itemPathOrToken);
    }
    if (account.provider === "google-drive") {
        return downloadGoogleDriveItem(account, itemPathOrToken);
    }
    if (account.provider === "onedrive") {
        return downloadOneDriveItem(account, itemPathOrToken);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function getCloudStorageUsage(account: CloudAccountCredentials): Promise<CloudStorageUsage> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return getWebDavStorageUsage(account);
    }
    if (account.provider === "google-drive") {
        return getGoogleDriveStorageUsage(account);
    }
    if (account.provider === "onedrive") {
        return getOneDriveStorageUsage(account);
    }
    return {usedBytes: null, totalBytes: null};
}

export async function getCloudItemStatus(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<CloudItemStatus> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        return getWebDavItemStatus(account, itemPathOrToken);
    }
    if (account.provider === "google-drive") {
        return getGoogleDriveItemStatus(account, itemPathOrToken);
    }
    if (account.provider === "onedrive") {
        return getOneDriveItemStatus(account, itemPathOrToken);
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

export async function createCloudShareLink(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<CloudShareLinkResult> {
    if (account.provider === "nextcloud" || account.provider === "webdav") {
        const baseUrlRaw = String(account.base_url || "").trim();
        if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
        const itemPath = normalizeWebDavPath(itemPathOrToken);
        return {url: resolveWebDavUrl(baseUrlRaw, itemPath)};
    }
    if (account.provider === "google-drive") {
        const bearerToken = await resolveCloudBearerToken(account);
        const itemId = String(itemPathOrToken || "").trim();
        if (!itemId || itemId === "root") {
            throw new Error("Share link is unavailable for this item.");
        }
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=id,webViewLink,webContentLink&supportsAllDrives=true`,
            {headers: {Authorization: `Bearer ${bearerToken}`}}
        );
        if (!response.ok) {
            throw new Error(`Share link request failed (${response.status})`);
        }
        const payload = (await response.json()) as { webViewLink?: string; webContentLink?: string };
        const url = String(payload.webViewLink || payload.webContentLink || "").trim();
        if (!url) throw new Error("Share link is unavailable for this item.");
        return {url};
    }
    if (account.provider === "onedrive") {
        const parsedToken = parseOneDriveToken(itemPathOrToken);
        const resolvedToken = await resolveOneDriveItemAccessToken(account, parsedToken);
        if (resolvedToken.kind === "root" || resolvedToken.kind === "scope" || resolvedToken.kind === "drive") {
            throw new Error("Share link is unavailable for this item.");
        }
        const endpoint = buildOneDriveItemEndpoint(resolvedToken);
        const response = await oneDriveFetch(account, `${endpoint}?$select=webUrl`);
        if (!response.ok) {
            throw new Error(`Share link request failed (${response.status})`);
        }
        const payload = (await response.json()) as { webUrl?: string };
        const url = String(payload.webUrl || "").trim();
        if (!url) throw new Error("Share link is unavailable for this item.");
        return {url};
    }
    throw new Error(`Unsupported cloud provider: ${account.provider}`);
}

async function listWebDavItems(
    account: CloudAccountCredentials,
    pathOrToken?: string | null
): Promise<{ path: string; items: CloudItem[] }> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const currentPath = normalizeWebDavPath(pathOrToken);
    const targetUrl = resolveWebDavUrl(baseUrlRaw, currentPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "PROPFIND",
        headers: {
            Authorization: `Basic ${auth}`,
            Depth: "1",
            "Content-Type": "application/xml; charset=utf-8",
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:creationdate/>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`,
    });

    if (!response.ok) {
        throw new Error(`WebDAV request failed (${response.status})`);
    }

    const xml = await response.text();
    const responses = parseWebDavMultiStatus(xml);
    const items = responses
        .map((entry) => normalizeWebDavResponseItem(entry, baseUrlRaw))
        .filter((entry): entry is CloudItem => Boolean(entry))
        .filter((entry) => entry.path !== currentPath);

    return {path: currentPath, items};
}

async function listGoogleDriveItems(
    account: CloudAccountCredentials,
    pathOrToken?: string | null
): Promise<{ path: string; items: CloudItem[] }> {
    const bearerToken = await resolveCloudBearerToken(account);
    const parentId = String(pathOrToken || "root").trim() || "root";
    const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
        },
    });
    if (!response.ok) {
        throw new Error(`Google Drive request failed (${response.status})`);
    }
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
        .map((row) => {
            const mimeType = row.mimeType || null;
            const isFolder = mimeType === "application/vnd.google-apps.folder";
            const sizeValue = Number(row.size);
            return {
                id: String(row.id),
                name: String(row.name || row.id),
                path: String(row.id),
                isFolder,
                size: Number.isFinite(sizeValue) ? sizeValue : null,
                createdAt: row.createdTime || null,
                modifiedAt: row.modifiedTime || null,
                mimeType,
            };
        });
    return {path: parentId, items};
}

async function listOneDriveItems(
    account: CloudAccountCredentials,
    pathOrToken?: string | null
): Promise<{ path: string; items: CloudItem[] }> {
    const parsedToken = parseOneDriveToken(pathOrToken);
    const resolvedToken = await resolveOneDriveItemAccessToken(account, parsedToken);
    const currentToken = serializeOneDriveToken(parsedToken);
    if (parsedToken.kind === "scope" && parsedToken.scope === "shares") {
        const sharedRoots = await listOneDriveSharedRootItems(account);
        const expanded = await expandOneDriveSharedFolders(account, sharedRoots);
        return {path: currentToken, items: expanded};
    }

    const endpoint = buildOneDriveChildrenEndpoint(resolvedToken);
    let rows: Array<{
        id?: string;
        name?: string;
        folder?: unknown;
        size?: number;
        createdDateTime?: string;
        lastModifiedDateTime?: string;
        file?: { mimeType?: string };
        parentReference?: { driveId?: string };
    }> = [];
    try {
        rows = await fetchAllOneDriveValues(account, endpoint, "OneDrive request failed");
    } catch (error: any) {
        const status = extractOneDriveStatusCode(error);
        if (resolvedToken.kind !== "item" || status !== 400) {
            throw error;
        }
        const shareRows = await listOneDriveSharedChildrenByShareId(account, resolvedToken.itemId);
        if (!shareRows) {
            throw error;
        }
        rows = shareRows;
    }
    const personalItems: CloudItem[] = rows
        .filter((row) => Boolean(row.id))
        .map((row) => ({
            id: String(row.id),
            name: String(row.name || row.id),
            path: serializeOneDriveToken(resolveOneDriveChildTokenWithRow(resolvedToken, row)),
            isFolder: Boolean(row.folder),
            size: Number.isFinite(Number(row.size)) ? Number(row.size) : null,
            createdAt: row.createdDateTime || null,
            modifiedAt: row.lastModifiedDateTime || null,
            mimeType: row.file?.mimeType || null,
        }));

    const shouldMergeSharedAtRoot =
        parsedToken.kind === "root" || (parsedToken.kind === "scope" && parsedToken.scope === "home");
    if (!shouldMergeSharedAtRoot) {
        return {path: currentToken, items: personalItems};
    }
    const sharedItems = await listOneDriveSharedRootItems(account);
    return {path: currentToken, items: mergeCloudItemsByPath(personalItems, sharedItems)};
}

async function listOneDriveSharedChildrenByShareId(
    account: CloudAccountCredentials,
    itemId: string
): Promise<Array<{
    id?: string;
    name?: string;
    folder?: unknown;
    size?: number;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    file?: { mimeType?: string };
    parentReference?: { driveId?: string };
}> | null> {
    const shareId = await resolveOneDriveShareIdForItem(account, itemId);
    if (!shareId) return null;
    const endpoint = `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareId)}/driveItem/children`;
    try {
        return await fetchAllOneDriveValues(account, endpoint, "OneDrive request failed");
    } catch {
        return null;
    }
}

async function resolveOneDriveShareIdForItem(account: CloudAccountCredentials, itemId: string): Promise<string | null> {
    const endpoints = [
        "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=200&allowexternal=true",
        "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=200&allowexternal=true&$select=id,name,remoteItem",
    ];
    for (const endpoint of endpoints) {
        let rows: Array<{
            id?: string;
            remoteItem?: { id?: string };
        }> = [];
        try {
            rows = await fetchAllOneDriveValues(account, endpoint, "OneDrive sharedWithMe request failed");
        } catch {
            continue;
        }
        const match = rows.find((row) => String(row.remoteItem?.id || "").trim() === itemId);
        const shareId = String(match?.id || "").trim();
        if (shareId) return shareId;
    }
    return null;
}

async function listOneDriveSharedRootItems(account: CloudAccountCredentials): Promise<CloudItem[]> {
    const endpoints = [
        // Preferred shape with explicit expansion.
        "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=200&allowexternal=true&$expand=remoteItem($select=id,name,size,createdDateTime,lastModifiedDateTime,folder,file,parentReference)&$select=id,name,remoteItem",
        // Fallback legacy shape.
        "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=200&allowexternal=true",
        // Conservative select fallback.
        "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=200&allowexternal=true&$select=id,name,remoteItem",
    ];
    let sawSuccessfulResponse = false;
    const failedStatuses: number[] = [];
    const mergedByPath = new Map<string, CloudItem>();
    let sawAnyRows = false;
    for (const endpoint of endpoints) {
        logger.debug("OneDrive sharedWithMe request accountId=%d endpoint=%s", account.id, endpoint);
        let rows: Array<{
            id?: string;
            name?: string;
            remoteItem?: {
                id?: string;
                name?: string;
                size?: number;
                createdDateTime?: string;
                lastModifiedDateTime?: string;
                folder?: unknown;
                file?: { mimeType?: string };
                parentReference?: { driveId?: string };
            };
        }> = [];
        try {
            rows = await fetchAllOneDriveValues(account, endpoint, "OneDrive sharedWithMe request failed");
            sawSuccessfulResponse = true;
        } catch (error: any) {
            const statusMatch = String(error?.message || "").match(/\((\d+)\)/);
            const status = Number(statusMatch?.[1] || "");
            if (Number.isFinite(status) && status > 0) {
                failedStatuses.push(status);
                logger.warn(
                    "OneDrive sharedWithMe request failed accountId=%d endpoint=%s status=%d",
                    account.id,
                    endpoint,
                    status
                );
                continue;
            }
            throw error;
        }
        if (rows.length > 0) sawAnyRows = true;
        const items = mapOneDriveSharedRows(rows);
        logger.debug(
            "OneDrive sharedWithMe page summary accountId=%d endpoint=%s rows=%d mappedItems=%d",
            account.id,
            endpoint,
            rows.length,
            items.length
        );
        for (const item of items) {
            mergedByPath.set(item.path, item);
        }
    }
    if (sawSuccessfulResponse) {
        if (!sawAnyRows) return [];
        const mergedItems = Array.from(mergedByPath.values());
        logger.info("OneDrive sharedWithMe merged result accountId=%d totalItems=%d", account.id, mergedItems.length);
        return mergedItems;
    }
    if (!sawSuccessfulResponse) {
        const statusSummary = failedStatuses.length ? failedStatuses.join(", ") : "unknown";
        throw new Error(`OneDrive sharedWithMe request failed (${statusSummary}).`);
    }
    return [];
}

async function expandOneDriveSharedFolders(
    account: CloudAccountCredentials,
    sharedRootItems: CloudItem[]
): Promise<CloudItem[]> {
    const MAX_SHARED_CRAWL_REQUESTS = 200;
    const MAX_DISCOVERED_FOLDERS = 4000;
    const mergedByPath = new Map<string, CloudItem>();
    const folderQueue: CloudItem[] = [];
    const visitedFolderPaths = new Set<string>();
    for (const item of sharedRootItems) {
        mergedByPath.set(item.path, item);
        if (item.isFolder) {
            folderQueue.push(item);
        }
    }
    let requestCount = 0;
    while (folderQueue.length > 0) {
        if (requestCount >= MAX_SHARED_CRAWL_REQUESTS) {
            logger.warn(
                "OneDrive shared folder crawl stopped at request limit accountId=%d requests=%d folders=%d",
                account.id,
                requestCount,
                mergedByPath.size
            );
            break;
        }
        if (mergedByPath.size >= MAX_DISCOVERED_FOLDERS) {
            logger.warn(
                "OneDrive shared folder crawl stopped at folder limit accountId=%d requests=%d folders=%d",
                account.id,
                requestCount,
                mergedByPath.size
            );
            break;
        }
        const parent = folderQueue.shift();
        if (!parent) break;
        if (visitedFolderPaths.has(parent.path)) continue;
        visitedFolderPaths.add(parent.path);
        const parentToken = parseOneDriveToken(parent.path);
        if (parentToken.kind !== "shared" && parentToken.kind !== "item") continue;
        requestCount += 1;
        let rows: Array<{
            id?: string;
            name?: string;
            folder?: unknown;
            size?: number;
            createdDateTime?: string;
            lastModifiedDateTime?: string;
            file?: { mimeType?: string };
        }> = [];
        try {
            const endpoint = buildOneDriveChildrenEndpoint(parentToken);
            rows = await fetchAllOneDriveValues(account, endpoint, "OneDrive shared descendants request failed");
        } catch (error: any) {
            logger.warn(
                "OneDrive shared descendants request failed accountId=%d parent=%s reason=%s",
                account.id,
                parent.path,
                String(error?.message || error)
            );
            continue;
        }
        for (const row of rows) {
            const childId = String(row.id || "").trim();
            if (!childId) continue;
            const childToken = resolveOneDriveChildToken(parentToken, childId);
            const childPath = serializeOneDriveToken(childToken);
            if (mergedByPath.has(childPath)) continue;
            const child: CloudItem = {
                id: childId,
                name: String(row.name || childId),
                path: childPath,
                isFolder: Boolean(row.folder),
                size: Number.isFinite(Number(row.size)) ? Number(row.size) : null,
                createdAt: row.createdDateTime || null,
                modifiedAt: row.lastModifiedDateTime || null,
                mimeType: row.file?.mimeType || null,
            };
            if (!child.isFolder) continue;
            mergedByPath.set(child.path, child);
            folderQueue.push(child);
        }
    }
    const mergedItems = Array.from(mergedByPath.values());
    logger.info(
        "OneDrive shared folder crawl complete accountId=%d roots=%d folders=%d requests=%d",
        account.id,
        sharedRootItems.length,
        mergedItems.length,
        requestCount
    );
    return mergedItems;
}

async function fetchAllOneDriveValues<T>(
    account: CloudAccountCredentials,
    initialUrl: string,
    errorPrefix: string
): Promise<T[]> {
    const allRows: T[] = [];
    let nextUrl: string | null = initialUrl;
    let pageCount = 0;
    while (nextUrl) {
        pageCount += 1;
        if (pageCount > 100) {
            throw new Error("OneDrive pagination limit reached.");
        }
        const response = await oneDriveFetch(account, nextUrl);
        if (!response.ok) {
            throw new Error(`${errorPrefix} (${response.status})`);
        }
        const payload = (await response.json()) as {
            value?: T[];
            "@odata.nextLink"?: string;
        };
        allRows.push(...(payload.value || []));
        nextUrl = String(payload["@odata.nextLink"] || "").trim() || null;
    }
    return allRows;
}

function mapOneDriveSharedRows(
    rows: Array<{
        id?: string;
        name?: string;
        remoteItem?: {
            id?: string;
            name?: string;
            size?: number;
            createdDateTime?: string;
            lastModifiedDateTime?: string;
            folder?: unknown;
            file?: { mimeType?: string };
            parentReference?: { driveId?: string };
        };
    }>
): CloudItem[] {
    return rows
        .map((row) => {
            const remote = row.remoteItem;
            const driveId = String(remote?.parentReference?.driveId || "").trim();
            const itemId = String(remote?.id || row.id || "").trim();
            if (!itemId) return null;
            const path = driveId
                ? serializeOneDriveToken({kind: "shared", driveId, itemId})
                : serializeOneDriveToken({kind: "item", itemId});
            return {
                id: `shared:${driveId || "me"}:${itemId}`,
                name: String(remote?.name || row.name || itemId),
                path,
                isFolder: Boolean(remote?.folder),
                size: Number.isFinite(Number(remote?.size)) ? Number(remote?.size) : null,
                createdAt: remote?.createdDateTime || null,
                modifiedAt: remote?.lastModifiedDateTime || null,
                mimeType: remote?.file?.mimeType || null,
            } satisfies CloudItem;
        })
        .filter((item): item is CloudItem => Boolean(item));
}

function resolveOneDriveChildToken(parentToken: OneDriveToken, childItemId: string): OneDriveToken {
    if (parentToken.kind === "shared") {
        return {kind: "shared", driveId: parentToken.driveId, itemId: childItemId};
    }
    if (parentToken.kind === "drive") {
        return {kind: "shared", driveId: parentToken.driveId, itemId: childItemId};
    }
    return {kind: "item", itemId: childItemId};
}

function resolveOneDriveChildTokenWithRow(
    parentToken: OneDriveToken,
    row: {
        id?: string;
        parentReference?: { driveId?: string };
    }
): OneDriveToken {
    const childItemId = String(row.id || "").trim();
    if (!childItemId) return {kind: "item", itemId: ""};
    const driveId = String(row.parentReference?.driveId || "").trim();
    if (driveId) {
        return {kind: "shared", driveId, itemId: childItemId};
    }
    return resolveOneDriveChildToken(parentToken, childItemId);
}

function mergeCloudItemsByPath(...lists: CloudItem[][]): CloudItem[] {
    const mergedByPath = new Map<string, CloudItem>();
    for (const list of lists) {
        for (const item of list) {
            mergedByPath.set(item.path, item);
        }
    }
    return Array.from(mergedByPath.values());
}

async function getWebDavStorageUsage(account: CloudAccountCredentials): Promise<CloudStorageUsage> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const targetUrl = resolveWebDavUrl(baseUrlRaw, "/");
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "PROPFIND",
        headers: {
            Authorization: `Basic ${auth}`,
            Depth: "0",
            "Content-Type": "application/xml; charset=utf-8",
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:quota-available-bytes/>
    <d:quota-used-bytes/>
  </d:prop>
</d:propfind>`,
    });
    if (!response.ok) {
        throw new Error(`WebDAV quota request failed (${response.status})`);
    }
    const xml = await response.text();
    const availableRaw = extractTagValue(xml, "quota-available-bytes");
    const usedRaw = extractTagValue(xml, "quota-used-bytes");
    const available = Number(availableRaw);
    const used = Number(usedRaw);
    const usedBytes = Number.isFinite(used) ? used : null;
    const totalBytes = Number.isFinite(available) && Number.isFinite(used) ? available + used : null;
    return {usedBytes, totalBytes};
}

async function getWebDavItemStatus(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<CloudItemStatus> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const itemPath = normalizeWebDavPath(itemPathOrToken);
    const targetUrl = resolveWebDavUrl(baseUrlRaw, itemPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const checkedAt = new Date().toISOString();
    const response = await fetch(targetUrl, {
        method: "HEAD",
        headers: {Authorization: `Basic ${auth}`},
    });
    if (response.status === 404) {
        return {exists: false, item: null, checkedAt};
    }
    if (!response.ok) {
        throw new Error(`Status check failed (${response.status})`);
    }
    const sizeRaw = Number(response.headers.get("content-length"));
    const modifiedRaw = response.headers.get("last-modified");
    const mimeType = response.headers.get("content-type");
    return {
        exists: true,
        checkedAt,
        item: {
            id: itemPath,
            name: decodeURIComponent(itemPath.split("/").filter(Boolean).pop() || "/"),
            path: itemPath,
            isFolder: itemPath.endsWith("/"),
            size: Number.isFinite(sizeRaw) ? sizeRaw : null,
            createdAt: null,
            modifiedAt: modifiedRaw ? new Date(modifiedRaw).toISOString() : null,
            mimeType: mimeType || null,
        },
    };
}

async function getGoogleDriveStorageUsage(account: CloudAccountCredentials): Promise<CloudStorageUsage> {
    const bearerToken = await resolveCloudBearerToken(account);
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
        headers: {Authorization: `Bearer ${bearerToken}`},
    });
    if (!response.ok) {
        throw new Error(`Google Drive quota request failed (${response.status})`);
    }
    const payload = (await response.json()) as {
        storageQuota?: {
            usage?: string | number;
            limit?: string | number;
        };
    };
    const usage = Number(payload.storageQuota?.usage);
    const limit = Number(payload.storageQuota?.limit);
    return {
        usedBytes: Number.isFinite(usage) ? usage : null,
        totalBytes: Number.isFinite(limit) && limit > 0 ? limit : null,
    };
}

async function getGoogleDriveItemStatus(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<CloudItemStatus> {
    const bearerToken = await resolveCloudBearerToken(account);
    const itemId = String(itemPathOrToken || "").trim();
    if (!itemId || itemId === "root") {
        return {exists: true, item: null, checkedAt: new Date().toISOString()};
    }
    const checkedAt = new Date().toISOString();
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=id,name,mimeType,size,createdTime,modifiedTime,trashed&supportsAllDrives=true`,
        {
            headers: {Authorization: `Bearer ${bearerToken}`},
        }
    );
    if (response.status === 404) {
        return {exists: false, item: null, checkedAt};
    }
    if (!response.ok) {
        throw new Error(`Status check failed (${response.status})`);
    }
    const payload = (await response.json()) as {
        id?: string;
        name?: string;
        mimeType?: string;
        size?: string | number;
        createdTime?: string;
        modifiedTime?: string;
        trashed?: boolean;
    };
    if (payload.trashed) {
        return {exists: false, item: null, checkedAt};
    }
    const mimeType = payload.mimeType || null;
    const sizeValue = Number(payload.size);
    return {
        exists: true,
        checkedAt,
        item: {
            id: String(payload.id || itemId),
            name: String(payload.name || itemId),
            path: String(payload.id || itemId),
            isFolder: mimeType === "application/vnd.google-apps.folder",
            size: Number.isFinite(sizeValue) ? sizeValue : null,
            createdAt: payload.createdTime || null,
            modifiedAt: payload.modifiedTime || null,
            mimeType,
        },
    };
}

async function getOneDriveStorageUsage(account: CloudAccountCredentials): Promise<CloudStorageUsage> {
    const response = await oneDriveFetch(account, "https://graph.microsoft.com/v1.0/me/drive?$select=quota");
    if (!response.ok) {
        throw new Error(`OneDrive quota request failed (${response.status})`);
    }
    const payload = (await response.json()) as {
        quota?: {
            used?: number;
            total?: number;
        };
    };
    const used = Number(payload.quota?.used);
    const total = Number(payload.quota?.total);
    return {
        usedBytes: Number.isFinite(used) ? used : null,
        totalBytes: Number.isFinite(total) && total > 0 ? total : null,
    };
}

async function getOneDriveItemStatus(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<CloudItemStatus> {
    const parsedToken = parseOneDriveToken(itemPathOrToken);
    const resolvedToken = await resolveOneDriveItemAccessToken(account, parsedToken);
    if (parsedToken.kind === "root" || parsedToken.kind === "scope" || parsedToken.kind === "drive") {
        return {exists: true, item: null, checkedAt: new Date().toISOString()};
    }
    const checkedAt = new Date().toISOString();
    const endpoint = buildOneDriveItemEndpoint(resolvedToken);
    const response = await oneDriveFetch(
        account,
        `${endpoint}?$select=id,name,folder,size,createdDateTime,lastModifiedDateTime,file,deleted`
    );
    if (response.status === 404) {
        return {exists: false, item: null, checkedAt};
    }
    if (!response.ok) {
        throw new Error(`Status check failed (${response.status})`);
    }
    const payload = (await response.json()) as {
        id?: string;
        name?: string;
        folder?: unknown;
        size?: number;
        createdDateTime?: string;
        lastModifiedDateTime?: string;
        file?: { mimeType?: string };
        deleted?: unknown;
    };
    if (payload.deleted) {
        return {exists: false, item: null, checkedAt};
    }
    const fallbackItemId = "itemId" in resolvedToken ? resolvedToken.itemId : "";
    const itemId = String(payload.id || fallbackItemId);
    const path = resolvedToken.kind === "shared" ? serializeOneDriveToken(resolvedToken) : itemId;
    return {
        exists: true,
        checkedAt,
        item: {
            id: itemId,
            name: String(payload.name || itemId),
            path,
            isFolder: Boolean(payload.folder),
            size: Number.isFinite(Number(payload.size)) ? Number(payload.size) : null,
            createdAt: payload.createdDateTime || null,
            modifiedAt: payload.lastModifiedDateTime || null,
            mimeType: payload.file?.mimeType || null,
        },
    };
}

type ParsedWebDavResponse = {
    href: string;
    displayName: string;
    isFolder: boolean;
    contentLength: number | null;
    contentType: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
};

function parseWebDavMultiStatus(xml: string): ParsedWebDavResponse[] {
    const responses: ParsedWebDavResponse[] = [];
    const responseBlocks = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/gi) || [];
    for (const block of responseBlocks) {
        const href = decodeXmlText(extractTagValue(block, "href") || "");
        if (!href) continue;
        const displayName = decodeXmlText(extractTagValue(block, "displayname") || "");
        const contentLengthRaw = extractTagValue(block, "getcontentlength");
        const contentLengthNumber = Number(contentLengthRaw);
        const contentType = decodeXmlText(extractTagValue(block, "getcontenttype") || "") || null;
        const createdAtRaw = decodeXmlText(extractTagValue(block, "creationdate") || "");
        const createdAt = createdAtRaw || null;
        const modifiedAtRaw = decodeXmlText(extractTagValue(block, "getlastmodified") || "");
        const modifiedAt = modifiedAtRaw || null;
        const resourcetypeBlock = extractTagBlock(block, "resourcetype");
        const isFolder = /<[^:>]*:?collection\b/i.test(resourcetypeBlock || "");
        responses.push({
            href,
            displayName,
            isFolder,
            contentLength: Number.isFinite(contentLengthNumber) ? contentLengthNumber : null,
            contentType,
            createdAt,
            modifiedAt,
        });
    }
    return responses;
}

function normalizeWebDavResponseItem(entry: ParsedWebDavResponse, baseUrlRaw: string): CloudItem | null {
    try {
        const base = new URL(baseUrlRaw.endsWith("/") ? baseUrlRaw : `${baseUrlRaw}/`);
        const hrefUrl = new URL(entry.href, base);
        let relativePath = decodeURIComponent(hrefUrl.pathname.replace(base.pathname, "/"));
        if (!relativePath.startsWith("/")) relativePath = `/${relativePath}`;
        if (relativePath.length > 1 && relativePath.endsWith("/")) relativePath = relativePath.slice(0, -1);
        const fallbackName = relativePath.split("/").filter(Boolean).pop() || "/";
        return {
            id: relativePath,
            name: entry.displayName || fallbackName,
            path: relativePath || "/",
            isFolder: entry.isFolder,
            size: entry.isFolder ? null : entry.contentLength,
            createdAt: entry.createdAt,
            modifiedAt: entry.modifiedAt,
            mimeType: entry.contentType,
        };
    } catch {
        return null;
    }
}

function extractTagValue(block: string, tagName: string): string | null {
    const match = block.match(new RegExp(`<[^:>]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tagName}>`, "i"));
    return match?.[1] ?? null;
}

function extractTagBlock(block: string, tagName: string): string | null {
    const match = block.match(new RegExp(`<[^:>]*:?${tagName}[^>]*>[\\s\\S]*?<\\/[^:>]*:?${tagName}>`, "i"));
    return match?.[0] ?? null;
}

function decodeXmlText(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function normalizeWebDavPath(value?: string | null): string {
    const raw = String(value || "/").trim();
    if (!raw) return "/";
    let normalized = raw.startsWith("/") ? raw : `/${raw}`;
    normalized = normalized.replace(/\/{2,}/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
}

function resolveWebDavUrl(baseUrlRaw: string, pathValue: string): string {
    const base = new URL(baseUrlRaw.endsWith("/") ? baseUrlRaw : `${baseUrlRaw}/`);
    const relative = pathValue === "/" ? "" : pathValue.slice(1).split("/").map(encodeURIComponent).join("/");
    return new URL(relative, base).toString();
}

function joinWebDavChildPath(parentPath: string, childName: string): string {
    const normalizedParent = normalizeWebDavPath(parentPath);
    const cleanedName = childName.replace(/[\\/]+/g, "-").trim();
    if (!cleanedName) throw new Error("Name is invalid.");
    if (normalizedParent === "/") return `/${cleanedName}`;
    return `${normalizedParent}/${cleanedName}`;
}

async function createWebDavFolder(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    folderName: string
): Promise<CloudUploadedItem> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const parentPath = normalizeWebDavPath(parentPathOrToken);
    const nextPath = joinWebDavChildPath(parentPath, folderName);
    const targetUrl = resolveWebDavUrl(baseUrlRaw, nextPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "MKCOL",
        headers: {Authorization: `Basic ${auth}`},
    });
    if (!response.ok && response.status !== 201) {
        throw new Error(`Create folder failed (${response.status})`);
    }
    return {
        id: nextPath,
        path: nextPath,
        name: folderName,
    };
}

async function uploadWebDavFile(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    fileName: string,
    content: Buffer,
    contentType?: string | null
): Promise<CloudUploadedItem> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const parentPath = normalizeWebDavPath(parentPathOrToken);
    const nextPath = joinWebDavChildPath(parentPath, fileName);
    const targetUrl = resolveWebDavUrl(baseUrlRaw, nextPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "PUT",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": contentType || "application/octet-stream",
        },
        body: new Uint8Array(content),
    });
    if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
    }
    return {
        id: nextPath,
        path: nextPath,
        name: fileName,
    };
}

async function deleteWebDavItem(account: CloudAccountCredentials, itemPathOrToken: string): Promise<{ removed: true }> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const itemPath = normalizeWebDavPath(itemPathOrToken);
    if (itemPath === "/") throw new Error("Cannot delete root folder.");
    const targetUrl = resolveWebDavUrl(baseUrlRaw, itemPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "DELETE",
        headers: {Authorization: `Basic ${auth}`},
    });
    if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`);
    }
    return {removed: true};
}

async function downloadWebDavItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<DownloadedCloudItem> {
    const baseUrlRaw = String(account.base_url || "").trim();
    if (!baseUrlRaw) throw new Error("Missing WebDAV base URL.");
    const itemPath = normalizeWebDavPath(itemPathOrToken);
    const targetUrl = resolveWebDavUrl(baseUrlRaw, itemPath);
    const auth = Buffer.from(`${account.user || ""}:${account.secret}`).toString("base64");
    const response = await fetch(targetUrl, {
        method: "GET",
        headers: {Authorization: `Basic ${auth}`},
    });
    if (!response.ok) {
        throw new Error(`Open file failed (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const name = decodeURIComponent(itemPath.split("/").filter(Boolean).pop() || "cloud-file");
    return {
        name,
        mimeType: response.headers.get("content-type") || null,
        content: Buffer.from(arrayBuffer),
    };
}

async function createGoogleDriveFolder(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    folderName: string
): Promise<CloudUploadedItem> {
    const bearerToken = await resolveCloudBearerToken(account);
    const parentId = String(parentPathOrToken || "root").trim() || "root";
    const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType&supportsAllDrives=true",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentId],
            }),
        }
    );
    if (!response.ok) {
        throw new Error(`Create folder failed (${response.status})`);
    }
    const created = (await response.json()) as { id?: string; name?: string };
    if (!created.id) throw new Error("Google Drive folder create returned no id.");
    return {
        id: String(created.id),
        path: String(created.id),
        name: String(created.name || folderName),
    };
}

async function uploadGoogleDriveFile(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    fileName: string,
    content: Buffer,
    contentType?: string | null
): Promise<CloudUploadedItem> {
    const bearerToken = await resolveCloudBearerToken(account);
    const parentId = String(parentPathOrToken || "root").trim() || "root";
    const boundary = `lunamail-${Date.now().toString(16)}`;
    const metadata = JSON.stringify({
        name: fileName,
        parents: [parentId],
    });
    const header = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${
            contentType || "application/octet-stream"
        }\r\n\r\n`,
        "utf8"
    );
    const footer = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([header, content, footer]);
    const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType&supportsAllDrives=true",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: new Uint8Array(body),
        }
    );
    if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
    }
    const created = (await response.json()) as { id?: string; name?: string };
    if (!created.id) throw new Error("Google Drive upload returned no id.");
    return {
        id: String(created.id),
        path: String(created.id),
        name: String(created.name || fileName),
    };
}

async function deleteGoogleDriveItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<{ removed: true }> {
    const bearerToken = await resolveCloudBearerToken(account);
    const itemId = String(itemPathOrToken || "").trim();
    if (!itemId || itemId === "root") throw new Error("Cannot delete root folder.");
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?supportsAllDrives=true`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${bearerToken}`,
            },
        }
    );
    if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`);
    }
    return {removed: true};
}

async function downloadGoogleDriveItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<DownloadedCloudItem> {
    const bearerToken = await resolveCloudBearerToken(account);
    const itemId = String(itemPathOrToken || "").trim();
    if (!itemId) throw new Error("Missing file token.");
    const metadataRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?fields=id,name,mimeType`,
        {
            headers: {Authorization: `Bearer ${bearerToken}`},
        }
    );
    if (!metadataRes.ok) {
        throw new Error(`Open file failed (${metadataRes.status})`);
    }
    const metadata = (await metadataRes.json()) as { name?: string; mimeType?: string };
    const mimeType = metadata.mimeType || null;
    if (mimeType?.startsWith("application/vnd.google-apps")) {
        throw new Error("Google Docs native files are not downloadable yet.");
    }
    const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}?alt=media`, {
        headers: {Authorization: `Bearer ${bearerToken}`},
    });
    if (!contentRes.ok) {
        throw new Error(`Open file failed (${contentRes.status})`);
    }
    const arrayBuffer = await contentRes.arrayBuffer();
    return {
        name: String(metadata.name || itemId),
        mimeType: contentRes.headers.get("content-type") || mimeType,
        content: Buffer.from(arrayBuffer),
    };
}

async function createOneDriveFolder(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    folderName: string
): Promise<CloudUploadedItem> {
    const parentToken = parseOneDriveToken(parentPathOrToken);
    const endpoint = buildOneDriveChildrenEndpoint(parentToken);
    const response = await oneDriveFetch(account, endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: folderName,
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
        }),
    });
    if (!response.ok) {
        throw new Error(`Create folder failed (${response.status})`);
    }
    const created = (await response.json()) as { id?: string; name?: string };
    if (!created.id) throw new Error("OneDrive folder create returned no id.");
    const createdToken = resolveOneDriveChildToken(parentToken, String(created.id));
    return {
        id: String(created.id),
        path: serializeOneDriveToken(createdToken),
        name: String(created.name || folderName),
    };
}

async function uploadOneDriveFile(
    account: CloudAccountCredentials,
    parentPathOrToken: string | null | undefined,
    fileName: string,
    content: Buffer,
    contentType?: string | null
): Promise<CloudUploadedItem> {
    const parentToken = parseOneDriveToken(parentPathOrToken);
    const encodedName = encodeURIComponent(fileName);
    const endpoint = buildOneDriveUploadEndpoint(parentToken, encodedName);
    const response = await oneDriveFetch(account, endpoint, {
        method: "PUT",
        headers: {
            "Content-Type": contentType || "application/octet-stream",
        },
        body: new Uint8Array(content),
    });
    if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
    }
    const uploaded = (await response.json()) as { id?: string; name?: string };
    if (!uploaded.id) throw new Error("OneDrive upload returned no id.");
    const uploadedToken = resolveOneDriveChildToken(parentToken, String(uploaded.id));
    return {
        id: String(uploaded.id),
        path: serializeOneDriveToken(uploadedToken),
        name: String(uploaded.name || fileName),
    };
}

async function deleteOneDriveItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<{ removed: true }> {
    const parsedToken = parseOneDriveToken(itemPathOrToken);
    const resolvedToken = await resolveOneDriveItemAccessToken(account, parsedToken);
    if (parsedToken.kind === "root" || parsedToken.kind === "scope" || parsedToken.kind === "drive") {
        throw new Error("Cannot delete this root folder.");
    }
    const endpoint = buildOneDriveItemEndpoint(resolvedToken);
    const response = await oneDriveFetch(account, endpoint, {
        method: "DELETE",
    });
    if (!response.ok && response.status !== 204) {
        throw new Error(`Delete failed (${response.status})`);
    }
    return {removed: true};
}

async function downloadOneDriveItem(
    account: CloudAccountCredentials,
    itemPathOrToken: string
): Promise<DownloadedCloudItem> {
    const parsedToken = parseOneDriveToken(itemPathOrToken);
    const resolvedToken = await resolveOneDriveItemAccessToken(account, parsedToken);
    if (parsedToken.kind === "root" || parsedToken.kind === "scope" || parsedToken.kind === "drive") {
        throw new Error("Missing file token.");
    }
    const itemEndpoint = buildOneDriveItemEndpoint(resolvedToken);
    const metadataRes = await oneDriveFetch(account, `${itemEndpoint}?$select=name,file`);
    if (!metadataRes.ok) {
        throw new Error(`Open file failed (${metadataRes.status})`);
    }
    const metadata = (await metadataRes.json()) as { name?: string; file?: { mimeType?: string } };
    const contentRes = await oneDriveFetch(account, `${itemEndpoint}/content`);
    if (!contentRes.ok) {
        throw new Error(`Open file failed (${contentRes.status})`);
    }
    const arrayBuffer = await contentRes.arrayBuffer();
    return {
        name: String(metadata.name || serializeOneDriveToken(resolvedToken)),
        mimeType: contentRes.headers.get("content-type") || metadata.file?.mimeType || null,
        content: Buffer.from(arrayBuffer),
    };
}

async function resolveOneDriveItemAccessToken(
    account: CloudAccountCredentials,
    token: OneDriveToken
): Promise<OneDriveToken> {
    if (token.kind !== "item") return token;
    const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(token.itemId)}?$select=id,parentReference`;
    const response = await oneDriveFetch(account, endpoint);
    if (!response.ok) return token;
    const payload = (await response.json()) as {
        id?: string;
        parentReference?: { driveId?: string };
    };
    const driveId = String(payload.parentReference?.driveId || "").trim();
    const itemId = String(payload.id || token.itemId || "").trim();
    if (!driveId || !itemId) return token;
    return {kind: "shared", driveId, itemId};
}

type OneDriveToken =
    | { kind: "root" }
    | { kind: "scope"; scope: "home" | "my-files" | "shares" | "recycle-bin" }
    | { kind: "drive"; driveId: string }
    | { kind: "item"; itemId: string }
    | { kind: "shared"; driveId: string; itemId: string };

function parseOneDriveToken(value?: string | null): OneDriveToken {
    const raw = String(value || "root").trim() || "root";
    if (raw === "root") return {kind: "root"};
    if (raw.startsWith("scope:")) {
        const scopeRaw = raw.slice("scope:".length).trim().toLowerCase();
        if (scopeRaw === "home" || scopeRaw === "my-files" || scopeRaw === "shares" || scopeRaw === "recycle-bin") {
            return {kind: "scope", scope: scopeRaw};
        }
    }
    if (raw.startsWith("drive:")) {
        const driveId = decodeURIComponent(raw.slice("drive:".length) || "").trim();
        if (driveId) return {kind: "drive", driveId};
    }
    if (raw.startsWith("shared:")) {
        const [_, driveEncoded = "", itemEncoded = ""] = raw.split(":");
        const driveId = decodeURIComponent(driveEncoded || "");
        const itemId = decodeURIComponent(itemEncoded || "");
        if (driveId && itemId) return {kind: "shared", driveId, itemId};
    }
    return {kind: "item", itemId: raw};
}

function serializeOneDriveToken(token: OneDriveToken): string {
    if (token.kind === "root") return "root";
    if (token.kind === "scope") return `scope:${token.scope}`;
    if (token.kind === "drive") return `drive:${encodeURIComponent(token.driveId)}`;
    if (token.kind === "shared") {
        return `shared:${encodeURIComponent(token.driveId)}:${encodeURIComponent(token.itemId)}`;
    }
    return token.itemId;
}

function buildOneDriveChildrenEndpoint(token: OneDriveToken): string {
    if (token.kind === "root") return "https://graph.microsoft.com/v1.0/me/drive/root/children";
    if (token.kind === "drive") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(token.driveId)}/root/children`;
    }
    if (token.kind === "scope") {
        if (token.scope === "home" || token.scope === "my-files") {
            return "https://graph.microsoft.com/v1.0/me/drive/root/children";
        }
        if (token.scope === "recycle-bin") {
            return "https://graph.microsoft.com/v1.0/me/drive/special/recycleBin/children";
        }
        throw new Error("This OneDrive scope does not have a direct children endpoint.");
    }
    if (token.kind === "shared") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(token.driveId)}/items/${encodeURIComponent(token.itemId)}/children`;
    }
    return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(token.itemId)}/children`;
}

function buildOneDriveItemEndpoint(token: OneDriveToken): string {
    if (token.kind === "root") return "https://graph.microsoft.com/v1.0/me/drive/root";
    if (token.kind === "drive") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(token.driveId)}/root`;
    }
    if (token.kind === "scope") {
        if (token.scope === "home" || token.scope === "my-files") return "https://graph.microsoft.com/v1.0/me/drive/root";
        if (token.scope === "recycle-bin") return "https://graph.microsoft.com/v1.0/me/drive/special/recycleBin";
        return "https://graph.microsoft.com/v1.0/me/drive/root";
    }
    if (token.kind === "shared") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(token.driveId)}/items/${encodeURIComponent(token.itemId)}`;
    }
    return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(token.itemId)}`;
}

function buildOneDriveUploadEndpoint(parentToken: OneDriveToken, encodedName: string): string {
    if (parentToken.kind === "root") {
        return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedName}:/content`;
    }
    if (parentToken.kind === "drive") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(parentToken.driveId)}/root:/${encodedName}:/content`;
    }
    if (parentToken.kind === "scope") {
        if (parentToken.scope === "home" || parentToken.scope === "my-files") {
            return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedName}:/content`;
        }
        throw new Error("Uploads are not supported in this OneDrive view.");
    }
    if (parentToken.kind === "shared") {
        return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(parentToken.driveId)}/items/${encodeURIComponent(parentToken.itemId)}:/${encodedName}:/content`;
    }
    return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentToken.itemId)}:/${encodedName}:/content`;
}

function extractOneDriveStatusCode(error: unknown): number | null {
    const message = String((error as any)?.message || "");
    const match = message.match(/\((\d+)\)/);
    const status = Number(match?.[1] || "");
    if (!Number.isFinite(status) || status <= 0) return null;
    return status;
}

async function oneDriveFetch(account: CloudAccountCredentials, input: string, init?: RequestInit): Promise<Response> {
    const token = await resolveCloudBearerToken(account);
    const response = await fetch(input, withBearerToken(init, token));
    if (response.status !== 401) return response;
    if (!canRefreshOneDriveOAuthToken(account)) return response;
    const refreshedToken = await resolveCloudBearerToken(account, {forceRefresh: true});
    return fetch(input, withBearerToken(init, refreshedToken));
}

async function resolveCloudBearerToken(
    account: CloudAccountCredentials,
    options: { forceRefresh?: boolean } = {}
): Promise<string> {
    const raw = String(account.secret || "").trim();
    if (!raw) throw new Error("Cloud access token is missing.");
    const parsed = parseOAuthSecretPayload(raw);
    if (!parsed) return raw;
    const currentToken = String(parsed.accessToken || "").trim();
    if (account.provider !== "onedrive") {
        if (currentToken) return currentToken;
        return raw;
    }

    const shouldRefresh = Boolean(options.forceRefresh) || !currentToken || isOAuthTokenExpired(parsed.expiresAt);
    if (!shouldRefresh) return currentToken;
    if (!canRefreshOneDriveOAuthToken(account, parsed)) {
        if (currentToken) return currentToken;
        throw new Error("OneDrive access token is missing. Please sign in again.");
    }
    return refreshOneDriveAccessToken(account, parsed);
}

function parseOAuthSecretPayload(rawSecret: string): OAuthSecretPayload | null {
    if (!rawSecret.startsWith("{")) return null;
    try {
        return JSON.parse(rawSecret) as OAuthSecretPayload;
    } catch {
        return null;
    }
}

function isOAuthTokenExpired(expiresAt: number | null | undefined): boolean {
    const timestamp = Number(expiresAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    return timestamp <= Date.now() + 60_000;
}

function canRefreshOneDriveOAuthToken(account: CloudAccountCredentials, payload?: OAuthSecretPayload | null): boolean {
    if (account.provider !== "onedrive") return false;
    const parsed = payload ?? parseOAuthSecretPayload(String(account.secret || "").trim());
    if (!parsed) return false;
    const refreshToken = String(parsed.refreshToken || "").trim();
    const clientId = String(parsed.clientId || "").trim();
    return Boolean(refreshToken && clientId);
}

function withBearerToken(init: RequestInit | undefined, token: string): RequestInit {
    const headers = new Headers(init?.headers ?? undefined);
    headers.set("Authorization", `Bearer ${token}`);
    return {
        ...init,
        headers,
    };
}

async function refreshOneDriveAccessToken(
    account: CloudAccountCredentials,
    payload: OAuthSecretPayload
): Promise<string> {
    const refreshToken = String(payload.refreshToken || "").trim();
    const clientId = String(payload.clientId || "").trim();
    if (!refreshToken || !clientId) {
        throw new Error("OneDrive token refresh is unavailable. Please sign in again.");
    }
    const tenantId = String(payload.tenantId || "").trim() || "common";
    const scope = String(payload.scope || "").trim() || "offline_access openid profile email Files.ReadWrite";
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope,
        }),
    });
    const tokenResponse = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
        error?: string;
        error_description?: string;
    };
    if (!response.ok) {
        const description = String(tokenResponse.error_description || tokenResponse.error || "").trim();
        throw new Error(
            description
                ? `OneDrive token refresh failed (${response.status}): ${description}`
                : `OneDrive token refresh failed (${response.status}).`
        );
    }
    const nextAccessToken = String(tokenResponse.access_token || "").trim();
    if (!nextAccessToken) {
        throw new Error("OneDrive token refresh response did not include an access token.");
    }
    const nextRefreshToken = String(tokenResponse.refresh_token || "").trim() || refreshToken;
    const nextExpiresAt = Number.isFinite(Number(tokenResponse.expires_in))
        ? Date.now() + Number(tokenResponse.expires_in) * 1000
        : null;
    const nextPayload: OAuthSecretPayload = {
        ...payload,
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        expiresAt: nextExpiresAt,
        tokenType: String(tokenResponse.token_type || payload.tokenType || "").trim() || null,
        scope: String(tokenResponse.scope || payload.scope || "").trim() || null,
        provider: "onedrive",
        clientId,
        tenantId,
    };
    const nextSecret = JSON.stringify(nextPayload);
    await setCloudAccountSecret(account.id, nextSecret);
    account.secret = nextSecret;
    return nextAccessToken;
}
