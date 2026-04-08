import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Cloud,
    Download,
    Eye,
    File,
    FileArchive,
    FileAudio2,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo,
    FolderOpen,
    FolderPlus,
    Globe,
    HardDrive,
    Loader2,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Settings,
    Share2,
    Trash2,
    Upload,
} from "lucide-react";
import {Link, useSearchParams} from "react-router-dom";
import type {
    AddCloudAccountPayload,
    CloudItem,
    CloudProvider,
    CloudStorageUsage,
    PublicCloudAccount,
    UpdateCloudAccountPayload,
} from "../../preload";
import {formatBytes} from "../lib/format";
import {formatSystemDateTime} from "../lib/dateTime";
import WorkspaceLayout from "../layouts/WorkspaceLayout";
import {useResizableSidebar} from "../hooks/useResizableSidebar";
import {ipcClient} from "../lib/ipcClient";

type NavigationEntry = { token: string; label: string };
type CloudTableColumnKey = "name" | "type" | "size" | "modified" | "created";
type CloudTableSortDirection = "asc" | "desc";
type OneDriveDriveScope = "home" | "my-files" | "shares" | "recycle-bin";
type EditCloudAccountDraft = {
    id: number;
    provider: CloudProvider;
    name: string;
    base_url: string;
    user: string;
    secret: string;
};

const providerLabels: Record<CloudProvider, string> = {
    nextcloud: "Nextcloud",
    webdav: "WebDAV",
    "google-drive": "Google Drive",
    onedrive: "OneDrive",
};
const DEFAULT_ONEDRIVE_CLIENT_ID = "63603077-288c-418e-9d1e-972b7f860ffc";
const DEFAULT_ONEDRIVE_TENANT_ID = "common";
const CLOUD_FOLDER_CACHE_PREFIX = "lunamail.cloud.folder.cache.v1";
const CLOUD_TABLE_COLUMNS_STORAGE_KEY = "lunamail.cloud.table.columns.v1";
const CLOUD_TABLE_RESIZE_HANDLE_CLASS =
    "absolute -right-1 top-1/2 h-[calc(100%-10px)] w-2 -translate-y-1/2 cursor-col-resize rounded bg-transparent after:absolute after:bottom-1 after:left-1/2 after:top-1 after:w-px after:-translate-x-1/2 after:bg-slate-300 after:content-[''] hover:after:bg-sky-500 dark:after:bg-[#4a4d55] dark:hover:after:bg-[#8ab4ff]";
const CLOUD_TABLE_COLUMN_OPTIONS: Array<{ key: CloudTableColumnKey; label: string }> = [
    {key: "name", label: "Name"},
    {key: "type", label: "Type"},
    {key: "size", label: "Size"},
    {key: "modified", label: "Modified"},
    {key: "created", label: "Created"},
];
const ONEDRIVE_SCOPE_OPTIONS: Array<{ value: OneDriveDriveScope; label: string; token: string }> = [
    {value: "home", label: "Home", token: "scope:home"},
    {value: "my-files", label: "My Files", token: "scope:my-files"},
    {value: "shares", label: "Shares", token: "scope:shares"},
    {value: "recycle-bin", label: "Recycle Bin", token: "scope:recycle-bin"},
];

