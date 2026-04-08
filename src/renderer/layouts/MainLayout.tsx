import React from "react";
import {Link} from "react-router-dom";
import {
    Archive,
    Bug,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    FileText,
    Folder,
    FolderPlus,
    Inbox,
    Mail,
    MailOpen,
    PenSquare,
    RefreshCw,
    Search,
    Send,
    Settings,
    ShieldAlert,
    SquareArrowOutUpRight,
    Star,
    Trash2,
    Users,
    X,
} from "lucide-react";
import type {FolderItem, MessageItem, PublicAccount} from "../../preload/index";
import {Button} from "../components/ui/button";
import {ScrollArea} from "../components/ui/scroll-area";
import NewEmailBadge from "../components/mail/NewEmailBadge";
import {isProtectedFolder} from "../features/mail/folders";
import {getAccountAvatarColors, getAccountMonogram} from "../lib/accountAvatar";
import {formatSystemDateTime} from "../lib/dateTime";
import {useResizableSidebar} from "../hooks/useResizableSidebar";
import {cn} from "../lib/utils";
import WorkspaceLayout from "./WorkspaceLayout";

interface MainLayoutProps {
    children: React.ReactNode;
    accounts: PublicAccount[];
    selectedAccountId: number | null;
    accountFoldersById: Record<number, FolderItem[]>;
    onSelectAccount: (id: number) => void;
    folders: FolderItem[];
    selectedFolderPath: string | null;
    onSelectFolder: (path: string, accountId?: number) => void;
    messages: MessageItem[];
    selectedMessageId: number | null;
    selectedMessageIds: number[];
    onSelectMessage: (
        id: number,
        index: number,
        modifiers?: {
            shiftKey?: boolean;
            ctrlKey?: boolean;
            metaKey?: boolean;
        }
    ) => void;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    searchResults: MessageItem[];
    searchLoading: boolean;
    onLoadMoreMessages: () => void;
    hasMoreMessages: boolean;
    loadingMoreMessages: boolean;
    onRefresh: () => void;
    canNavigateBack?: boolean;
    canNavigateForward?: boolean;
    onNavigateBack?: () => void;
    onNavigateForward?: () => void;
    onOpenCalendar: () => void;
    onOpenContacts: () => void;
    mailView: MailPaneLayoutMode;
    onMailViewChange: (view: MailPaneLayoutMode) => void;
    activeWorkspace?: "mail" | "calendar" | "contacts";
    hideFolderSidebar?: boolean;
    hideHeader?: boolean;
    syncStatusText?: string | null;
    syncInProgress?: boolean;
    statusHintText?: string | null;
    syncingAccountIds?: ReadonlySet<number>;
    onMessageMarkReadToggle: (message: MessageItem) => void;
    onBulkMarkRead: (messageIds: number[], nextRead: number) => void;
    onBulkDelete: (messageIds: number[]) => void;
    onClearMessageSelection: () => void;
    onMessageFlagToggle: (message: MessageItem) => void;
    onMessageTagChange: (message: MessageItem, tag: string | null) => void;
    onMessageArchive: (message: MessageItem) => void;
    onMessageDelete: (message: MessageItem) => void;
    onMessageMove: (message: MessageItem, targetFolderPath: string) => void;
    onBulkMove: (messageIds: number[], targetFolderPath: string) => void;
    onFolderSync: () => void;
    onCreateFolder: (payload: {
        accountId: number;
        folderPath: string;
        type?: string | null;
        color?: string | null;
    }) => Promise<void>;
    onReorderCustomFolders: (accountId: number, orderedFolderPaths: string[]) => Promise<void>;
    onDeleteFolder: (folder: FolderItem) => void;
    onUpdateFolderSettings: (
        folder: FolderItem,
        payload: { customName?: string | null; color?: string | null; type?: string | null }
    ) => Promise<void>;
    dateLocale?: string;
}

const FOLDER_COLOR_OPTIONS = [
    {value: "", label: "Default"},
    {value: "sky", label: "Sky"},
    {value: "emerald", label: "Emerald"},
    {value: "amber", label: "Amber"},
    {value: "rose", label: "Rose"},
    {value: "violet", label: "Violet"},
    {value: "slate", label: "Slate"},
] as const;

const FOLDER_TYPE_OPTIONS = [
    {value: "", label: "Auto detect"},
    {value: "inbox", label: "Inbox"},
    {value: "sent", label: "Sent"},
    {value: "drafts", label: "Drafts"},
    {value: "archive", label: "Archive"},
    {value: "junk", label: "Junk"},
    {value: "trash", label: "Trash"},
] as const;

const ACCOUNT_COLLAPSE_STORAGE_KEY = "lunamail.accountCollapseState.v1";
const MAIL_TABLE_COLUMNS_STORAGE_KEY = "lunamail.mailTableColumns.v1";
const MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY = "lunamail.mailTableColumnWidths.v1";
const MAIL_TABLE_RESIZE_HANDLE_CLASS = "absolute inset-y-0 right-[-8px] z-10 w-4 cursor-col-resize hover:bg-sky-400/20";
const SIDE_LIST_SPLIT_BREAKPOINT_PX = 1320;
const SIDE_LIST_SIDEBAR_WINDOW_FRACTION = 0.5;
const SIDE_LIST_MIN_SIDEBAR_WIDTH_PX = 180;
const TOP_TABLE_COMPACT_BREAKPOINT_PX = 860;

type MailPaneLayoutMode = "side-list" | "top-table";
type MailTableColumnKey =
    | "subject"
    | "from"
    | "recipient"
    | "date"
    | "read_status"
    | "flagged"
    | "tag"
    | "account"
    | "location"
    | "size";
const DEFAULT_TABLE_COLUMNS: MailTableColumnKey[] = ["subject", "from", "date"];
const DEFAULT_TABLE_COLUMN_WIDTHS: Record<MailTableColumnKey, number> = {
    subject: 360,
    from: 220,
    recipient: 220,
    date: 170,
    read_status: 96,
    flagged: 72,
    tag: 120,
    account: 180,
    location: 180,
    size: 92,
};
const MIN_TABLE_COLUMN_WIDTHS: Record<MailTableColumnKey, number> = {
    subject: 16,
    from: 16,
    recipient: 16,
    date: 16,
    read_status: 16,
    flagged: 16,
    tag: 16,
    account: 16,
    location: 16,
    size: 16,
};
const TABLE_COLUMN_OPTIONS: Array<{ key: MailTableColumnKey; label: string }> = [
    {key: "subject", label: "Subject"},
    {key: "from", label: "From"},
    {key: "recipient", label: "Recipient"},
    {key: "date", label: "Date"},
    {key: "read_status", label: "Read status"},
    {key: "flagged", label: "Starred"},
    {key: "tag", label: "Tag"},
    {key: "account", label: "Account"},
    {key: "location", label: "Location"},
    {key: "size", label: "Size"},
];

const MESSAGE_TAG_OPTIONS: Array<{ value: string; label: string; dotClass: string }> = [
    {value: "important", label: "Important", dotClass: "bg-red-500"},
    {value: "work", label: "Work", dotClass: "bg-blue-500"},
    {value: "personal", label: "Personal", dotClass: "bg-emerald-500"},
    {value: "todo", label: "To Do", dotClass: "bg-amber-500"},
    {value: "later", label: "Later", dotClass: "bg-violet-500"},
];

