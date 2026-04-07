import React from 'react';
import {
	Bug,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	CircleHelp,
	Mail,
	PenSquare,
	Search,
	Settings,
	Star,
	Users,
} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '../../preload/index';
import type {MailView} from '../../shared/ipcTypes';
import {Button} from '../components/ui/button';
import AccountContextMenu from '../components/mail/AccountContextMenu';
import AccountFolderSidebar from '../components/mail/AccountFolderSidebar';
import CreateFolderModal from '../components/mail/CreateFolderModal';
import FolderEditModal from '../components/mail/FolderEditModal';
import MailSearchModal from '../components/mail/MailSearchModal';
import MessageFolderContextMenu from '../components/mail/MessageFolderContextMenu';
import SideListMailPane from '../components/mail/SideListMailPane';
import TableColumnsMenu from '../components/mail/TableColumnsMenu';
import TopTableMailPane from '../components/mail/TopTableMailPane';
import {isProtectedFolder} from '../features/mail/folders';
import {formatSystemDateTime} from '../lib/dateTime';
import {
	formatAccountSearchLabel,
	formatMessageAccount,
	formatMessageLocation,
	formatMessageRecipient,
	formatMessageSender,
	formatMessageSize,
	getThreadCount,
} from '../lib/mailMessageFormat';
import {getFolderColorClass, getFolderIcon, getFolderSwatchClass} from '../lib/mail/folderPresentation';
import {getTagDotClass, getTagLabel} from '../lib/mail/tagPresentation';
import {useResizableSidebar} from '../hooks/useResizableSidebar';
import {cn} from '../lib/utils';
import type {Workspace} from '../lib/workspace';
import WorkspaceLayout from './WorkspaceLayout';

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
		},
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
	mailView: MailView;
	onMailViewChange: (view: MailView) => void;
	activeWorkspace?: Workspace;
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
		payload: { customName?: string | null; color?: string | null; type?: string | null },
	) => Promise<void>;
	dateLocale?: string;
}

const FOLDER_COLOR_OPTIONS = [
	{value: '', label: 'Default'},
	{value: 'sky', label: 'Sky'},
	{value: 'emerald', label: 'Emerald'},
	{value: 'amber', label: 'Amber'},
	{value: 'rose', label: 'Rose'},
	{value: 'violet', label: 'Violet'},
	{value: 'slate', label: 'Slate'},
] as const;

const FOLDER_TYPE_OPTIONS = [
	{value: '', label: 'Auto detect'},
	{value: 'inbox', label: 'Inbox'},
	{value: 'sent', label: 'Sent'},
	{value: 'drafts', label: 'Drafts'},
	{value: 'archive', label: 'Archive'},
	{value: 'junk', label: 'Junk'},
	{value: 'trash', label: 'Trash'},
] as const;

const ACCOUNT_COLLAPSE_STORAGE_KEY = 'lunamail.accountCollapseState.v1';
const MAIL_TABLE_COLUMNS_STORAGE_KEY = 'lunamail.mailTableColumns.v1';
const MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'lunamail.mailTableColumnWidths.v1';
const MAIL_TABLE_RESIZE_HANDLE_CLASS = 'absolute inset-y-0 right-[-8px] z-10 w-4 cursor-col-resize hover:bg-sky-400/20';
const SIDE_LIST_SPLIT_BREAKPOINT_PX = 1320;
const SIDE_LIST_SIDEBAR_WINDOW_FRACTION = 0.5;
const SIDE_LIST_MIN_SIDEBAR_WIDTH_PX = 180;
const TOP_TABLE_COMPACT_BREAKPOINT_PX = 860;

type MailTableColumnKey =
	| 'subject'
	| 'from'
	| 'recipient'
	| 'date'
	| 'read_status'
	| 'flagged'
	| 'tag'
	| 'account'
	| 'location'
	| 'size';
const DEFAULT_TABLE_COLUMNS: MailTableColumnKey[] = ['subject', 'from', 'date'];
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
	{key: 'subject', label: 'Subject'},
	{key: 'from', label: 'From'},
	{key: 'recipient', label: 'Recipient'},
	{key: 'date', label: 'Date'},
	{key: 'read_status', label: 'Read status'},
	{key: 'flagged', label: 'Starred'},
	{key: 'tag', label: 'Tag'},
	{key: 'account', label: 'Account'},
	{key: 'location', label: 'Location'},
	{key: 'size', label: 'Size'},
];

