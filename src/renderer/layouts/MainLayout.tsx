import React from 'react';
import {Star} from 'lucide-react';
import type {FolderItem, MessageItem, PublicAccount} from '@/preload';
import type {MailView} from '@/shared/ipcTypes';
import AccountContextMenu from '@renderer/components/mail/AccountContextMenu';
import AccountFolderSidebar from '@renderer/components/mail/AccountFolderSidebar';
import CreateFolderModal from '@renderer/components/mail/CreateFolderModal';
import FolderEditModal from '@renderer/components/mail/FolderEditModal';
import MainLayoutMenubar from '@renderer/components/mail/MainLayoutMenubar';
import MailSearchModal from '@renderer/components/mail/MailSearchModal';
import MessageFolderContextMenu from '@renderer/components/mail/MessageFolderContextMenu';
import SideListMailPane from '@renderer/components/mail/SideListMailPane';
import TableColumnsMenu from '@renderer/components/mail/TableColumnsMenu';
import TopTableMailPane from '@renderer/components/mail/TopTableMailPane';
import {isProtectedFolder} from '@renderer/features/mail/folders';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import {
	formatAccountSearchLabel,
	formatMessageAccount,
	formatMessageLocation,
	formatMessageRecipient,
	formatMessageSender,
	formatMessageSize,
	getThreadCount,
} from '@renderer/lib/mailMessageFormat';
import {getFolderColorClass, getFolderIcon, getFolderSwatchClass} from '@renderer/lib/mail/folderPresentation';
import {
	DEFAULT_TABLE_COLUMN_WIDTHS,
	DEFAULT_TABLE_COLUMNS,
	type MailTableColumnKey,
	normalizeColumnWidth,
	TABLE_COLUMN_OPTIONS,
} from '@renderer/lib/mail/tableConfig';
import {getTagDotClass, getTagLabel} from '@renderer/lib/mail/tagPresentation';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {cn} from '@renderer/lib/utils';
import type {Workspace} from '@renderer/lib/workspace';
import WorkspaceLayout from './WorkspaceLayout';

