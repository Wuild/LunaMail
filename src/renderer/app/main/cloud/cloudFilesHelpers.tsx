import {FormInput, FormSelect} from '@renderer/components/ui/FormControls';
import React from 'react';
import {File, FileArchive, FileAudio2, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo} from 'lucide-react';
import type {CloudItem, CloudProvider, CloudStorageUsage} from '@/preload';
import {ONEDRIVE_DEFAULT_CLIENT_ID, ONEDRIVE_DEFAULT_TENANT_ID} from '@/shared/cloudConfig';

export type NavigationEntry = { token: string; label: string };
export type CloudTableColumnKey = 'name' | 'type' | 'size' | 'modified' | 'created';
export type OneDriveDriveScope = 'home' | 'my-files' | 'shares' | 'recycle-bin';

export const providerLabels: Record<CloudProvider, string> = {
    nextcloud: 'Nextcloud',
    webdav: 'WebDAV',
    'google-drive': 'Google Drive',
    onedrive: 'OneDrive',
};

export const DEFAULT_ONEDRIVE_CLIENT_ID = ONEDRIVE_DEFAULT_CLIENT_ID;
export const DEFAULT_ONEDRIVE_TENANT_ID = ONEDRIVE_DEFAULT_TENANT_ID;

const CLOUD_FOLDER_CACHE_PREFIX = 'llamamail.cloud.folder.cache.v1';
const CLOUD_TABLE_COLUMNS_STORAGE_KEY = 'llamamail.cloud.table.columns.v1';
const CLOUD_ACCOUNT_COLLAPSE_STORAGE_KEY = 'llamamail.cloud.accountCollapseState.v1';

export const CLOUD_TABLE_RESIZE_HANDLE_CLASS =
    "cloud-resize-handle absolute -right-1 top-1/2 h-[calc(100%-10px)] w-2 -translate-y-1/2 cursor-col-resize rounded bg-transparent after:absolute after:bottom-1 after:left-1/2 after:top-1 after:w-px after:-translate-x-1/2 after:content-['']";

export const CLOUD_TABLE_COLUMN_OPTIONS: Array<{ key: CloudTableColumnKey; label: string }> = [
    {key: 'name', label: 'Name'},
    {key: 'type', label: 'Type'},
    {key: 'size', label: 'Size'},
    {key: 'modified', label: 'Modified'},
    {key: 'created', label: 'Created'},
];

export const ONEDRIVE_SCOPE_OPTIONS: Array<{ value: OneDriveDriveScope; label: string; token: string }> = [
    {value: 'home', label: 'Home', token: 'scope:home'},
    {value: 'my-files', label: 'My Files', token: 'scope:my-files'},
    {value: 'shares', label: 'Shares', token: 'scope:shares'},
    {value: 'recycle-bin', label: 'Recycle Bin', token: 'scope:recycle-bin'},
];

function rootToken(provider: CloudProvider): string {
    if (provider === 'google-drive') return 'root';
    if (provider === 'onedrive') return 'scope:home';
    return '/';
}

export function resolveOneDriveScope(trail: NavigationEntry[]): OneDriveDriveScope {
    const rootTokenValue = String(trail[0]?.token || '')
        .trim()
        .toLowerCase();
    const match = ONEDRIVE_SCOPE_OPTIONS.find((option) => option.token === rootTokenValue);
    if (!match) return 'home';
    return match.value;
}

export function buildRootTrail(provider: CloudProvider): NavigationEntry[] {
    if (provider === 'onedrive') return [{token: rootToken(provider), label: 'Home'}];
    return [{token: rootToken(provider), label: 'Root'}];
}

export function serializeNavigationTrail(trail: NavigationEntry[]): string {
    return JSON.stringify(trail.slice(0, 32));
}

