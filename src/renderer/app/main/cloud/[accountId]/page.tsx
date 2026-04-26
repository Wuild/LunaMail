import {Button} from '@llamamail/ui/button';
import {Modal} from '@llamamail/ui/modal';
import {ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator} from '@llamamail/ui/contextmenu';
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
	ChevronRight,
	Cloud,
	Download,
	Eye,
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
	X,
} from '@llamamail/ui/icon';
import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import type {
	AddCloudAccountPayload,
	CloudItem,
	CloudProvider,
	CloudStorageUsage,
	PublicCloudAccount,
	UpdateCloudAccountPayload,
} from '@preload';
import {formatBytes} from '@renderer/lib/format';
import {formatSystemDateTime} from '@renderer/lib/dateTime';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {useNotification} from '@renderer/hooks/useNotification';
import {useResizableSidebar} from '@renderer/hooks/useResizableSidebar';
import {ipcClient} from '@renderer/lib/ipcClient';
import {emitReconnectRequired} from '@renderer/lib/reconnectPrompt';
import {
	type AddCloudAccountDraft,
	areCloudItemsEqual,
	buildCloudRoute,
	buildRootTrail,
	clearPersistedDeletedFolderCaches,
	CLOUD_TABLE_COLUMN_OPTIONS,
	type CloudTableColumnKey,
	constrainToViewport,
	Field,
	type EditCloudAccountDraft,
	formatStorageUsage,
	formatStorageUsagePercent,
	invalidateDeletedFolderCaches,
	type NavigationEntry,
	ONEDRIVE_SCOPE_OPTIONS,
	type OneDriveDriveScope,
	parseNavigationTrail,
	providerLabels,
	pruneCollapsedCloudAccountIds,
	readCloudTableColumns,
	readCollapsedCloudAccountIds,
	readPersistedFolderCache,
	readPersistedStorageUsage,
	renderCloudItemIcon,
	resolveOneDriveScope,
	serializeNavigationTrail,
	writeCloudTableColumns,
	writeCollapsedCloudAccountIds,
	writePersistedFolderCache,
	writePersistedStorageUsage,
} from '../cloudFilesHelpers';
import CloudSortableHeaderCell from '../CloudSortableHeaderCell';
import {useI18n} from '@llamamail/app/i18n/renderer';

type CloudTableSortDirection = 'asc' | 'desc';

function isOAuthCloudProvider(provider: CloudProvider): provider is 'google-drive' | 'onedrive' {
	return provider === 'google-drive' || provider === 'onedrive';
}

function isCloudAuthErrorMessage(message: string): boolean {
	const normalized = String(message || '').toLowerCase();
	return (
		normalized.includes('(401)') ||
		normalized.includes('invalid_grant') ||
		normalized.includes('access token is missing') ||
		normalized.includes('sign in again') ||
		normalized.includes('session expired') ||
		normalized.includes('token has been expired or revoked') ||
		normalized.includes('please reconnect this account')
	);
}

function normalizeCloudSecret(secret: string): string {
	return String(secret || '');
}

function resolveCloudBaseUrlForSave(baseUrl: string): string | null {
	const configured = String(baseUrl || '').trim();
	if (configured) return configured;
	return null;
}