export default function CloudFilesPage() {
    const {sidebarWidth, onResizeStart} = useResizableSidebar({
        defaultWidth: 300,
        minWidth: 260,
        maxWidth: 420,
        storageKey: "lunamail.cloud.sidebar.width",
    });
    const [searchParams, setSearchParams] = useSearchParams();
    const [accounts, setAccounts] = useState<PublicCloudAccount[]>([]);
    const [items, setItems] = useState<CloudItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [adding, setAdding] = useState(false);
    const [linkingOAuth, setLinkingOAuth] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [mutating, setMutating] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [shareModal, setShareModal] = useState<{ name: string; url: string } | null>(null);
    const [filesCache, setFilesCache] = useState<Record<string, CloudItem[]>>({});
    const filesCacheRef = useRef<Record<string, CloudItem[]>>({});
    const [pendingFolderToken, setPendingFolderToken] = useState<string | null>(null);
    const [activeFileActionId, setActiveFileActionId] = useState<string | null>(null);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [refreshingAccountIds, setRefreshingAccountIds] = useState<Set<number>>(new Set());
    const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<number>>(new Set());
    const [rowMenu, setRowMenu] = useState<{ x: number; y: number; item: CloudItem } | null>(null);
    const [accountMenu, setAccountMenu] = useState<{ x: number; y: number; account: PublicCloudAccount } | null>(null);
    const [storageUsage, setStorageUsage] = useState<CloudStorageUsage | null>(null);
    const [storageLoading, setStorageLoading] = useState(false);
    const rowMenuRef = useRef<HTMLDivElement | null>(null);
    const accountMenuRef = useRef<HTMLDivElement | null>(null);
    const tableHeadMenuRef = useRef<HTMLDivElement | null>(null);
    const [rowMenuPosition, setRowMenuPosition] = useState<{ left: number; top: number }>({
        left: 0,
        top: 0,
    });
    const [rowMenuReady, setRowMenuReady] = useState(false);
    const [accountMenuPosition, setAccountMenuPosition] = useState<{ left: number; top: number }>({
        left: 0,
        top: 0,
    });
    const [accountMenuReady, setAccountMenuReady] = useState(false);
    const [tableHeadMenu, setTableHeadMenu] = useState<{ x: number; y: number } | null>(null);
    const [tableHeadMenuPosition, setTableHeadMenuPosition] = useState<{ left: number; top: number }>({
        left: 0,
        top: 0,
    });
    const [tableHeadMenuReady, setTableHeadMenuReady] = useState(false);
    const [tableColumns, setTableColumns] = useState<CloudTableColumnKey[]>(() => readCloudTableColumns());
    const [tableSort, setTableSort] = useState<{ column: CloudTableColumnKey; direction: CloudTableSortDirection }>({
        column: "name",
        direction: "asc",
    });
    const [draggingColumn, setDraggingColumn] = useState<CloudTableColumnKey | null>(null);
    const [dragPlaceholder, setDragPlaceholder] = useState<{
        column: CloudTableColumnKey;
        side: "before" | "after";
    } | null>(null);
    const [columnWidths, setColumnWidths] = useState<Record<CloudTableColumnKey, number>>({
        name: 440,
        type: 120,
        size: 120,
        modified: 180,
        created: 180,
    });
    const resizeRef = useRef<{
        key: CloudTableColumnKey;
        startX: number;
        startWidth: number;
    } | null>(null);
    const [draft, setDraft] = useState<AddCloudAccountPayload>({
        provider: "nextcloud",
        name: "",
        base_url: "",
        user: "",
        secret: "",
    });
    const [editDraft, setEditDraft] = useState<EditCloudAccountDraft | null>(null);

    useEffect(() => {
        filesCacheRef.current = filesCache;
    }, [filesCache]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const rows = await ipcClient.getCloudAccounts();
            if (!active) return;
            setAccounts(rows);
        };
        void load();
        const off = ipcClient.onCloudAccountsUpdated((rows) => {
            if (!active) return;
            setAccounts(rows);
        });
        return () => {
            active = false;
            if (typeof off === "function") off();
        };
    }, []);

    const selectedAccountId = useMemo(() => {
        const raw = Number(searchParams.get("account"));
        return Number.isFinite(raw) && raw > 0 ? raw : null;
    }, [searchParams]);

    const selectedAccount = useMemo(
        () => accounts.find((account) => account.id === selectedAccountId) ?? null,
        [accounts, selectedAccountId]
    );
    const nav = useMemo(
        () => parseNavigationTrail(searchParams.get("trail"), selectedAccount?.provider ?? "webdav"),
        [searchParams, selectedAccount?.provider]
    );
    const currentNavEntry = nav[nav.length - 1];
    const currentCacheKey = useMemo(
        () => (selectedAccount && currentNavEntry ? `${selectedAccount.id}:${currentNavEntry.token}` : null),
        [currentNavEntry, selectedAccount]
    );
    const visibleTableColumns = useMemo(
        () => CLOUD_TABLE_COLUMN_OPTIONS.filter((column) => tableColumns.includes(column.key)),
        [tableColumns]
    );
    const tableMinWidth = useMemo(
        () => visibleTableColumns.reduce((sum, column) => sum + columnWidths[column.key], 0) + 56,
        [columnWidths, visibleTableColumns]
    );
    const currentCachedItems = useMemo(() => {
        if (!selectedAccount || !currentNavEntry || !currentCacheKey) return null;
        return filesCache[currentCacheKey] || readPersistedFolderCache(selectedAccount.id, currentNavEntry.token);
    }, [currentCacheKey, currentNavEntry, filesCache, selectedAccount]);
    const sortedItems = useMemo(() => {
        const list = [...items];
        const directionFactor = tableSort.direction === "asc" ? 1 : -1;
        list.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
            let comparison = 0;
            switch (tableSort.column) {
                case "name":
                    comparison = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"});
                    break;
                case "type":
                    comparison = (a.isFolder ? "Folder" : "File").localeCompare(b.isFolder ? "Folder" : "File");
                    break;
                case "size":
                    comparison = (a.size ?? -1) - (b.size ?? -1);
                    break;
                case "modified":
                    comparison = (Date.parse(a.modifiedAt || "") || 0) - (Date.parse(b.modifiedAt || "") || 0);
                    break;
                case "created":
                    comparison = (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0);
                    break;
                default:
                    comparison = 0;
            }
            if (comparison === 0) {
                comparison = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"});
            }
            return comparison * directionFactor;
        });
        return list;
    }, [items, tableSort]);

    useEffect(() => {
        if (!accounts.length) {
            setItems([]);
            return;
        }
        if (selectedAccount && searchParams.get("trail")) return;
        const fallbackAccount = selectedAccount ?? accounts[0];
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("account", String(fallbackAccount.id));
        nextParams.set("trail", serializeNavigationTrail(buildRootTrail(fallbackAccount.provider)));
        setSearchParams(nextParams, {replace: true});
    }, [accounts, searchParams, selectedAccount, setSearchParams]);

    useEffect(() => {
        if (!rowMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (rowMenuRef.current && target && rowMenuRef.current.contains(target)) return;
            setRowMenu(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setRowMenu(null);
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [rowMenu]);

    useEffect(() => {
        if (!rowMenu) {
            setRowMenuReady(false);
            return;
        }
        const updatePosition = () => {
            const el = rowMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(rowMenu.x, rowMenu.y, rect.width, rect.height);
            setRowMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
            setRowMenuReady(true);
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", updatePosition);
        };
    }, [rowMenu]);

    useEffect(() => {
        if (!accountMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (accountMenuRef.current && target && accountMenuRef.current.contains(target)) return;
            setAccountMenu(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setAccountMenu(null);
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [accountMenu]);

    useEffect(() => {
        if (!accountMenu) {
            setAccountMenuReady(false);
            return;
        }
        const updatePosition = () => {
            const el = accountMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(accountMenu.x, accountMenu.y, rect.width, rect.height);
            setAccountMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
            setAccountMenuReady(true);
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", updatePosition);
        };
    }, [accountMenu]);

    useEffect(() => {
        if (!tableHeadMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (tableHeadMenuRef.current && target && tableHeadMenuRef.current.contains(target)) return;
            setTableHeadMenu(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setTableHeadMenu(null);
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [tableHeadMenu]);

    useEffect(() => {
        if (!tableHeadMenu) {
            setTableHeadMenuReady(false);
            return;
        }
        const updatePosition = () => {
            const el = tableHeadMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(tableHeadMenu.x, tableHeadMenu.y, rect.width, rect.height);
            setTableHeadMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
            setTableHeadMenuReady(true);
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", updatePosition);
        };
    }, [tableHeadMenu]);

    useEffect(() => {
        writeCloudTableColumns(tableColumns);
    }, [tableColumns]);

    useLayoutEffect(() => {
        if (!selectedAccount || !currentNavEntry) {
            setPendingFolderToken(null);
            setItems([]);
            return;
        }
        if (currentCachedItems) {
            setPendingFolderToken((prev) => (prev ? null : prev));
            return;
        }
        setItems([]);
        setPendingFolderToken((prev) => (prev === currentNavEntry.token ? prev : currentNavEntry.token));
    }, [currentCachedItems, currentNavEntry, selectedAccount]);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            const current = resizeRef.current;
            if (!current) return;
            const delta = event.clientX - current.startX;
            const nextWidth = Math.max(90, current.startWidth + delta);
            setColumnWidths((prev) => ({...prev, [current.key]: nextWidth}));
        };
        const onMouseUp = () => {
            resizeRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    useEffect(() => {
        if (!selectedAccount) {
            setStorageUsage(null);
            setStorageLoading(false);
            return;
        }
        let active = true;
        const loadUsage = (markLoading: boolean) => {
            if (!active) return;
            if (markLoading) setStorageLoading(true);
            void ipcClient
                .getCloudStorageUsage(selectedAccount.id)
                .then((usage) => {
                    if (!active) return;
                    setStorageUsage(usage);
                })
                .catch(() => {
                    if (!active) return;
                    setStorageUsage(null);
                })
                .finally(() => {
                    if (!active) return;
                    if (markLoading) setStorageLoading(false);
                });
        };
        loadUsage(true);
        const timer = window.setInterval(() => loadUsage(false), 30000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [reloadKey, selectedAccount]);

    useEffect(() => {
        if (!selectedAccount || !currentNavEntry) {
            setItems([]);
            return;
        }
        const key = `${selectedAccount.id}:${currentNavEntry.token}`;
        const memoryCached = filesCacheRef.current[key];
        const persistedCached = memoryCached || readPersistedFolderCache(selectedAccount.id, currentNavEntry.token);
        if (persistedCached) {
            if (!memoryCached) {
                setFilesCache((prev) => ({...prev, [key]: persistedCached}));
            }
            setItems(persistedCached);
            setPendingFolderToken((prev) => (prev ? null : prev));
        } else {
            // No cache for this target folder: clear stale rows and force loading state.
            setItems([]);
            setPendingFolderToken((prev) => (prev === currentNavEntry.token ? prev : currentNavEntry.token));
        }
        let active = true;
        setLoading(true);
        setStatus("Loading cloud files...");
        void ipcClient
            .listCloudItems(selectedAccount.id, currentNavEntry.token)
            .then((result) => {
                if (!active) return;
                setItems(result.items);
                setFilesCache((prev) => ({...prev, [key]: result.items}));
                writePersistedFolderCache(selectedAccount.id, currentNavEntry.token, result.items);
                setStatus(`Loaded ${result.items.length} items.`);
                setPendingFolderToken(null);
            })
            .catch((error: any) => {
                if (!active) return;
                if (!persistedCached) setItems([]);
                setStatus(`Load failed: ${error?.message || String(error)}`);
                setPendingFolderToken(null);
            })
            .finally(() => {
                if (!active) return;
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [currentNavEntry, reloadKey, selectedAccount]);

    useEffect(() => {
        if (loading || !selectedAccountId) return;
        setRefreshingAccountIds((prev) => {
            if (!prev.has(selectedAccountId)) return prev;
            const next = new Set(prev);
            next.delete(selectedAccountId);
            return next;
        });
    }, [loading, selectedAccountId]);

    useEffect(() => {
        if (!selectedAccount || !currentNavEntry || pendingFolderToken) return;
        const accountId = selectedAccount.id;
        const token = currentNavEntry.token;
        const key = `${accountId}:${token}`;
        const timer = window.setInterval(() => {
            void ipcClient
                .listCloudItems(accountId, token)
                .then((result) => {
                    setFilesCache((prev) => {
                        const previous = prev[key] || [];
                        if (areCloudItemsEqual(previous, result.items)) return prev;
                        return {...prev, [key]: result.items};
                    });
                    writePersistedFolderCache(accountId, token, result.items);
                    const isStillCurrent = selectedAccount?.id === accountId && currentNavEntry?.token === token;
                    if (isStillCurrent) {
                        setItems((prev) => (areCloudItemsEqual(prev, result.items) ? prev : result.items));
                    }
                })
                .catch(() => undefined);
        }, 30000);
        return () => {
            window.clearInterval(timer);
        };
    }, [currentNavEntry, pendingFolderToken, selectedAccount]);

    function buildCloudLink(accountId: number, trail: NavigationEntry[]): string {
        return buildCloudRoute(accountId, trail);
    }

    function buildFolderLink(item: CloudItem): string {
        if (!selectedAccount) return "/cloud";
        return buildCloudLink(selectedAccount.id, [...nav, {token: item.path, label: item.name}]);
    }

    function toggleTableColumn(column: CloudTableColumnKey): void {
        setTableColumns((prev) => {
            if (prev.includes(column)) {
                if (prev.length === 1) return prev;
                return prev.filter((item) => item !== column);
            }
            return [...prev, column];
        });
    }

    function resetTableColumns(): void {
        setTableColumns(CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key));
    }

    function openTableHeadMenuAt(x: number, y: number): void {
        setTableHeadMenu({x, y});
    }

    function moveTableColumnBefore(dragged: CloudTableColumnKey, target: CloudTableColumnKey): void {
        if (dragged === target) return;
        setTableColumns((prev) => {
            const fromIndex = prev.indexOf(dragged);
            const targetIndex = prev.indexOf(target);
            if (fromIndex < 0 || targetIndex < 0) return prev;
            const next = prev.filter((column) => column !== dragged);
            const insertAt = next.indexOf(target);
            if (insertAt < 0) return prev;
            next.splice(insertAt, 0, dragged);
            return next;
        });
    }

    function moveTableColumnAfter(dragged: CloudTableColumnKey, target: CloudTableColumnKey): void {
        if (dragged === target) return;
        setTableColumns((prev) => {
            const fromIndex = prev.indexOf(dragged);
            const targetIndex = prev.indexOf(target);
            if (fromIndex < 0 || targetIndex < 0) return prev;
            const next = prev.filter((column) => column !== dragged);
            const insertAt = next.indexOf(target);
            if (insertAt < 0) return prev;
            next.splice(insertAt + 1, 0, dragged);
            return next;
        });
    }

    function onTableHeaderDragStart(event: React.DragEvent, column: CloudTableColumnKey): void {
        if (resizeRef.current) {
            event.preventDefault();
            return;
        }
        setDraggingColumn(column);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column);
    }

    function onTableHeaderDrop(event: React.DragEvent, target: CloudTableColumnKey): void {
        event.preventDefault();
        const dragged = draggingColumn || (event.dataTransfer.getData("text/plain") as CloudTableColumnKey);
        if (!dragged) return;
        const side = dragPlaceholder?.column === target ? dragPlaceholder.side : "before";
        if (side === "after") {
            moveTableColumnAfter(dragged, target);
        } else {
            moveTableColumnBefore(dragged, target);
        }
        setDragPlaceholder(null);
        setDraggingColumn(null);
    }

    function toggleTableSort(column: CloudTableColumnKey): void {
        setTableSort((prev) => {
            if (prev.column === column) {
                return {
                    column,
                    direction: prev.direction === "asc" ? "desc" : "asc",
                };
            }
            return {column, direction: "asc"};
        });
    }

    function onColumnResizeStart(key: CloudTableColumnKey, event: React.MouseEvent) {
        event.preventDefault();
        resizeRef.current = {
            key,
            startX: event.clientX,
            startWidth: columnWidths[key],
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    async function onCreateFolder(folderName: string): Promise<void> {
        if (!selectedAccount || mutating) return;
        const current = currentNavEntry;
        const trimmed = String(folderName || "").trim();
        if (!trimmed) return;
        setMutating(true);
        setStatus("Creating folder...");
        try {
            await ipcClient.createCloudFolder(selectedAccount.id, current?.token ?? null, trimmed);
            setStatus(`Folder "${trimmed}" created.`);
            setReloadKey((value) => value + 1);
        } catch (error: any) {
            setStatus(`Create folder failed: ${error?.message || String(error)}`);
        } finally {
            setMutating(false);
        }
    }

    async function onUploadFiles(): Promise<void> {
        if (!selectedAccount || mutating) return;
        const current = currentNavEntry;
        setMutating(true);
        setStatus("Uploading files...");
        try {
            const result = await ipcClient.uploadCloudFiles(selectedAccount.id, current?.token ?? null);
            if (!result.uploaded) {
                setStatus("Upload cancelled.");
                return;
            }
            setStatus(`Uploaded ${result.uploaded} file${result.uploaded === 1 ? "" : "s"}.`);
            setReloadKey((value) => value + 1);
        } catch (error: any) {
            setStatus(`Upload failed: ${error?.message || String(error)}`);
        } finally {
            setMutating(false);
        }
    }

    async function onDeleteItem(item: CloudItem): Promise<void> {
        if (!selectedAccount || mutating) return;
        const label = item.isFolder ? "folder" : "file";
        if (!window.confirm(`Delete ${label} "${item.name}"?`)) return;
        setMutating(true);
        setDeletingItemId(item.id);
        setRowMenu(null);
        setStatus(`Deleting ${label}...`);
        try {
            const accountId = selectedAccount.id;
            const folderToken = currentNavEntry?.token ?? "root";
            const nextVisibleItems = items.filter((entry) => entry.id !== item.id);
            setItems(nextVisibleItems);
            if (currentCacheKey) {
                setFilesCache((prev) => {
                    const next = {...prev, [currentCacheKey]: nextVisibleItems};
                    invalidateDeletedFolderCaches(next, accountId, item);
                    return next;
                });
            }
            if (selectedAccount && currentNavEntry) {
                writePersistedFolderCache(selectedAccount.id, currentNavEntry.token, nextVisibleItems);
                clearPersistedDeletedFolderCaches(selectedAccount.id, item);
            }
            await ipcClient.deleteCloudItem(selectedAccount.id, item.path);
            let stillExists = false;
            try {
                const statusResult = await ipcClient.getCloudItemStatus(accountId, item.path);
                stillExists = statusResult.exists;
            } catch {
                stillExists = false;
            }
            const refreshed = await ipcClient.listCloudItems(accountId, folderToken);
            setItems(refreshed.items);
            const refreshedCacheKey = `${accountId}:${folderToken}`;
            setFilesCache((prev) => ({...prev, [refreshedCacheKey]: refreshed.items}));
            writePersistedFolderCache(accountId, folderToken, refreshed.items);
            setStatus(
                stillExists ? `Delete requested for ${item.name}; sync is still in progress.` : `${item.name} deleted.`
            );
            setReloadKey((value) => value + 1);
        } catch (error: any) {
            setStatus(`Delete failed: ${error?.message || String(error)}`);
            setReloadKey((value) => value + 1);
        } finally {
            setDeletingItemId(null);
            setMutating(false);
        }
    }

    async function onViewItem(item: CloudItem): Promise<void> {
        if (!selectedAccount || item.isFolder || mutating) return;
        const actionItemId = item.id;
        setActiveFileActionId(actionItemId);
        setRowMenu(null);
        setStatus(`Opening ${item.name}...`);
        let finished = false;
        const clearActiveAction = () => {
            setActiveFileActionId((prev) => (prev === actionItemId ? null : prev));
        };
        const fallbackTimer = window.setTimeout(() => {
            if (finished) return;
            clearActiveAction();
            setStatus(`Opening ${item.name} in external app...`);
        }, 4500);
        try {
            await ipcClient.openCloudItem(selectedAccount.id, item.path, item.name, "open");
            finished = true;
            setStatus(`Opened ${item.name}.`);
        } catch (error: any) {
            finished = true;
            setStatus(`Open failed: ${error?.message || String(error)}`);
        } finally {
            window.clearTimeout(fallbackTimer);
            clearActiveAction();
        }
    }

    async function onDownloadItem(item: CloudItem): Promise<void> {
        if (!selectedAccount || item.isFolder || mutating) return;
        setActiveFileActionId(item.id);
        setRowMenu(null);
        setStatus(`Downloading ${item.name}...`);
        try {
            const result = await ipcClient.openCloudItem(selectedAccount.id, item.path, item.name, "save");
            if (!result.ok || result.action === "cancelled") {
                setStatus("Download cancelled.");
                return;
            }
            setStatus(`Saved ${item.name}.`);
        } catch (error: any) {
            setStatus(`Download failed: ${error?.message || String(error)}`);
        } finally {
            setActiveFileActionId(null);
        }
    }

    async function onShareItem(item: CloudItem): Promise<void> {
        if (!selectedAccount) return;
        setRowMenu(null);
        setStatus(`Generating share link for ${item.name}...`);
        try {
            const result = await ipcClient.createCloudShareLink(selectedAccount.id, item.path);
            setShareModal({name: item.name, url: result.url});
            setStatus("Share link ready.");
        } catch (error: any) {
            setStatus(`Share failed: ${error?.message || String(error)}`);
        }
    }

    async function onAddCloudAccount(): Promise<void> {
        if (adding) return;
        setAdding(true);
        setStatus("Adding cloud account...");
        try {
            const payload: AddCloudAccountPayload = {
                provider: draft.provider,
                name: draft.name.trim(),
                base_url: (draft.base_url || "").trim() || null,
                user: (draft.user || "").trim() || null,
                secret: draft.secret,
            };
            await ipcClient.addCloudAccount(payload);
            setShowAddModal(false);
            setDraft({
                provider: "nextcloud",
                name: "",
                base_url: "",
                user: "",
                secret: "",
            });
            setStatus("Cloud account added.");
        } catch (error: any) {
            setStatus(`Add failed: ${error?.message || String(error)}`);
        } finally {
            setAdding(false);
        }
    }

    async function onLinkOneDriveAccount(): Promise<void> {
        if (linkingOAuth) return;
        setLinkingOAuth(true);
        setStatus("Opening OneDrive sign-in...");
        try {
            await ipcClient.linkCloudOAuth("onedrive", {
                clientId: DEFAULT_ONEDRIVE_CLIENT_ID,
                tenantId: DEFAULT_ONEDRIVE_TENANT_ID,
            });
            setShowAddModal(false);
            setDraft({
                provider: "nextcloud",
                name: "",
                base_url: "",
                user: "",
                secret: "",
            });
            setStatus("OneDrive account linked.");
        } catch (error: any) {
            setStatus(`OneDrive sign-in failed: ${error?.message || String(error)}`);
        } finally {
            setLinkingOAuth(false);
        }
    }

    function navigateToAccount(account: PublicCloudAccount, forceReload = false): void {
        const rootTrail = buildRootTrail(account.provider);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("account", String(account.id));
        nextParams.set("trail", serializeNavigationTrail(rootTrail));
        setSearchParams(nextParams);
        if (forceReload) {
            setPendingFolderToken(rootTrail[rootTrail.length - 1]?.token || null);
            setItems([]);
            setLoading(true);
            setReloadKey((value) => value + 1);
        }
    }

    async function onDeleteAccount(account: PublicCloudAccount): Promise<void> {
        if (deleting) return;
        if (!window.confirm(`Delete cloud account "${account.name}"?`)) return;
        setDeleting(true);
        setAccountMenu(null);
        setStatus("Deleting cloud account...");
        try {
            await ipcClient.deleteCloudAccount(account.id);
            setStatus("Cloud account deleted.");
        } catch (error: any) {
            setStatus(`Delete failed: ${error?.message || String(error)}`);
        } finally {
            setDeleting(false);
        }
    }

    async function onRefreshAccount(account: PublicCloudAccount): Promise<void> {
        if (loading || mutating) return;
        setRefreshingAccountIds((prev) => {
            if (prev.has(account.id)) return prev;
            const next = new Set(prev);
            next.add(account.id);
            return next;
        });
        setAccountMenu(null);
        setStatus(`Refreshing ${account.name}...`);
        navigateToAccount(account, true);
    }

    function onOpenAccountSettings(account: PublicCloudAccount): void {
        setAccountMenu(null);
        setEditDraft({
            id: account.id,
            provider: account.provider,
            name: account.name,
            base_url: account.base_url || "",
            user: account.user || "",
            secret: "",
        });
        setShowEditModal(true);
    }

    async function onSaveEditedAccount(): Promise<void> {
        if (!editDraft || savingEdit) return;
        setSavingEdit(true);
        setStatus("Saving cloud account...");
        try {
            const payload: UpdateCloudAccountPayload = {
                name: editDraft.name.trim(),
                base_url: (editDraft.base_url || "").trim() || null,
                user: (editDraft.user || "").trim() || null,
            };
            const nextSecret = (editDraft.secret || "").trim();
            if (nextSecret) {
                payload.secret = nextSecret;
            }
            await ipcClient.updateCloudAccount(editDraft.id, payload);
            setShowEditModal(false);
            setEditDraft(null);
            if (selectedAccount?.id === editDraft.id) {
                setReloadKey((value) => value + 1);
            }
            setStatus("Cloud account updated.");
        } catch (error: any) {
            setStatus(`Update failed: ${error?.message || String(error)}`);
        } finally {
            setSavingEdit(false);
        }
    }

    function onOpenAccountInNewWindow(account: PublicCloudAccount): void {
        const url = `${window.location.origin}${window.location.pathname}#${buildCloudLink(account.id, buildRootTrail(account.provider))}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setAccountMenu(null);
    }

    const requiresWebDavFields = draft.provider === "nextcloud" || draft.provider === "webdav";
    const isOneDriveOAuthProvider = draft.provider === "onedrive";
    const editRequiresWebDavFields = editDraft?.provider === "nextcloud" || editDraft?.provider === "webdav";
    const secretLabel = draft.provider === "onedrive" ? "OAuth key / access token" : "Password / app token";
    const tokenHelp =
        draft.provider === "onedrive"
            ? {
                title: "OneDrive sign-in",
                steps: [
                    'Click "Sign in with OneDrive".',
                    "Complete Microsoft sign-in and consent in your browser.",
                    "Return to LunaMail after the browser callback finishes.",
                ],
                link: "https://support.microsoft.com/onedrive",
            }
            : null;

    function toggleAccountExpanded(accountId: number): void {
        setCollapsedAccountIds((prev) => {
            const next = new Set(prev);
            if (next.has(accountId)) {
                next.delete(accountId);
            } else {
                next.add(accountId);
            }
            return next;
        });
    }

    function navigateToOneDriveScope(accountId: number, scope: OneDriveDriveScope): void {
        const option = ONEDRIVE_SCOPE_OPTIONS.find((entry) => entry.value === scope);
        if (!option) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("account", String(accountId));
        nextParams.set("trail", serializeNavigationTrail([{token: option.token, label: option.label}]));
        setSearchParams(nextParams);
        setPendingFolderToken(option.token);
        setItems([]);
        setStatus(`Opening ${option.label}...`);
        setLoading(true);
    }

    const menubar = (
        <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedAccount ? selectedAccount.name : "Cloud Files"}
                </h1>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {selectedAccount
                        ? `${storageLoading ? "Loading storage..." : formatStorageUsage(storageUsage)}`
                        : "Add an account to browse cloud files."}
                </p>
                {selectedAccount && (
                    <div className="mt-1 h-1.5 w-52 overflow-hidden rounded-full bg-slate-200 dark:bg-[#3a3d44]">
                        <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{width: `${storageLoading ? 20 : formatStorageUsagePercent(storageUsage)}%`}}
                        />
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                    disabled={!selectedAccount || loading || mutating}
                    onClick={() => {
                        setNewFolderName("");
                        setShowCreateFolderModal(true);
                    }}
                >
                    <FolderPlus size={14}/>
                    New Folder
                </button>
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                    disabled={!selectedAccount || loading || mutating}
                    onClick={() => void onUploadFiles()}
                >
                    <Upload size={14}/>
                    Upload
                </button>
            </div>
        </div>
    );

    const sidebar = (
        <aside
            className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]">
            <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-[#3a3d44]">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cloud Accounts</h2>
                <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                    onClick={() => setShowAddModal(true)}
                    title="Add cloud account"
                >
                    <Plus size={15}/>
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
                {accounts.length === 0 && (
                    <p className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">No cloud accounts yet.</p>
                )}
                {accounts.map((account) => {
                    const active = account.id === selectedAccountId;
                    const rootTrail = buildRootTrail(account.provider);
                    const isOneDrive = account.provider === "onedrive";
                    const isExpanded = active || !collapsedAccountIds.has(account.id);
                    const selectedScope = active ? resolveOneDriveScope(nav) : "home";
                    return (
                        <div
                            key={account.id}
                            className="space-y-1"
                            onContextMenu={(event) => {
                                event.preventDefault();
                                setAccountMenu({x: event.clientX, y: event.clientY, account});
                            }}
                        >
                            <div
                                className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors ${
                                    active
                                        ? "bg-gradient-to-r from-slate-200/90 to-slate-100/90 dark:from-[#3f434b] dark:to-[#373a42]"
                                        : "bg-transparent hover:bg-gradient-to-r hover:from-slate-200/90 hover:to-slate-100/90 dark:hover:from-[#3f434b] dark:hover:to-[#373a42]"
                                }`}
                            >
                                <Link
                                    to={buildCloudLink(account.id, rootTrail)}
                                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors ${
                                        active ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"
                                    }`}
                                    style={{color: "inherit"}}
                                >
                  <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                          account.provider === "onedrive"
                              ? "border-sky-300/80 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300"
                              : account.provider === "nextcloud"
                                  ? "border-emerald-300/80 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  : "border-slate-300 bg-slate-100 text-slate-600 dark:border-[#4a4d55] dark:bg-[#2b2e34] dark:text-slate-300"
                      }`}
                      aria-hidden
                  >
                    {account.provider === "onedrive" ? (
                        <Cloud size={14}/>
                    ) : account.provider === "nextcloud" ? (
                        <Globe size={14}/>
                    ) : (
                        <HardDrive size={14}/>
                    )}
                  </span>
                                    <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.name}</span>
                    <span className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      {providerLabels[account.provider]}
                    </span>
                  </span>
                                </Link>
                                <div className="ml-auto flex items-center gap-1 pr-0">
                                    <div
                                        className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                        <button
                                            type="button"
                                            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                            title="Refresh account"
                                            disabled={refreshingAccountIds.has(account.id)}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void onRefreshAccount(account);
                                            }}
                                        >
                                            <RefreshCw
                                                size={13}
                                                className={refreshingAccountIds.has(account.id) ? "animate-spin" : undefined}
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                            title="Account actions"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setAccountMenu({x: event.clientX, y: event.clientY, account});
                                            }}
                                        >
                                            <Settings size={13}/>
                                        </button>
                                    </div>
                                    {isOneDrive && (
                                        <button
                                            type="button"
                                            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                toggleAccountExpanded(account.id);
                                            }}
                                            title={isExpanded ? "Collapse drives" : "Expand drives"}
                                            aria-label={isExpanded ? "Collapse drives" : "Expand drives"}
                                            aria-expanded={isExpanded}
                                        >
                                            <ChevronRight
                                                size={14}
                                                className={isExpanded ? "rotate-90 transition-transform" : "transition-transform"}
                                            />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isOneDrive && isExpanded && (
                                <div
                                    className="relative space-y-1 pl-7 before:absolute before:bottom-2 before:left-3.5 before:top-1 before:w-px before:bg-gradient-to-b before:from-slate-300 before:to-slate-200/30 before:content-[''] dark:before:from-[#4a4d55] dark:before:to-transparent">
                                    {ONEDRIVE_SCOPE_OPTIONS.map((scope) => (
                                        <Link
                                            key={`${account.id}-${scope.value}`}
                                            to={buildCloudLink(account.id, [{token: scope.token, label: scope.label}])}
                                            onClick={() => navigateToOneDriveScope(account.id, scope.value)}
                                            className={`group relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-xs no-underline transition-colors ${
                                                active && selectedScope === scope.value
                                                    ? "bg-sky-50/80 text-sky-700 dark:bg-[#3a3e52] dark:text-slate-100"
                                                    : "text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-[#3a3d44]"
                                            }`}
                                            style={{color: "inherit"}}
                                        >
                                            <span className="truncate">{scope.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );

    return (
        <div className="relative h-full w-full overflow-hidden">
            <WorkspaceLayout
                menubar={menubar}
                showMenuBar
                sidebar={sidebar}
                sidebarWidth={sidebarWidth}
                onSidebarResizeStart={onResizeStart}
                statusText={status || (loading ? "Loading..." : "Ready")}
                statusBusy={loading || mutating || activeFileActionId !== null || deletingItemId !== null}
                showStatusBar
                showFooter={false}
                contentClassName="min-h-0 flex flex-1 flex-col overflow-hidden bg-slate-50 p-0 dark:bg-[#26292f]"
            >
                <div
                    className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-[#3a3d44] dark:bg-[#25272c] dark:text-slate-400">
                    {nav.map((entry, index) => (
                        <Link
                            key={`${entry.token}-${index}`}
                            to={selectedAccount ? buildCloudLink(selectedAccount.id, nav.slice(0, index + 1)) : "/cloud"}
                            className="mr-1 rounded px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-[#35373c]"
                        >
                            {entry.label}
                            {index < nav.length - 1 ? " /" : ""}
                        </Link>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    {!selectedAccount && (
                        <div
                            className="flex h-full min-h-[240px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                            Add a cloud account to start browsing files.
                        </div>
                    )}
                    {selectedAccount && loading && Boolean(pendingFolderToken) && (
                        <div
                            className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <Loader2 size={18} className="animate-spin"/>
                            <span>Loading folder...</span>
                        </div>
                    )}
                    {selectedAccount && !pendingFolderToken && items.length === 0 && !loading && (
                        <div
                            className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                            <span>No files</span>
                            <Link
                                to={buildCloudLink(
                                    selectedAccount.id,
                                    nav.length > 1 ? nav.slice(0, -1) : buildRootTrail(selectedAccount.provider)
                                )}
                                onClick={() => {
                                    setPendingFolderToken("__parent__");
                                    setItems([]);
                                    setStatus("Opening folder...");
                                    setLoading(true);
                                }}
                                className="rounded px-2 py-1 text-sky-700 hover:underline dark:text-sky-300"
                            >
                                Go back
                            </Link>
                        </div>
                    )}
                    {selectedAccount && !pendingFolderToken && items.length > 0 && (
                        <div
                            className="h-full min-h-0 border-t border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#26292f]">
                            <div className="h-full min-h-0 overflow-auto">
                                <table
                                    key={`cloud-table-${visibleTableColumns.map((column) => column.key).join("|")}`}
                                    className="table-fixed border-collapse text-sm"
                                    style={{width: `max(${tableMinWidth}px, 100%)`, minWidth: "100%"}}
                                >
                                    <colgroup>
                                        {visibleTableColumns.map((column) => (
                                            <col key={column.key} style={{width: `${columnWidths[column.key]}px`}}/>
                                        ))}
                                        <col style={{width: "44px"}}/>
                                    </colgroup>
                                    <thead
                                        className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[inset_0_-1px_0_0_rgb(226_232_240)] dark:border-[#3a3d44] dark:bg-[#32353c] dark:shadow-[inset_0_-1px_0_0_#3a3d44]"
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            openTableHeadMenuAt(event.clientX, event.clientY);
                                        }}
                                    >
                                    <tr className="group text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                        {visibleTableColumns.map((column, index) => (
                                            <th
                                                key={column.key}
                                                className={`relative border-b border-slate-200 bg-slate-100 px-3 py-2 select-none dark:border-[#3a3d44] dark:bg-[#32353c] ${
                                                    index < visibleTableColumns.length - 1
                                                        ? "border-r border-r-slate-200 dark:border-r-[#3a3d44]"
                                                        : ""
                                                } ${draggingColumn === column.key ? "opacity-70" : ""} ${
                                                    dragPlaceholder?.column === column.key && draggingColumn && draggingColumn !== column.key
                                                        ? "bg-sky-100/50 dark:bg-[#3a4f72]/60"
                                                        : ""
                                                }`}
                                                style={{width: columnWidths[column.key]}}
                                                draggable
                                                onDragStart={(event) => onTableHeaderDragStart(event, column.key)}
                                                onDragOver={(event) => {
                                                    event.preventDefault();
                                                    if (draggingColumn && draggingColumn !== column.key) {
                                                        const rect = event.currentTarget.getBoundingClientRect();
                                                        const side = event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
                                                        setDragPlaceholder((prev) => {
                                                            if (prev?.column === column.key && prev.side === side) return prev;
                                                            return {column: column.key, side};
                                                        });
                                                    }
                                                }}
                                                onDragLeave={() => {
                                                    setDragPlaceholder((prev) => (prev?.column === column.key ? null : prev));
                                                }}
                                                onDrop={(event) => onTableHeaderDrop(event, column.key)}
                                                onDragEnd={() => {
                                                    setDraggingColumn(null);
                                                    setDragPlaceholder(null);
                                                }}
                                            >
                                                {dragPlaceholder?.column === column.key && dragPlaceholder.side === "before" && (
                                                    <span
                                                        className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    className="inline-flex max-w-full items-center gap-1 truncate text-left hover:text-slate-900 dark:hover:text-slate-100"
                                                    onClick={() => toggleTableSort(column.key)}
                                                >
                                                    <span className="truncate">{column.label}</span>
                                                    {tableSort.column === column.key &&
                                                        (tableSort.direction === "asc" ? (
                                                            <ArrowUp size={12} className="shrink-0"/>
                                                        ) : (
                                                            <ArrowDown size={12} className="shrink-0"/>
                                                        ))}
                                                </button>
                                                {index < visibleTableColumns.length - 1 && (
                                                    <div
                                                        role="separator"
                                                        aria-orientation="vertical"
                                                        className={CLOUD_TABLE_RESIZE_HANDLE_CLASS}
                                                        onMouseDown={(event) => onColumnResizeStart(column.key, event)}
                                                    />
                                                )}
                                                {dragPlaceholder?.column === column.key && dragPlaceholder.side === "after" && (
                                                    <span
                                                        className="pointer-events-none absolute bottom-0 right-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </th>
                                        ))}
                                        <th className="border-b border-slate-200 bg-slate-100 px-1 py-1 text-right dark:border-[#3a3d44] dark:bg-[#32353c]">
                                            <button
                                                type="button"
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-[#3a3d44] dark:hover:text-slate-100"
                                                title="Table column options"
                                                aria-label="Table column options"
                                                onClick={(event) => {
                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                    openTableHeadMenuAt(rect.right - 8, rect.bottom + 6);
                                                }}
                                            >
                                                <Settings size={13}/>
                                            </button>
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {nav.length > 1 && (
                                        <tr className="border-b border-slate-100 hover:bg-slate-50/80 dark:border-[#3a3d44] dark:hover:bg-[#35373c]">
                                            {visibleTableColumns.map((column) => {
                                                if (column.key === "name") {
                                                    return (
                                                        <td
                                                            key={`parent-${column.key}`}
                                                            className="px-3 py-2"
                                                            style={{width: columnWidths.name}}
                                                        >
                                                            <Link
                                                                to={buildCloudLink(selectedAccount.id, nav.slice(0, -1))}
                                                                onClick={() => {
                                                                    setPendingFolderToken("__parent__");
                                                                    setItems([]);
                                                                    setStatus("Opening parent folder...");
                                                                    setLoading(true);
                                                                }}
                                                                className="flex min-w-0 items-center gap-2 text-slate-800 hover:underline dark:text-slate-100"
                                                            >
                                                                <FolderOpen size={15}
                                                                            className="shrink-0 text-sky-500"/>
                                                                <span className="truncate font-medium">..</span>
                                                            </Link>
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "type") {
                                                    return (
                                                        <td
                                                            key={`parent-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.type}}
                                                        >
                                                            Folder
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "size") {
                                                    return (
                                                        <td
                                                            key={`parent-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.size}}
                                                        >
                                                            -
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "modified") {
                                                    return (
                                                        <td
                                                            key={`parent-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.modified}}
                                                        >
                                                            -
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td
                                                        key={`parent-${column.key}`}
                                                        className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                        style={{width: columnWidths.created}}
                                                    >
                                                        -
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-2 text-right text-xs text-slate-500 dark:text-slate-400">Parent</td>
                                        </tr>
                                    )}
                                    {sortedItems.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="relative border-b border-slate-100 hover:bg-slate-50/80 dark:border-[#2b2d32] dark:hover:bg-[#25272c]"
                                            onContextMenu={(event) => {
                                                event.preventDefault();
                                                setRowMenu({x: event.clientX, y: event.clientY, item});
                                            }}
                                        >
                                            {visibleTableColumns.map((column) => {
                                                if (column.key === "name") {
                                                    return (
                                                        <td
                                                            key={`${item.id}-${column.key}`}
                                                            className="px-3 py-2"
                                                            style={{width: columnWidths.name}}
                                                        >
                                                            {item.isFolder ? (
                                                                <Link
                                                                    to={buildFolderLink(item)}
                                                                    onClick={() => {
                                                                        setPendingFolderToken(item.path);
                                                                        setItems([]);
                                                                        setStatus(`Opening ${item.name}...`);
                                                                        setLoading(true);
                                                                    }}
                                                                    className="flex min-w-0 items-center gap-2 text-slate-800 hover:underline dark:text-slate-100"
                                                                >
                                                                    <FolderOpen size={15}
                                                                                className="shrink-0 text-sky-500"/>
                                                                    <span className="truncate">{item.name}</span>
                                                                </Link>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="flex min-w-0 items-center gap-2 text-left text-slate-800 hover:underline dark:text-slate-100"
                                                                    onClick={() => void onViewItem(item)}
                                                                >
                                                                    {activeFileActionId === item.id ? (
                                                                        <Loader2 size={15}
                                                                                 className="shrink-0 animate-spin text-slate-500"/>
                                                                    ) : (
                                                                        renderCloudFileTypeIcon(item)
                                                                    )}
                                                                    <span className="truncate">{item.name}</span>
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "type") {
                                                    return (
                                                        <td
                                                            key={`${item.id}-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.type}}
                                                        >
                                                            {item.isFolder ? "Folder" : "File"}
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "size") {
                                                    return (
                                                        <td
                                                            key={`${item.id}-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.size}}
                                                        >
                                                            {item.isFolder ? "-" : formatBytes(item.size ?? 0)}
                                                        </td>
                                                    );
                                                }
                                                if (column.key === "modified") {
                                                    return (
                                                        <td
                                                            key={`${item.id}-${column.key}`}
                                                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                            style={{width: columnWidths.modified}}
                                                        >
                                                            {formatSystemDateTime(item.modifiedAt) || "-"}
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td
                                                        key={`${item.id}-${column.key}`}
                                                        className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
                                                        style={{width: columnWidths.created}}
                                                    >
                                                        {formatSystemDateTime(item.createdAt) || "-"}
                                                    </td>
                                                );
                                            })}
                                            <td className="relative px-2 py-2 text-right">
                                                <button
                                                    type="button"
                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                    title="Actions"
                                                    aria-label={`Actions for ${item.name}`}
                                                    onClick={(event) => {
                                                        const rect = event.currentTarget.getBoundingClientRect();
                                                        setRowMenu({x: rect.right - 8, y: rect.bottom + 6, item});
                                                    }}
                                                    disabled={mutating || activeFileActionId !== null || deletingItemId === item.id}
                                                >
                                                    {deletingItemId === item.id ? (
                                                        <Loader2 size={14} className="animate-spin"/>
                                                    ) : (
                                                        <MoreHorizontal size={14}/>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </WorkspaceLayout>

            {rowMenu && (
                <div
                    ref={rowMenuRef}
                    className="fixed z-[1015] min-w-52 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{
                        left: rowMenuPosition.left,
                        top: rowMenuPosition.top,
                        visibility: rowMenuReady ? "visible" : "hidden",
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {!rowMenu.item.isFolder && (
                        <>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                                onClick={() => void onViewItem(rowMenu.item)}
                            >
                                <Eye size={14}/>
                                View
                            </button>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                                onClick={() => void onDownloadItem(rowMenu.item)}
                            >
                                <Download size={14}/>
                                Download
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                        onClick={() => void onShareItem(rowMenu.item)}
                    >
                        <Share2 size={14}/>
                        Share
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-900/30"
                        onClick={() => void onDeleteItem(rowMenu.item)}
                        disabled={deletingItemId === rowMenu.item.id}
                    >
                        {deletingItemId === rowMenu.item.id ? <Loader2 size={14} className="animate-spin"/> :
                            <Trash2 size={14}/>}
                        {deletingItemId === rowMenu.item.id ? "Deleting..." : "Delete"}
                    </button>
                </div>
            )}

            {tableHeadMenu && (
                <div
                    ref={tableHeadMenuRef}
                    className="fixed z-[1015] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{
                        left: tableHeadMenuPosition.left,
                        top: tableHeadMenuPosition.top,
                        visibility: tableHeadMenuReady ? "visible" : "hidden",
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div
                        className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Table Columns
                    </div>
                    {CLOUD_TABLE_COLUMN_OPTIONS.map((column) => {
                        const checked = tableColumns.includes(column.key);
                        return (
                            <button
                                key={column.key}
                                type="button"
                                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                onClick={() => toggleTableColumn(column.key)}
                            >
                                <span>{column.label}</span>
                                <span
                                    className={`inline-flex h-4 w-4 items-center justify-center text-xs ${checked ? "text-emerald-600 dark:text-emerald-300" : "text-transparent"}`}
                                    aria-hidden={!checked}
                                >
                  ✓
                </span>
                            </button>
                        );
                    })}
                    <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                    <button
                        type="button"
                        className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                        onClick={() => resetTableColumns()}
                    >
                        Reset Columns
                    </button>
                </div>
            )}

            {accountMenu && (
                <div
                    ref={accountMenuRef}
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{
                        left: accountMenuPosition.left,
                        top: accountMenuPosition.top,
                        visibility: accountMenuReady ? "visible" : "hidden",
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                        onClick={() => {
                            navigateToAccount(accountMenu.account, false);
                            setAccountMenu(null);
                        }}
                    >
                        Open
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                        onClick={() => onOpenAccountInNewWindow(accountMenu.account)}
                    >
                        Open in new window
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                        onClick={() => void onRefreshAccount(accountMenu.account)}
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#2a2d33]"
                        onClick={() => onOpenAccountSettings(accountMenu.account)}
                    >
                        Edit account
                    </button>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
                        onClick={() => void onDeleteAccount(accountMenu.account)}
                    >
                        Delete account
                    </button>
                </div>
            )}

            {showAddModal && (
                <div
                    className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
                    <div
                        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]">
                        <div className="mb-3 flex items-start justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Cloud
                                    Account</h3>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Nextcloud/WebDAV uses URL + username + app password. OneDrive can use direct
                                    sign-in.
                                </p>
                            </div>
                            <Cloud size={18} className="text-slate-500"/>
                        </div>
                        <div className="space-y-3">
                            <Field
                                label="Provider"
                                as="select"
                                value={draft.provider}
                                onChange={(next) => setDraft((prev) => ({...prev, provider: next as CloudProvider}))}
                                options={[
                                    {value: "nextcloud", label: "Nextcloud (WebDAV)"},
                                    {value: "webdav", label: "Generic WebDAV"},
                                    {value: "onedrive", label: "OneDrive (Sign in)"},
                                ]}
                            />
                            {!isOneDriveOAuthProvider && (
                                <Field
                                    label="Account name"
                                    value={draft.name}
                                    onChange={(next) => setDraft((prev) => ({...prev, name: next}))}
                                    placeholder="Personal Drive"
                                />
                            )}
                            {requiresWebDavFields && (
                                <>
                                    <Field
                                        label="WebDAV URL"
                                        value={draft.base_url || ""}
                                        onChange={(next) => setDraft((prev) => ({...prev, base_url: next}))}
                                        placeholder="https://cloud.example.com/remote.php/dav/files/username/"
                                    />
                                    <Field
                                        label="Username"
                                        value={draft.user || ""}
                                        onChange={(next) => setDraft((prev) => ({...prev, user: next}))}
                                        placeholder="username"
                                    />
                                </>
                            )}
                            {!isOneDriveOAuthProvider && (
                                <Field
                                    label={secretLabel}
                                    value={draft.secret}
                                    onChange={(next) => setDraft((prev) => ({...prev, secret: next}))}
                                    placeholder={draft.provider === "onedrive" ? "Paste OAuth key or access token" : "App password"}
                                    type="password"
                                />
                            )}
                            {tokenHelp && (
                                <div
                                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tokenHelp.title}</p>
                                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                        LunaMail handles OneDrive OAuth tokens automatically, including refresh when the
                                        access token
                                        expires.
                                    </p>
                                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-300">
                                        {tokenHelp.steps.map((step) => (
                                            <li key={step}>{step}</li>
                                        ))}
                                    </ol>
                                    <a
                                        href={tokenHelp.link}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="mt-1 inline-block text-xs text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                                    >
                                        Open helper page
                                    </a>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setShowAddModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                disabled={isOneDriveOAuthProvider ? linkingOAuth : adding || !draft.name.trim() || !draft.secret.trim()}
                                onClick={() => {
                                    if (isOneDriveOAuthProvider) {
                                        void onLinkOneDriveAccount();
                                        return;
                                    }
                                    void onAddCloudAccount();
                                }}
                            >
                                {isOneDriveOAuthProvider
                                    ? linkingOAuth
                                        ? "Signing in..."
                                        : "Sign in with OneDrive"
                                    : adding
                                        ? "Adding..."
                                        : "Add Cloud Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showEditModal && editDraft && (
                <div
                    className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
                    <div
                        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]">
                        <div className="mb-3 flex items-start justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit Cloud
                                    Account</h3>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Update account details. Leave secret empty to keep current one.
                                </p>
                            </div>
                            <Settings size={18} className="text-slate-500"/>
                        </div>
                        <div className="space-y-3">
                            <Field
                                label="Provider"
                                as="select"
                                value={editDraft.provider}
                                onChange={() => undefined}
                                options={[{value: editDraft.provider, label: providerLabels[editDraft.provider]}]}
                            />
                            <Field
                                label="Account name"
                                value={editDraft.name}
                                onChange={(next) => setEditDraft((prev) => (prev ? {...prev, name: next} : prev))}
                                placeholder="Personal Drive"
                            />
                            {editRequiresWebDavFields && (
                                <>
                                    <Field
                                        label="WebDAV URL"
                                        value={editDraft.base_url}
                                        onChange={(next) =>
                                            setEditDraft((prev) =>
                                                prev
                                                    ? {
                                                        ...prev,
                                                        base_url: next,
                                                    }
                                                    : prev
                                            )
                                        }
                                        placeholder="https://cloud.example.com/remote.php/dav/files/username/"
                                    />
                                    <Field
                                        label="Username"
                                        value={editDraft.user}
                                        onChange={(next) =>
                                            setEditDraft((prev) =>
                                                prev
                                                    ? {
                                                        ...prev,
                                                        user: next,
                                                    }
                                                    : prev
                                            )
                                        }
                                        placeholder="username"
                                    />
                                </>
                            )}
                            <Field
                                label="Secret (optional)"
                                value={editDraft.secret}
                                onChange={(next) => setEditDraft((prev) => (prev ? {...prev, secret: next} : prev))}
                                placeholder="Leave empty to keep unchanged"
                                type="password"
                            />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => {
                                    setShowEditModal(false);
                                    setEditDraft(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                disabled={savingEdit || !editDraft.name.trim()}
                                onClick={() => void onSaveEditedAccount()}
                            >
                                {savingEdit ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showCreateFolderModal && (
                <div
                    className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
                    <div
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create Folder</h3>
                        <div className="mt-3">
                            <Field label="Folder name" value={newFolderName} onChange={setNewFolderName}
                                   placeholder="New folder"/>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => {
                                    setShowCreateFolderModal(false);
                                    setNewFolderName("");
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                disabled={!newFolderName.trim() || mutating}
                                onClick={() => {
                                    const targetName = newFolderName.trim();
                                    setShowCreateFolderModal(false);
                                    setNewFolderName("");
                                    void onCreateFolder(targetName);
                                }}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {shareModal && (
                <div
                    className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
                    <div
                        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#1f2125]">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Share
                                    Link</h3>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shareModal.name}</p>
                            </div>
                        </div>
                        <div
                            className="rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
                            <p className="break-all text-xs text-slate-700 dark:text-slate-200">{shareModal.url}</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                onClick={() => setShareModal(null)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                onClick={() => {
                                    void navigator.clipboard
                                        .writeText(shareModal.url)
                                        .then(() => {
                                            setStatus("Share link copied to clipboard.");
                                        })
                                        .catch((error: any) => {
                                            setStatus(`Copy failed: ${error?.message || String(error)}`);
                                        });
                                }}
                            >
                                Copy link
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function rootToken(provider: CloudProvider): string {
    if (provider === "google-drive") return "root";
    if (provider === "onedrive") return "scope:home";
    return "/";
}

function resolveOneDriveScope(trail: NavigationEntry[]): OneDriveDriveScope {
    const rootTokenValue = String(trail[0]?.token || "")
        .trim()
        .toLowerCase();
    const match = ONEDRIVE_SCOPE_OPTIONS.find((option) => option.token === rootTokenValue);
    if (!match) return "home";
    return match.value;
}

function buildRootTrail(provider: CloudProvider): NavigationEntry[] {
    if (provider === "onedrive") return [{token: rootToken(provider), label: "Home"}];
    return [{token: rootToken(provider), label: "Root"}];
}

function serializeNavigationTrail(trail: NavigationEntry[]): string {
    return JSON.stringify(trail.slice(0, 32));
}

function parseNavigationTrail(raw: string | null, provider: CloudProvider): NavigationEntry[] {
    if (!raw) return buildRootTrail(provider);
    try {
        const parsed = JSON.parse(raw) as Array<{ token?: unknown; label?: unknown }>;
        if (!Array.isArray(parsed) || parsed.length === 0) return buildRootTrail(provider);
        const normalized: NavigationEntry[] = parsed
            .slice(0, 32)
            .map((entry) => ({
                token: String(entry?.token || "").trim(),
                label: String(entry?.label || "").trim(),
            }))
            .filter((entry) => entry.token.length > 0 && entry.label.length > 0);
        if (normalized.length === 0) return buildRootTrail(provider);
        return normalized;
    } catch {
        return buildRootTrail(provider);
    }
}

function buildCloudRoute(accountId: number, trail: NavigationEntry[]): string {
    const params = new URLSearchParams();
    params.set("account", String(accountId));
    params.set("trail", serializeNavigationTrail(trail));
    return `/cloud?${params.toString()}`;
}

function readCloudTableColumns(): CloudTableColumnKey[] {
    try {
        const raw = window.localStorage.getItem(CLOUD_TABLE_COLUMNS_STORAGE_KEY);
        if (!raw) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        const valid = parsed
            .map((value) => String(value))
            .filter((value): value is CloudTableColumnKey =>
                CLOUD_TABLE_COLUMN_OPTIONS.some((column) => column.key === value)
            );
        if (valid.length === 0) return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
        return Array.from(new Set(valid));
    } catch {
        return CLOUD_TABLE_COLUMN_OPTIONS.map((column) => column.key);
    }
}

function writeCloudTableColumns(columns: CloudTableColumnKey[]): void {
    try {
        window.localStorage.setItem(CLOUD_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
    } catch {
        // Ignore preference persistence failures.
    }
}

function isHierarchicalPathToken(token: string): boolean {
    return token.startsWith("/");
}

function shouldInvalidateTokenForDeletedItem(token: string, item: CloudItem): boolean {
    if (token === item.path) return true;
    if (!item.isFolder) return false;
    if (!isHierarchicalPathToken(token) || !isHierarchicalPathToken(item.path)) return false;
    return token.startsWith(`${item.path}/`);
}

function invalidateDeletedFolderCaches(cache: Record<string, CloudItem[]>, accountId: number, item: CloudItem): void {
    const prefix = `${accountId}:`;
    for (const key of Object.keys(cache)) {
        if (!key.startsWith(prefix)) continue;
        const token = key.slice(prefix.length);
        if (!shouldInvalidateTokenForDeletedItem(token, item)) continue;
        delete cache[key];
    }
}

function clearPersistedDeletedFolderCaches(accountId: number, item: CloudItem): void {
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

function formatStorageUsage(usage: CloudStorageUsage | null): string {
    if (!usage) return "Storage unavailable";
    const used = usage.usedBytes;
    const total = usage.totalBytes;
    const usedLabel =
        typeof used === "number" && Number.isFinite(used) ? `${(used / 1024 ** 3).toFixed(1)} GB` : "Unknown";
    if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) {
        return `${usedLabel} used`;
    }
    const totalLabel = `${(total / 1024 ** 3).toFixed(1)} GB`;
    return `${usedLabel} / ${totalLabel}`;
}

function renderCloudFileTypeIcon(item: CloudItem): React.ReactNode {
    const type = (item.mimeType || "").toLowerCase();
    const ext = (item.name.split(".").pop() || "").toLowerCase();
    const baseClassName = "shrink-0 text-slate-500";
    if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) {
        return <FileImage size={15} className={baseClassName}/>;
    }
    if (type.startsWith("video/") || ["mp4", "mkv", "mov", "avi", "webm"].includes(ext)) {
        return <FileVideo size={15} className={baseClassName}/>;
    }
    if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
        return <FileAudio2 size={15} className={baseClassName}/>;
    }
    if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) {
        return <FileArchive size={15} className={baseClassName}/>;
    }
    if (["csv", "xls", "xlsx", "ods"].includes(ext)) {
        return <FileSpreadsheet size={15} className={baseClassName}/>;
    }
    if (["txt", "md", "rtf", "doc", "docx", "pdf"].includes(ext) || type.startsWith("text/")) {
        return <FileText size={15} className={baseClassName}/>;
    }
    if (
        ["json", "xml", "yml", "yaml", "js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "c", "cpp", "h"].includes(ext)
    ) {
        return <FileCode size={15} className={baseClassName}/>;
    }
    return <File size={15} className={baseClassName}/>;
}

function formatStorageUsagePercent(usage: CloudStorageUsage | null): number {
    if (!usage) return 0;
    const used = usage.usedBytes;
    const total = usage.totalBytes;
    if (
        typeof used !== "number" ||
        !Number.isFinite(used) ||
        typeof total !== "number" ||
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

function readPersistedFolderCache(accountId: number, folderToken: string): CloudItem[] | null {
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

function writePersistedFolderCache(accountId: number, folderToken: string, items: CloudItem[]): void {
    try {
        window.localStorage.setItem(
            buildFolderCacheStorageKey(accountId, folderToken),
            JSON.stringify({updatedAt: Date.now(), items: items.slice(0, 500)})
        );
    } catch {
        // Ignore cache persistence failures.
    }
}

function areCloudItemsEqual(a: CloudItem[], b: CloudItem[]): boolean {
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

function constrainToViewport(x: number, y: number, width: number, height: number): { left: number; top: number } {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(x, margin), maxLeft);
    const top = Math.min(Math.max(y, margin), maxTop);
    return {left, top};
}

function Field(props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    as?: "input" | "select";
    options?: Array<{ value: string; label: string }>;
}) {
    const {label, value, onChange, placeholder, type = "text", as = "input", options = []} = props;
    return (
        <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>
            {as === "select" ? (
                <select
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                />
            )}
        </label>
    );
}