interface MainLayoutProps {
	children: React.ReactNode;
	accounts: PublicAccount[];
	selectedAccountId: number | null;
	accountFoldersById: Record<number, FolderItem[]>;
	onSelectAccount: (id: number) => void;
	onReorderAccounts: (orderedAccountIds: number[]) => void;
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
    {value: 'cyan', label: 'Cyan'},
    {value: 'lime', label: 'Lime'},
    {value: 'indigo', label: 'Indigo'},
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

const ACCOUNT_COLLAPSE_STORAGE_KEY = 'llamamail.accountCollapseState.v1';
const MAIL_TABLE_COLUMNS_STORAGE_KEY = 'llamamail.mailTableColumns.v1';
const MAIL_TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'llamamail.mailTableColumnWidths.v1';
const MAIL_TABLE_RESIZE_HANDLE_CLASS = 'mail-table-resize-hover absolute inset-y-0 right-[-8px] z-10 w-4 cursor-col-resize';
const SIDE_LIST_SPLIT_BREAKPOINT_PX = 1320;
const SIDE_LIST_SIDEBAR_WINDOW_FRACTION = 0.5;
const SIDE_LIST_MIN_SIDEBAR_WIDTH_PX = 180;
const TOP_TABLE_COMPACT_BREAKPOINT_PX = 860;

const MESSAGE_TAG_OPTIONS: Array<{ value: string; label: string; dotClass: string }> = [
	{value: 'important', label: 'Important', dotClass: 'tag-dot-important'},
	{value: 'work', label: 'Work', dotClass: 'tag-dot-work'},
	{value: 'personal', label: 'Personal', dotClass: 'tag-dot-personal'},
	{value: 'todo', label: 'To Do', dotClass: 'tag-dot-todo'},
	{value: 'later', label: 'Later', dotClass: 'tag-dot-later'},
];

const MainLayout: React.FC<MainLayoutProps> = ({
												   children,
												   accounts,
												   selectedAccountId,
												   accountFoldersById,
												   onSelectAccount,
												   onReorderAccounts,
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
		const stored = Number(window.localStorage.getItem('llamamail.mailTopList.height') || '');
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
	const topListResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
	const tableColumnResizeRef = React.useRef<{
		column: MailTableColumnKey;
		startX: number;
		startWidth: number;
	} | null>(null);
	const {sidebarWidth, onResizeStart} = useResizableSidebar();
	const {sidebarWidth: mailListWidth, onResizeStart: onMailListResizeStart} = useResizableSidebar({
		storageKey: 'llamamail.mailList.width',
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
		const baseResults = searchResults.length > 0 ? searchResults : messages;
		const normalizedFrom = advancedSearchOpen ? fromFilter.trim().toLowerCase() : '';
		const normalizedSubject = advancedSearchOpen ? subjectFilter.trim().toLowerCase() : '';
		const normalizedTo = advancedSearchOpen ? toFilter.trim().toLowerCase() : '';
		const effectiveReadFilter = advancedSearchOpen ? readFilter : 'all';
		const effectiveStarFilter = advancedSearchOpen ? starFilter : 'all';
		const effectiveDateRangeFilter = advancedSearchOpen ? dateRangeFilter : 'all';
		const minSizeKb = advancedSearchOpen ? Number(minSizeKbFilter) : Number.NaN;
		const maxSizeKb = advancedSearchOpen ? Number(maxSizeKbFilter) : Number.NaN;
		const nowMs = Date.now();
		if (
			!normalizedFrom &&
			!normalizedSubject &&
			!normalizedTo &&
			accountFilter === 'all' &&
			folderFilter === 'all' &&
			effectiveReadFilter === 'all' &&
			effectiveStarFilter === 'all' &&
			effectiveDateRangeFilter === 'all' &&
			!Number.isFinite(minSizeKb) &&
			!Number.isFinite(maxSizeKb)
		) {
			return baseResults;
		}
		return baseResults.filter((message) => {
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
			if (effectiveReadFilter === 'read' && !message.is_read) return false;
			if (effectiveReadFilter === 'unread' && Boolean(message.is_read)) return false;
			if (effectiveStarFilter === 'starred' && !message.is_flagged) return false;
			if (effectiveStarFilter === 'unstarred' && Boolean(message.is_flagged)) return false;
			if (effectiveDateRangeFilter !== 'all') {
				const messageTime = message.date ? Date.parse(message.date) : 0;
				if (!messageTime) return false;
				const dayMs = 24 * 60 * 60 * 1000;
				const maxAgeMs =
					effectiveDateRangeFilter === '7d'
						? 7 * dayMs
						: effectiveDateRangeFilter === '30d'
							? 30 * dayMs
							: 365 * dayMs;
				if (nowMs - messageTime > maxAgeMs) return false;
			}
			const sizeKb = (Number(message.size) || 0) / 1024;
			if (Number.isFinite(minSizeKb) && sizeKb < minSizeKb) return false;
			if (Number.isFinite(maxSizeKb) && sizeKb > maxSizeKb) return false;
			return true;
		});
	}, [
		searchResults,
		messages,
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
		advancedSearchOpen,
	]);

	React.useEffect(() => {
		if (accountFilter === 'all') return;
		const accountExists = accounts.some((account) => String(account.id) === accountFilter);
		if (accountExists) return;
		setAccountFilter('all');
		setFolderFilter('all');
	}, [accountFilter, accounts]);

	React.useEffect(() => {
		if (accountFilter === 'all' || folderFilter === 'all') return;
		const accountId = Number(accountFilter);
		if (!Number.isFinite(accountId)) {
			setFolderFilter('all');
			return;
		}
		const folderExists = (accountFoldersById[accountId] ?? []).some((folder) => String(folder.id) === folderFilter);
		if (!folderExists) setFolderFilter('all');
	}, [accountFilter, folderFilter, accountFoldersById]);

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
	const closeSearchModal = React.useCallback(() => {
		setSearchModalOpen(false);
		onSearchQueryChange('');
	}, [onSearchQueryChange]);
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

	const handleMessageDropOnFolder = React.useCallback(
		(folder: FolderItem, draggedIds: number[], dragAccountId: number) => {
			if (dragAccountId !== folder.account_id) return;
			if (folder.path === selectedFolderPath) return;

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
		},
		[messages, onBulkMove, onMessageMove, selectedFolderPath],
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
			window.localStorage.setItem('llamamail.mailTopList.height', String(topListHeight));
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
		window.addEventListener('llamamail-close-overlays', close as EventListener);
		return () => {
			window.removeEventListener('click', close);
			window.removeEventListener('keydown', close);
			window.removeEventListener('llamamail-close-overlays', close as EventListener);
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
		// Reset advanced filters on open so stale criteria cannot silently hide all matches.
		setAdvancedSearchOpen(false);
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
		const raf = window.requestAnimationFrame(() => {
			mailSearchModalInputRef.current?.focus();
			mailSearchModalInputRef.current?.select();
		});
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			closeSearchModal();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [searchModalOpen, closeSearchModal]);

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
		void ipcClient
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

	function reorderVisibleTableColumns(orderedVisibleColumns: MailTableColumnKey[]): void {
		setTableColumns((prev) => {
			const visibleSet = new Set(orderedVisibleColumns);
			let visibleIndex = 0;
			return prev.map((column) => {
				if (!visibleSet.has(column)) return column;
				const next = orderedVisibleColumns[visibleIndex] ?? column;
				visibleIndex += 1;
				return next;
			});
		});
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

	function onTopListResizeStart(event: React.MouseEvent<HTMLDivElement>): void {
		topListResizeRef.current = {
			startY: event.clientY,
			startHeight: topListHeight,
		};
		document.body.classList.add('is-resizing-mail-top-list');
	}

	function renderTableCell(message: MessageItem, column: MailTableColumnKey): React.ReactNode {
		const withBorder = lastVisibleTableColumn !== column;
		const baseCell = cn('relative px-3 py-2', withBorder && 'border-r ui-border-default');

		switch (column) {
			case 'subject':
				return (
					<td
						key={`${message.id}-subject`}
						className={cn(
							baseCell,
							message.is_read
								? 'mail-list-subject-read font-medium'
								: 'mail-list-subject-unread font-semibold',
						)}
					>
						<div className="flex min-w-0 items-center gap-2">
							{!message.is_read && (
								<span
									className="mail-list-unread-dot inline-flex h-2 w-2 shrink-0 rounded-full"
									title="Unread"
									aria-label="Unread"
								/>
							)}
							<span className="truncate">{message.subject || '(No subject)'}</span>
							{getThreadCount(message) > 1 && (
								<span
									className="mail-list-thread-count inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none">
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
						className={cn(baseCell, 'ui-text-secondary truncate')}
					>
						{formatMessageSender(message)}
					</td>
				);
			case 'recipient':
				return (
					<td
						key={`${message.id}-recipient`}
						className={cn(baseCell, 'ui-text-secondary truncate')}
					>
						{formatMessageRecipient(message)}
					</td>
				);
			case 'date':
				return (
					<td
						key={`${message.id}-date`}
						className={cn(baseCell, 'ui-text-secondary truncate')}
					>
						{formatSystemDateTime(message.date, dateLocale)}
					</td>
				);
			case 'read_status':
				return (
					<td
						key={`${message.id}-read-status`}
						className={cn(baseCell, 'ui-text-secondary')}
					>
						{message.is_read ? 'Read' : 'Unread'}
					</td>
				);
			case 'flagged':
				return (
					<td key={`${message.id}-flagged`} className={cn(baseCell, 'ui-text-secondary')}>
						{message.is_flagged ? (
							<Star size={12} className="mail-list-starred fill-current"/>
						) : (
							''
						)}
					</td>
				);
			case 'tag':
				return (
					<td key={`${message.id}-tag`} className={cn(baseCell, 'ui-text-secondary')}>
						{renderTagCell((message as MessageItem & { tag?: string | null }).tag ?? null)}
					</td>
				);
			case 'account':
				return (
					<td
						key={`${message.id}-account`}
						className={cn(baseCell, 'ui-text-secondary truncate')}
					>
						{formatMessageAccount(message, accounts)}
					</td>
				);
			case 'location':
				return (
					<td
						key={`${message.id}-location`}
						className={cn(baseCell, 'ui-text-secondary truncate')}
					>
						{formatMessageLocation(message, folders)}
					</td>
				);
			case 'size':
				return (
					<td key={`${message.id}-size`} className={cn(baseCell, 'ui-text-secondary')}>
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
				className="ui-surface-content"
				showMenuBar={!hideHeader}
				menubar={
					<MainLayoutMenubar
						canNavigateBack={canNavigateBack}
						canNavigateForward={canNavigateForward}
						onNavigateBack={onNavigateBack}
						onNavigateForward={onNavigateForward}
						activeWorkspace={activeWorkspace}
						searchModalOpen={searchModalOpen}
						onOpenSearch={() => setSearchModalOpen(true)}
						onOpenCalendar={onOpenCalendar}
						onOpenContacts={onOpenContacts}
					/>
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
						onToggleAccountExpanded={toggleAccountExpanded}
						onSelectAccount={onSelectAccount}
						onReorderAccounts={onReorderAccounts}
						onSyncAccount={syncAccountNow}
						onOpenAccountSettings={(accountId) => {
							window.location.hash = `/settings/account/${accountId}`;
						}}
						onOpenAccountContextMenu={(account, x, y) => {
							setAccountMenu({x, y, account});
						}}
						onOpenCompose={(accountId) => {
							void ipcClient.openComposeWindow(accountId ? {accountId} : undefined);
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
							hasMoreMessages={hasMoreMessages}
							loadingMoreMessages={loadingMoreMessages}
							dateLocale={dateLocale}
							onOpenSearchModal={() => setSearchModalOpen(true)}
							onBulkMarkRead={onBulkMarkRead}
							onBulkDelete={onBulkDelete}
							onClearMessageSelection={onClearMessageSelection}
							onLoadMoreMessages={onLoadMoreMessages}
							onMessageRowClick={onMessageRowClick}
							onOpenMessageMenu={(message, x, y) => {
								setMenu({kind: 'message', x, y, message});
							}}
							onOpenMessageWindow={(messageId) => {
								void ipcClient.openMessageWindow(messageId);
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
								onOpenSearchModal={() => setSearchModalOpen(true)}
								onBulkMarkRead={onBulkMarkRead}
								onBulkDelete={onBulkDelete}
								onClearMessageSelection={onClearMessageSelection}
								onLoadMoreMessages={onLoadMoreMessages}
								onOpenTableHeadMenuAt={openTableHeadMenuAt}
								onReorderVisibleTableColumns={reorderVisibleTableColumns}
								onBeginTableColumnResize={beginTableColumnResize}
								onMessageRowClick={onMessageRowClick}
							onOpenMessageMenu={(message, x, y) => {
								setMenu({kind: 'message', x, y, message});
							}}
							onOpenMessageWindow={(messageId) => {
								void ipcClient.openMessageWindow(messageId);
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
				onClose={closeSearchModal}
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
					void ipcClient.openMessageWindow(messageId);
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
			className="mail-list-tag-chip inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]">
			<span className={cn('inline-flex h-2 w-2 shrink-0 rounded-full', getTagDotClass(tag))}/>
			<span className="truncate">{label}</span>
		</span>
	);
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