export default function CloudFilesPage() {
	const {t} = useI18n();
	const navigate = useNavigate();
	const {create: createNotification, update: updateNotification} = useNotification();
	const {sidebarWidth, onResizeStart} = useResizableSidebar({
		defaultWidth: 300,
		minWidth: 260,
		maxWidth: 420,
		storageKey: 'llamamail.cloud.sidebar.width',
	});
	const [searchParams] = useSearchParams();
	const {accountId: routeAccountIdParam} = useParams<{accountId?: string}>();
	const [accounts, setAccounts] = useState<PublicCloudAccount[]>([]);
	const [items, setItems] = useState<CloudItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [showAddModal, setShowAddModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [adding, setAdding] = useState(false);
	const [savingEdit, setSavingEdit] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [mutating, setMutating] = useState(false);
	const [relinkingAccountId, setRelinkingAccountId] = useState<number | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	const [shareModal, setShareModal] = useState<{name: string; url: string} | null>(null);
	const [filesCache, setFilesCache] = useState<Record<string, CloudItem[]>>({});
	const filesCacheRef = useRef<Record<string, CloudItem[]>>({});
	const [pendingFolderToken, setPendingFolderToken] = useState<string | null>(null);
	const [activeFileActionId, setActiveFileActionId] = useState<string | null>(null);
	const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
	const [refreshingAccountIds, setRefreshingAccountIds] = useState<Set<number>>(new Set());
	const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<number>>(() => readCollapsedCloudAccountIds());
	const [pausedOAuthAccountIds, setPausedOAuthAccountIds] = useState<Set<number>>(new Set());
	const [rowMenu, setRowMenu] = useState<{x: number; y: number; item: CloudItem} | null>(null);
	const [accountMenu, setAccountMenu] = useState<{x: number; y: number; account: PublicCloudAccount} | null>(null);
	const [storageUsage, setStorageUsage] = useState<CloudStorageUsage | null>(null);
	const [storageLoading, setStorageLoading] = useState(false);
	const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
	const [detailsItemId, setDetailsItemId] = useState<string | null>(null);
	const [selectionBox, setSelectionBox] = useState<{
		left: number;
		top: number;
		width: number;
		height: number;
	} | null>(null);
	const [dragOverTargetToken, setDragOverTargetToken] = useState<string | null>(null);
	const [movingItems, setMovingItems] = useState(false);
	const rowMenuRef = useRef<HTMLDivElement | null>(null);
	const accountMenuRef = useRef<HTMLDivElement | null>(null);
	const tableHeadMenuRef = useRef<HTMLDivElement | null>(null);
	const tableViewportRef = useRef<HTMLDivElement | null>(null);
	const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
	const lastSelectedItemIdRef = useRef<string | null>(null);
	const boxSelectionOriginRef = useRef<{x: number; y: number} | null>(null);
	const draggedItemIdRef = useRef<string | null>(null);
	const [rowMenuPosition, setRowMenuPosition] = useState<{left: number; top: number}>({
		left: 0,
		top: 0,
	});
	const [rowMenuReady, setRowMenuReady] = useState(false);
	const [accountMenuPosition, setAccountMenuPosition] = useState<{left: number; top: number}>({
		left: 0,
		top: 0,
	});
	const [accountMenuReady, setAccountMenuReady] = useState(false);
	const [tableHeadMenu, setTableHeadMenu] = useState<{x: number; y: number} | null>(null);
	const [tableHeadMenuPosition, setTableHeadMenuPosition] = useState<{left: number; top: number}>({
		left: 0,
		top: 0,
	});
	const [tableHeadMenuReady, setTableHeadMenuReady] = useState(false);
	const [tableColumns, setTableColumns] = useState<CloudTableColumnKey[]>(() => readCloudTableColumns());
	const [tableSort, setTableSort] = useState<{column: CloudTableColumnKey; direction: CloudTableSortDirection}>({
		column: 'name',
		direction: 'asc',
	});
	const [draggingColumn, setDraggingColumn] = useState<CloudTableColumnKey | null>(null);
	const [dragPlaceholder, setDragPlaceholder] = useState<{
		column: CloudTableColumnKey;
		side: 'before' | 'after';
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
	const [draft, setDraft] = useState<AddCloudAccountDraft>({
		provider: 'nextcloud',
		name: '',
		base_url: '',
		user: '',
		secret: '',
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
			if (typeof off === 'function') off();
		};
	}, []);

	const selectedAccountId = useMemo(() => {
		const raw = Number(routeAccountIdParam);
		return Number.isFinite(raw) && raw > 0 ? raw : null;
	}, [routeAccountIdParam]);

	const selectedAccount = useMemo(
		() => accounts.find((account) => account.id === selectedAccountId) ?? null,
		[accounts, selectedAccountId],
	);
	const nav = useMemo(
		() => parseNavigationTrail(searchParams.get('trail'), selectedAccount?.provider ?? 'webdav'),
		[searchParams, selectedAccount?.provider],
	);
	const currentNavEntry = nav[nav.length - 1];
	const currentCacheKey = useMemo(
		() => (selectedAccount && currentNavEntry ? `${selectedAccount.id}:${currentNavEntry.token}` : null),
		[currentNavEntry, selectedAccount],
	);
	const visibleTableColumns = useMemo(
		() => CLOUD_TABLE_COLUMN_OPTIONS.filter((column) => tableColumns.includes(column.key)),
		[tableColumns],
	);
	const tableMinWidth = useMemo(
		() => visibleTableColumns.reduce((sum, column) => sum + columnWidths[column.key], 0) + 56,
		[columnWidths, visibleTableColumns],
	);
	const currentCachedItems = useMemo(() => {
		if (!selectedAccount || !currentNavEntry || !currentCacheKey) return null;
		return filesCache[currentCacheKey] || readPersistedFolderCache(selectedAccount.id, currentNavEntry.token);
	}, [currentCacheKey, currentNavEntry, filesCache, selectedAccount]);
	const queueOAuthReconnectPrompt = useCallback((account: PublicCloudAccount, reason: string): void => {
		if (!isOAuthCloudProvider(account.provider)) return;
		setPausedOAuthAccountIds((prev) => {
			if (prev.has(account.id)) return prev;
			const next = new Set(prev);
			next.add(account.id);
			return next;
		});
		emitReconnectRequired({
			kind: 'cloud',
			accountId: account.id,
			reason,
		});
		setStatus(reason);
	}, []);
	const sortedItems = useMemo(() => {
		const list = [...items];
		const directionFactor = tableSort.direction === 'asc' ? 1 : -1;
		list.sort((a, b) => {
			if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
			let comparison;
			switch (tableSort.column) {
				case 'name':
					comparison = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
					break;
				case 'type':
					comparison = Number(a.isFolder) - Number(b.isFolder);
					break;
				case 'size':
					comparison = (a.size ?? -1) - (b.size ?? -1);
					break;
				case 'modified':
					comparison = (Date.parse(a.modifiedAt || '') || 0) - (Date.parse(b.modifiedAt || '') || 0);
					break;
				case 'created':
					comparison = (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0);
					break;
				default:
					comparison = 0;
			}
			if (comparison === 0) {
				comparison = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
			}
			return comparison * directionFactor;
		});
		return list;
	}, [items, tableSort]);
	const selectedItems = useMemo(
		() => sortedItems.filter((item) => selectedItemIds.has(item.id)),
		[selectedItemIds, sortedItems],
	);
	const detailsItem = useMemo(() => items.find((item) => item.id === detailsItemId) ?? null, [detailsItemId, items]);

	useEffect(() => {
		if (!accounts.length) {
			setItems([]);
			return;
		}
		const fallbackAccount = selectedAccount ?? accounts[0];
		if (!fallbackAccount) return;
		if (selectedAccount && searchParams.get('trail')) return;
		navigate(buildCloudRoute(fallbackAccount.id, buildRootTrail(fallbackAccount.provider)), {replace: true});
	}, [accounts, navigate, searchParams, selectedAccount]);

	useEffect(() => {
		setCollapsedAccountIds((prev) => {
			if (accounts.length === 0) return prev;
			const next = pruneCollapsedCloudAccountIds(
				prev,
				accounts.map((account) => account.id),
			);
			return next.size !== prev.size ? next : prev;
		});
	}, [accounts]);

	useEffect(() => {
		writeCollapsedCloudAccountIds(collapsedAccountIds);
	}, [collapsedAccountIds]);

	useEffect(() => {
		const validIds = new Set(accounts.map((account) => account.id));
		setPausedOAuthAccountIds((prev) => {
			const next = new Set<number>();
			for (const id of prev) {
				if (validIds.has(id)) next.add(id);
			}
			return next.size === prev.size ? prev : next;
		});
	}, [accounts]);

	useEffect(() => {
		if (!rowMenu) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (rowMenuRef.current && target && rowMenuRef.current.contains(target)) return;
			setRowMenu(null);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setRowMenu(null);
		};
		window.addEventListener('mousedown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('mousedown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
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
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
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
			if (event.key === 'Escape') setAccountMenu(null);
		};
		window.addEventListener('mousedown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('mousedown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
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
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
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
			if (event.key === 'Escape') setTableHeadMenu(null);
		};
		window.addEventListener('mousedown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('mousedown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
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
		window.addEventListener('resize', updatePosition);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updatePosition);
		};
	}, [tableHeadMenu]);

	useEffect(() => {
		const resetDragState = () => {
			setDragOverTargetToken(null);
			draggedItemIdRef.current = null;
		};
		window.addEventListener('dragend', resetDragState);
		window.addEventListener('drop', resetDragState);
		return () => {
			window.removeEventListener('dragend', resetDragState);
			window.removeEventListener('drop', resetDragState);
		};
	}, []);

	useEffect(() => {
		writeCloudTableColumns(tableColumns);
	}, [tableColumns]);

	useEffect(() => {
		setSelectedItemIds(new Set());
		lastSelectedItemIdRef.current = null;
		setDetailsItemId(null);
	}, [selectedAccount?.id, currentNavEntry?.token]);

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
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	}, []);

	useEffect(() => {
		if (!selectedAccount) {
			setStorageUsage(null);
			setStorageLoading(false);
			return;
		}
		if (pausedOAuthAccountIds.has(selectedAccount.id)) {
			setStorageUsage(null);
			setStorageLoading(false);
			return;
		}
		let active = true;
		const cachedUsage = readPersistedStorageUsage(selectedAccount.id);
		setStorageUsage(cachedUsage);
		setStorageLoading(!cachedUsage);
		const loadUsage = (markLoading: boolean) => {
			if (!active) return;
			if (markLoading) setStorageLoading(true);
			void ipcClient
				.getCloudStorageUsage(selectedAccount.id)
				.then((usage) => {
					if (!active) return;
					setStorageUsage(usage);
					writePersistedStorageUsage(selectedAccount.id, usage);
				})
				.catch((error: any) => {
					if (!active) return;
					const message = String(error?.message || error || t('cloud_page.error.unknown'));
					if (isOAuthCloudProvider(selectedAccount.provider) && isCloudAuthErrorMessage(message)) {
						queueOAuthReconnectPrompt(
							selectedAccount,
							t('cloud_page.status.storage_check_paused', {message}),
						);
					}
					setStorageUsage(null);
				})
				.finally(() => {
					if (!active) return;
					if (markLoading) setStorageLoading(false);
				});
		};
		loadUsage(!cachedUsage);
		const timer = window.setInterval(() => loadUsage(false), 30000);
		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [pausedOAuthAccountIds, queueOAuthReconnectPrompt, reloadKey, selectedAccount]);

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
		if (pausedOAuthAccountIds.has(selectedAccount.id)) {
			setLoading(false);
			setStatus(t('cloud_page.status.sync_paused_reconnect', {name: selectedAccount.name}));
			return;
		}
		let active = true;
		setLoading(true);
		setStatus(t('cloud_page.status.loading_cloud_files'));
		void ipcClient
			.listCloudItems(selectedAccount.id, currentNavEntry.token)
			.then((result) => {
				if (!active) return;
				setItems(result.items);
				setFilesCache((prev) => ({...prev, [key]: result.items}));
				writePersistedFolderCache(selectedAccount.id, currentNavEntry.token, result.items);
				setStatus(t('cloud_page.status.loaded_items', {count: result.items.length}));
				setPendingFolderToken(null);
			})
			.catch((error: any) => {
				if (!active) return;
				if (!persistedCached) setItems([]);
				const message = String(error?.message || error || t('cloud_page.error.unknown'));
				if (selectedAccount && isOAuthCloudProvider(selectedAccount.provider) && isCloudAuthErrorMessage(message)) {
					queueOAuthReconnectPrompt(selectedAccount, t('cloud_page.status.load_failed_paused', {message}));
				} else {
					setStatus(t('cloud_page.status.load_failed', {message}));
				}
				setPendingFolderToken(null);
			})
			.finally(() => {
				if (!active) return;
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [currentNavEntry, pausedOAuthAccountIds, queueOAuthReconnectPrompt, reloadKey, selectedAccount]);

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
		if (!accounts.length) return;
		if (pendingFolderToken) return;
		let active = true;
		let inFlight = false;

		const listAccountTokens = (account: PublicCloudAccount): string[] => {
			const tokens = new Set<string>();
			const root = buildRootTrail(account.provider);
			if (root[0]?.token) tokens.add(root[0].token);
			const prefix = `${account.id}:`;
			for (const key of Object.keys(filesCacheRef.current)) {
				if (!key.startsWith(prefix)) continue;
				const token = key.slice(prefix.length);
				if (!token) continue;
				tokens.add(token);
			}
			if (selectedAccount?.id === account.id && currentNavEntry?.token) {
				tokens.add(currentNavEntry.token);
			}
			return Array.from(tokens);
		};

		const syncAccountFiles = async (account: PublicCloudAccount): Promise<void> => {
			if (!active) return;
			if (pausedOAuthAccountIds.has(account.id)) return;
			const tokens = listAccountTokens(account);
			for (const token of tokens) {
				if (!active) return;
				try {
					const result = await ipcClient.listCloudItems(account.id, token);
					if (!active) return;
					const cacheKey = `${account.id}:${token}`;
					setFilesCache((prev) => {
						const previous = prev[cacheKey] || [];
						if (areCloudItemsEqual(previous, result.items)) return prev;
						return {...prev, [cacheKey]: result.items};
					});
					writePersistedFolderCache(account.id, token, result.items);
					const isCurrentFolder = selectedAccount?.id === account.id && currentNavEntry?.token === token;
					if (isCurrentFolder) {
						setItems((prev) => (areCloudItemsEqual(prev, result.items) ? prev : result.items));
					}
				} catch {
					// Background cloud sync is best-effort.
				}
			}
		};

		const runBackgroundSync = () => {
			if (!active || inFlight) return;
			inFlight = true;
			void Promise.all(accounts.map((account) => syncAccountFiles(account))).finally(() => {
				inFlight = false;
			});
		};

		runBackgroundSync();
		const timer = window.setInterval(runBackgroundSync, 45000);
		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [accounts, currentNavEntry?.token, pausedOAuthAccountIds, pendingFolderToken, selectedAccount?.id]);

	function buildCloudLink(accountId: number, trail: NavigationEntry[]): string {
		return buildCloudRoute(accountId, trail);
	}
	function buildFolderLink(item: CloudItem): string {
		if (!selectedAccount) return '/cloud';
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
	function onTableHeaderDragStart(column: CloudTableColumnKey): void {
		if (resizeRef.current) return;
		setDraggingColumn(column);
	}
	function isTableColumnMoveNoop(
		dragged: CloudTableColumnKey,
		target: CloudTableColumnKey,
		side: 'before' | 'after',
	): boolean {
		if (dragged === target) return true;
		const order = tableColumns;
		const sourceIndex = order.indexOf(dragged);
		const targetIndex = order.indexOf(target);
		if (sourceIndex < 0 || targetIndex < 0) return true;
		const rawInsertionIndex = targetIndex + (side === 'after' ? 1 : 0);
		const adjustedInsertionIndex = sourceIndex < rawInsertionIndex ? rawInsertionIndex - 1 : rawInsertionIndex;
		return adjustedInsertionIndex === sourceIndex;
	}
	function onTableHeaderDrop(
		target: CloudTableColumnKey,
		side: 'before' | 'after',
		draggedFromDrop?: CloudTableColumnKey,
	): void {
		const dragged = draggedFromDrop || draggingColumn;
		if (!dragged) return;
		if (isTableColumnMoveNoop(dragged, target, side)) {
			setDragPlaceholder(null);
			setDraggingColumn(null);
			return;
		}
		if (side === 'after') {
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
					direction: prev.direction === 'asc' ? 'desc' : 'asc',
				};
			}
			return {column, direction: 'asc'};
		});
	}
	function onColumnResizeStart(key: CloudTableColumnKey, event: React.MouseEvent) {
		event.preventDefault();
		resizeRef.current = {
			key,
			startX: event.clientX,
			startWidth: columnWidths[key],
		};
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

	function registerRowRef(itemId: string, node: HTMLTableRowElement | null): void {
		if (node) {
			rowRefs.current.set(itemId, node);
			return;
		}
		rowRefs.current.delete(itemId);
	}

	function selectSingleItem(itemId: string): void {
		setSelectedItemIds(new Set([itemId]));
		lastSelectedItemIdRef.current = itemId;
	}

	function toggleItemSelection(itemId: string): void {
		setSelectedItemIds((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
		lastSelectedItemIdRef.current = itemId;
	}

	function selectItemRange(itemId: string): void {
		const firstSelectedInViewOrder = sortedItems.find((entry) => selectedItemIds.has(entry.id))?.id ?? null;
		const anchorId = firstSelectedInViewOrder ?? lastSelectedItemIdRef.current;
		if (!anchorId) {
			selectSingleItem(itemId);
			return;
		}
		const from = sortedItems.findIndex((entry) => entry.id === anchorId);
		const to = sortedItems.findIndex((entry) => entry.id === itemId);
		if (from < 0 || to < 0) {
			selectSingleItem(itemId);
			return;
		}
		const [start, end] = from <= to ? [from, to] : [to, from];
		const rangeIds = sortedItems.slice(start, end + 1).map((entry) => entry.id);
		setSelectedItemIds(new Set(rangeIds));
	}

	function onRowClick(item: CloudItem, event: React.MouseEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('button,a,input,textarea,select,[role="button"]')) return;
		if (event.shiftKey) {
			selectItemRange(item.id);
			setDetailsItemId(item.isFolder ? null : item.id);
			return;
		}
		if (event.metaKey || event.ctrlKey) {
			toggleItemSelection(item.id);
			setDetailsItemId(item.isFolder ? null : item.id);
			return;
		}
		selectSingleItem(item.id);
		setDetailsItemId(item.isFolder ? null : item.id);
	}

	function onFileNameClick(item: CloudItem, event: React.MouseEvent): void {
		event.stopPropagation();
		if (event.shiftKey) {
			selectItemRange(item.id);
		} else if (event.metaKey || event.ctrlKey) {
			toggleItemSelection(item.id);
		} else {
			selectSingleItem(item.id);
		}
		setDetailsItemId(item.id);
	}

	function onTablePointerDown(event: React.MouseEvent<HTMLDivElement>): void {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('button,a,input,textarea,select,[role="button"]')) return;
		if (target?.closest('tr,td,th')) return;
		const viewport = tableViewportRef.current;
		if (!viewport) return;
		event.preventDefault();
		const viewportRect = viewport.getBoundingClientRect();
		const originX = event.clientX - viewportRect.left + viewport.scrollLeft;
		const originY = event.clientY - viewportRect.top + viewport.scrollTop;
		boxSelectionOriginRef.current = {x: originX, y: originY};
		setSelectionBox({left: originX, top: originY, width: 0, height: 0});
		setSelectedItemIds(new Set());
		lastSelectedItemIdRef.current = null;
		setDetailsItemId(null);

		const onPointerMove = (moveEvent: MouseEvent) => {
			const origin = boxSelectionOriginRef.current;
			if (!origin) return;
			const currentX = moveEvent.clientX - viewportRect.left + viewport.scrollLeft;
			const currentY = moveEvent.clientY - viewportRect.top + viewport.scrollTop;
			const left = Math.min(origin.x, currentX);
			const top = Math.min(origin.y, currentY);
			const width = Math.abs(currentX - origin.x);
			const height = Math.abs(currentY - origin.y);
			const right = left + width;
			const bottom = top + height;
			setSelectionBox({left, top, width, height});
			const nextSelected = new Set<string>();
			for (const [itemId, row] of rowRefs.current.entries()) {
				const rowRect = row.getBoundingClientRect();
				const rowLeft = rowRect.left - viewportRect.left + viewport.scrollLeft;
				const rowTop = rowRect.top - viewportRect.top + viewport.scrollTop;
				const rowRight = rowLeft + rowRect.width;
				const rowBottom = rowTop + rowRect.height;
				const intersects = !(rowRight < left || rowLeft > right || rowBottom < top || rowTop > bottom);
				if (intersects) nextSelected.add(itemId);
			}
			setSelectedItemIds(nextSelected);
		};

		const onPointerUp = () => {
			boxSelectionOriginRef.current = null;
			setSelectionBox(null);
			window.removeEventListener('mousemove', onPointerMove);
			window.removeEventListener('mouseup', onPointerUp);
		};

		window.addEventListener('mousemove', onPointerMove);
		window.addEventListener('mouseup', onPointerUp);
	}

	async function moveSelectedItemsTo(targetParentToken: string | null): Promise<void> {
		if (!selectedAccount) return;
		if (movingItems || mutating || loading) return;
		const fallbackDraggedId = draggedItemIdRef.current;
		const fallbackDraggedItem =
			fallbackDraggedId ? sortedItems.find((item) => item.id === fallbackDraggedId) ?? null : null;
		const sourceItems = selectedItems.length > 0 ? selectedItems : fallbackDraggedItem ? [fallbackDraggedItem] : [];
		if (sourceItems.length === 0) return;
		const movableItems = sourceItems.filter((item) => item.path !== targetParentToken);
		if (movableItems.length === 0) return;
		setMovingItems(true);
		setMutating(true);
		setDragOverTargetToken(null);
		setStatus(t('cloud_page.status.moving_items', {count: movableItems.length}));
		try {
			await Promise.all(
				movableItems.map((item) => ipcClient.moveCloudItem(selectedAccount.id, item.path, targetParentToken)),
			);
			const movedIds = new Set(movableItems.map((item) => item.id));
			setItems((prev) => prev.filter((item) => !movedIds.has(item.id)));
			if (currentCacheKey) {
				setFilesCache((prev) => {
					const current = prev[currentCacheKey] || [];
					const filtered = current.filter((item) => !movedIds.has(item.id));
					return {...prev, [currentCacheKey]: filtered};
				});
			}
			if (selectedAccount && currentNavEntry) {
				const filtered = items.filter((item) => !movedIds.has(item.id));
				writePersistedFolderCache(selectedAccount.id, currentNavEntry.token, filtered);
			}
			setSelectedItemIds(new Set());
			lastSelectedItemIdRef.current = null;
			setDetailsItemId((prev) => (prev && movedIds.has(prev) ? null : prev));
			setStatus(t('cloud_page.status.moved_items', {count: movableItems.length}));
			setReloadKey((value) => value + 1);
		} catch (error: any) {
			setStatus(t('cloud_page.status.move_failed', {error: error?.message || String(error)}));
		} finally {
			setMutating(false);
			setMovingItems(false);
		}
	}

	function onRowDragStart(item: CloudItem, event: React.DragEvent<HTMLTableRowElement>): void {
		draggedItemIdRef.current = item.id;
		if (!selectedItemIds.has(item.id)) {
			setSelectedItemIds(new Set([item.id]));
			lastSelectedItemIdRef.current = item.id;
		}
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', item.path);
	}

	function onDragOverTarget(targetParentToken: string | null, event: React.DragEvent<HTMLElement>): void {
		if (!selectedAccount) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		setDragOverTargetToken(targetParentToken ?? '__root__');
	}

	function onDragLeaveTarget(targetParentToken: string | null): void {
		const token = targetParentToken ?? '__root__';
		setDragOverTargetToken((prev) => (prev === token ? null : prev));
	}

	function onDropTarget(targetParentToken: string | null, event: React.DragEvent<HTMLElement>): void {
		event.preventDefault();
		setDragOverTargetToken(null);
		void moveSelectedItemsTo(targetParentToken);
	}

	async function onCreateFolder(folderName: string): Promise<void> {
		if (!selectedAccount || mutating) return;
		const current = currentNavEntry;
		const trimmed = String(folderName || '').trim();
		if (!trimmed) return;
		setMutating(true);
		setStatus(t('cloud_page.status.creating_folder'));
		try {
			await ipcClient.createCloudFolder(selectedAccount.id, current?.token ?? null, trimmed);
			setStatus(t('cloud_page.status.folder_created', {name: trimmed}));
			setReloadKey((value) => value + 1);
		} catch (error: any) {
			setStatus(t('cloud_page.status.create_folder_failed', {error: error?.message || String(error)}));
		} finally {
			setMutating(false);
		}
	}

	async function onUploadFiles(): Promise<void> {
		if (!selectedAccount || mutating) return;
		const current = currentNavEntry;
		setMutating(true);
		setStatus(t('cloud_page.status.uploading_files'));
		try {
			const result = await ipcClient.uploadCloudFiles(selectedAccount.id, current?.token ?? null);
			if (!result.uploaded) {
				setStatus(t('cloud_page.status.upload_cancelled'));
				return;
			}
			setStatus(t('cloud_page.status.uploaded_files', {count: result.uploaded}));
			setReloadKey((value) => value + 1);
		} catch (error: any) {
			setStatus(t('cloud_page.status.upload_failed', {error: error?.message || String(error)}));
		} finally {
			setMutating(false);
		}
	}

	async function onDeleteItem(item: CloudItem): Promise<void> {
		if (!selectedAccount || mutating || deletingItemId !== null) return;
		const label = item.isFolder ? t('cloud_page.table.folder_lc') : t('cloud_page.table.file_lc');
		if (!window.confirm(t('cloud_page.confirm.delete_item', {label, name: item.name}))) return;
		const totalDeleteSteps = 4;
		setDeletingItemId(item.id);
		setRowMenu(null);
		const notificationId = createNotification({
			title: t('cloud_page.notification.deleting_title', {name: item.name}),
			message: t('cloud_page.notification.removing_item'),
			progress: Math.round((1 / totalDeleteSteps) * 100),
			busy: true,
			tone: 'info',
			autoCloseMs: null,
		});
		setStatus(t('cloud_page.status.deleting_label', {label}));
		try {
			const accountId = selectedAccount.id;
			const folderToken = currentNavEntry?.token ?? 'root';
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
			updateNotification(notificationId, {
				message: t('cloud_page.notification.sending_delete_request'),
				progress: Math.round((2 / totalDeleteSteps) * 100),
			});
			await ipcClient.deleteCloudItem(selectedAccount.id, item.path);
			let stillExists;
			updateNotification(notificationId, {
				message: t('cloud_page.notification.checking_remote_status'),
				progress: Math.round((3 / totalDeleteSteps) * 100),
			});
			try {
				const statusResult = await ipcClient.getCloudItemStatus(accountId, item.path);
				stillExists = statusResult.exists;
			} catch {
				stillExists = false;
			}
			updateNotification(notificationId, {
				message: t('cloud_page.notification.refreshing_folder'),
				progress: Math.round((4 / totalDeleteSteps) * 100),
			});
			const refreshed = await ipcClient.listCloudItems(accountId, folderToken);
			setItems(refreshed.items);
			const refreshedCacheKey = `${accountId}:${folderToken}`;
			setFilesCache((prev) => ({...prev, [refreshedCacheKey]: refreshed.items}));
			writePersistedFolderCache(accountId, folderToken, refreshed.items);
			setStatus(stillExists
				? t('cloud_page.status.delete_requested_syncing_name', {name: item.name})
				: t('cloud_page.status.item_deleted', {name: item.name}));
			setDetailsItemId((prev) => (prev === item.id ? null : prev));
			updateNotification(notificationId, {
				message: stillExists
					? t('cloud_page.notification.delete_requested_syncing')
					: t('cloud_page.notification.delete_complete'),
				busy: false,
				progress: 100,
				tone: stillExists ? 'info' : 'success',
				autoCloseMs: 3500,
			});
			setReloadKey((value) => value + 1);
		} catch (error: any) {
			setStatus(t('cloud_page.status.delete_failed', {error: error?.message || String(error)}));
			updateNotification(notificationId, {
				message: t('cloud_page.status.delete_failed', {error: error?.message || String(error)}),
				busy: false,
				progress: 100,
				tone: 'danger',
				autoCloseMs: 7000,
			});
			setReloadKey((value) => value + 1);
		} finally {
			setDeletingItemId(null);
		}
	}

	async function onViewItem(item: CloudItem): Promise<void> {
		if (!selectedAccount || item.isFolder || mutating) return;
		const actionItemId = item.id;
		setActiveFileActionId(actionItemId);
		setRowMenu(null);
		setStatus(t('cloud_page.status.opening_label', {label: item.name}));
		let finished = false;
		const clearActiveAction = () => {
			setActiveFileActionId((prev) => (prev === actionItemId ? null : prev));
		};
		const fallbackTimer = window.setTimeout(() => {
			if (finished) return;
			clearActiveAction();
			setStatus(t('cloud_page.status.opening_external_app', {name: item.name}));
		}, 4500);
		try {
			await ipcClient.openCloudItem(selectedAccount.id, item.path, item.name, 'open');
			finished = true;
			setStatus(t('cloud_page.status.opened_name', {name: item.name}));
		} catch (error: any) {
			finished = true;
			setStatus(t('cloud_page.status.open_failed', {error: error?.message || String(error)}));
		} finally {
			window.clearTimeout(fallbackTimer);
			clearActiveAction();
		}
	}

	async function onDownloadItem(item: CloudItem): Promise<void> {
		if (!selectedAccount || item.isFolder || mutating) return;
		setActiveFileActionId(item.id);
		setRowMenu(null);
		setStatus(t('cloud_page.status.downloading_name', {name: item.name}));
		try {
			const result = await ipcClient.openCloudItem(selectedAccount.id, item.path, item.name, 'save');
			if (!result.ok || result.action === 'cancelled') {
				setStatus(t('cloud_page.status.download_cancelled'));
				return;
			}
			setStatus(t('cloud_page.status.saved_name', {name: item.name}));
		} catch (error: any) {
			setStatus(t('cloud_page.status.download_failed', {error: error?.message || String(error)}));
		} finally {
			setActiveFileActionId(null);
		}
	}

	async function onShareItem(item: CloudItem): Promise<void> {
		if (!selectedAccount) return;
		setRowMenu(null);
		setStatus(t('cloud_page.status.generating_share_link', {name: item.name}));
		try {
			const result = await ipcClient.createCloudShareLink(selectedAccount.id, item.path);
			setShareModal({name: item.name, url: result.url});
			setStatus(t('cloud_page.status.share_link_ready'));
		} catch (error: any) {
			setStatus(t('cloud_page.status.share_failed', {error: error?.message || String(error)}));
		}
	}

	async function onAddCloudAccount(): Promise<void> {
		if (adding) return;
		setAdding(true);
		setStatus(t('cloud_page.status.adding_account'));
		try {
			if (draft.provider === 'google-drive' || draft.provider === 'onedrive') {
				const providerLabel =
					draft.provider === 'google-drive' ? t('cloud_page.provider.google_drive') : t('cloud_page.provider.onedrive');
				setStatus(t('cloud_page.status.opening_oauth', {provider: providerLabel}));
				const linked = await ipcClient.linkCloudOAuth(draft.provider, {});
				setShowAddModal(false);
				setDraft({
					provider: 'nextcloud',
					name: '',
					base_url: '',
					user: '',
					secret: '',
				});
				setStatus(t('cloud_page.status.account_connected', {provider: providerLabel, name: linked.name}));
				return;
			}

			const payload: AddCloudAccountPayload = {
				provider: draft.provider,
				name: draft.name.trim(),
				base_url: resolveCloudBaseUrlForSave(draft.base_url || ''),
				user: (draft.user || '').trim() || null,
				secret: normalizeCloudSecret(draft.secret),
			};
			await ipcClient.addCloudAccount(payload);
			setShowAddModal(false);
			setDraft({
				provider: 'nextcloud',
				name: '',
				base_url: '',
				user: '',
				secret: '',
			});
			setStatus(t('cloud_page.status.account_added'));
		} catch (error: any) {
			setStatus(t('cloud_page.status.add_failed', {error: error?.message || String(error)}));
		} finally {
			setAdding(false);
		}
	}

	function navigateToAccount(account: PublicCloudAccount, forceReload = false): void {
		const rootTrail = buildRootTrail(account.provider);
		navigate(buildCloudRoute(account.id, rootTrail));
		if (forceReload) {
			setPendingFolderToken(rootTrail[rootTrail.length - 1]?.token || null);
			setItems([]);
			setLoading(true);
			setReloadKey((value) => value + 1);
		}
	}

	async function onDeleteAccount(account: PublicCloudAccount): Promise<void> {
		if (deleting) return;
		if (!window.confirm(t('cloud_page.confirm.delete_account', {name: account.name}))) return;
		setDeleting(true);
		setAccountMenu(null);
		setStatus(t('cloud_page.status.deleting_account'));
		try {
			await ipcClient.deleteCloudAccount(account.id);
			setStatus(t('cloud_page.status.account_deleted'));
		} catch (error: any) {
			setStatus(t('cloud_page.status.delete_failed', {error: error?.message || String(error)}));
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
		setStatus(t('cloud_page.status.refreshing_name', {name: account.name}));
		navigateToAccount(account, true);
	}

	async function onRelinkAccount(account: PublicCloudAccount): Promise<boolean> {
		if (!isOAuthCloudProvider(account.provider) || relinkingAccountId !== null) return false;
		setRelinkingAccountId(account.id);
		setAccountMenu(null);
		const providerLabel = providerLabels[account.provider];
		setStatus(t('cloud_page.status.opening_signin', {provider: providerLabel}));
		try {
			await ipcClient.relinkCloudOAuth(account.id, {});
			setStatus(t('cloud_page.status.account_reconnected', {provider: providerLabel}));
			setPausedOAuthAccountIds((prev) => {
				if (!prev.has(account.id)) return prev;
				const next = new Set(prev);
				next.delete(account.id);
				return next;
			});
			if (selectedAccount?.id === account.id) {
				navigateToAccount(account, true);
			}
			return true;
		} catch (error: any) {
			setStatus(t('cloud_page.status.reconnect_failed', {error: error?.message || String(error)}));
			return false;
		} finally {
			setRelinkingAccountId(null);
		}
	}

	function onOpenAccountSettings(account: PublicCloudAccount): void {
		setAccountMenu(null);
		setEditDraft({
			id: account.id,
			provider: account.provider,
			name: account.name,
			base_url: account.base_url || '',
			user: account.user || '',
			secret: '',
		});
		setShowEditModal(true);
	}

	async function onSaveEditedAccount(): Promise<void> {
		if (!editDraft || savingEdit) return;
		setSavingEdit(true);
		setStatus(t('cloud_page.status.saving_account'));
		try {
			const payload: UpdateCloudAccountPayload = {
				name: editDraft.name.trim(),
				base_url: resolveCloudBaseUrlForSave(editDraft.base_url || ''),
				user: (editDraft.user || '').trim() || null,
			};
			const nextSecret = normalizeCloudSecret(editDraft.secret).trim();
			if (nextSecret) {
				payload.secret = nextSecret;
			}
			await ipcClient.updateCloudAccount(editDraft.id, payload);
			setShowEditModal(false);
			setEditDraft(null);
			if (selectedAccount?.id === editDraft.id) {
				setReloadKey((value) => value + 1);
			}
			setStatus(t('cloud_page.status.account_updated'));
		} catch (error: any) {
			setStatus(t('cloud_page.status.update_failed', {error: error?.message || String(error)}));
		} finally {
			setSavingEdit(false);
		}
	}

	function onOpenAccountInNewWindow(account: PublicCloudAccount): void {
		const url = `${window.location.origin}${window.location.pathname}#${buildCloudLink(account.id, buildRootTrail(account.provider))}`;
		window.open(url, '_blank', 'noopener,noreferrer');
		setAccountMenu(null);
	}

	const requiresWebDavBaseUrlFields = draft.provider === 'nextcloud' || draft.provider === 'webdav';
	const requiresWebDavAuthFields = draft.provider === 'nextcloud' || draft.provider === 'webdav';
	const isOAuthProviderDraft = draft.provider === 'google-drive' || draft.provider === 'onedrive';
	const editRequiresWebDavBaseUrlFields = editDraft?.provider === 'nextcloud' || editDraft?.provider === 'webdav';
	const editRequiresWebDavAuthFields = editDraft?.provider === 'nextcloud' || editDraft?.provider === 'webdav';
	const secretLabel = t('cloud_page.field.secret_password');
	const canSubmitAddDraft = isOAuthProviderDraft
		? true
		: draft.name.trim().length > 0 && draft.secret.trim().length > 0;

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
		navigate(buildCloudRoute(accountId, [{token: option.token, label: option.label}]));
		setPendingFolderToken(option.token);
		setItems([]);
		setStatus(t('cloud_page.status.opening_label', {label: option.label}));
		setLoading(true);
	}

	const menubar = (
		<div className="flex min-w-0 items-center justify-between gap-3">
			<div className="min-w-0">
				<h1 className="ui-text-primary truncate text-sm font-semibold">
					{selectedAccount ? selectedAccount.name : t('cloud_page.title')}
				</h1>
				<p className="ui-text-muted truncate text-xs">
					{selectedAccount
						? `${storageLoading ? t('cloud_page.status.loading_storage') : formatStorageUsage(storageUsage)}`
						: t('cloud_page.empty.add_account_to_browse')}
				</p>
				{selectedAccount && (
					<div className="progress-track mt-1 h-1.5 w-52 overflow-hidden rounded-full">
						<div
							className="progress-fill-info h-full rounded-full transition-all"
							style={{width: `${storageLoading ? 20 : formatStorageUsagePercent(storageUsage)}%`}}
						/>
					</div>
				)}
			</div>
			<div className="flex items-center gap-2">
				{selectedItemIds.size > 0 && (
					<>
						<span className="ui-text-muted text-xs">{t('cloud_page.selection.selected_count', {count: selectedItemIds.size})}</span>
						<Button
							type="button"
							variant="ghost"
							className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm"
							onClick={() => {
								setSelectedItemIds(new Set());
								lastSelectedItemIdRef.current = null;
							}}
						>
							{t('cloud_page.action.clear')}
						</Button>
					</>
				)}
				<Button
					type="button"
					variant="outline"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm disabled:opacity-50"
					disabled={!selectedAccount || loading || mutating}
					onClick={() => {
						setNewFolderName('');
						setShowCreateFolderModal(true);
					}}
				>
					<FolderPlus size={14} />
					{t('cloud_page.action.new_folder')}
				</Button>
				<Button
					type="button"
					variant="outline"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm disabled:opacity-50"
					disabled={!selectedAccount || loading || mutating}
					onClick={() => void onUploadFiles()}
				>
					<Upload size={14} />
					{t('cloud_page.action.upload')}
				</Button>
			</div>
		</div>
	);

	const sidebar = (
		<aside className="sidebar flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-between border-b ui-border-default p-3">
				<h2 className="ui-text-primary text-sm font-semibold">{t('cloud_page.accounts.title')}</h2>
				<Button
					type="button"
					variant="outline"
					className="inline-flex h-8 w-8 items-center justify-center rounded-md"
					onClick={() => setShowAddModal(true)}
					title={t('cloud_page.accounts.add')}
				>
					<Plus size={15} />
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-2">
				{accounts.length === 0 && <p className="ui-text-muted px-2 py-3 text-sm">{t('cloud_page.accounts.none')}</p>}
				{accounts.map((account) => {
					const active = account.id === selectedAccountId;
					const rootTrail = buildRootTrail(account.provider);
					const isOneDrive = account.provider === 'onedrive';
					const isExpanded = !collapsedAccountIds.has(account.id);
					const selectedScope = active ? resolveOneDriveScope(nav) : 'home';
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
								className={`account-row-shell group flex items-center gap-1 rounded-lg px-1 py-0.5 ${
									active ? 'is-active' : ''
								}`}
							>
								<Link
									to={buildCloudLink(account.id, rootTrail)}
									className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm no-underline transition-colors ${
										active ? 'font-semibold ui-text-primary' : 'ui-text-secondary'
									}`}
									style={{color: 'inherit'}}
								>
									<span
										className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
											account.provider === 'onedrive'
												? 'chip-info'
												: account.provider === 'nextcloud'
													? 'chip-success'
													: 'chip-border'
										}`}
										aria-hidden
									>
										{account.provider === 'onedrive' ? (
											<Cloud size={14} />
										) : account.provider === 'nextcloud' ? (
											<Globe size={14} />
										) : (
											<HardDrive size={14} />
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate">{account.name}</span>
										<span className="ui-text-muted block truncate text-[11px] font-normal">
											{providerLabels[account.provider]}
										</span>
									</span>
								</Link>
								<div className="ml-auto flex items-center gap-1 pr-0">
									<div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
										<Button
											type="button"
											variant="ghost"
											className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
											title={t('cloud_page.accounts.refresh')}
											disabled={refreshingAccountIds.has(account.id)}
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												void onRefreshAccount(account);
											}}
										>
											<RefreshCw
												size={13}
												className={
													refreshingAccountIds.has(account.id) ? 'animate-spin' : undefined
												}
											/>
										</Button>
										<Button
											type="button"
											variant="ghost"
											className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
											title={t('cloud_page.accounts.actions')}
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												setAccountMenu({x: event.clientX, y: event.clientY, account});
											}}
										>
											<Settings size={13} />
										</Button>
									</div>
									{isOneDrive && (
										<Button
											type="button"
											variant="ghost"
											className="ui-surface-hover ui-hover-text-primary rounded p-1 ui-text-muted transition-colors"
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												toggleAccountExpanded(account.id);
											}}
											title={isExpanded ? t('cloud_page.accounts.collapse_drives') : t('cloud_page.accounts.expand_drives')}
											aria-label={isExpanded ? t('cloud_page.accounts.collapse_drives') : t('cloud_page.accounts.expand_drives')}
											aria-expanded={isExpanded}
										>
											<ChevronRight
												size={14}
												className={
													isExpanded
														? 'rotate-90 transition-transform'
														: 'transition-transform'
												}
											/>
										</Button>
									)}
								</div>
							</div>
							{isOneDrive && isExpanded && (
								<div className="tree-guide relative space-y-1 pl-7 before:absolute before:bottom-2 before:left-3.5 before:top-1 before:w-px before:content-['']">
									{ONEDRIVE_SCOPE_OPTIONS.map((scope) => (
										<Link
											key={`${account.id}-${scope.value}`}
											to={buildCloudLink(account.id, [{token: scope.token, label: scope.label}])}
											onClick={() => navigateToOneDriveScope(account.id, scope.value)}
											className={`group relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-xs no-underline transition-colors ${
												active && selectedScope === scope.value
													? 'event-selection ui-text-primary'
													: 'ui-text-secondary ui-surface-hover'
											}`}
											style={{color: 'inherit'}}
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
				showMenuBar={false}
				sidebar={sidebar}
				sidebarWidth={sidebarWidth}
				onSidebarResizeStart={onResizeStart}
				statusText={status || (loading ? t('cloud_page.status.loading') : t('cloud_page.status.ready'))}
				statusBusy={loading || mutating || movingItems || activeFileActionId !== null || deletingItemId !== null}
				showStatusBar
				showFooter={false}
				contentClassName="ui-surface-content min-h-0 flex flex-1 flex-col overflow-hidden p-0"
			>
				<div className="surface-muted ui-text-muted border-b ui-border-default px-4 py-3">{menubar}</div>
				<div className="surface-muted ui-text-muted border-b ui-border-default px-4 py-2 text-xs">
					{nav.map((entry, index) => (
						<Link
							key={`${entry.token}-${index}`}
							to={
								selectedAccount ? buildCloudLink(selectedAccount.id, nav.slice(0, index + 1)) : '/cloud'
							}
							className={`mr-1 rounded px-1.5 py-0.5 ${
								dragOverTargetToken === entry.token ? 'chip-info' : 'ui-surface-hover'
							}`}
							onDragOver={(event) => onDragOverTarget(entry.token, event)}
							onDragLeave={() => onDragLeaveTarget(entry.token)}
							onDrop={(event) => onDropTarget(entry.token, event)}
						>
							{entry.label}
							{index < nav.length - 1 ? ' /' : ''}
						</Link>
						))}
				</div>
				<div className="min-h-0 flex flex-1 overflow-hidden">
					<div className="min-h-0 flex-1 overflow-hidden">
					{!selectedAccount && (
						<div className="ui-text-muted flex h-full min-h-60 items-center justify-center text-sm">
							{t('cloud_page.empty.add_account_to_browse')}
						</div>
					)}
					{selectedAccount && loading && Boolean(pendingFolderToken) && (
						<div className="ui-text-muted flex h-full min-h-60 flex-col items-center justify-center gap-2 text-sm">
							<Loader2 size={18} className="animate-spin" />
							<span>{t('cloud_page.status.loading_folder')}</span>
						</div>
					)}
					{selectedAccount && !pendingFolderToken && items.length === 0 && !loading && (
						<div className="ui-text-muted flex h-full min-h-60 flex-col items-center justify-center gap-3 text-sm">
							<span>{t('cloud_page.empty.no_files')}</span>
							<Link
								to={buildCloudLink(
									selectedAccount.id,
									nav.length > 1 ? nav.slice(0, -1) : buildRootTrail(selectedAccount.provider),
								)}
								onClick={() => {
									setPendingFolderToken('__parent__');
									setItems([]);
									setStatus(t('cloud_page.status.opening_folder'));
									setLoading(true);
								}}
								className="link-primary rounded px-2 py-1"
							>
								{t('cloud_page.action.go_back')}
							</Link>
						</div>
					)}
						{selectedAccount && !pendingFolderToken && items.length > 0 && (
						<div className="h-full min-h-0 border-t ui-border-default ui-surface-card">
							<div
								ref={tableViewportRef}
								className="relative h-full min-h-0 overflow-auto"
								onMouseDown={onTablePointerDown}
							>
								{selectionBox && (
									<div
										className="pointer-events-none absolute z-20 border border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)]"
										style={{
											left: selectionBox.left,
											top: selectionBox.top,
											width: selectionBox.width,
											height: selectionBox.height,
										}}
									/>
								)}
								<table
									key={`cloud-table-${visibleTableColumns.map((column) => column.key).join('|')}`}
									className="table-fixed border-collapse text-sm"
									style={{width: `max(${tableMinWidth}px, 100%)`, minWidth: '100%'}}
								>
									<colgroup>
										{visibleTableColumns.map((column) => (
											<col key={column.key} style={{width: `${columnWidths[column.key]}px`}} />
										))}
										<col style={{width: '44px'}} />
									</colgroup>
									<thead
										className="surface-muted sticky top-0 z-10 border-b ui-border-default shadow-[inset_0_-1px_0_0_var(--border-default)]"
										onContextMenu={(event) => {
											event.preventDefault();
											openTableHeadMenuAt(event.clientX, event.clientY);
										}}
									>
										<tr className="group text-left text-xs uppercase tracking-wide ui-text-secondary">
											{visibleTableColumns.map((column, index) => (
												<CloudSortableHeaderCell
													key={column.key}
													columnKey={column.key}
													label={column.label}
													index={index}
													visibleColumnCount={visibleTableColumns.length}
													dragPlaceholder={dragPlaceholder}
													tableSort={tableSort}
													onToggleSort={toggleTableSort}
													onColumnResizeStart={onColumnResizeStart}
													onDragStart={onTableHeaderDragStart}
													onHover={(hoverColumn, side, draggedFromHover) => {
														const dragged = draggedFromHover || draggingColumn;
														if (!dragged) return;
														if (isTableColumnMoveNoop(dragged, hoverColumn, side)) {
															setDragPlaceholder(null);
															return;
														}
														setDragPlaceholder((prev) => {
															if (prev?.column === hoverColumn && prev.side === side)
																return prev;
															return {column: hoverColumn, side};
														});
													}}
													onDrop={onTableHeaderDrop}
													onDragEnd={() => {
														setDraggingColumn(null);
														setDragPlaceholder(null);
													}}
												/>
											))}
											<th className="surface-muted border-b ui-border-default px-1 py-1 text-right">
												<Button
													type="button"
													variant="ghost"
													className="ui-surface-hover ui-hover-text-primary inline-flex h-6 w-6 items-center justify-center rounded-md ui-text-muted transition-colors"
													title={t('cloud_page.table.column_options')}
													aria-label={t('cloud_page.table.column_options')}
													onClick={(event) => {
														const rect = event.currentTarget.getBoundingClientRect();
														openTableHeadMenuAt(rect.right - 8, rect.bottom + 6);
													}}
												>
													<Settings size={13} />
												</Button>
											</th>
										</tr>
									</thead>
									<tbody>
										{nav.length > 1 && (
											<tr
												className={`border-b ui-border-default ${
													dragOverTargetToken === nav[nav.length - 2]?.token
														? 'chip-info'
														: 'ui-surface-hover'
												}`}
												onDragOver={(event) => onDragOverTarget(nav[nav.length - 2]?.token ?? null, event)}
												onDragLeave={() => onDragLeaveTarget(nav[nav.length - 2]?.token ?? null)}
												onDrop={(event) => onDropTarget(nav[nav.length - 2]?.token ?? null, event)}
											>
												{visibleTableColumns.map((column) => {
													if (column.key === 'name') {
														return (
															<td
																key={`parent-${column.key}`}
																className="px-3 py-2"
																style={{width: columnWidths.name}}
															>
																<Link
																	to={buildCloudLink(
																		selectedAccount.id,
																		nav.slice(0, -1),
																	)}
																	onClick={() => {
																		setPendingFolderToken('__parent__');
																		setItems([]);
																		setStatus(t('cloud_page.status.opening_parent_folder'));
																		setLoading(true);
																	}}
																	className="flex min-w-0 items-center gap-2 ui-text-primary hover:underline"
																>
																	<span className="shrink-0">
																		{renderCloudItemIcon(
																			{
																				id: '__parent__',
																				name: '..',
																				path: '..',
																				isFolder: true,
																				size: null,
																				createdAt: null,
																				modifiedAt: null,
																				mimeType: null,
																			},
																			15,
																		)}
																	</span>
																	<span className="truncate font-medium">..</span>
																</Link>
															</td>
														);
													}
													if (column.key === 'type') {
														return (
															<td
																key={`parent-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.type}}
															>
																{t('cloud_page.table.folder')}
															</td>
														);
													}
													if (column.key === 'size') {
														return (
															<td
																key={`parent-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.size}}
															>
																-
															</td>
														);
													}
													if (column.key === 'modified') {
														return (
															<td
																key={`parent-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.modified}}
															>
																-
															</td>
														);
													}
													return (
														<td
															key={`parent-${column.key}`}
															className="ui-text-muted px-3 py-2 text-xs"
															style={{width: columnWidths.created}}
														>
															-
														</td>
													);
												})}
												<td className="ui-text-muted px-2 py-2 text-right text-xs">{t('cloud_page.table.parent')}</td>
											</tr>
										)}
										{sortedItems.map((item) => (
											<tr
												key={item.id}
												ref={(node) => registerRowRef(item.id, node)}
												draggable
												className={`relative border-b ui-border-default ${
													dragOverTargetToken === item.path && item.isFolder
														? 'chip-info'
														: selectedItemIds.has(item.id)
															? 'event-selection'
															: 'ui-surface-hover'
												}`}
												onClick={(event) => onRowClick(item, event)}
												onDragStart={(event) => onRowDragStart(item, event)}
												onContextMenu={(event) => {
													event.preventDefault();
													setRowMenu({x: event.clientX, y: event.clientY, item});
												}}
												onDragOver={(event) => {
													if (!item.isFolder) return;
													onDragOverTarget(item.path, event);
												}}
												onDragLeave={() => {
													if (!item.isFolder) return;
													onDragLeaveTarget(item.path);
												}}
												onDrop={(event) => {
													if (!item.isFolder) return;
													onDropTarget(item.path, event);
												}}
											>
												{visibleTableColumns.map((column) => {
													if (column.key === 'name') {
														return (
															<td
																key={`${item.id}-${column.key}`}
																className="px-3 py-2 min-w-0"
																style={{width: columnWidths.name}}
															>
																{item.isFolder ? (
																	<Link
																		to={buildFolderLink(item)}
																		onClick={() => {
																			setPendingFolderToken(item.path);
																			setItems([]);
																			setStatus(t('cloud_page.status.opening_label', {label: item.name}));
																			setLoading(true);
																		}}
																		className="flex w-full min-w-0 items-center gap-2 ui-text-primary hover:underline"
																	>
																		{renderCloudItemIcon(item, 15)}
																		<span className="min-w-0 flex-1 truncate">
																			{item.name}
																		</span>
																	</Link>
																) : (
																	<Button
																		type="button"
																		className="flex w-full min-w-0 items-center gap-2 text-left ui-text-primary"
																		onClick={(event) => onFileNameClick(item, event)}
																		onDoubleClick={(event) => {
																			event.stopPropagation();
																			void onViewItem(item);
																		}}
																	>
																		{renderCloudItemIcon(item, 15)}
																		<span className="min-w-0 flex-1 truncate">
																			{item.name}
																		</span>
																	</Button>
																)}
															</td>
														);
													}
													if (column.key === 'type') {
														return (
															<td
																key={`${item.id}-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.type}}
															>
																{item.isFolder ? t('cloud_page.table.folder') : t('cloud_page.table.file')}
															</td>
														);
													}
													if (column.key === 'size') {
														return (
															<td
																key={`${item.id}-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.size}}
															>
																{item.isFolder ? '-' : formatBytes(item.size ?? 0)}
															</td>
														);
													}
													if (column.key === 'modified') {
														return (
															<td
																key={`${item.id}-${column.key}`}
																className="ui-text-muted px-3 py-2 text-xs"
																style={{width: columnWidths.modified}}
															>
																{formatSystemDateTime(item.modifiedAt) || '-'}
															</td>
														);
													}
													return (
														<td
															key={`${item.id}-${column.key}`}
															className="ui-text-muted px-3 py-2 text-xs"
															style={{width: columnWidths.created}}
														>
															{formatSystemDateTime(item.createdAt) || '-'}
														</td>
													);
												})}
												<td className="relative px-2 py-2 text-right">
													<Button
														type="button"
														variant="outline"
														className="inline-flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-50"
														title={t('cloud_page.action.actions')}
														aria-label={t('cloud_page.action.actions_for', {name: item.name})}
														onClick={(event) => {
															const rect = event.currentTarget.getBoundingClientRect();
															setRowMenu({x: rect.right - 8, y: rect.bottom + 6, item});
														}}
														disabled={
															mutating ||
															activeFileActionId !== null ||
															deletingItemId === item.id
														}
													>
														{deletingItemId === item.id ? (
															<Loader2 size={14} className="animate-spin" />
														) : (
															<MoreHorizontal size={14} />
														)}
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}
					</div>
					{selectedAccount && detailsItem && !detailsItem.isFolder && (
						<aside className="w-[320px] shrink-0 border-l ui-border-default ui-surface-card">
							<div className="flex h-full min-h-0 flex-col">
								<div className="flex items-center justify-between gap-2 border-b ui-border-default px-4 py-3">
									<div className="flex min-w-0 items-center gap-2">
										{renderCloudItemIcon(detailsItem, 16)}
										<h3 className="ui-text-primary truncate text-sm font-semibold">{detailsItem.name}</h3>
									</div>
									<Button
										type="button"
										variant="ghost"
										className="h-7 w-7 rounded-md"
										title={t('cloud_page.action.close_details')}
										onClick={() => setDetailsItemId(null)}
									>
										<X size={14} />
									</Button>
								</div>
								<div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3 text-xs">
									<div className="space-y-2">
										<div className="flex justify-between gap-2">
											<span className="ui-text-muted">{t('cloud_page.field.type')}</span>
											<span className="ui-text-primary">{t('cloud_page.table.file')}</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="ui-text-muted">{t('cloud_page.field.size')}</span>
											<span className="ui-text-primary">{formatBytes(detailsItem.size ?? 0)}</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="ui-text-muted">{t('cloud_page.field.modified')}</span>
											<span className="ui-text-primary">
												{formatSystemDateTime(detailsItem.modifiedAt) || '-'}
											</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="ui-text-muted">{t('cloud_page.field.created')}</span>
											<span className="ui-text-primary">
												{formatSystemDateTime(detailsItem.createdAt) || '-'}
											</span>
										</div>
									</div>
									<div className="rounded-md border ui-border-default p-2">
										<div className="ui-text-muted mb-1">{t('cloud_page.field.path')}</div>
										<div className="ui-text-secondary break-all">{detailsItem.path}</div>
									</div>
								</div>
								<div className="border-t ui-border-default p-3">
									<div className="grid grid-cols-2 gap-2">
										<Button
											type="button"
											variant="secondary"
											className="h-8 rounded-md text-xs font-medium"
											disabled={mutating || activeFileActionId !== null || deletingItemId !== null}
											onClick={() => void onViewItem(detailsItem)}
											leftIcon={<Eye size={14} />}
										>
											<span className="ml-0.5">{t('cloud_page.action.open')}</span>
										</Button>
										<Button
											type="button"
											variant="secondary"
											className="h-8 rounded-md text-xs font-medium"
											disabled={mutating || activeFileActionId !== null || deletingItemId !== null}
											onClick={() => void onDownloadItem(detailsItem)}
											leftIcon={<Download size={14} />}
										>
											<span className="ml-0.5">{t('cloud_page.action.download')}</span>
										</Button>
										<Button
											type="button"
											variant="secondary"
											className="h-8 rounded-md text-xs font-medium"
											disabled={mutating || deletingItemId !== null}
											onClick={() => void onShareItem(detailsItem)}
											leftIcon={<Share2 size={14} />}
										>
											<span className="ml-0.5">{t('cloud_page.action.share')}</span>
										</Button>
										<Button
											type="button"
											variant="danger"
											className="h-8 rounded-md text-xs disabled:opacity-60"
											disabled={deletingItemId !== null}
											onClick={() => void onDeleteItem(detailsItem)}
											leftIcon={
												deletingItemId === detailsItem.id ? (
													<Loader2 size={14} className="animate-spin" />
												) : (
													<Trash2 size={14} />
												)
											}
										>
											<span className="ml-0.5">
												{deletingItemId === detailsItem.id ? t('cloud_page.status.deleting') : t('cloud_page.action.delete')}
											</span>
										</Button>
									</div>
								</div>
							</div>
						</aside>
					)}
				</div>
			</WorkspaceLayout>
			{rowMenu && (
				<ContextMenu
					ref={rowMenuRef}
					size="md"
					layer="1015"
					position={rowMenuPosition}
					ready={rowMenuReady}
					onRequestClose={() => setRowMenu(null)}
					onClick={(event) => event.stopPropagation()}
				>
					{!rowMenu.item.isFolder && (
						<>
							<ContextMenuItem type="button" onClick={() => void onViewItem(rowMenu.item)}>
								<Eye size={14} />
								{t('cloud_page.action.view')}
							</ContextMenuItem>
							<ContextMenuItem type="button" onClick={() => void onDownloadItem(rowMenu.item)}>
								<Download size={14} />
								{t('cloud_page.action.download')}
							</ContextMenuItem>
						</>
					)}
					<ContextMenuItem type="button" onClick={() => void onShareItem(rowMenu.item)}>
						<Share2 size={14} />
						{t('cloud_page.action.share')}
					</ContextMenuItem>
					<ContextMenuItem
						type="button"
						danger
						className="disabled:opacity-60"
						onClick={() => void onDeleteItem(rowMenu.item)}
						disabled={deletingItemId !== null}
					>
								{deletingItemId === rowMenu.item.id ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Trash2 size={14} />
								)}
								{deletingItemId === rowMenu.item.id ? t('cloud_page.status.deleting') : t('cloud_page.action.delete')}
							</ContextMenuItem>
				</ContextMenu>
			)}

			{tableHeadMenu && (
				<ContextMenu
					ref={tableHeadMenuRef}
					size="lg"
					layer="1015"
					position={tableHeadMenuPosition}
					ready={tableHeadMenuReady}
					onRequestClose={() => setTableHeadMenu(null)}
					onClick={(event) => event.stopPropagation()}
				>
					<ContextMenuLabel>{t('cloud_page.table.columns')}</ContextMenuLabel>
					{CLOUD_TABLE_COLUMN_OPTIONS.map((column) => {
						const checked = tableColumns.includes(column.key);
						return (
							<ContextMenuItem
								key={column.key}
								type="button"
								align="between"
								onClick={() => toggleTableColumn(column.key)}
							>
								<span>{column.label}</span>
								<span
									className={`context-menu-checkmark ${checked ? 'text-success' : 'text-transparent'}`}
									aria-hidden={!checked}
								>
									✓
								</span>
							</ContextMenuItem>
						);
					})}
					<ContextMenuSeparator />
					<ContextMenuItem type="button" onClick={() => resetTableColumns()}>
						{t('cloud_page.table.reset_columns')}
					</ContextMenuItem>
				</ContextMenu>
			)}

			{accountMenu && (
				<ContextMenu
					ref={accountMenuRef}
					size="lg"
					layer="1000"
					position={accountMenuPosition}
					ready={accountMenuReady}
					onRequestClose={() => setAccountMenu(null)}
					onClick={(event) => event.stopPropagation()}
				>
					<ContextMenuItem
						type="button"
						onClick={() => {
							navigateToAccount(accountMenu.account, false);
							setAccountMenu(null);
						}}
					>
						{t('cloud_page.action.open')}
					</ContextMenuItem>
					<ContextMenuItem type="button" onClick={() => onOpenAccountInNewWindow(accountMenu.account)}>
						{t('cloud_page.action.open_in_new_window')}
					</ContextMenuItem>
					<ContextMenuItem type="button" onClick={() => void onRefreshAccount(accountMenu.account)}>
						{t('cloud_page.action.refresh')}
					</ContextMenuItem>
					{isOAuthCloudProvider(accountMenu.account.provider) && (
						<ContextMenuItem
							type="button"
							onClick={() => void onRelinkAccount(accountMenu.account)}
							disabled={relinkingAccountId === accountMenu.account.id}
						>
							{relinkingAccountId === accountMenu.account.id ? (
								<Loader2 size={14} className="animate-spin" />
							) : (
								<Cloud size={14} />
							)}
							{relinkingAccountId === accountMenu.account.id ? t('cloud_page.status.reconnecting') : t('cloud_page.action.reconnect_account')}
						</ContextMenuItem>
					)}
					<ContextMenuItem type="button" onClick={() => onOpenAccountSettings(accountMenu.account)}>
						{t('cloud_page.action.edit_account')}
					</ContextMenuItem>
					<ContextMenuItem type="button" danger onClick={() => void onDeleteAccount(accountMenu.account)}>
						{t('cloud_page.action.delete_account')}
					</ContextMenuItem>
					</ContextMenu>
				)}

			{showAddModal && (
				<Modal
					open
					onClose={() => setShowAddModal(false)}
					backdropClassName="z-[1000] backdrop-blur-[1px]"
					contentClassName="max-w-lg p-4"
				>
					<div className="mb-3 flex items-start justify-between">
						<div>
							<h3 className="ui-text-primary text-base font-semibold">{t('cloud_page.modal.add_account.title')}</h3>
							<p className="ui-text-muted mt-1 text-xs">
								{t('cloud_page.modal.add_account.subtitle')}
							</p>
						</div>
						<Cloud size={18} className="icon-muted" />
					</div>
					<div className="space-y-3">
						<Field
							label={t('cloud_page.field.provider')}
							as="select"
							value={draft.provider}
							onChange={(next) => setDraft((prev) => ({...prev, provider: next as CloudProvider}))}
							options={[
								{value: 'nextcloud', label: t('cloud_page.provider.nextcloud_webdav')},
								{value: 'webdav', label: t('cloud_page.provider.generic_webdav')},
								{value: 'google-drive', label: t('cloud_page.provider.google_drive_oauth')},
								{value: 'onedrive', label: t('cloud_page.provider.onedrive_oauth')},
							]}
						/>
						{!isOAuthProviderDraft && (
							<Field
								label={t('cloud_page.field.account_name')}
								value={draft.name}
								onChange={(next) => setDraft((prev) => ({...prev, name: next}))}
								placeholder={t('cloud_page.placeholder.personal_drive')}
							/>
						)}
						{requiresWebDavBaseUrlFields && (
							<>
								<Field
									label={t('cloud_page.field.webdav_url')}
									value={draft.base_url || ''}
									onChange={(next) => setDraft((prev) => ({...prev, base_url: next}))}
									placeholder={t('cloud_page.placeholder.webdav_url')}
								/>
							</>
						)}
						{requiresWebDavAuthFields && (
							<Field
								label={t('cloud_page.field.username')}
								value={draft.user || ''}
								onChange={(next) => setDraft((prev) => ({...prev, user: next}))}
								placeholder={t('cloud_page.placeholder.username')}
							/>
						)}
						{requiresWebDavAuthFields && (
							<Field
								label={secretLabel}
								value={draft.secret}
								onChange={(next) => setDraft((prev) => ({...prev, secret: next}))}
								placeholder={t('cloud_page.placeholder.app_password')}
								type="password"
							/>
						)}
						{isOAuthProviderDraft && (
							<p className="ui-text-muted rounded-md border border-dashed p-3 text-xs">
								{t('cloud_page.modal.add_account.oauth_hint')}
							</p>
						)}
						{adding && isOAuthProviderDraft && (
							<div className="ui-text-secondary flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
								<Loader2 size={14} className="animate-spin" />
								<span>{t('cloud_page.modal.add_account.oauth_waiting')}</span>
							</div>
						)}
					</div>
					<div className="mt-4 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setShowAddModal(false)}
						>
							{t('cloud_page.action.cancel')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							disabled={adding || !canSubmitAddDraft}
							onClick={() => {
								void onAddCloudAccount();
							}}
						>
							{adding
								? t('cloud_page.status.adding')
								: isOAuthProviderDraft
									? t('cloud_page.action.connect_oauth')
									: t('cloud_page.modal.add_account.title')}
						</Button>
					</div>
				</Modal>
			)}
			{showEditModal && editDraft && (
				<Modal
					open
					onClose={() => {
						setShowEditModal(false);
						setEditDraft(null);
					}}
					backdropClassName="z-[1000] backdrop-blur-[1px]"
					contentClassName="max-w-lg p-4"
				>
					<div className="mb-3 flex items-start justify-between">
						<div>
							<h3 className="ui-text-primary text-base font-semibold">{t('cloud_page.modal.edit_account.title')}</h3>
							<p className="ui-text-muted mt-1 text-xs">
								{t('cloud_page.modal.edit_account.subtitle')}
							</p>
						</div>
						<Settings size={18} className="icon-muted" />
					</div>
					<div className="space-y-3">
						<Field
							label={t('cloud_page.field.provider')}
							as="select"
							value={editDraft.provider}
							onChange={() => undefined}
							options={[{value: editDraft.provider, label: providerLabels[editDraft.provider]}]}
						/>
						<Field
							label={t('cloud_page.field.account_name')}
							value={editDraft.name}
							onChange={(next) => setEditDraft((prev) => (prev ? {...prev, name: next} : prev))}
							placeholder={t('cloud_page.placeholder.personal_drive')}
						/>
						{editRequiresWebDavBaseUrlFields && (
							<Field
								label={t('cloud_page.field.webdav_url')}
								value={editDraft.base_url}
								onChange={(next) =>
									setEditDraft((prev) =>
										prev
											? {
													...prev,
													base_url: next,
												}
											: prev,
									)
								}
								placeholder={t('cloud_page.placeholder.webdav_url')}
							/>
						)}
						{editRequiresWebDavAuthFields && (
							<Field
								label={t('cloud_page.field.username')}
								value={editDraft.user}
								onChange={(next) =>
									setEditDraft((prev) =>
										prev
											? {
													...prev,
													user: next,
												}
											: prev,
									)
								}
								placeholder={t('cloud_page.placeholder.username')}
							/>
						)}
						<Field
							label={t('cloud_page.field.secret_optional')}
							value={editDraft.secret}
							onChange={(next) => setEditDraft((prev) => (prev ? {...prev, secret: next} : prev))}
							placeholder={t('cloud_page.placeholder.leave_secret_unchanged')}
							type="password"
						/>
					</div>
					<div className="mt-4 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => {
								setShowEditModal(false);
								setEditDraft(null);
							}}
						>
							{t('cloud_page.action.cancel')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							disabled={savingEdit || !editDraft.name.trim()}
							onClick={() => void onSaveEditedAccount()}
						>
							{savingEdit ? t('cloud_page.status.saving') : t('cloud_page.action.save')}
						</Button>
					</div>
				</Modal>
			)}
			{showCreateFolderModal && (
				<Modal
					open
					onClose={() => {
						setShowCreateFolderModal(false);
						setNewFolderName('');
					}}
					backdropClassName="z-[1000] backdrop-blur-[1px]"
					contentClassName="max-w-md p-4"
				>
					<h3 className="ui-text-primary text-base font-semibold">{t('cloud_page.modal.create_folder.title')}</h3>
					<div className="mt-3">
						<Field
							label={t('cloud_page.field.folder_name')}
							value={newFolderName}
							onChange={setNewFolderName}
							placeholder={t('cloud_page.placeholder.new_folder')}
						/>
					</div>
					<div className="mt-4 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => {
								setShowCreateFolderModal(false);
								setNewFolderName('');
							}}
						>
							{t('cloud_page.action.cancel')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
							disabled={!newFolderName.trim() || mutating}
							onClick={() => {
								const targetName = newFolderName.trim();
								setShowCreateFolderModal(false);
								setNewFolderName('');
								void onCreateFolder(targetName);
							}}
						>
							{t('cloud_page.action.create')}
						</Button>
					</div>
				</Modal>
			)}
			{shareModal && (
				<Modal
					open
					onClose={() => setShareModal(null)}
					backdropClassName="z-[1000] backdrop-blur-[1px]"
					contentClassName="max-w-xl p-4"
				>
					<div className="mb-3 flex items-start justify-between gap-3">
						<div>
							<h3 className="ui-text-primary text-base font-semibold">{t('cloud_page.modal.share_link.title')}</h3>
							<p className="ui-text-muted mt-1 text-xs">{shareModal.name}</p>
						</div>
					</div>
					<div className="surface-muted rounded-md border ui-border-default p-2">
						<p className="ui-text-secondary break-all text-xs">{shareModal.url}</p>
					</div>
					<div className="mt-4 flex items-center justify-between gap-2">
						<Button
							type="button"
							variant="outline"
							className="rounded-md px-3 py-2 text-sm"
							onClick={() => setShareModal(null)}
						>
							{t('cloud_page.action.close')}
						</Button>
						<Button
							type="button"
							variant="default"
							className="rounded-md px-3 py-2 text-sm font-medium"
							onClick={() => {
								void navigator.clipboard
									.writeText(shareModal.url)
									.then(() => {
										setStatus(t('cloud_page.status.share_copied'));
									})
									.catch((error: any) => {
										setStatus(t('cloud_page.status.copy_failed', {error: error?.message || String(error)}));
									});
							}}
						>
							{t('cloud_page.action.copy_link')}
						</Button>
					</div>
				</Modal>
			)}
		</div>
	);
}