export function parseNavigationTrail(raw: string | null, provider: CloudProvider): NavigationEntry[] {
    if (!raw) return buildRootTrail(provider);
    try {
        const parsed = JSON.parse(raw) as Array<{ token?: unknown; label?: unknown }>;
        if (!Array.isArray(parsed) || parsed.length === 0) return buildRootTrail(provider);
        const normalized: NavigationEntry[] = parsed
            .slice(0, 32)
            .map((entry) => ({
                token: String(entry?.token || '').trim(),
                label: String(entry?.label || '').trim(),
            }))
            .filter((entry) => entry.token.length > 0 && entry.label.length > 0);
        if (normalized.length === 0) return buildRootTrail(provider);
        return normalized;
    } catch {
        return buildRootTrail(provider);
    }
}

export function buildCloudRoute(accountId: number, trail: NavigationEntry[]): string {
    const params = new URLSearchParams();
    params.set('account', String(accountId));
    params.set('trail', serializeNavigationTrail(trail));
    return `/cloud?${params.toString()}`;
}

export function readCloudTableColumns(): CloudTableColumnKey[] {
    try {
        const raw = window.localStorage.getItem(CLOUD_TABLE_COLUMNS_STORAGE_KEY);
        if (!raw) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        const valid = parsed
            .map((value) => String(value))
            .filter((value): value is CloudTableColumnKey =>
                CLOUD_TABLE_COLUMN_OPTIONS.some((column) => column.key === value),
            );
        if (valid.length === 0) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        return Array.from(new Set(valid));
    } catch {
        return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
    }
}

export function writeCloudTableColumns(columns: CloudTableColumnKey[]): void {
    try {
        window.localStorage.setItem(CLOUD_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch {
        // Ignore preference persistence failures.
    }
}

export function readCollapsedCloudAccountIds(): Set<number> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = window.localStorage.getItem(CLOUD_ACCOUNT_COLLAPSE_STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as number[];
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((value) => Number.isFinite(value)));
    } catch {
        return new Set();
    }
}

export function writeCollapsedCloudAccountIds(ids: Set<number>): void {
    try {
        window.localStorage.setItem(CLOUD_ACCOUNT_COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        // Ignore preference persistence failures.
    }
}

export function pruneCollapsedCloudAccountIds(ids: Set<number>, accountIds: number[]): Set<number> {
    const valid = new Set(accountIds);
    const next = new Set<number>();
    for (const id of ids) {
        if (valid.has(id)) next.add(id);
    }
    return next;
}

function isHierarchicalPathToken(token: string): boolean {
    return token.startsWith('/');
}

function shouldInvalidateTokenForDeletedItem(token: string, item: CloudItem): boolean {
    if (token === item.path) return true;
    if (!item.isFolder) return false;
    if (!isHierarchicalPathToken(token) || !isHierarchicalPathToken(item.path)) return false;
    return token.startsWith(`${item.path}/`);
}

export function invalidateDeletedFolderCaches(
    cache: Record<string, CloudItem[]>,
    accountId: number,
    item: CloudItem,
): void {
    const prefix = `${accountId}:`;
    for (const key of Object.keys(cache)) {
        if (!key.startsWith(prefix)) continue;
        const token = key.slice(prefix.length);
        if (!shouldInvalidateTokenForDeletedItem(token, item)) continue;
        delete cache[key];
    }
}

export function clearPersistedDeletedFolderCaches(accountId: number, item: CloudItem): void {
    try {
        const keyPrefix = `${CLOUD_FOLDER_CACHE_PREFIX}:${accountId}:`;
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith(keyPrefix)) continue;
            const token = key.slice(keyPrefix.length);
            if (!shouldInvalidateTokenForDeletedItem(token, item)) continue;
            keysToRemove.push(key);
        }
        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }
    } catch {
        // Ignore cache cleanup failures.
    }
}

export function formatStorageUsage(usage: CloudStorageUsage | null): string {
    if (!usage) return 'Storage unavailable';
    const used = usage.usedBytes;
    const total = usage.totalBytes;
    const usedLabel =
        typeof used === 'number' && Number.isFinite(used) ? `${(used / 1024 ** 3).toFixed(1)} GB` : 'Unknown';
    if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) {
        return `${usedLabel} used`;
    }
    const totalLabel = `${(total / 1024 ** 3).toFixed(1)} GB`;
    return `${usedLabel} / ${totalLabel}`;
}