const MESSAGE_TAG_OPTIONS: Array<{ value: string; label: string; dotClass: string }> = [
	{value: 'important', label: 'Important', dotClass: 'bg-red-500'},
	{value: 'work', label: 'Work', dotClass: 'bg-blue-500'},
	{value: 'personal', label: 'Personal', dotClass: 'bg-emerald-500'},
	{value: 'todo', label: 'To Do', dotClass: 'bg-amber-500'},
	{value: 'later', label: 'Later', dotClass: 'bg-violet-500'},
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
												   onRefresh: _onRefresh,
												   canNavigateBack = false,
												   canNavigateForward = false,
												   onNavigateBack,
												   onNavigateForward,
												   onOpenCalendar,
												   onOpenContacts,
												   mailView,
												   onMailViewChange: _onMailViewChange,
												   activeWorkspace = 'mail',
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
												   onFolderSync: _onFolderSync,
												   onCreateFolder,
												   onReorderCustomFolders,
												   onDeleteFolder,
												   onUpdateFolderSettings,
												   dateLocale,
											   }) => {
	const [menu, setMenu] = React.useState<
		| { kind: 'message'; x: number; y: number; message: MessageItem }
		| { kind: 'folder'; x: number; y: number; folder: FolderItem }
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
		if (typeof window === 'undefined') return new Set();
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
	const [fromFilter, setFromFilter] = React.useState('');
	const [subjectFilter, setSubjectFilter] = React.useState('');
	const [toFilter, setToFilter] = React.useState('');
	const [accountFilter, setAccountFilter] = React.useState<string>('all');
	const [folderFilter, setFolderFilter] = React.useState<string>('all');
	const [readFilter, setReadFilter] = React.useState<'all' | 'read' | 'unread'>('all');
	const [starFilter, setStarFilter] = React.useState<'all' | 'starred' | 'unstarred'>('all');
	const [dateRangeFilter, setDateRangeFilter] = React.useState<'all' | '7d' | '30d' | '365d'>('all');
	const [minSizeKbFilter, setMinSizeKbFilter] = React.useState<string>('');
	const [maxSizeKbFilter, setMaxSizeKbFilter] = React.useState<string>('');
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
		if (typeof window === 'undefined') return DEFAULT_TABLE_COLUMNS;
		try {
			const raw = window.localStorage.getItem(MAIL_TABLE_COLUMNS_STORAGE_KEY);
			if (!raw) return DEFAULT_TABLE_COLUMNS;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return DEFAULT_TABLE_COLUMNS;
			const next = parsed.filter(
				(column) =>
					column === 'subject' ||
					column === 'from' ||
					column === 'recipient' ||
					column === 'date' ||
					column === 'read_status' ||
					column === 'flagged' ||
					column === 'tag' ||
					column === 'account' ||
					column === 'location' ||
					column === 'size',
			) as MailTableColumnKey[];
			return next.length > 0 ? next : DEFAULT_TABLE_COLUMNS;
		} catch {
			return DEFAULT_TABLE_COLUMNS;
		}
	});
	const [topListHeight, setTopListHeight] = React.useState<number>(() => {
		if (typeof window === 'undefined') return 300;
		const stored = Number(window.localStorage.getItem('lunamail.mailTopList.height') || '');
		if (!Number.isFinite(stored)) return 300;
		return Math.max(220, Math.min(640, stored));
	});
	const [tableColumnWidths, setTableColumnWidths] = React.useState<Record<MailTableColumnKey, number>>(() => {
		if (typeof window === 'undefined') return DEFAULT_TABLE_COLUMN_WIDTHS;
		try {
			const raw = window.localStorage.getItem(MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY);
			if (!raw) return DEFAULT_TABLE_COLUMN_WIDTHS;
			const parsed = JSON.parse(raw) as Partial<Record<MailTableColumnKey, number>>;
			return {
				subject: normalizeColumnWidth(parsed.subject, 'subject'),
				from: normalizeColumnWidth(parsed.from, 'from'),
				recipient: normalizeColumnWidth(parsed.recipient, 'recipient'),
				date: normalizeColumnWidth(parsed.date, 'date'),
				read_status: normalizeColumnWidth(parsed.read_status, 'read_status'),
				flagged: normalizeColumnWidth(parsed.flagged, 'flagged'),
				tag: normalizeColumnWidth(parsed.tag, 'tag'),
				account: normalizeColumnWidth(parsed.account, 'account'),
				location: normalizeColumnWidth(parsed.location, 'location'),
				size: normalizeColumnWidth(parsed.size, 'size'),
			};
		} catch {
			return DEFAULT_TABLE_COLUMN_WIDTHS;
		}
	});
	const [draggingColumn, setDraggingColumn] = React.useState<MailTableColumnKey | null>(null);
	const [dragPlaceholder, setDragPlaceholder] = React.useState<{
		column: MailTableColumnKey;
		side: 'before' | 'after';
	} | null>(null);
	const topListResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
	const tableColumnResizeRef = React.useRef<{
		column: MailTableColumnKey;
		startX: number;
		startWidth: number;
	} | null>(null);
	const {sidebarWidth, onResizeStart} = useResizableSidebar();
	const {sidebarWidth: mailListWidth, onResizeStart: onMailListResizeStart} = useResizableSidebar({
		storageKey: 'lunamail.mailList.width',
		defaultWidth: 420,
		minWidth: 300,
		maxWidth: 760,
	});
	const [viewportWidth, setViewportWidth] = React.useState<number>(() => {
		if (typeof window === 'undefined') return 1920;
		return window.innerWidth;
	});
	const [viewportHeight, setViewportHeight] = React.useState<number>(() => {
		if (typeof window === 'undefined') return 1080;
		return window.innerHeight;
	});
	const moveTargets = React.useMemo(
		() => folders.filter((f) => f.path !== selectedFolderPath).slice(0, 12),
		[folders, selectedFolderPath],
	);
	const visibleTableColumns = React.useMemo(
		() => tableColumns.filter((column) => TABLE_COLUMN_OPTIONS.some((item) => item.key === column)),
		[tableColumns],
	);
	const lastVisibleTableColumn = visibleTableColumns[visibleTableColumns.length - 1] ?? null;
	const effectiveTableColumnWidths = React.useMemo(() => {
		return Object.fromEntries(
			visibleTableColumns.map((column) => [
				column,
				tableColumnWidths[column] ?? DEFAULT_TABLE_COLUMN_WIDTHS[column],
			]),
		) as Record<MailTableColumnKey, number>;
	}, [tableColumnWidths, visibleTableColumns]);
	const tableMinWidth = React.useMemo(() => {
		const columnsWidth = visibleTableColumns.reduce(
			(sum, column) => sum + (effectiveTableColumnWidths[column] ?? DEFAULT_TABLE_COLUMN_WIDTHS[column]),
			0,
		);
		return columnsWidth + 44;
	}, [effectiveTableColumnWidths, visibleTableColumns]);
	const moveTargetsProtected = React.useMemo(
		() => moveTargets.filter((folder) => isProtectedFolder(folder)),
		[moveTargets],
	);
	const moveTargetsCustom = React.useMemo(
		() => moveTargets.filter((folder) => !isProtectedFolder(folder)),
		[moveTargets],
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
			accountFilter === 'all' &&
			folderFilter === 'all' &&
			readFilter === 'all' &&
			starFilter === 'all' &&
			dateRangeFilter === 'all' &&
			!Number.isFinite(minSizeKb) &&
			!Number.isFinite(maxSizeKb)
		) {
			return searchResults;
		}
		return searchResults.filter((message) => {
			if (normalizedFrom) {
				const fromName = (message.from_name || '').toLowerCase();
				const fromAddress = (message.from_address || '').toLowerCase();
				if (!fromName.includes(normalizedFrom) && !fromAddress.includes(normalizedFrom)) return false;
			}
			if (normalizedSubject) {
				const subject = (message.subject || '').toLowerCase();
				if (!subject.includes(normalizedSubject)) return false;
			}
			if (normalizedTo) {
				const toAddress = (message.to_address || '').toLowerCase();
				if (!toAddress.includes(normalizedTo)) return false;
			}
			if (accountFilter !== 'all' && String(message.account_id) !== accountFilter) return false;
			if (folderFilter !== 'all' && String(message.folder_id) !== folderFilter) return false;
			if (readFilter === 'read' && !message.is_read) return false;
			if (readFilter === 'unread' && Boolean(message.is_read)) return false;
			if (starFilter === 'starred' && !message.is_flagged) return false;
			if (starFilter === 'unstarred' && Boolean(message.is_flagged)) return false;
			if (dateRangeFilter !== 'all') {
				const messageTime = message.date ? Date.parse(message.date) : 0;
				if (!messageTime) return false;
				const dayMs = 24 * 60 * 60 * 1000;
				const maxAgeMs =
					dateRangeFilter === '7d' ? 7 * dayMs : dateRangeFilter === '30d' ? 30 * dayMs : 365 * dayMs;
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
		if (accountFilter === 'all') return [];
		const accountId = Number(accountFilter);
		if (!Number.isFinite(accountId)) return [];
		return accountFoldersById[accountId] ?? [];
	}, [accountFilter, accountFoldersById]);
	const createFolderAccountLabel = React.useMemo(() => {
		if (!createFolderModal) return '';
		const account = accounts.find((item) => item.id === createFolderModal.accountId) ?? null;
		return account?.display_name?.trim() || account?.email || `Account ${createFolderModal.accountId}`;
	}, [accounts, createFolderModal]);

	const isCompactSideList = mailView === 'side-list' && viewportWidth < SIDE_LIST_SPLIT_BREAKPOINT_PX;
	const isCompactTopTable = mailView === 'top-table' && viewportHeight < TOP_TABLE_COMPACT_BREAKPOINT_PX;
	const effectiveSidebarWidth = React.useMemo(() => {
		if (!isCompactSideList) return sidebarWidth;
		const maxCompactSidebarWidth = Math.max(
			SIDE_LIST_MIN_SIDEBAR_WIDTH_PX,
			Math.round(viewportWidth * SIDE_LIST_SIDEBAR_WINDOW_FRACTION),
		);
		// Respect persisted resize width, but cap sidebar to 50% in compact mode.
		return Math.max(SIDE_LIST_MIN_SIDEBAR_WIDTH_PX, Math.min(sidebarWidth, maxCompactSidebarWidth));
	}, [isCompactSideList, sidebarWidth, viewportWidth]);

	React.useEffect(() => {
		const onResize = () => {
			setViewportWidth(window.innerWidth);
			setViewportHeight(window.innerHeight);
		};
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
		};
	}, []);

	const parseDraggedMessageIds = React.useCallback((event: React.DragEvent<HTMLElement>): number[] => {
		const idsRaw = event.dataTransfer.getData('application/x-lunamail-message-ids');
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
			event.dataTransfer.getData('application/x-lunamail-message-id') || event.dataTransfer.getData('text/plain');
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
				(message) => draggedSet.has(message.id) && message.account_id === folder.account_id,
			);
			if (draggedMessages.length === 1) {
				onMessageMove(draggedMessages[0], folder.path);
			} else if (draggedMessages.length > 1) {
				onBulkMove(
					draggedMessages.map((message) => message.id),
					folder.path,
				);
			}

			setDragTargetFolder(null);
			setDraggingMessage(null);
		},
		[draggingMessage, messages, onBulkMove, onMessageMove, parseDraggedMessageIds, selectedFolderPath],
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
			window.localStorage.setItem('lunamail.mailTopList.height', String(topListHeight));
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
				const nextWidth = normalizeColumnWidth(
					resize.startWidth + (event.clientX - resize.startX),
					resize.column,
				);
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
			document.body.classList.remove('is-resizing-mail-top-list');
			document.body.classList.remove('is-resizing-mail-columns');
		};
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			document.body.classList.remove('is-resizing-mail-top-list');
			document.body.classList.remove('is-resizing-mail-columns');
		};
	}, []);

	React.useEffect(() => {
		const close = () => {
			setMenu(null);
			setAccountMenu(null);
			setTableHeadMenu(null);
		};
		window.addEventListener('click', close);
		window.addEventListener('keydown', close);
		window.addEventListener('lunamail-close-overlays', close as EventListener);
		return () => {
			window.removeEventListener('click', close);
			window.removeEventListener('keydown', close);
			window.removeEventListener('lunamail-close-overlays', close as EventListener);
		};
	}, []);

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.ctrlKey || event.metaKey;
			if (!mod || event.shiftKey || event.altKey) return;
			if (event.key.toLowerCase() !== 'f') return;
			event.preventDefault();
			setSearchModalOpen(true);
		};

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	React.useEffect(() => {
		if (!searchModalOpen) return;
		const raf = window.requestAnimationFrame(() => {
			mailSearchModalInputRef.current?.focus();
			mailSearchModalInputRef.current?.select();
		});
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			setSearchModalOpen(false);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('keydown', onKeyDown);
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
			if (menu.kind === 'message') {
				const rightSpace = window.innerWidth - (next.left + rect.width) - 8;
				setMoveSubmenuLeft(rightSpace < 236);
			} else {
				setMoveSubmenuLeft(false);
			}
		};
		const raf = window.requestAnimationFrame(updatePosition);
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
		};
	}, [menu]);

	React.useEffect(() => {
		if (!menu || menu.kind !== 'message') {
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
		window.addEventListener('resize', updateSubmenuY);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updateSubmenuY);
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
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
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
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
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
			setCreateFolderError('Folder path is required');
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
				console.error('Failed to sync account', accountId, error);
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
			column,
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
		document.body.classList.add('is-resizing-mail-columns');
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
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', column);
	}

	function onTableHeaderDrop(event: React.DragEvent, target: MailTableColumnKey): void {
		event.preventDefault();
		const dragged = draggingColumn || (event.dataTransfer.getData('text/plain') as MailTableColumnKey);
		if (!dragged) return;
		const side = dragPlaceholder?.column === target ? dragPlaceholder.side : 'before';
		if (side === 'after') {
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
			selectedMessageIds.length > 1 && selectedMessageIds.includes(message.id)
				? selectedMessageIds
				: [message.id];
		setDraggingMessage({id: message.id, accountId: message.account_id});
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/x-lunamail-message-id', String(message.id));
		event.dataTransfer.setData('application/x-lunamail-message-ids', JSON.stringify(dragIds));
		event.dataTransfer.setData('text/plain', String(message.id));

		const ghost = document.createElement('div');
		ghost.textContent =
			dragIds.length > 1 ? `Move ${dragIds.length} emails` : `Move: ${message.subject || '(No subject)'}`;
		ghost.style.position = 'fixed';
		ghost.style.top = '-1000px';
		ghost.style.left = '-1000px';
		ghost.style.padding = '6px 10px';
		ghost.style.maxWidth = '280px';
		ghost.style.borderRadius = '8px';
		ghost.style.background = 'rgba(3, 105, 161, 0.92)';
		ghost.style.color = '#fff';
		ghost.style.fontSize = '12px';
		ghost.style.fontWeight = '600';
		ghost.style.whiteSpace = 'nowrap';
		ghost.style.overflow = 'hidden';
		ghost.style.textOverflow = 'ellipsis';
		ghost.style.pointerEvents = 'none';
		ghost.style.zIndex = '9999';
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
		document.body.classList.add('is-resizing-mail-top-list');
	}

	function renderTableCell(message: MessageItem, column: MailTableColumnKey): React.ReactNode {
		const withBorder = lastVisibleTableColumn !== column;
		const baseCell = cn('relative px-3 py-2 dark:border-r-[#3a3d44]', withBorder && 'border-r border-r-slate-200');

		switch (column) {
			case 'subject':
				return (
					<td
						key={`${message.id}-subject`}
						className={cn(
							baseCell,
							message.is_read
								? 'font-medium text-slate-700 dark:text-slate-300'
								: 'font-semibold text-slate-950 dark:text-white',
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
							<span className="truncate">{message.subject || '(No subject)'}</span>
							{getThreadCount(message) > 1 && (
								<span
									className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold leading-none text-slate-700 dark:bg-[#454a55] dark:text-slate-100">
									{getThreadCount(message)}
								</span>
							)}
						</div>
					</td>
				);
			case 'from':
				return (
					<td
						key={`${message.id}-from`}
						className={cn(baseCell, 'truncate text-slate-600 dark:text-slate-300')}
					>
						{formatMessageSender(message)}
					</td>
				);
			case 'recipient':
				return (
					<td
						key={`${message.id}-recipient`}
						className={cn(baseCell, 'truncate text-slate-600 dark:text-slate-300')}
					>
						{formatMessageRecipient(message)}
					</td>
				);
			case 'date':
				return (
					<td
						key={`${message.id}-date`}
						className={cn(baseCell, 'truncate text-slate-600 dark:text-slate-300')}
					>
						{formatSystemDateTime(message.date, dateLocale)}
					</td>
				);
			case 'read_status':
				return (
					<td
						key={`${message.id}-read-status`}
						className={cn(baseCell, 'text-slate-600 dark:text-slate-300')}
					>
						{message.is_read ? 'Read' : 'Unread'}
					</td>
				);
			case 'flagged':
				return (
					<td key={`${message.id}-flagged`} className={cn(baseCell, 'text-slate-600 dark:text-slate-300')}>
						{message.is_flagged ? (
							<Star size={12} className="fill-current text-amber-500 dark:text-amber-300"/>
						) : (
							''
						)}
					</td>
				);
			case 'tag':
				return (
					<td key={`${message.id}-tag`} className={cn(baseCell, 'text-slate-600 dark:text-slate-300')}>
						{renderTagCell((message as MessageItem & { tag?: string | null }).tag ?? null)}
					</td>
				);
			case 'account':
				return (
					<td
						key={`${message.id}-account`}
						className={cn(baseCell, 'truncate text-slate-600 dark:text-slate-300')}
					>
						{formatMessageAccount(message, accounts)}
					</td>
				);
			case 'location':
				return (
					<td
						key={`${message.id}-location`}
						className={cn(baseCell, 'truncate text-slate-600 dark:text-slate-300')}
					>
						{formatMessageLocation(message, folders)}
					</td>
				);
			case 'size':
				return (
					<td key={`${message.id}-size`} className={cn(baseCell, 'text-slate-600 dark:text-slate-300')}>
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
									'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
									activeWorkspace === 'calendar' && 'bg-white/20 text-white',
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
									'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
									activeWorkspace === 'contacts' && 'bg-white/20 text-white',
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
									'mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white',
									searchModalOpen && 'bg-white/20 text-white',
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
									window.location.hash = '/settings/application';
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
									window.location.hash = '/debug';
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
									window.location.hash = '/help';
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
				statusText={syncStatusText || 'Ready'}
				statusBusy={Boolean(syncInProgress)}
				statusHintText={statusHintText || null}
				contentClassName="min-h-0 flex-1 overflow-hidden p-0"
			>
				<div className="min-h-0 flex h-full overflow-hidden">
					<AccountFolderSidebar
						hidden={Boolean(hideFolderSidebar)}
						width={effectiveSidebarWidth}
						onResizeStart={onResizeStart}
						selectedAccountId={selectedAccountId}
						accounts={accounts}
						accountFoldersById={accountFoldersById}
						selectedFolderPath={selectedFolderPath}
						syncingAccountIds={syncingAccountIds}
						localSyncingAccountIds={localSyncingAccountIds}
						collapsedAccountIds={collapsedAccountIds}
						draggingMessage={draggingMessage}
						dragTargetFolder={dragTargetFolder}
						draggingCustomFolder={draggingCustomFolder}
						customFolderDropTarget={customFolderDropTarget}
						onSetDragTargetFolder={setDragTargetFolder}
						onSetDraggingCustomFolder={setDraggingCustomFolder}
						onSetCustomFolderDropTarget={setCustomFolderDropTarget}
						onToggleAccountExpanded={toggleAccountExpanded}
						onSelectAccount={onSelectAccount}
						onSyncAccount={syncAccountNow}
						onOpenAccountSettings={(accountId) => {
							window.location.hash = `/settings/account/${accountId}`;
						}}
						onOpenAccountContextMenu={(account, x, y) => {
							setAccountMenu({x, y, account});
						}}
						onOpenCompose={(accountId) => {
							void window.electronAPI.openComposeWindow(accountId ? {accountId} : null);
						}}
						onHandleMessageDropOnFolder={handleMessageDropOnFolder}
						onOpenFolderContextMenu={(accountId, folder, x, y) => {
							if (accountId !== selectedAccountId) onSelectAccount(accountId);
							setMenu({kind: 'folder', x, y, folder});
						}}
						onOpenFolderEditor={(folder) => {
							setFolderEditor({
								folder,
								customName: folder.custom_name || folder.name,
								type: folder.type || '',
								color: folder.color || '',
							});
							setFolderEditorError(null);
						}}
						onReorderCustomFolders={onReorderCustomFolders}
						isProtectedFolder={isProtectedFolder}
						getFolderIcon={getFolderIcon}
						getFolderColorClass={getFolderColorClass}
					/>

					{mailView === 'side-list' && (
						<SideListMailPane
							mailListWidth={mailListWidth}
							isCompactSideList={isCompactSideList}
							selectedMessageIds={selectedMessageIds}
							selectedMessageId={selectedMessageId}
							messages={messages}
							draggingMessage={draggingMessage}
							hasMoreMessages={hasMoreMessages}
							loadingMoreMessages={loadingMoreMessages}
							dateLocale={dateLocale}
							onOpenSearchModal={() => setSearchModalOpen(true)}
							onBulkMarkRead={onBulkMarkRead}
							onBulkDelete={onBulkDelete}
							onClearMessageSelection={onClearMessageSelection}
							onLoadMoreMessages={onLoadMoreMessages}
							onMessageRowClick={onMessageRowClick}
							onMessageRowDragStart={onMessageRowDragStart}
							onResetDragState={() => {
								setDraggingMessage(null);
								setDragTargetFolder(null);
							}}
							onOpenMessageMenu={(message, x, y) => {
								setMenu({kind: 'message', x, y, message});
							}}
							onOpenMessageWindow={(messageId) => {
								void window.electronAPI.openMessageWindow(messageId);
							}}
							onResizeStart={onMailListResizeStart}
							getThreadCount={getThreadCount}
							formatMessageSender={formatMessageSender}
							getTagDotClass={getTagDotClass}
							getTagLabel={getTagLabel}
						>
							{children}
						</SideListMailPane>
					)}

					{mailView === 'top-table' && (
						<TopTableMailPane
							isCompactTopTable={isCompactTopTable}
							topListHeight={topListHeight}
							selectedMessageIds={selectedMessageIds}
							messages={messages}
							loadingMoreMessages={loadingMoreMessages}
							hasMoreMessages={hasMoreMessages}
							visibleTableColumns={visibleTableColumns}
							tableColumnOptions={TABLE_COLUMN_OPTIONS}
							effectiveTableColumnWidths={effectiveTableColumnWidths}
							tableMinWidth={tableMinWidth}
							mailTableResizeHandleClass={MAIL_TABLE_RESIZE_HANDLE_CLASS}
							draggingColumn={draggingColumn}
							dragPlaceholder={dragPlaceholder}
							onOpenSearchModal={() => setSearchModalOpen(true)}
							onBulkMarkRead={onBulkMarkRead}
							onBulkDelete={onBulkDelete}
							onClearMessageSelection={onClearMessageSelection}
							onLoadMoreMessages={onLoadMoreMessages}
							onOpenTableHeadMenuAt={openTableHeadMenuAt}
							onTableHeaderDragStart={onTableHeaderDragStart}
							onTableHeaderDragOver={(event, column) => {
								event.preventDefault();
								if (draggingColumn && draggingColumn !== column) {
									const rect = event.currentTarget.getBoundingClientRect();
									const side = event.clientX >= rect.left + rect.width / 2 ? 'after' : 'before';
									setDragPlaceholder((prev) => {
										if (prev?.column === column && prev.side === side) return prev;
										return {column, side};
									});
								}
							}}
							onTableHeaderDragLeave={(column) => {
								setDragPlaceholder((prev) => (prev?.column === column ? null : prev));
							}}
							onTableHeaderDrop={onTableHeaderDrop}
							onTableHeaderDragEnd={() => {
								setDraggingColumn(null);
								setDragPlaceholder(null);
							}}
							onBeginTableColumnResize={beginTableColumnResize}
							onMessageRowClick={onMessageRowClick}
							onMessageRowDragStart={onMessageRowDragStart}
							onResetMessageDragState={() => {
								setDraggingMessage(null);
								setDragTargetFolder(null);
							}}
							onOpenMessageMenu={(message, x, y) => {
								setMenu({kind: 'message', x, y, message});
							}}
							onOpenMessageWindow={(messageId) => {
								void window.electronAPI.openMessageWindow(messageId);
							}}
							renderTableCell={renderTableCell}
							onTopListResizeStart={onTopListResizeStart}
						>
							{children}
						</TopTableMailPane>
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
				<TableColumnsMenu
					ref={tableHeadMenuRef}
					options={TABLE_COLUMN_OPTIONS}
					selectedColumns={tableColumns}
					position={tableHeadMenuPosition}
					ready={tableHeadMenuReady}
					onToggleColumn={toggleTableColumn}
					onResetColumns={resetTableColumns}
				/>
			)}

			<MailSearchModal
				open={searchModalOpen}
				onClose={() => setSearchModalOpen(false)}
				inputRef={mailSearchModalInputRef}
				searchQuery={searchQuery}
				onSearchQueryChange={onSearchQueryChange}
				accountFilter={accountFilter}
				onAccountFilterChange={(value) => {
					setAccountFilter(value);
					setFolderFilter('all');
				}}
				accounts={accounts}
				advancedSearchOpen={advancedSearchOpen}
				onToggleAdvancedSearch={() => setAdvancedSearchOpen((prev) => !prev)}
				fromFilter={fromFilter}
				onFromFilterChange={setFromFilter}
				subjectFilter={subjectFilter}
				onSubjectFilterChange={setSubjectFilter}
				toFilter={toFilter}
				onToFilterChange={setToFilter}
				folderFilter={folderFilter}
				onFolderFilterChange={setFolderFilter}
				searchFoldersForSelectedAccount={searchFoldersForSelectedAccount}
				readFilter={readFilter}
				onReadFilterChange={setReadFilter}
				starFilter={starFilter}
				onStarFilterChange={setStarFilter}
				dateRangeFilter={dateRangeFilter}
				onDateRangeFilterChange={setDateRangeFilter}
				minSizeKbFilter={minSizeKbFilter}
				onMinSizeKbFilterChange={setMinSizeKbFilter}
				maxSizeKbFilter={maxSizeKbFilter}
				onMaxSizeKbFilterChange={setMaxSizeKbFilter}
				onResetFilters={() => {
					setFromFilter('');
					setSubjectFilter('');
					setToFilter('');
					setAccountFilter('all');
					setFolderFilter('all');
					setReadFilter('all');
					setStarFilter('all');
					setDateRangeFilter('all');
					setMinSizeKbFilter('');
					setMaxSizeKbFilter('');
				}}
				isGlobalSearchActive={isGlobalSearchActive}
				searchLoading={searchLoading}
				filteredSearchMessages={filteredSearchMessages}
				accountFoldersById={accountFoldersById}
				onSelectMessage={onSelectMessage}
				dateLocale={dateLocale}
				formatAccountSearchLabel={formatAccountSearchLabel}
				formatMessageSender={formatMessageSender}
			/>

			<MessageFolderContextMenu
				menu={menu}
				menuRef={contextMenuRef}
				menuPosition={menuPosition}
				menuReady={menuReady}
				moveToTriggerRef={moveToTriggerRef}
				moveSubmenuLeft={moveSubmenuLeft}
				moveSubmenuOffsetY={moveSubmenuOffsetY}
				moveTargetsProtected={moveTargetsProtected}
				moveTargetsCustom={moveTargetsCustom}
				messageTagOptions={MESSAGE_TAG_OPTIONS}
				selectedAccountId={selectedAccountId}
				getTagDotClass={getTagDotClass}
				getFolderColorClass={getFolderColorClass}
				getFolderIcon={getFolderIcon}
				isProtectedFolder={isProtectedFolder}
				onClose={() => setMenu(null)}
				onOpenMessageWindow={(messageId) => {
					void window.electronAPI.openMessageWindow(messageId);
				}}
				onMessageMarkReadToggle={onMessageMarkReadToggle}
				onMessageFlagToggle={onMessageFlagToggle}
				onMessageTagChange={onMessageTagChange}
				onMessageArchive={onMessageArchive}
				onMessageMove={onMessageMove}
				onMessageDelete={onMessageDelete}
				onSelectAccount={onSelectAccount}
				onSelectFolder={onSelectFolder}
				onOpenFolderSettings={(editor) => {
					setFolderEditor(editor);
					setFolderEditorError(null);
				}}
				onSyncAccount={syncAccountNow}
				onDeleteFolder={onDeleteFolder}
			/>

			<AccountContextMenu
				accountMenu={accountMenu}
				menuRef={accountMenuRef}
				position={accountMenuPosition}
				ready={accountMenuReady}
				onClose={() => setAccountMenu(null)}
				onOpenCreateFolder={(payload) => {
					setCreateFolderModal(payload);
					setCreateFolderError(null);
				}}
				onOpenAccountSettings={(accountId) => {
					window.location.hash = `/settings/account/${accountId}`;
				}}
			/>

			<FolderEditModal
				editor={folderEditor}
				saving={folderEditorSaving}
				error={folderEditorError}
				typeOptions={FOLDER_TYPE_OPTIONS.map((option) => ({...option}))}
				colorOptions={FOLDER_COLOR_OPTIONS.map((option) => ({...option}))}
				getFolderSwatchClass={getFolderSwatchClass}
				onClose={() => setFolderEditor(null)}
				onSave={() => void saveFolderSettings()}
				onCustomNameChange={(value) => setFolderEditor((prev) => (prev ? {...prev, customName: value} : prev))}
				onTypeChange={(value) => setFolderEditor((prev) => (prev ? {...prev, type: value} : prev))}
				onColorChange={(value) => setFolderEditor((prev) => (prev ? {...prev, color: value} : prev))}
			/>

			<CreateFolderModal
				state={createFolderModal}
				accountLabel={createFolderAccountLabel}
				saving={createFolderSaving}
				error={createFolderError}
				typeOptions={FOLDER_TYPE_OPTIONS.map((option) => ({...option}))}
				colorOptions={FOLDER_COLOR_OPTIONS.map((option) => ({...option}))}
				getFolderSwatchClass={getFolderSwatchClass}
				onClose={() => setCreateFolderModal(null)}
				onCreate={() => void createFolderFromModal()}
				onFolderPathChange={(value) =>
					setCreateFolderModal((prev) => (prev ? {...prev, folderPath: value} : prev))
				}
				onTypeChange={(value) => setCreateFolderModal((prev) => (prev ? {...prev, type: value} : prev))}
				onColorChange={(value) => setCreateFolderModal((prev) => (prev ? {...prev, color: value} : prev))}
			/>
		</>
	);
};

function renderTagCell(tag: string | null): React.ReactNode {
	const label = getTagLabel(tag);
	if (!label) return '';
	return (
		<span
			className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 dark:border-[#4a4d55] dark:text-slate-200">
			<span className={cn('inline-flex h-2 w-2 shrink-0 rounded-full', getTagDotClass(tag))}/>
			<span className="truncate">{label}</span>
		</span>
	);
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