const MainLayout: React.FC<MainLayoutProps> = ({
                                                   children,
                                                   accounts,
                                                   selectedAccountId,
                                                   accountFoldersById,
                                                   onSelectAccount,
                                                   folders,
                                                   selectedFolderPath,
                                                   onSelectFolder,
                                                   messages,
                                                   selectedMessageId,
                                                   selectedMessageIds,
                                                   onSelectMessage,
                                                   searchQuery,
                                                   onSearchQueryChange,
                                                   searchResults,
                                                   searchLoading,
                                                   onLoadMoreMessages,
                                                   hasMoreMessages,
                                                   loadingMoreMessages,
                                                   onRefresh,
                                                   canNavigateBack = false,
                                                   canNavigateForward = false,
                                                   onNavigateBack,
                                                   onNavigateForward,
                                                   onOpenCalendar,
                                                   onOpenContacts,
                                                   mailView,
                                                   onMailViewChange,
                                                   activeWorkspace = "mail",
                                                   hideFolderSidebar = false,
                                                   hideHeader = false,
                                                   syncStatusText,
                                                   syncInProgress,
                                                   statusHintText,
                                                   syncingAccountIds,
                                                   onMessageMarkReadToggle,
                                                   onBulkMarkRead,
                                                   onBulkDelete,
                                                   onClearMessageSelection,
                                                   onMessageFlagToggle,
                                                   onMessageTagChange,
                                                   onMessageArchive,
                                                   onMessageDelete,
                                                   onMessageMove,
                                                   onBulkMove,
                                                   onFolderSync,
                                                   onCreateFolder,
                                                   onReorderCustomFolders,
                                                   onDeleteFolder,
                                                   onUpdateFolderSettings,
                                                   dateLocale,
                                               }) => {
    const [menu, setMenu] = React.useState<
        | { kind: "message"; x: number; y: number; message: MessageItem }
        | { kind: "folder"; x: number; y: number; folder: FolderItem }
        | null
    >(null);
    const [accountMenu, setAccountMenu] = React.useState<{ x: number; y: number; account: PublicAccount } | null>(null);
    const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
    const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
    const tableHeadMenuRef = React.useRef<HTMLDivElement | null>(null);
    const moveToTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const mailSearchModalInputRef = React.useRef<HTMLInputElement | null>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number }>({left: 0, top: 0});
    const [menuReady, setMenuReady] = React.useState(false);
    const [accountMenuPosition, setAccountMenuPosition] = React.useState<{ left: number; top: number }>({
        left: 0,
        top: 0,
    });
    const [accountMenuReady, setAccountMenuReady] = React.useState(false);
    const [tableHeadMenu, setTableHeadMenu] = React.useState<{ x: number; y: number } | null>(null);
    const [tableHeadMenuPosition, setTableHeadMenuPosition] = React.useState<{ left: number; top: number }>({
        left: 0,
        top: 0,
    });
    const [tableHeadMenuReady, setTableHeadMenuReady] = React.useState(false);
    const [moveSubmenuLeft, setMoveSubmenuLeft] = React.useState(false);
    const [moveSubmenuOffsetY, setMoveSubmenuOffsetY] = React.useState(0);
    const [collapsedAccountIds, setCollapsedAccountIds] = React.useState<Set<number>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const raw = window.localStorage.getItem(ACCOUNT_COLLAPSE_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw) as number[];
            if (!Array.isArray(parsed)) return new Set();
            return new Set(parsed.filter((v) => Number.isFinite(v)));
        } catch {
            return new Set();
        }
    });
    const [draggingMessage, setDraggingMessage] = React.useState<{ id: number; accountId: number } | null>(null);
    const [dragTargetFolder, setDragTargetFolder] = React.useState<{ accountId: number; path: string } | null>(null);
    const [draggingCustomFolder, setDraggingCustomFolder] = React.useState<{
        accountId: number;
        path: string;
    } | null>(null);
    const [customFolderDropTarget, setCustomFolderDropTarget] = React.useState<{
        accountId: number;
        path: string;
    } | null>(null);
    const [searchModalOpen, setSearchModalOpen] = React.useState(false);
    const [advancedSearchOpen, setAdvancedSearchOpen] = React.useState(false);
    const [fromFilter, setFromFilter] = React.useState("");
    const [subjectFilter, setSubjectFilter] = React.useState("");
    const [toFilter, setToFilter] = React.useState("");
    const [accountFilter, setAccountFilter] = React.useState<string>("all");
    const [folderFilter, setFolderFilter] = React.useState<string>("all");
    const [readFilter, setReadFilter] = React.useState<"all" | "read" | "unread">("all");
    const [starFilter, setStarFilter] = React.useState<"all" | "starred" | "unstarred">("all");
    const [dateRangeFilter, setDateRangeFilter] = React.useState<"all" | "7d" | "30d" | "365d">("all");
    const [minSizeKbFilter, setMinSizeKbFilter] = React.useState<string>("");
    const [maxSizeKbFilter, setMaxSizeKbFilter] = React.useState<string>("");
    const [localSyncingAccountIds, setLocalSyncingAccountIds] = React.useState<Set<number>>(new Set());
    const [folderEditor, setFolderEditor] = React.useState<{
        folder: FolderItem;
        customName: string;
        type: string;
        color: string;
    } | null>(null);
    const [folderEditorSaving, setFolderEditorSaving] = React.useState(false);
    const [folderEditorError, setFolderEditorError] = React.useState<string | null>(null);
    const [createFolderModal, setCreateFolderModal] = React.useState<{
        accountId: number;
        folderPath: string;
        type: string;
        color: string;
    } | null>(null);
    const [createFolderSaving, setCreateFolderSaving] = React.useState(false);
    const [createFolderError, setCreateFolderError] = React.useState<string | null>(null);
    const [tableColumns, setTableColumns] = React.useState<MailTableColumnKey[]>(() => {
        if (typeof window === "undefined") return DEFAULT_TABLE_COLUMNS;
        try {
            const raw = window.localStorage.getItem(MAIL_TABLE_COLUMNS_STORAGE_KEY);
            if (!raw) return DEFAULT_TABLE_COLUMNS;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return DEFAULT_TABLE_COLUMNS;
            const next = parsed.filter(
                (column) =>
                    column === "subject" ||
                    column === "from" ||
                    column === "recipient" ||
                    column === "date" ||
                    column === "read_status" ||
                    column === "flagged" ||
                    column === "tag" ||
                    column === "account" ||
                    column === "location" ||
                    column === "size"
            ) as MailTableColumnKey[];
            return next.length > 0 ? next : DEFAULT_TABLE_COLUMNS;
        } catch {
            return DEFAULT_TABLE_COLUMNS;
        }
    });
    const [topListHeight, setTopListHeight] = React.useState<number>(() => {
        if (typeof window === "undefined") return 300;
        const stored = Number(window.localStorage.getItem("lunamail.mailTopList.height") || "");
        if (!Number.isFinite(stored)) return 300;
        return Math.max(220, Math.min(640, stored));
    });
    const [tableColumnWidths, setTableColumnWidths] = React.useState<Record<MailTableColumnKey, number>>(() => {
        if (typeof window === "undefined") return DEFAULT_TABLE_COLUMN_WIDTHS;
        try {
            const raw = window.localStorage.getItem(MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY);
            if (!raw) return DEFAULT_TABLE_COLUMN_WIDTHS;
            const parsed = JSON.parse(raw) as Partial<Record<MailTableColumnKey, number>>;
            return {
                subject: normalizeColumnWidth(parsed.subject, "subject"),
                from: normalizeColumnWidth(parsed.from, "from"),
                recipient: normalizeColumnWidth(parsed.recipient, "recipient"),
                date: normalizeColumnWidth(parsed.date, "date"),
                read_status: normalizeColumnWidth(parsed.read_status, "read_status"),
                flagged: normalizeColumnWidth(parsed.flagged, "flagged"),
                tag: normalizeColumnWidth(parsed.tag, "tag"),
                account: normalizeColumnWidth(parsed.account, "account"),
                location: normalizeColumnWidth(parsed.location, "location"),
                size: normalizeColumnWidth(parsed.size, "size"),
            };
        } catch {
            return DEFAULT_TABLE_COLUMN_WIDTHS;
        }
    });
    const [draggingColumn, setDraggingColumn] = React.useState<MailTableColumnKey | null>(null);
    const [dragPlaceholder, setDragPlaceholder] = React.useState<{
        column: MailTableColumnKey;
        side: "before" | "after";
    } | null>(null);
    const topListResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
    const tableColumnResizeRef = React.useRef<{
        column: MailTableColumnKey;
        startX: number;
        startWidth: number;
    } | null>(null);
    const {sidebarWidth, onResizeStart} = useResizableSidebar();
    const {sidebarWidth: mailListWidth, onResizeStart: onMailListResizeStart} = useResizableSidebar({
        storageKey: "lunamail.mailList.width",
        defaultWidth: 420,
        minWidth: 300,
        maxWidth: 760,
    });
    const [viewportWidth, setViewportWidth] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1920;
        return window.innerWidth;
    });
    const [viewportHeight, setViewportHeight] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1080;
        return window.innerHeight;
    });
    const selectedFolder = React.useMemo(
        () => folders.find((folder) => folder.path === selectedFolderPath) ?? null,
        [folders, selectedFolderPath]
    );
    const protectedFolders = React.useMemo(() => folders.filter((folder) => isProtectedFolder(folder)), [folders]);
    const customFolders = React.useMemo(() => folders.filter((folder) => !isProtectedFolder(folder)), [folders]);
    const moveTargets = React.useMemo(
        () => folders.filter((f) => f.path !== selectedFolderPath).slice(0, 12),
        [folders, selectedFolderPath]
    );
    const visibleTableColumns = React.useMemo(
        () => tableColumns.filter((column) => TABLE_COLUMN_OPTIONS.some((item) => item.key === column)),
        [tableColumns]
    );
    const lastVisibleTableColumn = visibleTableColumns[visibleTableColumns.length - 1] ?? null;
    const effectiveTableColumnWidths = React.useMemo(() => {
        return Object.fromEntries(
            visibleTableColumns.map((column) => [column, tableColumnWidths[column] ?? DEFAULT_TABLE_COLUMN_WIDTHS[column]])
        ) as Record<MailTableColumnKey, number>;
    }, [tableColumnWidths, visibleTableColumns]);
    const tableMinWidth = React.useMemo(() => {
        const columnsWidth = visibleTableColumns.reduce(
            (sum, column) => sum + (effectiveTableColumnWidths[column] ?? DEFAULT_TABLE_COLUMN_WIDTHS[column]),
            0
        );
        return columnsWidth + 44;
    }, [effectiveTableColumnWidths, visibleTableColumns]);
    const moveTargetsProtected = React.useMemo(
        () => moveTargets.filter((folder) => isProtectedFolder(folder)),
        [moveTargets]
    );
    const moveTargetsCustom = React.useMemo(
        () => moveTargets.filter((folder) => !isProtectedFolder(folder)),
        [moveTargets]
    );
    const isGlobalSearchActive = searchQuery.trim().length > 0;
    const filteredSearchMessages = React.useMemo(() => {
        const normalizedFrom = fromFilter.trim().toLowerCase();
        const normalizedSubject = subjectFilter.trim().toLowerCase();
        const normalizedTo = toFilter.trim().toLowerCase();
        const minSizeKb = Number(minSizeKbFilter);
        const maxSizeKb = Number(maxSizeKbFilter);
        const nowMs = Date.now();
        if (
            !normalizedFrom &&
            !normalizedSubject &&
            !normalizedTo &&
            accountFilter === "all" &&
            folderFilter === "all" &&
            readFilter === "all" &&
            starFilter === "all" &&
            dateRangeFilter === "all" &&
            !Number.isFinite(minSizeKb) &&
            !Number.isFinite(maxSizeKb)
        ) {
            return searchResults;
        }
        return searchResults.filter((message) => {
            if (normalizedFrom) {
                const fromName = (message.from_name || "").toLowerCase();
                const fromAddress = (message.from_address || "").toLowerCase();
                if (!fromName.includes(normalizedFrom) && !fromAddress.includes(normalizedFrom)) return false;
            }
            if (normalizedSubject) {
                const subject = (message.subject || "").toLowerCase();
                if (!subject.includes(normalizedSubject)) return false;
            }
            if (normalizedTo) {
                const toAddress = (message.to_address || "").toLowerCase();
                if (!toAddress.includes(normalizedTo)) return false;
            }
            if (accountFilter !== "all" && String(message.account_id) !== accountFilter) return false;
            if (folderFilter !== "all" && String(message.folder_id) !== folderFilter) return false;
            if (readFilter === "read" && !Boolean(message.is_read)) return false;
            if (readFilter === "unread" && Boolean(message.is_read)) return false;
            if (starFilter === "starred" && !Boolean(message.is_flagged)) return false;
            if (starFilter === "unstarred" && Boolean(message.is_flagged)) return false;
            if (dateRangeFilter !== "all") {
                const messageTime = message.date ? Date.parse(message.date) : 0;
                if (!messageTime) return false;
                const dayMs = 24 * 60 * 60 * 1000;
                const maxAgeMs = dateRangeFilter === "7d" ? 7 * dayMs : dateRangeFilter === "30d" ? 30 * dayMs : 365 * dayMs;
                if (nowMs - messageTime > maxAgeMs) return false;
            }
            const sizeKb = (Number(message.size) || 0) / 1024;
            if (Number.isFinite(minSizeKb) && sizeKb < minSizeKb) return false;
            if (Number.isFinite(maxSizeKb) && sizeKb > maxSizeKb) return false;
            return true;
        });
    }, [
        searchResults,
        fromFilter,
        subjectFilter,
        toFilter,
        accountFilter,
        folderFilter,
        readFilter,
        starFilter,
        dateRangeFilter,
        minSizeKbFilter,
        maxSizeKbFilter,
    ]);

    const searchFoldersForSelectedAccount = React.useMemo(() => {
        if (accountFilter === "all") return [];
        const accountId = Number(accountFilter);
        if (!Number.isFinite(accountId)) return [];
        return accountFoldersById[accountId] ?? [];
    }, [accountFilter, accountFoldersById]);

    const isCompactSideList = mailView === "side-list" && viewportWidth < SIDE_LIST_SPLIT_BREAKPOINT_PX;
    const isCompactTopTable = mailView === "top-table" && viewportHeight < TOP_TABLE_COMPACT_BREAKPOINT_PX;
    const effectiveSidebarWidth = React.useMemo(() => {
        if (!isCompactSideList) return sidebarWidth;
        const maxCompactSidebarWidth = Math.max(
            SIDE_LIST_MIN_SIDEBAR_WIDTH_PX,
            Math.round(viewportWidth * SIDE_LIST_SIDEBAR_WINDOW_FRACTION)
        );
        // Respect persisted resize width, but cap sidebar to 50% in compact mode.
        return Math.max(SIDE_LIST_MIN_SIDEBAR_WIDTH_PX, Math.min(sidebarWidth, maxCompactSidebarWidth));
    }, [isCompactSideList, sidebarWidth, viewportWidth]);

    React.useEffect(() => {
        const onResize = () => {
            setViewportWidth(window.innerWidth);
            setViewportHeight(window.innerHeight);
        };
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
        };
    }, []);

    const parseDraggedMessageIds = React.useCallback((event: React.DragEvent<HTMLElement>): number[] => {
        const idsRaw = event.dataTransfer.getData("application/x-lunamail-message-ids");
        if (idsRaw) {
            try {
                const parsed = JSON.parse(idsRaw);
                if (Array.isArray(parsed)) {
                    const normalized = parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
                    if (normalized.length > 0) return Array.from(new Set(normalized));
                }
            } catch {
                // fall back to single-id payload
            }
        }

        const idRaw =
            event.dataTransfer.getData("application/x-lunamail-message-id") || event.dataTransfer.getData("text/plain");
        const parsed = Number(idRaw);
        return Number.isFinite(parsed) ? [parsed] : [];
    }, []);

    const handleMessageDropOnFolder = React.useCallback(
        (event: React.DragEvent<HTMLElement>, folder: FolderItem) => {
            if (!draggingMessage) return;
            if (draggingMessage.accountId !== folder.account_id) return;
            if (folder.path === selectedFolderPath) return;

            event.preventDefault();
            const draggedIds = parseDraggedMessageIds(event);
            if (draggedIds.length === 0) {
                setDragTargetFolder(null);
                setDraggingMessage(null);
                return;
            }

            const draggedSet = new Set(draggedIds);
            const draggedMessages = messages.filter(
                (message) => draggedSet.has(message.id) && message.account_id === folder.account_id
            );
            if (draggedMessages.length === 1) {
                onMessageMove(draggedMessages[0], folder.path);
            } else if (draggedMessages.length > 1) {
                onBulkMove(
                    draggedMessages.map((message) => message.id),
                    folder.path
                );
            }

            setDragTargetFolder(null);
            setDraggingMessage(null);
        },
        [draggingMessage, messages, onBulkMove, onMessageMove, parseDraggedMessageIds, selectedFolderPath]
    );

    React.useEffect(() => {
        setCollapsedAccountIds((prev) => {
            // Keep persisted collapse state while accounts are still loading.
            // Otherwise an initial empty accounts list would wipe stored state.
            if (accounts.length === 0) return prev;
            const validIds = new Set(accounts.map((account) => account.id));
            const next = new Set<number>();
            let changed = false;
            for (const id of prev) {
                if (validIds.has(id)) next.add(id);
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [accounts]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(ACCOUNT_COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(collapsedAccountIds)));
        } catch {
            // ignore storage failures
        }
    }, [collapsedAccountIds]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(MAIL_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(tableColumns));
        } catch {
            // ignore storage failures
        }
    }, [tableColumns]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(tableColumnWidths));
        } catch {
            // ignore storage failures
        }
    }, [tableColumnWidths]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem("lunamail.mailTopList.height", String(topListHeight));
        } catch {
            // ignore storage failures
        }
    }, [topListHeight]);

    React.useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            const drag = topListResizeRef.current;
            if (drag) {
                const next = drag.startHeight + (event.clientY - drag.startY);
                setTopListHeight(Math.max(220, Math.min(640, next)));
            }
            const resize = tableColumnResizeRef.current;
            if (resize) {
                const nextWidth = normalizeColumnWidth(resize.startWidth + (event.clientX - resize.startX), resize.column);
                setTableColumnWidths((prev) => {
                    if (prev[resize.column] === nextWidth) return prev;
                    return {
                        ...prev,
                        [resize.column]: nextWidth,
                    };
                });
            }
        };
        const onMouseUp = () => {
            topListResizeRef.current = null;
            tableColumnResizeRef.current = null;
            document.body.classList.remove("is-resizing-mail-top-list");
            document.body.classList.remove("is-resizing-mail-columns");
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            document.body.classList.remove("is-resizing-mail-top-list");
            document.body.classList.remove("is-resizing-mail-columns");
        };
    }, []);

    React.useEffect(() => {
        const close = () => {
            setMenu(null);
            setAccountMenu(null);
            setTableHeadMenu(null);
        };
        window.addEventListener("click", close);
        window.addEventListener("keydown", close);
        window.addEventListener("lunamail-close-overlays", close as EventListener);
        return () => {
            window.removeEventListener("click", close);
            window.removeEventListener("keydown", close);
            window.removeEventListener("lunamail-close-overlays", close as EventListener);
        };
    }, []);

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod || event.shiftKey || event.altKey) return;
            if (event.key.toLowerCase() !== "f") return;
            event.preventDefault();
            setSearchModalOpen(true);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    React.useEffect(() => {
        if (!searchModalOpen) return;
        const raf = window.requestAnimationFrame(() => {
            mailSearchModalInputRef.current?.focus();
            mailSearchModalInputRef.current?.select();
        });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setSearchModalOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [searchModalOpen]);

    React.useEffect(() => {
        if (!menu) {
            setMenuReady(false);
            setMoveSubmenuLeft(false);
            setMoveSubmenuOffsetY(0);
            return;
        }
        const updatePosition = () => {
            const el = contextMenuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const next = constrainToViewport(menu.x, menu.y, rect.width, rect.height);
            setMenuPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
            setMenuReady(true);
            if (menu.kind === "message") {
                const rightSpace = window.innerWidth - (next.left + rect.width) - 8;
                setMoveSubmenuLeft(rightSpace < 236);
            } else {
                setMoveSubmenuLeft(false);
            }
        };
        const raf = window.requestAnimationFrame(updatePosition);
        window.addEventListener("resize", updatePosition);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", updatePosition);
        };
    }, [menu]);

    React.useEffect(() => {
        if (!menu || menu.kind !== "message") {
            setMoveSubmenuOffsetY(0);
            return;
        }
        const updateSubmenuY = () => {
            const trigger = moveToTriggerRef.current;
            if (!trigger) return;
            const triggerTop = trigger.getBoundingClientRect().top;
            const estimatedSubmenuHeight = Math.min(moveTargets.length * 34 + 8, window.innerHeight - 16);
            const availableBelow = window.innerHeight - triggerTop - 8;
            let offsetY = 0;
            if (availableBelow < estimatedSubmenuHeight) {
                offsetY = availableBelow - estimatedSubmenuHeight;
            }
            const maxUpShift = 8 - triggerTop;
            if (offsetY < maxUpShift) offsetY = maxUpShift;
            setMoveSubmenuOffsetY(offsetY);
        };
        const raf = window.requestAnimationFrame(updateSubmenuY);
        window.addEventListener("resize", updateSubmenuY);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", updateSubmenuY);
        };
    }, [menu, menuPosition, moveTargets.length]);

    React.useEffect(() => {
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

    React.useEffect(() => {
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

    async function saveFolderSettings() {
        if (!folderEditor || folderEditorSaving) return;
        setFolderEditorSaving(true);
        setFolderEditorError(null);
        try {
            await onUpdateFolderSettings(folderEditor.folder, {
                customName: folderEditor.customName.trim() || null,
                color: folderEditor.color || null,
                type: folderEditor.type || null,
            });
            setFolderEditor(null);
        } catch (e: any) {
            setFolderEditorError(e?.message || String(e));
        } finally {
            setFolderEditorSaving(false);
        }
    }

    async function createFolderFromModal() {
        if (!createFolderModal || createFolderSaving) return;
        const normalizedPath = createFolderModal.folderPath.trim();
        if (!normalizedPath) {
            setCreateFolderError("Folder path is required");
            return;
        }
        setCreateFolderSaving(true);
        setCreateFolderError(null);
        try {
            await onCreateFolder({
                accountId: createFolderModal.accountId,
                folderPath: normalizedPath,
                type: createFolderModal.type || null,
                color: createFolderModal.color || null,
            });
            setCreateFolderModal(null);
        } catch (e: any) {
            setCreateFolderError(e?.message || String(e));
        } finally {
            setCreateFolderSaving(false);
        }
    }

    function syncAccountNow(accountId: number): void {
        setLocalSyncingAccountIds((prev) => {
            if (prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.add(accountId);
            return next;
        });
        void window.electronAPI
            .syncAccount(accountId)
            .catch((error) => {
                console.error("Failed to sync account", accountId, error);
            })
            .finally(() => {
                setLocalSyncingAccountIds((prev) => {
                    if (!prev.has(accountId)) return prev;
                    const next = new Set(prev);
                    next.delete(accountId);
                    return next;
                });
            });
    }

    function toggleAccountExpanded(accountId: number): void {
        setCollapsedAccountIds((prev) => {
            const next = new Set(prev);
            if (next.has(accountId)) next.delete(accountId);
            else next.add(accountId);
            return next;
        });
    }

    function ensureAccountExpanded(accountId: number): void {
        setCollapsedAccountIds((prev) => {
            if (!prev.has(accountId)) return prev;
            const next = new Set(prev);
            next.delete(accountId);
            return next;
        });
    }

    function toggleTableColumn(column: MailTableColumnKey): void {
        setTableColumns((prev) => {
            if (prev.includes(column)) {
                if (prev.length === 1) return prev;
                return prev.filter((item) => item !== column);
            }
            return [...prev, column];
        });
    }

    function resetTableColumns(): void {
        setTableColumns(DEFAULT_TABLE_COLUMNS);
    }

    function openTableHeadMenuAt(x: number, y: number): void {
        setTableHeadMenu({x, y});
    }

    function beginTableColumnResize(event: React.MouseEvent, column: MailTableColumnKey): void {
        event.preventDefault();
        event.stopPropagation();
        const startWidth = normalizeColumnWidth(
            effectiveTableColumnWidths[column] ?? tableColumnWidths[column] ?? DEFAULT_TABLE_COLUMN_WIDTHS[column],
            column
        );
        setTableColumnWidths((prev) => ({
            ...prev,
            [column]: startWidth,
        }));
        tableColumnResizeRef.current = {
            column,
            startX: event.clientX,
            startWidth,
        };
        document.body.classList.add("is-resizing-mail-columns");
    }

    function moveTableColumnBefore(dragged: MailTableColumnKey, target: MailTableColumnKey): void {
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

    function moveTableColumnAfter(dragged: MailTableColumnKey, target: MailTableColumnKey): void {
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

    function onTableHeaderDragStart(event: React.DragEvent, column: MailTableColumnKey): void {
        if (tableColumnResizeRef.current) {
            event.preventDefault();
            return;
        }
        setDraggingColumn(column);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column);
    }

    function onTableHeaderDrop(event: React.DragEvent, target: MailTableColumnKey): void {
        event.preventDefault();
        const dragged = draggingColumn || (event.dataTransfer.getData("text/plain") as MailTableColumnKey);
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

    function navigateToMessage(message: MessageItem): void {
        window.location.hash = `#/email/${message.account_id}/${message.folder_id}/${message.id}`;
    }

    function onMessageRowClick(event: React.MouseEvent, message: MessageItem, messageIndex: number): void {
        const multiGesture = event.ctrlKey || event.metaKey || event.shiftKey;
        if (multiGesture) {
            event.preventDefault();
        }
        onSelectMessage(message.id, messageIndex, {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
        });
        if (!multiGesture) {
            navigateToMessage(message);
        }
    }

    function onMessageRowDragStart(event: React.DragEvent, message: MessageItem): void {
        const dragIds =
            selectedMessageIds.length > 1 && selectedMessageIds.includes(message.id) ? selectedMessageIds : [message.id];
        setDraggingMessage({id: message.id, accountId: message.account_id});
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-lunamail-message-id", String(message.id));
        event.dataTransfer.setData("application/x-lunamail-message-ids", JSON.stringify(dragIds));
        event.dataTransfer.setData("text/plain", String(message.id));

        const ghost = document.createElement("div");
        ghost.textContent =
            dragIds.length > 1 ? `Move ${dragIds.length} emails` : `Move: ${message.subject || "(No subject)"}`;
        ghost.style.position = "fixed";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.padding = "6px 10px";
        ghost.style.maxWidth = "280px";
        ghost.style.borderRadius = "8px";
        ghost.style.background = "rgba(3, 105, 161, 0.92)";
        ghost.style.color = "#fff";
        ghost.style.fontSize = "12px";
        ghost.style.fontWeight = "600";
        ghost.style.whiteSpace = "nowrap";
        ghost.style.overflow = "hidden";
        ghost.style.textOverflow = "ellipsis";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "9999";
        document.body.appendChild(ghost);
        event.dataTransfer.setDragImage(ghost, 12, 12);
        setTimeout(() => {
            ghost.remove();
        }, 0);
    }

    function onTopListResizeStart(event: React.MouseEvent<HTMLDivElement>): void {
        topListResizeRef.current = {
            startY: event.clientY,
            startHeight: topListHeight,
        };
        document.body.classList.add("is-resizing-mail-top-list");
    }

    function renderTableCell(message: MessageItem, column: MailTableColumnKey): React.ReactNode {
        const withBorder = lastVisibleTableColumn !== column;
        const baseCell = cn("relative px-3 py-2 dark:border-r-[#3a3d44]", withBorder && "border-r border-r-slate-200");

        switch (column) {
            case "subject":
                return (
                    <td
                        key={`${message.id}-subject`}
                        className={cn(
                            baseCell,
                            message.is_read
                                ? "font-medium text-slate-700 dark:text-slate-300"
                                : "font-semibold text-slate-950 dark:text-white"
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            {!message.is_read && (
                                <span
                                    className="inline-flex h-2 w-2 shrink-0 rounded-full bg-sky-500 dark:bg-[#8ab4ff]"
                                    title="Unread"
                                    aria-label="Unread"
                                />
                            )}
                            <span className="truncate">{message.subject || "(No subject)"}</span>
                            {getThreadCount(message) > 1 && (
                                <span
                                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold leading-none text-slate-700 dark:bg-[#454a55] dark:text-slate-100">
                  {getThreadCount(message)}
                </span>
                            )}
                        </div>
                    </td>
                );
            case "from":
                return (
                    <td key={`${message.id}-from`}
                        className={cn(baseCell, "truncate text-slate-600 dark:text-slate-300")}>
                        {formatMessageSender(message)}
                    </td>
                );
            case "recipient":
                return (
                    <td key={`${message.id}-recipient`}
                        className={cn(baseCell, "truncate text-slate-600 dark:text-slate-300")}>
                        {formatMessageRecipient(message)}
                    </td>
                );
            case "date":
                return (
                    <td key={`${message.id}-date`}
                        className={cn(baseCell, "truncate text-slate-600 dark:text-slate-300")}>
                        {formatSystemDateTime(message.date, dateLocale)}
                    </td>
                );
            case "read_status":
                return (
                    <td key={`${message.id}-read-status`}
                        className={cn(baseCell, "text-slate-600 dark:text-slate-300")}>
                        {message.is_read ? "Read" : "Unread"}
                    </td>
                );
            case "flagged":
                return (
                    <td key={`${message.id}-flagged`} className={cn(baseCell, "text-slate-600 dark:text-slate-300")}>
                        {Boolean(message.is_flagged) ? (
                            <Star size={12} className="fill-current text-amber-500 dark:text-amber-300"/>
                        ) : (
                            ""
                        )}
                    </td>
                );
            case "tag":
                return (
                    <td key={`${message.id}-tag`} className={cn(baseCell, "text-slate-600 dark:text-slate-300")}>
                        {renderTagCell((message as MessageItem & { tag?: string | null }).tag ?? null)}
                    </td>
                );
            case "account":
                return (
                    <td key={`${message.id}-account`}
                        className={cn(baseCell, "truncate text-slate-600 dark:text-slate-300")}>
                        {formatMessageAccount(message, accounts)}
                    </td>
                );
            case "location":
                return (
                    <td key={`${message.id}-location`}
                        className={cn(baseCell, "truncate text-slate-600 dark:text-slate-300")}>
                        {formatMessageLocation(message, folders)}
                    </td>
                );
            case "size":
                return (
                    <td key={`${message.id}-size`} className={cn(baseCell, "text-slate-600 dark:text-slate-300")}>
                        {formatMessageSize(message.size)}
                    </td>
                );
            default:
                return null;
        }
    }

    return (
        <>
            <WorkspaceLayout
                className="bg-slate-100 dark:bg-[#2f3136]"
                showMenuBar={!hideHeader}
                menubar={
                    <div className="flex h-full items-center justify-between gap-3 px-4">
                        <div className="min-w-0 flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                                    onClick={() => onNavigateBack?.()}
                                    title="Back"
                                    aria-label="Back"
                                    disabled={!canNavigateBack}
                                >
                                    <ChevronLeft size={16}/>
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                                    onClick={() => onNavigateForward?.()}
                                    title="Forward"
                                    aria-label="Forward"
                                    disabled={!canNavigateForward}
                                >
                                    <ChevronRight size={16}/>
                                </Button>
                                <Mail size={18} className="opacity-90"/>
                                <p className="truncate text-base font-semibold tracking-tight text-white">LunaMail</p>
                            </div>
                            <Button
                                variant="ghost"
                                className="h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => window.electronAPI.openComposeWindow()}
                                title="Compose"
                                aria-label="Compose"
                            >
                                <PenSquare size={16} className="mr-2"/>
                                <span className="text-sm font-medium">Compose</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className={cn(
                                    "h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white",
                                    activeWorkspace === "calendar" && "bg-white/20 text-white"
                                )}
                                onClick={onOpenCalendar}
                                title="Open calendar"
                                aria-label="Open calendar"
                            >
                                <CalendarDays size={16} className="mr-2"/>
                                <span className="text-sm font-medium">Calendar</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className={cn(
                                    "h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white",
                                    activeWorkspace === "contacts" && "bg-white/20 text-white"
                                )}
                                onClick={onOpenContacts}
                                title="Open contacts"
                                aria-label="Open contacts"
                            >
                                <Users size={16} className="mr-2"/>
                                <span className="text-sm font-medium">Contacts</span>
                            </Button>
                        </div>
                        <div className="flex items-center justify-end">
                            <Button
                                variant="ghost"
                                className={cn(
                                    "mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white",
                                    searchModalOpen && "bg-white/20 text-white"
                                )}
                                onClick={() => setSearchModalOpen(true)}
                                title="Search mail"
                                aria-label="Search mail"
                            >
                                <Search size={15}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = "/settings/application";
                                }}
                                title="App settings"
                                aria-label="App settings"
                            >
                                <Settings size={17}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = "/debug";
                                }}
                                title="Debug console"
                                aria-label="Debug console"
                            >
                                <Bug size={17}/>
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                                onClick={() => {
                                    window.location.hash = "/help";
                                }}
                                title="Support"
                                aria-label="Support"
                            >
                                <CircleHelp size={17}/>
                            </Button>
                        </div>
                    </div>
                }
                showStatusBar
                statusText={syncStatusText || "Ready"}
                statusBusy={Boolean(syncInProgress)}
                statusHintText={statusHintText || null}
                contentClassName="min-h-0 flex-1 overflow-hidden p-0"
            >
                <div className="min-h-0 flex h-full overflow-hidden">
                    {!hideFolderSidebar && (
                        <div className="relative min-h-0 shrink-0" style={{width: effectiveSidebarWidth}}>
                            <aside
                                className="flex h-full min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-800 dark:border-[#3a3d44] dark:bg-[#2b2d31] dark:text-slate-100">
                                <ScrollArea className="min-h-0 flex-1 px-2.5 py-3">
                                    <nav className="space-y-2">
                                        <div className="mb-2 pb-2 border-b border-slate-200 dark:border-[#1b1c20]">
                                            <button
                                                type="button"
                                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                                                onClick={() =>
                                                    void window.electronAPI.openComposeWindow(
                                                        selectedAccountId ? {accountId: selectedAccountId} : null
                                                    )
                                                }
                                                title="Compose"
                                                aria-label="Compose"
                                            >
                                                <PenSquare size={16}/>
                                                <span>Compose</span>
                                            </button>
                                        </div>

                                        {accounts.length === 0 && (
                                            <div
                                                className="rounded-lg px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                                                No accounts yet
                                            </div>
                                        )}

                                        {accounts.map((account, accountIndex) => {
                                            const isSelectedAccount = account.id === selectedAccountId;
                                            const isSyncingAccount =
                                                (syncingAccountIds?.has(account.id) ?? false) || localSyncingAccountIds.has(account.id);
                                            const isPersistedExpanded = !collapsedAccountIds.has(account.id);
                                            // Keep the active account open in the UI without changing persisted collapse state.
                                            const isExpanded = isSelectedAccount || isPersistedExpanded;
                                            const accountFolders = accountFoldersById[account.id] ?? [];
                                            const accountUnread = accountFolders.reduce(
                                                (sum, folder) => sum + Math.max(0, Number(folder.unread_count) || 0),
                                                0
                                            );
                                            const accountProtectedFolders = accountFolders.filter((folder) => isProtectedFolder(folder));
                                            const accountCustomFolders = accountFolders.filter((folder) => !isProtectedFolder(folder));
                                            const accountDefaultFolder = accountFolders[0] ?? null;
                                            const accountLinkTarget = accountDefaultFolder
                                                ? `/email/${account.id}/${accountDefaultFolder.id}`
                                                : `/email/${account.id}`;
                                            const avatarColors = getAccountAvatarColors(
                                                account.email || account.display_name || String(account.id)
                                            );
                                            return (
                                                <div key={account.id} className="space-y-1">
                                                    <div
                                                        className={cn(
                                                            "group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors",
                                                            isSelectedAccount
                                                                ? "bg-gradient-to-r from-slate-200/90 to-slate-100/90 dark:from-[#3f434b] dark:to-[#373a42]"
                                                                : "bg-transparent hover:bg-gradient-to-r hover:from-slate-200/90 hover:to-slate-100/90 dark:hover:from-[#3f434b] dark:hover:to-[#373a42]"
                                                        )}
                                                    >
                                                        <Link
                                                            to={accountLinkTarget}
                                                            className={cn(
                                                                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors",
                                                                isSelectedAccount
                                                                    ? "font-semibold text-slate-900 dark:text-white"
                                                                    : "text-slate-700 dark:text-slate-200"
                                                            )}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                setAccountMenu({x: e.clientX, y: e.clientY, account});
                                                            }}
                                                            style={{color: "inherit"}}
                                                        >
                              <span
                                  className={cn(
                                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ring-1",
                                      isSelectedAccount
                                          ? "ring-slate-800/30 dark:ring-white/25"
                                          : "ring-black/10 dark:ring-white/10"
                                  )}
                                  style={{
                                      backgroundColor: avatarColors.background,
                                      color: avatarColors.foreground,
                                  }}
                              >
                                {getAccountMonogram(account)}
                              </span>
                                                            <span className="min-w-0 flex-1">
                                <span className="block truncate">{account.display_name?.trim() || account.email}</span>
                                                                {account.display_name?.trim() && (
                                                                    <span
                                                                        className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                    {account.email}
                                  </span>
                                                                )}
                              </span>
                                                        </Link>
                                                        <div className="ml-auto flex items-center gap-1 pr-0">
                                                            <div
                                                                className={cn(
                                                                    "flex items-center gap-1 transition-opacity",
                                                                    isSyncingAccount ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                                )}
                                                            >
                                                                <button
                                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        syncAccountNow(account.id);
                                                                    }}
                                                                    title="Sync account"
                                                                    aria-label="Sync account"
                                                                    disabled={isSyncingAccount}
                                                                >
                                                                    <RefreshCw size={13}
                                                                               className={cn(isSyncingAccount && "animate-spin")}/>
                                                                </button>
                                                                <button
                                                                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        window.location.hash = `/settings/account/${account.id}`;
                                                                    }}
                                                                    title="Edit account"
                                                                    aria-label="Edit account"
                                                                >
                                                                    <Settings size={13}/>
                                                                </button>
                                                            </div>
                                                            {accountUnread > 0 && (
                                                                <NewEmailBadge
                                                                    count={accountUnread}
                                                                    title={`${accountUnread} unread in account`}
                                                                    className={cn(
                                                                        isSelectedAccount &&
                                                                        "border-red-400/90 from-red-500 to-red-700 dark:border-red-400/80"
                                                                    )}
                                                                />
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    toggleAccountExpanded(account.id);
                                                                }}
                                                                title={isExpanded ? "Collapse account folders" : "Expand account folders"}
                                                                aria-label={isExpanded ? "Collapse account folders" : "Expand account folders"}
                                                                aria-expanded={isExpanded}
                                                            >
                                                                <ChevronRight
                                                                    size={14}
                                                                    className={cn("transition-transform", isExpanded && "rotate-90")}
                                                                />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div
                                                            className="relative space-y-1 pl-7 before:absolute before:bottom-2 before:left-3.5 before:top-1 before:w-px before:bg-gradient-to-b before:from-slate-300 before:to-slate-200/30 before:content-[''] dark:before:from-[#4a4d55] dark:before:to-transparent">
                                                            {accountFolders.length === 0 ? (
                                                                <div
                                                                    className="rounded-md px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                                    No folders yet
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {accountProtectedFolders.map((folder) => (
                                                                        <FolderItemRow
                                                                            key={folder.id}
                                                                            to={`/email/${account.id}/${folder.id}`}
                                                                            icon={getFolderIcon(folder)}
                                                                            iconColorClassName={getFolderColorClass(folder.color)}
                                                                            label={folder.custom_name || folder.name}
                                                                            count={folder.unread_count}
                                                                            active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                            dropActive={
                                                                                dragTargetFolder?.accountId === folder.account_id &&
                                                                                dragTargetFolder.path === folder.path
                                                                            }
                                                                            onDragEnter={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                if (!draggingMessage) return;
                                                                                if (draggingMessage.accountId !== folder.account_id) return;
                                                                                if (folder.path === selectedFolderPath) return;
                                                                                e.preventDefault();
                                                                                setDragTargetFolder({
                                                                                    accountId: folder.account_id,
                                                                                    path: folder.path,
                                                                                });
                                                                            }}
                                                                            onDragOver={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                if (!draggingMessage) return;
                                                                                if (draggingMessage.accountId !== folder.account_id) return;
                                                                                if (folder.path === selectedFolderPath) return;
                                                                                e.preventDefault();
                                                                                e.dataTransfer.dropEffect = "move";
                                                                                if (
                                                                                    dragTargetFolder?.accountId !== folder.account_id ||
                                                                                    dragTargetFolder.path !== folder.path
                                                                                ) {
                                                                                    setDragTargetFolder({
                                                                                        accountId: folder.account_id,
                                                                                        path: folder.path,
                                                                                    });
                                                                                }
                                                                            }}
                                                                            onDragLeave={(e) => {
                                                                                const related = e.relatedTarget as Node | null;
                                                                                if (related && e.currentTarget.contains(related)) return;
                                                                                if (
                                                                                    dragTargetFolder?.accountId === folder.account_id &&
                                                                                    dragTargetFolder.path === folder.path
                                                                                ) {
                                                                                    setDragTargetFolder(null);
                                                                                }
                                                                            }}
                                                                            onDrop={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                handleMessageDropOnFolder(e, folder);
                                                                            }}
                                                                            onContextMenu={(e) => {
                                                                                e.preventDefault();
                                                                                if (!isSelectedAccount) onSelectAccount(account.id);
                                                                                setMenu({
                                                                                    kind: "folder",
                                                                                    x: e.clientX,
                                                                                    y: e.clientY,
                                                                                    folder,
                                                                                });
                                                                            }}
                                                                        />
                                                                    ))}
                                                                    {accountProtectedFolders.length > 0 && accountCustomFolders.length > 0 && (
                                                                        <div
                                                                            className="my-1.5 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-[#3a3d44]"/>
                                                                    )}
                                                                    {accountCustomFolders.map((folder) => (
                                                                        <FolderItemRow
                                                                            key={folder.id}
                                                                            to={`/email/${account.id}/${folder.id}`}
                                                                            icon={getFolderIcon(folder)}
                                                                            iconColorClassName={getFolderColorClass(folder.color)}
                                                                            label={folder.custom_name || folder.name}
                                                                            count={folder.unread_count}
                                                                            active={isSelectedAccount && selectedFolderPath === folder.path}
                                                                            customDragActive={
                                                                                customFolderDropTarget?.accountId === folder.account_id &&
                                                                                customFolderDropTarget.path === folder.path
                                                                            }
                                                                            customDragging={
                                                                                draggingCustomFolder?.accountId === folder.account_id &&
                                                                                draggingCustomFolder.path === folder.path
                                                                            }
                                                                            draggableFolder
                                                                            onFolderDragStart={(e) => {
                                                                                setDraggingCustomFolder({
                                                                                    accountId: folder.account_id,
                                                                                    path: folder.path,
                                                                                });
                                                                                setCustomFolderDropTarget(null);
                                                                                e.dataTransfer.effectAllowed = "move";
                                                                                e.dataTransfer.setData("application/x-lunamail-folder-path", folder.path);
                                                                                e.dataTransfer.setData(
                                                                                    "application/x-lunamail-folder-account",
                                                                                    String(folder.account_id)
                                                                                );
                                                                            }}
                                                                            onFolderDragEnd={() => {
                                                                                setDraggingCustomFolder(null);
                                                                                setCustomFolderDropTarget(null);
                                                                            }}
                                                                            onFolderDragOver={(e) => {
                                                                                if (!draggingCustomFolder) return;
                                                                                if (draggingCustomFolder.accountId !== folder.account_id) return;
                                                                                if (draggingCustomFolder.path === folder.path) return;
                                                                                e.preventDefault();
                                                                                e.dataTransfer.dropEffect = "move";
                                                                                if (
                                                                                    customFolderDropTarget?.accountId !== folder.account_id ||
                                                                                    customFolderDropTarget.path !== folder.path
                                                                                ) {
                                                                                    setCustomFolderDropTarget({
                                                                                        accountId: folder.account_id,
                                                                                        path: folder.path,
                                                                                    });
                                                                                }
                                                                            }}
                                                                            onFolderDrop={(e) => {
                                                                                if (!draggingCustomFolder) return;
                                                                                if (draggingCustomFolder.accountId !== folder.account_id) return;
                                                                                if (draggingCustomFolder.path === folder.path) return;
                                                                                e.preventDefault();
                                                                                const accountId = folder.account_id;
                                                                                const accountCustom = (accountFoldersById[accountId] ?? []).filter(
                                                                                    (f) => !isProtectedFolder(f)
                                                                                );
                                                                                const fromIndex = accountCustom.findIndex(
                                                                                    (f) => f.path === draggingCustomFolder.path
                                                                                );
                                                                                const toIndex = accountCustom.findIndex((f) => f.path === folder.path);
                                                                                if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
                                                                                    const next = [...accountCustom];
                                                                                    const [moved] = next.splice(fromIndex, 1);
                                                                                    next.splice(toIndex, 0, moved);
                                                                                    void onReorderCustomFolders(
                                                                                        accountId,
                                                                                        next.map((f) => f.path)
                                                                                    );
                                                                                }
                                                                                setDraggingCustomFolder(null);
                                                                                setCustomFolderDropTarget(null);
                                                                            }}
                                                                            onEditFolder={() => {
                                                                                setFolderEditor({
                                                                                    folder,
                                                                                    customName: folder.custom_name || folder.name,
                                                                                    type: folder.type || "",
                                                                                    color: folder.color || "",
                                                                                });
                                                                                setFolderEditorError(null);
                                                                            }}
                                                                            dropActive={
                                                                                dragTargetFolder?.accountId === folder.account_id &&
                                                                                dragTargetFolder.path === folder.path
                                                                            }
                                                                            onDragEnter={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                if (!draggingMessage) return;
                                                                                if (draggingMessage.accountId !== folder.account_id) return;
                                                                                if (folder.path === selectedFolderPath) return;
                                                                                e.preventDefault();
                                                                                setDragTargetFolder({
                                                                                    accountId: folder.account_id,
                                                                                    path: folder.path,
                                                                                });
                                                                            }}
                                                                            onDragOver={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                if (!draggingMessage) return;
                                                                                if (draggingMessage.accountId !== folder.account_id) return;
                                                                                if (folder.path === selectedFolderPath) return;
                                                                                e.preventDefault();
                                                                                e.dataTransfer.dropEffect = "move";
                                                                                if (
                                                                                    dragTargetFolder?.accountId !== folder.account_id ||
                                                                                    dragTargetFolder.path !== folder.path
                                                                                ) {
                                                                                    setDragTargetFolder({
                                                                                        accountId: folder.account_id,
                                                                                        path: folder.path,
                                                                                    });
                                                                                }
                                                                            }}
                                                                            onDragLeave={(e) => {
                                                                                const related = e.relatedTarget as Node | null;
                                                                                if (related && e.currentTarget.contains(related)) return;
                                                                                if (
                                                                                    dragTargetFolder?.accountId === folder.account_id &&
                                                                                    dragTargetFolder.path === folder.path
                                                                                ) {
                                                                                    setDragTargetFolder(null);
                                                                                }
                                                                            }}
                                                                            onDrop={(e) => {
                                                                                if (!isSelectedAccount) return;
                                                                                handleMessageDropOnFolder(e, folder);
                                                                            }}
                                                                            onContextMenu={(e) => {
                                                                                e.preventDefault();
                                                                                if (!isSelectedAccount) onSelectAccount(account.id);
                                                                                setMenu({
                                                                                    kind: "folder",
                                                                                    x: e.clientX,
                                                                                    y: e.clientY,
                                                                                    folder,
                                                                                });
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {accountIndex < accounts.length - 1 && (
                                                        <div
                                                            className="mx-2 my-1.5 h-px bg-gradient-to-r from-transparent via-slate-300/85 to-transparent dark:via-[#3b3e45]"/>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </nav>
                                </ScrollArea>
                            </aside>
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                                onMouseDown={onResizeStart}
                            />
                        </div>
                    )}

                    {mailView === "side-list" && (
                        <>
                            <main
                                className={cn(
                                    "relative flex min-h-0 flex-col border-r border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]",
                                    isCompactSideList ? "min-w-0 flex-1" : "shrink-0"
                                )}
                                style={isCompactSideList ? undefined : {width: mailListWidth}}
                            >
                                <div className="border-b border-slate-200 p-2 dark:border-[#3a3d44]">
                                    <div className="relative">
                                        <Search
                                            size={14}
                                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                                        />
                                        <input
                                            type="text"
                                            readOnly
                                            value=""
                                            placeholder="Search mail"
                                            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:placeholder:text-slate-400 dark:hover:bg-[#25272c] dark:focus:border-[#5865f2]"
                                            onClick={() => setSearchModalOpen(true)}
                                            onFocus={(event) => {
                                                setSearchModalOpen(true);
                                                event.currentTarget.blur();
                                            }}
                                            aria-label="Search mail"
                                        />
                                        <span
                                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Ctrl+F
                    </span>
                                    </div>
                                </div>
                                {selectedMessageIds.length > 1 && (
                                    <div className="border-b border-slate-200 px-2 py-2 dark:border-[#3a3d44]">
                                        <div
                                            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {selectedMessageIds.length} selected
                      </span>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                                            >
                                                Mark read
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                                            >
                                                Mark unread
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/25"
                                                onClick={() => onBulkDelete(selectedMessageIds)}
                                            >
                                                Delete
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={onClearMessageSelection}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <ScrollArea
                                    className="min-h-0 flex-1 overflow-auto"
                                    onScroll={(e) => {
                                        if (!hasMoreMessages || loadingMoreMessages) return;
                                        const el = e.currentTarget;
                                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 220) {
                                            onLoadMoreMessages();
                                        }
                                    }}
                                >
                                    {messages.length === 0 && (
                                        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                                            No messages in this folder yet.
                                        </div>
                                    )}
                                    {messages.map((message, messageIndex) => (
                                        <div
                                            key={message.id}
                                            className={cn(
                                                "block w-full border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]",
                                                draggingMessage?.id === message.id && "opacity-60",
                                                selectedMessageIds.includes(message.id) && "bg-sky-50/70 dark:bg-[#3a3e52]",
                                                selectedMessageId === message.id && "border-l-4 border-l-sky-600 dark:border-l-[#5865f2]"
                                            )}
                                            onClick={(event) => {
                                                onMessageRowClick(event, message, messageIndex);
                                                if (!isCompactSideList) return;
                                                if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                                                void window.electronAPI.openMessageWindow(message.id);
                                            }}
                                            onDoubleClick={() => {
                                                void window.electronAPI.openMessageWindow(message.id);
                                            }}
                                            draggable
                                            onDragStart={(event) => onMessageRowDragStart(event, message)}
                                            onDragEnd={() => {
                                                setDraggingMessage(null);
                                                setDragTargetFolder(null);
                                            }}
                                            onContextMenu={(event) => {
                                                event.preventDefault();
                                                setMenu({kind: "message", x: event.clientX, y: event.clientY, message});
                                            }}
                                        >
                                            <div
                                                className={`flex min-w-0 items-center gap-2 text-sm ${message.is_read ? "font-medium text-slate-700 dark:text-slate-300" : "font-semibold text-slate-950 dark:text-white"}`}
                                            >
                                                {!message.is_read && (
                                                    <span
                                                        className="inline-flex h-2 w-2 shrink-0 rounded-full bg-sky-500 dark:bg-[#8ab4ff]"
                                                        title="Unread"
                                                        aria-label="Unread"
                                                    />
                                                )}
                                                <span className="truncate">{message.subject || "(No subject)"}</span>
                                                {getThreadCount(message) > 1 && (
                                                    <span
                                                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold leading-none text-slate-700 dark:bg-[#454a55] dark:text-slate-100">
                            {getThreadCount(message)}
                          </span>
                                                )}
                                            </div>
                                            <div className="mt-1.5 flex items-center justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                        {formatMessageSender(message)}
                                                    </p>
                                                    {Boolean(
                                                        (
                                                            message as MessageItem & {
                                                                tag?: string | null;
                                                            }
                                                        ).tag
                                                    ) && (
                                                        <span
                                                            className="inline-flex max-w-[10rem] items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-[#4a4d55] dark:text-slate-200">
                              <span
                                  className={cn(
                                      "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
                                      getTagDotClass(
                                          (
                                              message as MessageItem & {
                                                  tag?: string | null;
                                              }
                                          ).tag ?? null
                                      )
                                  )}
                              />
                              <span className="truncate">
                                {getTagLabel(
                                    (
                                        message as MessageItem & {
                                            tag?: string | null;
                                        }
                                    ).tag ?? null
                                )}
                              </span>
                            </span>
                                                    )}
                                                </div>
                                                <span
                                                    className="ml-3 inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                          {Boolean(message.is_flagged) && (
                              <span
                                  className="inline-flex items-center text-amber-500 dark:text-amber-300"
                                  title="Starred"
                              >
                              <Star size={12} className="fill-current"/>
                            </span>
                          )}
                                                    <span>{formatSystemDateTime(message.date, dateLocale)}</span>
                        </span>
                                            </div>
                                        </div>
                                    ))}
                                    {loadingMoreMessages && messages.length > 0 && (
                                        <div
                                            className="px-5 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                            Loading more messages...
                                        </div>
                                    )}
                                    {!hasMoreMessages && messages.length > 0 && (
                                        <div
                                            className="px-5 py-3 text-center text-xs text-slate-400 dark:text-slate-500">End
                                            of list</div>
                                    )}
                                </ScrollArea>
                                {!isCompactSideList && (
                                    <div
                                        role="separator"
                                        aria-orientation="vertical"
                                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                                        onMouseDown={onMailListResizeStart}
                                    />
                                )}
                            </main>
                            {!isCompactSideList && (
                                <section
                                    className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">{children}</section>
                            )}
                        </>
                    )}

                    {mailView === "top-table" && (
                        <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#34373d]">
                            <div
                                className={cn(
                                    "relative flex min-h-0 flex-col border-b border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#2b2d31]",
                                    isCompactTopTable ? "flex-1" : "shrink-0"
                                )}
                                style={isCompactTopTable ? undefined : {height: topListHeight}}
                            >
                                <div className="border-b border-slate-200 p-2 dark:border-[#3a3d44]">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search
                                                size={14}
                                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                                            />
                                            <input
                                                type="text"
                                                readOnly
                                                value=""
                                                placeholder="Search mail"
                                                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-14 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-200 dark:placeholder:text-slate-400 dark:hover:bg-[#25272c] dark:focus:border-[#5865f2]"
                                                onClick={() => setSearchModalOpen(true)}
                                                onFocus={(event) => {
                                                    setSearchModalOpen(true);
                                                    event.currentTarget.blur();
                                                }}
                                                aria-label="Search mail"
                                            />
                                            <span
                                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Ctrl+F
                      </span>
                                        </div>
                                    </div>
                                </div>
                                {selectedMessageIds.length > 1 && (
                                    <div className="border-b border-slate-200 px-2 py-2 dark:border-[#3a3d44]">
                                        <div
                                            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#26292f]">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {selectedMessageIds.length} selected
                      </span>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={() => onBulkMarkRead(selectedMessageIds, 1)}
                                            >
                                                Mark read
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={() => onBulkMarkRead(selectedMessageIds, 0)}
                                            >
                                                Mark unread
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/25"
                                                onClick={() => onBulkDelete(selectedMessageIds)}
                                            >
                                                Delete
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                                onClick={onClearMessageSelection}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <ScrollArea
                                    className="min-h-0 flex-1"
                                    onScroll={(e) => {
                                        if (!hasMoreMessages || loadingMoreMessages) return;
                                        const el = e.currentTarget;
                                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 220) {
                                            onLoadMoreMessages();
                                        }
                                    }}
                                >
                                    {messages.length === 0 && (
                                        <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
                                            No messages in this folder yet.
                                        </div>
                                    )}
                                    {messages.length > 0 && (
                                        <table
                                            key={`mail-table-${visibleTableColumns.join("|")}`}
                                            className="table-fixed border-collapse text-sm"
                                            style={{width: `max(${tableMinWidth}px, 100%)`, minWidth: "100%"}}
                                        >
                                            <colgroup>
                                                {visibleTableColumns.map((column) => (
                                                    <col key={column}
                                                         style={{width: `${effectiveTableColumnWidths[column]}px`}}/>
                                                ))}
                                                <col style={{width: "44px"}}/>
                                            </colgroup>
                                            <thead
                                                className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[inset_0_-1px_0_0_rgb(226_232_240)] dark:border-[#3a3d44] dark:bg-[#2f3138] dark:shadow-[inset_0_-1px_0_0_#3a3d44]"
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    openTableHeadMenuAt(event.clientX, event.clientY);
                                                }}
                                            >
                                            <tr className="group text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                                {visibleTableColumns.map((column, index) => {
                                                    const label = TABLE_COLUMN_OPTIONS.find((item) => item.key === column)?.label || column;
                                                    return (
                                                        <th
                                                            key={column}
                                                            className={cn(
                                                                "relative border-b border-slate-200 px-3 py-2 select-none dark:border-[#3a3d44]",
                                                                index < visibleTableColumns.length - 1 &&
                                                                "border-r border-r-slate-200 dark:border-r-[#3a3d44]",
                                                                draggingColumn === column && "opacity-70",
                                                                dragPlaceholder?.column === column &&
                                                                draggingColumn &&
                                                                draggingColumn !== column &&
                                                                "bg-sky-100/50 dark:bg-[#3a4f72]/60"
                                                            )}
                                                            draggable
                                                            onDragStart={(event) => onTableHeaderDragStart(event, column)}
                                                            onDragOver={(event) => {
                                                                event.preventDefault();
                                                                if (draggingColumn && draggingColumn !== column) {
                                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                                    const side = event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
                                                                    setDragPlaceholder((prev) => {
                                                                        if (prev?.column === column && prev.side === side) return prev;
                                                                        return {column, side};
                                                                    });
                                                                }
                                                            }}
                                                            onDragLeave={() => {
                                                                setDragPlaceholder((prev) => (prev?.column === column ? null : prev));
                                                            }}
                                                            onDrop={(event) => onTableHeaderDrop(event, column)}
                                                            onDragEnd={() => {
                                                                setDraggingColumn(null);
                                                                setDragPlaceholder(null);
                                                            }}
                                                        >
                                                            {dragPlaceholder?.column === column && dragPlaceholder.side === "before" && (
                                                                <span
                                                                    className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                                    aria-hidden="true"
                                                                />
                                                            )}
                                                            <div className="truncate">
                                                                <span className="truncate">{label}</span>
                                                            </div>
                                                            {dragPlaceholder?.column === column && dragPlaceholder.side === "after" && (
                                                                <span
                                                                    className="pointer-events-none absolute bottom-0 right-0 top-0 w-0.5 bg-sky-600 dark:bg-sky-400"
                                                                    aria-hidden="true"
                                                                />
                                                            )}
                                                            {index < visibleTableColumns.length - 1 && (
                                                                <>
                                                                    <div
                                                                        role="separator"
                                                                        aria-orientation="vertical"
                                                                        className={MAIL_TABLE_RESIZE_HANDLE_CLASS}
                                                                        onMouseDown={(event) => beginTableColumnResize(event, column)}
                                                                    />
                                                                </>
                                                            )}
                                                        </th>
                                                    );
                                                })}
                                                <th className="border-b border-slate-200 px-1 py-1 text-right dark:border-[#3a3d44]">
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-[#3a3d44] dark:hover:text-slate-100"
                                                        aria-label="Table column options"
                                                        title="Table column options"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
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
                                            {messages.map((message, messageIndex) => (
                                                <tr
                                                    key={message.id}
                                                    className={cn(
                                                        "cursor-pointer border-t border-slate-100 first:border-t-0 hover:bg-slate-50 dark:border-[#393c41] dark:hover:bg-[#32353b]",
                                                        selectedMessageIds.includes(message.id) && "bg-sky-50/70 dark:bg-[#3a3e52]"
                                                    )}
                                                    onClick={(event) => {
                                                        onMessageRowClick(event, message, messageIndex);
                                                        if (!isCompactTopTable) return;
                                                        if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                                                        void window.electronAPI.openMessageWindow(message.id);
                                                    }}
                                                    onDoubleClick={() => {
                                                        void window.electronAPI.openMessageWindow(message.id);
                                                    }}
                                                    draggable
                                                    onDragStart={(event) => onMessageRowDragStart(event, message)}
                                                    onDragEnd={() => {
                                                        setDraggingMessage(null);
                                                        setDragTargetFolder(null);
                                                    }}
                                                    onContextMenu={(event) => {
                                                        event.preventDefault();
                                                        setMenu({
                                                            kind: "message",
                                                            x: event.clientX,
                                                            y: event.clientY,
                                                            message,
                                                        });
                                                    }}
                                                >
                                                    {visibleTableColumns.map((column) => renderTableCell(message, column))}
                                                    <td className="px-1 py-2"/>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    )}
                                    {loadingMoreMessages && messages.length > 0 && (
                                        <div
                                            className="px-5 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                                            Loading more messages...
                                        </div>
                                    )}
                                </ScrollArea>
                                {!isCompactTopTable && (
                                    <div
                                        role="separator"
                                        aria-orientation="horizontal"
                                        className="absolute bottom-0 left-0 right-0 z-10 h-1.5 cursor-row-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                                        onMouseDown={onTopListResizeStart}
                                    />
                                )}
                            </div>
                            {!isCompactTopTable && <div className="min-h-0 flex-1">{children}</div>}
                        </section>
                    )}
                </div>
            </WorkspaceLayout>

            {(menu || accountMenu || tableHeadMenu) && (
                <div
                    className="fixed inset-0 z-[996]"
                    onClick={() => {
                        setMenu(null);
                        setAccountMenu(null);
                        setTableHeadMenu(null);
                    }}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu(null);
                        setAccountMenu(null);
                        setTableHeadMenu(null);
                    }}
                />
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
                    {TABLE_COLUMN_OPTIONS.map((column) => {
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
                                    className={cn(
                                        "inline-flex h-4 w-4 items-center justify-center text-xs",
                                        checked ? "text-emerald-600 dark:text-emerald-300" : "text-transparent"
                                    )}
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

            {searchModalOpen && (
                <div
                    className="fixed inset-0 z-[1100] flex items-start justify-center bg-slate-950/45 p-4 pt-20"
                    onClick={() => setSearchModalOpen(false)}
                >
                    <div
                        className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#3a3d44] dark:bg-[#25272c]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="group flex h-11 items-center rounded-xl border border-slate-300 bg-white/90 px-3 shadow-sm transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 dark:border-[#40444b] dark:bg-[#1f2125] dark:focus-within:border-[#5865f2] dark:focus-within:ring-[#5865f2]/30">
                            <Search size={16} className="mr-2 shrink-0 text-slate-400 dark:text-slate-500"/>
                            <input
                                ref={mailSearchModalInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => onSearchQueryChange(e.target.value)}
                                placeholder="Search sender, subject, or content across all accounts..."
                                className="h-full w-full border-0 bg-transparent px-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
                            <select
                                value={accountFilter}
                                onChange={(event) => {
                                    setAccountFilter(event.target.value);
                                    setFolderFilter("all");
                                }}
                                className="ml-2 h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-200 dark:focus:border-[#5865f2]"
                            >
                                <option value="all">All accounts</option>
                                {accounts.map((account) => (
                                    <option key={account.id} value={String(account.id)}>
                                        {formatAccountSearchLabel(account)}
                                    </option>
                                ))}
                            </select>
                            {searchQuery.trim().length > 0 && (
                                <button
                                    type="button"
                                    className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                                    onClick={() => onSearchQueryChange("")}
                                    aria-label="Clear search"
                                    title="Clear search"
                                >
                                    <X size={14}/>
                                </button>
                            )}
                        </div>
                        <div
                            className="mt-2 flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {accountFilter === "all"
                    ? "Searching all accounts and folders"
                    : `Searching ${formatAccountSearchLabel(accounts.find((account) => String(account.id) === accountFilter) ?? null)}`}
              </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                                    onClick={() => setAdvancedSearchOpen((prev) => !prev)}
                                >
                                    {advancedSearchOpen ? "Basic" : "Advanced"}
                                </button>
                                <button
                                    type="button"
                                    className="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#35373c] dark:hover:text-slate-200"
                                    onClick={() => setSearchModalOpen(false)}
                                >
                                    Esc
                                </button>
                            </div>
                        </div>
                        {advancedSearchOpen && (
                            <div
                                className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#1f2125] sm:grid-cols-3 lg:grid-cols-4">
                                <input
                                    type="search"
                                    value={fromFilter}
                                    onChange={(e) => setFromFilter(e.target.value)}
                                    placeholder="From address/name"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <input
                                    type="search"
                                    value={subjectFilter}
                                    onChange={(e) => setSubjectFilter(e.target.value)}
                                    placeholder="Subject"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <input
                                    type="search"
                                    value={toFilter}
                                    onChange={(e) => setToFilter(e.target.value)}
                                    placeholder="To address"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <select
                                    value={folderFilter}
                                    onChange={(event) => setFolderFilter(event.target.value)}
                                    disabled={accountFilter === "all"}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 disabled:opacity-60 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="all">All folders</option>
                                    {searchFoldersForSelectedAccount.map((folder) => (
                                        <option key={folder.id} value={String(folder.id)}>
                                            {folder.custom_name || folder.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={readFilter}
                                    onChange={(event) => setReadFilter(event.target.value as "all" | "read" | "unread")}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="all">Read status: all</option>
                                    <option value="read">Read only</option>
                                    <option value="unread">Unread only</option>
                                </select>
                                <select
                                    value={starFilter}
                                    onChange={(event) => setStarFilter(event.target.value as "all" | "starred" | "unstarred")}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="all">Star: all</option>
                                    <option value="starred">Starred only</option>
                                    <option value="unstarred">Unstarred only</option>
                                </select>
                                <select
                                    value={dateRangeFilter}
                                    onChange={(event) => setDateRangeFilter(event.target.value as "all" | "7d" | "30d" | "365d")}
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                >
                                    <option value="all">Any date</option>
                                    <option value="7d">Last 7 days</option>
                                    <option value="30d">Last 30 days</option>
                                    <option value="365d">Last 12 months</option>
                                </select>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={minSizeKbFilter}
                                    onChange={(event) => setMinSizeKbFilter(event.target.value)}
                                    placeholder="Min size (KB)"
                                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                />
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={maxSizeKbFilter}
                                        onChange={(event) => setMaxSizeKbFilter(event.target.value)}
                                        placeholder="Max size (KB)"
                                        className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-[#40444b] dark:bg-[#25272c] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    />
                                    <button
                                        type="button"
                                        className="h-9 shrink-0 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                                        onClick={() => {
                                            setFromFilter("");
                                            setSubjectFilter("");
                                            setToFilter("");
                                            setAccountFilter("all");
                                            setFolderFilter("all");
                                            setReadFilter("all");
                                            setStarFilter("all");
                                            setDateRangeFilter("all");
                                            setMinSizeKbFilter("");
                                            setMaxSizeKbFilter("");
                                        }}
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="mt-3 max-h-[56vh] overflow-y-auto">
                            {!isGlobalSearchActive && (
                                <div
                                    className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
                                    Type to search emails across all accounts.
                                </div>
                            )}
                            {isGlobalSearchActive && searchLoading && (
                                <div
                                    className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
                                    Searching...
                                </div>
                            )}
                            {isGlobalSearchActive && !searchLoading && filteredSearchMessages.length === 0 && (
                                <div
                                    className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-[#40444b] dark:text-slate-400">
                                    No matching emails found.
                                </div>
                            )}
                            {isGlobalSearchActive && !searchLoading && filteredSearchMessages.length > 0 && (
                                <div className="space-y-1">
                                    {filteredSearchMessages.map((message, idx) => {
                                        const account = accounts.find((a) => a.id === message.account_id);
                                        const folder = (accountFoldersById[message.account_id] ?? []).find(
                                            (f) => f.id === message.folder_id
                                        );
                                        return (
                                            <Link
                                                key={message.id}
                                                to={`/email/${message.account_id}/${message.folder_id}/${message.id}`}
                                                className="block w-full rounded-lg border border-transparent px-3 py-2 text-left no-underline transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-[#3a3d44] dark:hover:bg-[#30333a]"
                                                style={{color: "inherit"}}
                                                onClick={() => {
                                                    onSelectMessage(message.id, idx);
                                                    setSearchModalOpen(false);
                                                }}
                                            >
                                                <div
                                                    className={`truncate text-sm ${message.is_read ? "font-medium text-slate-700 dark:text-slate-300" : "font-semibold text-slate-950 dark:text-white"}`}
                                                >
                                                    {message.subject || "(No subject)"}
                                                </div>
                                                <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {formatMessageSender(message)}
                          </span>
                                                    <div className="ml-2 flex shrink-0 items-center gap-2">
                                                        {Boolean(message.is_flagged) && (
                                                            <span
                                                                className="inline-flex items-center text-amber-500 dark:text-amber-300"
                                                                title="Starred"
                                                            >
                                <Star size={12} className="fill-current"/>
                              </span>
                                                        )}
                                                        <span className="text-xs text-slate-400 dark:text-slate-500">
                              {formatSystemDateTime(message.date, dateLocale)}
                            </span>
                                                    </div>
                                                </div>
                                                <div
                                                    className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                          <span className="truncate">
                            {account?.display_name?.trim() || account?.email || `Account ${message.account_id}`}
                          </span>
                                                    <span
                                                        className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#30333a] dark:text-slate-300">
                            {folder?.custom_name || folder?.name || folder?.path || "Unknown folder"}
                          </span>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {menu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[1000] min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-[#3a3d44] dark:bg-[#313338]"
                    style={{
                        left: menuPosition.left,
                        top: menuPosition.top,
                        visibility: menuReady ? "visible" : "hidden",
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {menu.kind === "message" && (
                        <>
                            <ContextItem
                                label="Open in new window"
                                icon={<SquareArrowOutUpRight size={14}/>}
                                onClick={() => {
                                    void window.electronAPI.openMessageWindow(menu.message.id);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label={menu.message.is_read ? "Mark as unread" : "Mark as read"}
                                icon={menu.message.is_read ? <Mail size={14}/> : <MailOpen size={14}/>}
                                onClick={() => {
                                    onMessageMarkReadToggle(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label={menu.message.is_flagged ? "Remove star" : "Star message"}
                                icon={<Star size={14}/>}
                                onClick={() => {
                                    onMessageFlagToggle(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <div className="group relative">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                >
                  <span className="flex items-center gap-2">
                    <span
                        className={cn(
                            "inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
                            getTagDotClass(
                                (
                                    menu.message as MessageItem & {
                                        tag?: string | null;
                                    }
                                ).tag ?? null
                            )
                        )}
                    />
                    Tag
                  </span>
                                    <ChevronRight size={14}/>
                                </button>
                                <div
                                    className={cn(
                                        "absolute top-0 z-[1010] hidden min-w-52 rounded-md border border-slate-200 bg-white p-1 shadow-xl group-hover:block group-focus-within:block dark:border-[#3a3d44] dark:bg-[#313338]",
                                        moveSubmenuLeft ? "right-full mr-1" : "left-full ml-1"
                                    )}
                                    style={{
                                        transform: `translateY(${moveSubmenuOffsetY}px)`,
                                    }}
                                >
                                    {MESSAGE_TAG_OPTIONS.map((tag) => (
                                        <button
                                            key={tag.value}
                                            type="button"
                                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                            onClick={() => {
                                                onMessageTagChange(menu.message, tag.value);
                                                setMenu(null);
                                            }}
                                        >
                      <span className="flex items-center gap-2">
                        <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", tag.dotClass)}/>
                          {tag.label}
                      </span>
                                            {((
                                                menu.message as MessageItem & {
                                                    tag?: string | null;
                                                }
                                            ).tag || "") === tag.value && (
                                                <span
                                                    className="text-xs text-emerald-600 dark:text-emerald-300">On</span>
                                            )}
                                        </button>
                                    ))}
                                    <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                                    <button
                                        type="button"
                                        className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                        onClick={() => {
                                            onMessageTagChange(menu.message, null);
                                            setMenu(null);
                                        }}
                                    >
                                        Clear tag
                                    </button>
                                </div>
                            </div>
                            <ContextItem
                                label="Archive"
                                icon={<Archive size={14}/>}
                                onClick={() => {
                                    onMessageArchive(menu.message);
                                    setMenu(null);
                                }}
                            />
                            <div className="my-1 h-px bg-slate-200"/>
                            <div className="group relative">
                                <button
                                    ref={moveToTriggerRef}
                                    type="button"
                                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
                                >
                  <span className="flex items-center gap-2">
                    <Folder size={14}/>
                    Move to
                  </span>
                                    <ChevronRight size={14}/>
                                </button>
                                <div
                                    className={cn(
                                        "absolute top-0 z-[1010] hidden min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl group-hover:block group-focus-within:block dark:border-[#3a3d44] dark:bg-[#313338]",
                                        moveSubmenuLeft ? "right-full mr-1" : "left-full ml-1"
                                    )}
                                    style={{
                                        transform: `translateY(${moveSubmenuOffsetY}px)`,
                                        maxHeight: "calc(100vh - 16px)",
                                        overflowY: "auto",
                                    }}
                                >
                                    {moveTargetsProtected.map((f) => (
                                        <ContextItem
                                            key={f.id}
                                            label={f.custom_name || f.name}
                                            icon={
                                                <span
                                                    className={cn(getFolderColorClass(f.color) || "text-slate-500 dark:text-slate-300")}>
                          {getFolderIcon(f)}
                        </span>
                                            }
                                            onClick={() => {
                                                onMessageMove(menu.message, f.path);
                                                setMenu(null);
                                            }}
                                        />
                                    ))}
                                    {moveTargetsProtected.length > 0 && moveTargetsCustom.length > 0 && (
                                        <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                                    )}
                                    {moveTargetsCustom.map((f) => (
                                        <ContextItem
                                            key={f.id}
                                            label={f.custom_name || f.name}
                                            icon={
                                                <span
                                                    className={cn(getFolderColorClass(f.color) || "text-slate-500 dark:text-slate-300")}>
                          {getFolderIcon(f)}
                        </span>
                                            }
                                            onClick={() => {
                                                onMessageMove(menu.message, f.path);
                                                setMenu(null);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="my-1 h-px bg-slate-200"/>
                            <ContextItem
                                label="Delete"
                                icon={<Trash2 size={14}/>}
                                danger
                                onClick={() => {
                                    onMessageDelete(menu.message);
                                    setMenu(null);
                                }}
                            />
                        </>
                    )}
                    {menu.kind === "folder" && (
                        <>
                            <ContextItem
                                label="Open Folder"
                                icon={<Folder size={14}/>}
                                onClick={() => {
                                    if (menu.folder.account_id !== selectedAccountId) {
                                        onSelectAccount(menu.folder.account_id);
                                    }
                                    onSelectFolder(menu.folder.path, menu.folder.account_id);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label="Edit Folder Settings"
                                icon={<Settings size={14}/>}
                                onClick={() => {
                                    setFolderEditor({
                                        folder: menu.folder,
                                        customName: menu.folder.custom_name || menu.folder.name,
                                        type: menu.folder.type || "",
                                        color: menu.folder.color || "",
                                    });
                                    setFolderEditorError(null);
                                    setMenu(null);
                                }}
                            />
                            <ContextItem
                                label="Sync Account"
                                icon={<RefreshCw size={14}/>}
                                onClick={() => {
                                    syncAccountNow(menu.folder.account_id);
                                    setMenu(null);
                                }}
                            />
                            {!isProtectedFolder(menu.folder) && (
                                <>
                                    <div className="my-1 h-px bg-slate-200"/>
                                    <ContextItem
                                        label="Delete Folder"
                                        icon={<Trash2 size={14}/>}
                                        danger
                                        onClick={() => {
                                            onDeleteFolder(menu.folder);
                                            setMenu(null);
                                        }}
                                    />
                                </>
                            )}
                        </>
                    )}
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
                    onClick={(e) => e.stopPropagation()}
                >
                    <ContextItem
                        label="Create Folder"
                        icon={<FolderPlus size={14}/>}
                        onClick={() => {
                            setCreateFolderModal({
                                accountId: accountMenu.account.id,
                                folderPath: "",
                                type: "",
                                color: "",
                            });
                            setCreateFolderError(null);
                            setAccountMenu(null);
                        }}
                    />
                    <div className="my-1 h-px bg-slate-200 dark:bg-[#3a3d44]"/>
                    <ContextItem
                        label="Edit Account Settings"
                        icon={<Settings size={14}/>}
                        onClick={() => {
                            window.location.hash = `/settings/account/${accountMenu.account.id}`;
                            setAccountMenu(null);
                        }}
                    />
                </div>
            )}

            {folderEditor && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setFolderEditor(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#313338]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Folder</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{folderEditor.folder.path}</p>

                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Display name</span>
                                <input
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    value={folderEditor.customName}
                                    onChange={(e) =>
                                        setFolderEditor((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    customName: e.target.value,
                                                }
                                                : prev
                                        )
                                    }
                                />
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder type</span>
                                <select
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                    value={folderEditor.type}
                                    onChange={(e) =>
                                        setFolderEditor((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    type: e.target.value,
                                                }
                                                : prev
                                        )
                                    }
                                >
                                    {FOLDER_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder color</span>
                                <div
                                    className="grid grid-cols-4 gap-2 rounded-md border border-slate-300 bg-white p-2 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                                    {FOLDER_COLOR_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() =>
                                                setFolderEditor((prev) =>
                                                    prev
                                                        ? {
                                                            ...prev,
                                                            color: option.value,
                                                        }
                                                        : prev
                                                )
                                            }
                                            className={cn(
                                                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                                                folderEditor.color === option.value
                                                    ? "border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-[#2b2e34] dark:text-slate-100"
                                                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2b2e34]"
                                            )}
                                            title={option.label}
                                            aria-label={`Set folder color ${option.label}`}
                                        >
                      <span
                          className={cn(
                              "inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                              getFolderSwatchClass(option.value)
                          )}
                      />
                                            <span className="truncate">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </label>
                        </div>

                        {folderEditorError && <p className="mt-3 text-sm text-red-600">{folderEditorError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setFolderEditor(null)}
                                    disabled={folderEditorSaving}>
                                Cancel
                            </Button>
                            <Button onClick={() => void saveFolderSettings()} disabled={folderEditorSaving}>
                                {folderEditorSaving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {createFolderModal && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4"
                    onClick={() => setCreateFolderModal(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#313338]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Folder</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {accounts.find((a) => a.id === createFolderModal.accountId)?.display_name?.trim() ||
                                accounts.find((a) => a.id === createFolderModal.accountId)?.email ||
                                `Account ${createFolderModal.accountId}`}
                        </p>

                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder path</span>
                                <input
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                    value={createFolderModal.folderPath}
                                    onChange={(e) =>
                                        setCreateFolderModal((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    folderPath: e.target.value,
                                                }
                                                : prev
                                        )
                                    }
                                />
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder type</span>
                                <select
                                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
                                    value={createFolderModal.type}
                                    onChange={(e) =>
                                        setCreateFolderModal((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    type: e.target.value,
                                                }
                                                : prev
                                        )
                                    }
                                >
                                    {FOLDER_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block text-sm">
                                <span
                                    className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder color</span>
                                <div
                                    className="grid grid-cols-4 gap-2 rounded-md border border-slate-300 bg-white p-2 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                                    {FOLDER_COLOR_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() =>
                                                setCreateFolderModal((prev) =>
                                                    prev
                                                        ? {
                                                            ...prev,
                                                            color: option.value,
                                                        }
                                                        : prev
                                                )
                                            }
                                            className={cn(
                                                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                                                createFolderModal.color === option.value
                                                    ? "border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-[#2b2e34] dark:text-slate-100"
                                                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2b2e34]"
                                            )}
                                            title={option.label}
                                            aria-label={`Set folder color ${option.label}`}
                                        >
                      <span
                          className={cn(
                              "inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15",
                              getFolderSwatchClass(option.value)
                          )}
                      />
                                            <span className="truncate">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </label>
                        </div>

                        {createFolderError && <p className="mt-3 text-sm text-red-600">{createFolderError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setCreateFolderModal(null)}
                                    disabled={createFolderSaving}>
                                Cancel
                            </Button>
                            <Button onClick={() => void createFolderFromModal()} disabled={createFolderSaving}>
                                {createFolderSaving ? "Creating..." : "Create"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const FolderItemRow: React.FC<{
    to?: string;
    icon: React.ReactNode;
    iconColorClassName?: string;
    label: string;
    active?: boolean;
    dropActive?: boolean;
    customDragActive?: boolean;
    customDragging?: boolean;
    count?: number;
    onEditFolder?: () => void;
    draggableFolder?: boolean;
    onFolderDragStart?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDragEnd?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDragOver?: (e: React.DragEvent<HTMLElement>) => void;
    onFolderDrop?: (e: React.DragEvent<HTMLElement>) => void;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnter?: (e: React.DragEvent<HTMLElement>) => void;
    onDragLeave?: (e: React.DragEvent<HTMLElement>) => void;
}> = ({
          to,
          icon,
          iconColorClassName,
          label,
          active,
          dropActive,
          customDragActive,
          customDragging,
          count,
          onEditFolder,
          draggableFolder,
          onFolderDragStart,
          onFolderDragEnd,
          onFolderDragOver,
          onFolderDrop,
          onClick,
          onContextMenu,
          onDrop,
          onDragOver,
          onDragEnter,
          onDragLeave,
      }) => {
    return (
        <div
            className={cn(
                "group relative ml-3 w-[calc(100%-0.75rem)] before:absolute before:left-[-0.75rem] before:top-1/2 before:h-px before:w-2 before:-translate-y-1/2 before:bg-slate-300/80 before:content-[''] dark:before:bg-[#4a4d55]"
            )}
        >
            <Link
                to={to || "#"}
                className={cn(
                    "relative flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left no-underline transition-all",
                    dropActive &&
                    "bg-slate-200 text-slate-900 ring-1 ring-slate-300 shadow-sm dark:bg-[#404249] dark:text-slate-100 dark:ring-[#5b5e66]",
                    customDragging && "opacity-45",
                    active
                        ? "bg-slate-200/80 text-slate-900 ring-1 ring-slate-300/70 dark:bg-[#3d4048] dark:text-slate-100 dark:ring-[#575a62]"
                        : "text-slate-700 dark:text-slate-200",
                    "hover:bg-slate-200/70 dark:hover:bg-[#3a3d44]"
                )}
                draggable={Boolean(draggableFolder)}
                onDragStart={onFolderDragStart}
                onDragEnd={onFolderDragEnd}
                onDragOver={(e) => {
                    onFolderDragOver?.(e);
                    onDragOver?.(e);
                }}
                onDrop={(e) => {
                    onFolderDrop?.(e);
                    onDrop?.(e);
                }}
                onClick={onClick}
                onContextMenu={onContextMenu}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                style={{color: "inherit"}}
            >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
              className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  active ? "bg-white dark:bg-[#2c2f36]" : "bg-slate-100 dark:bg-[#32353b]",
                  iconColorClassName ||
                  (active ? "text-slate-700 dark:text-slate-100" : "text-slate-600 dark:text-slate-300")
              )}
          >
            {icon}
          </span>
          <span className={cn("truncate pr-8 text-xs", active ? "font-semibold" : "font-medium")}>{label}</span>
        </span>
                <span className="flex items-center">
          {typeof count === "number" && count > 0 && (
              <NewEmailBadge
                  count={count}
                  className={cn(
                      "transition-opacity",
                      onEditFolder && "group-hover:opacity-0",
                      active && "border-red-400/90 from-red-500 to-red-700 dark:border-red-400/80"
                  )}
              />
          )}
        </span>
            </Link>
            {onEditFolder && (
                <button
                    type="button"
                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-800 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-[#454850] dark:hover:text-slate-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditFolder();
                    }}
                    title="Edit folder"
                    aria-label="Edit folder"
                >
                    <Settings size={13}/>
                </button>
            )}
            {customDragActive && (
                <div
                    className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-sky-500/90 dark:bg-sky-400/90"/>
            )}
        </div>
    );
};

const ContextItem: React.FC<{
    label: string;
    onClick: () => void;
    danger?: boolean;
    icon?: React.ReactNode;
}> = ({label, onClick, danger, icon}) => (
    <button
        className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
            danger
                ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3e52]"
        )}
        onClick={onClick}
    >
        {icon && <span className="shrink-0">{icon}</span>}
        {label}
    </button>
);

function getFolderIcon(folder: FolderItem): React.ReactNode {
    const type = (folder.type ?? "").toLowerCase();
    const path = folder.path.toLowerCase();

    if (type === "inbox" || path === "inbox") return <Inbox size={15}/>;
    if (type === "sent" || path.includes("sent")) return <Send size={15}/>;
    if (type === "drafts" || path.includes("draft")) return <FileText size={15}/>;
    if (type === "archive" || path.includes("archive")) return <Archive size={15}/>;
    if (type === "trash" || path.includes("trash") || path.includes("deleted")) return <Trash2 size={15}/>;
    if (type === "junk" || path.includes("spam") || path.includes("junk")) return <ShieldAlert size={15}/>;
    return <FilledFolderIcon/>;
}

const FilledFolderIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="shrink-0 fill-current">
        <path
            d="M3 6.5a2.5 2.5 0 0 1 2.5-2.5h4.1c.56 0 1.1.19 1.52.53l1.38 1.13c.18.15.4.23.64.23h5.35A2.5 2.5 0 0 1 21 8.4v8.1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6.5z"/>
    </svg>
);

function getFolderColorClass(color: string | null | undefined): string | undefined {
    switch ((color || "").toLowerCase()) {
        case "sky":
            return "text-sky-600 dark:text-sky-300";
        case "emerald":
            return "text-emerald-600 dark:text-emerald-300";
        case "amber":
            return "text-amber-600 dark:text-amber-300";
        case "rose":
            return "text-rose-600 dark:text-rose-300";
        case "violet":
            return "text-violet-600 dark:text-violet-300";
        case "slate":
            return "text-slate-700 dark:text-slate-200";
        default:
            return undefined;
    }
}

function getFolderSwatchClass(color: string): string {
    switch ((color || "").toLowerCase()) {
        case "sky":
            return "bg-sky-500";
        case "emerald":
            return "bg-emerald-500";
        case "amber":
            return "bg-amber-500";
        case "rose":
            return "bg-rose-500";
        case "violet":
            return "bg-violet-500";
        case "slate":
            return "bg-slate-500";
        default:
            return "bg-transparent ring-1 ring-dashed ring-slate-400 dark:ring-slate-500";
    }
}

function formatMessageSender(message: MessageItem): string {
    const name = (message.from_name || "").trim();
    const email = (message.from_address || "").trim();
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    if (email) return email;
    return "Unknown sender";
}

function formatMessageRecipient(message: MessageItem): string {
    const value = String(message.to_address || "").trim();
    return value || "Unknown recipient";
}

function formatMessageAccount(message: MessageItem, accounts: PublicAccount[]): string {
    const account = accounts.find((item) => item.id === message.account_id);
    if (!account) return `Account ${message.account_id}`;
    return account.display_name?.trim() || account.email;
}

function formatMessageLocation(message: MessageItem, folders: FolderItem[]): string {
    const folder = folders.find((item) => item.id === message.folder_id);
    if (!folder) return `Folder ${message.folder_id}`;
    return folder.custom_name || folder.name || folder.path;
}

function getTagLabel(tag: string | null): string {
    const normalized = String(tag || "")
        .trim()
        .toLowerCase();
    if (!normalized) return "";
    const found = MESSAGE_TAG_OPTIONS.find((item) => item.value === normalized);
    return found?.label || normalized;
}

function getTagDotClass(tag: string | null): string {
    const normalized = String(tag || "")
        .trim()
        .toLowerCase();
    const found = MESSAGE_TAG_OPTIONS.find((item) => item.value === normalized);
    return found?.dotClass || "bg-slate-400";
}

function renderTagCell(tag: string | null): React.ReactNode {
    const label = getTagLabel(tag);
    if (!label) return "";
    return (
        <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 dark:border-[#4a4d55] dark:text-slate-200">
      <span className={cn("inline-flex h-2 w-2 shrink-0 rounded-full", getTagDotClass(tag))}/>
      <span className="truncate">{label}</span>
    </span>
    );
}

function formatAccountSearchLabel(account: PublicAccount | null): string {
    if (!account) return "selected account";
    const displayName = (account.display_name || "").trim();
    if (!displayName) return account.email;
    return `${displayName} <${account.email}>`;
}

function getThreadCount(message: MessageItem): number {
    const raw = (message as MessageItem & { thread_count?: number }).thread_count;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.round(parsed);
}

function formatMessageSize(size: number | null): string {
    if (!size || size <= 0) return "-";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeColumnWidth(value: unknown, key: MailTableColumnKey): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_TABLE_COLUMN_WIDTHS[key];
    const min = MIN_TABLE_COLUMN_WIDTHS[key];
    return Math.max(min, Math.round(numeric));
}

function constrainToViewport(x: number, y: number, width: number, height: number): { left: number; top: number } {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(x, margin), maxLeft);
    const top = Math.min(Math.max(y, margin), maxTop);
    return {left, top};
}

export default MainLayout;

function isInboxFolderPath(folder: FolderItem): boolean {
    const type = String(folder.type || "").toLowerCase();
    const path = String(folder.path || "").toLowerCase();
    return type === "inbox" || path === "inbox" || path.endsWith("/inbox") || path.endsWith(".inbox");
}