export function renderCloudFileTypeIcon(item: CloudItem): React.ReactNode {
    const type = (item.mimeType || '').toLowerCase();
    const ext = (item.name.split('.').pop() || '').toLowerCase();
    const baseClassName = 'ui-text-muted shrink-0';
    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) {
        return <FileImage size={15} className={baseClassName}/>;
    }
    if (type.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) {
        return <FileVideo size={15} className={baseClassName}/>;
    }
    if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
        return <FileAudio2 size={15} className={baseClassName}/>;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
        return <FileArchive size={15} className={baseClassName}/>;
    }
    if (['csv', 'xls', 'xlsx', 'ods'].includes(ext)) {
        return <FileSpreadsheet size={15} className={baseClassName}/>;
    }
    if (['txt', 'md', 'rtf', 'doc', 'docx', 'pdf'].includes(ext) || type.startsWith('text/')) {
        return <FileText size={15} className={baseClassName}/>;
    }
    if (
        ['json', 'xml', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(
            ext,
        )
    ) {
        return <FileCode size={15} className={baseClassName}/>;
    }
    return <File size={15} className={baseClassName}/>;
}

export function formatStorageUsagePercent(usage: CloudStorageUsage | null): number {
    if (!usage) return 0;
    const used = usage.usedBytes;
    const total = usage.totalBytes;
    if (
        typeof used !== 'number' ||
        !Number.isFinite(used) ||
        typeof total !== 'number' ||
        !Number.isFinite(total) ||
        total <= 0
    ) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function buildFolderCacheStorageKey(accountId: number, folderToken: string): string {
    return `${CLOUD_FOLDER_CACHE_PREFIX}:${accountId}:${folderToken}`;
}

export function readPersistedFolderCache(accountId: number, folderToken: string): CloudItem[] | null {
    try {
        const raw = window.localStorage.getItem(buildFolderCacheStorageKey(accountId, folderToken));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { items?: CloudItem[] };
        if (!Array.isArray(parsed.items)) return null;
        return parsed.items;
    } catch {
        return null;
    }
}

export function writePersistedFolderCache(accountId: number, folderToken: string, items: CloudItem[]): void {
    try {
        window.localStorage.setItem(
            buildFolderCacheStorageKey(accountId, folderToken),
            JSON.stringify({updatedAt: Date.now(), items: items.slice(0, 500)}),
        );
    } catch {
        // Ignore cache persistence failures.
    }
}

export function areCloudItemsEqual(a: CloudItem[], b: CloudItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        const left = a[i];
        const right = b[i];
        if (
            left.id !== right.id ||
            left.path !== right.path ||
            left.name !== right.name ||
            left.isFolder !== right.isFolder ||
            left.size !== right.size ||
            left.createdAt !== right.createdAt ||
            left.modifiedAt !== right.modifiedAt ||
            left.mimeType !== right.mimeType
        ) {
            return false;
        }
    }
    return true;
}

export function constrainToViewport(
    x: number,
    y: number,
    width: number,
    height: number,
): {
    left: number;
    top: number;
} {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(x, margin), maxLeft);
    const top = Math.min(Math.max(y, margin), maxTop);
    return {left, top};
}

export function Field(props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    as?: 'input' | 'select';
    options?: Array<{ value: string; label: string }>;
}) {
    const {label, value, onChange, placeholder, type = 'text', as = 'input', options = []} = props;
    return (
        <label className="block text-sm">
            <span className="ui-text-secondary mb-1 block font-medium">{label}</span>
            {as === 'select' ? (
                <FormSelect
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="field-select h-10 w-full rounded-md px-3 text-sm"
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </FormSelect>
            ) : (
                <FormInput
                    type={type}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="field-input h-10 w-full rounded-md px-3 text-sm"
                />
            )}
        </label>
    );
}
