import {Button} from './components/ui/button';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, Bug, CalendarDays, CircleHelp, Cloud, Copy, Download, Mail, Minus, Settings, Square, Users, X} from 'lucide-react';
import {
	closestCenter,
	DndContext,
	DragOverlay,
	type DragEndEvent,
	type DragStartEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {arrayMove, SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {HashRouter, Navigate, Route, Routes, useLocation, useNavigate} from 'react-router-dom';
import MailPage from './pages/MailPage';
import DebugConsolePage from './pages/DebugConsolePage';
import SupportPage from './pages/SupportPage';
import llamaLogo from '../resources/llamatray.png';
import {DEFAULT_APP_SETTINGS} from '../shared/defaults';
import {APP_NAME} from '../shared/appConfig';
import SettingsRoute from './routes/SettingsRoute';
import NavRailItem from './components/navigation/NavRailItem';
import ContactsRoute from './routes/ContactsRoute';
import CalendarRoute from './routes/CalendarRoute';
import {useAccounts} from './hooks/ipc/useAccounts';
import {useAutoUpdateState} from './hooks/ipc/useAutoUpdateState';
import {useWindowControlsState} from './hooks/ipc/useWindowControlsState';
import {useAppSettings} from './hooks/ipc/useAppSettings';
import {useIpcEvent} from './hooks/ipc/useIpcEvent';
import {ipcClient} from './lib/ipcClient';
import type {AppSettings, GlobalErrorEvent} from '../shared/ipcTypes';
import CloudFilesPage from './pages/CloudFilesPage';
import type {SendEmailBackgroundStatusEvent, SyncStatusEvent} from '../preload';

type TopNavItemId = AppSettings['navRailOrder'][number];
type TopNavItemDef = {
	id: TopNavItemId;
	to: string;
	label: string;
	icon: React.ReactNode;
	badgeCount?: number;
};

type SystemFailureToast = {
	id: string;
	title: string;
	message: string;
	key: string;
	timestampMs: number;
	accountId?: number;
};

type MainNavContextItemId = TopNavItemId | 'settings' | 'debug' | 'help';
type MainNavContextMenuState = {
	id: MainNavContextItemId;
	label: string;
	to: string;
	x: number;
	y: number;
};

const DEFAULT_TOP_NAV_ORDER: TopNavItemId[] = ['email', 'contacts', 'calendar', 'cloud'];

function isTopNavItemId(value: unknown): value is TopNavItemId {
	return value === 'email' || value === 'contacts' || value === 'calendar' || value === 'cloud';
}

function normalizeTopNavOrder(input: unknown): TopNavItemId[] {
	const source = Array.isArray(input) ? input : [];
	const normalized: TopNavItemId[] = [];
	for (const item of source) {
		if (!isTopNavItemId(item)) continue;
		if (normalized.includes(item)) continue;
		normalized.push(item);
	}
	for (const item of DEFAULT_TOP_NAV_ORDER) {
		if (!normalized.includes(item)) normalized.push(item);
	}
	return normalized;
}

function toTopNavSortableId(id: TopNavItemId): string {
	return `topnav-${id}`;
}

function parseTopNavSortableId(id: string): TopNavItemId | null {
	if (!id.startsWith('topnav-')) return null;
	const value = id.slice('topnav-'.length);
	return isTopNavItemId(value) ? value : null;
}

type SortableTopNavItemProps = {
	item: TopNavItemDef;
	onContextMenu: (event: React.MouseEvent<HTMLDivElement>, item: TopNavItemDef) => void;
};

function SortableTopNavItem({
	item,
	onContextMenu,
}: SortableTopNavItemProps) {
	const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
		id: toTopNavSortableId(item.id),
		data: {kind: 'topnav', id: item.id, label: item.label},
	});
	return (
		<div
			ref={setNodeRef}
			onContextMenu={(event) => onContextMenu(event, item)}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.2 : 1,
			}}
			{...attributes}
			{...listeners}
		>
			<NavRailItem to={item.to} icon={item.icon} label={item.label} badgeCount={item.badgeCount}/>
		</div>
	);
}

function TopNavEndDrop() {
	const {setNodeRef} = useDroppable({
		id: 'topnav-end',
		data: {kind: 'topnav-end'},
	});
	return <div ref={setNodeRef} className="h-12 w-full"/>;
}

export default function MainWindowApp() {
	return (
		<HashRouter>
			<MainWindowShell/>
		</HashRouter>
	);
}

function MainWindowShell() {
	const location = useLocation();
	const navigate = useNavigate();
	const {accounts, selectedAccountId, setSelectedAccountId, totalUnreadCount} = useAccounts();
	const {isMaximized, toggleMaximize, minimize, close} = useWindowControlsState();
	const {appVersion, autoUpdatePhase, autoUpdateMessage} = useAutoUpdateState();
	const {appSettings, setAppSettings, isFetched: appSettingsFetched} = useAppSettings(DEFAULT_APP_SETTINGS);
	const developerMode = Boolean(appSettings.developerMode);
	const showRouteOverlay = developerMode && Boolean(appSettings.developerShowRouteOverlay);
	const showSendNotifications = Boolean(appSettings.developerShowSendNotifications);
	const showSystemFailureNotifications = Boolean(appSettings.developerShowSystemFailureNotifications);
	const showDebugNavItem = developerMode && Boolean(appSettings.developerShowDebugNavItem);
	const [globalErrors, setGlobalErrors] = useState<GlobalErrorEvent[]>([]);
	const [restartBusy, setRestartBusy] = useState(false);
	const [topNavOrder, setTopNavOrder] = useState<TopNavItemId[]>(() =>
		normalizeTopNavOrder(appSettings.navRailOrder),
	);
	const [draggingTopNavItemId, setDraggingTopNavItemId] = useState<TopNavItemId | null>(null);
	const [topNavOverlaySize, setTopNavOverlaySize] = useState<{width: number; height: number} | null>(null);
    const [sendStatus, setSendStatus] = useState<SendEmailBackgroundStatusEvent | null>(null);
	const [systemFailureToasts, setSystemFailureToasts] = useState<SystemFailureToast[]>([]);
	const [mainNavContextMenu, setMainNavContextMenu] = useState<MainNavContextMenuState | null>(null);
	const mainNavContextMenuRef = useRef<HTMLDivElement | null>(null);
	const topNavSensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
	const topNavSortableIds = useMemo(() => topNavOrder.map((id) => toTopNavSortableId(id)), [topNavOrder]);

	const pushGlobalError = (entry: GlobalErrorEvent) => {
		setGlobalErrors((prev) => {
			const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
			return next.slice(0, 5);
		});
	};

	const dismissGlobalError = (id: string) => {
		setGlobalErrors((prev) => prev.filter((item) => item.id !== id));
	};

	const pushSystemFailureToast = (notice: {title: string; message: string; key: string; accountId?: number}) => {
		const now = Date.now();
		setSystemFailureToasts((prev) => {
			const duplicate = prev.some(
				(item) => item.key === notice.key && now - item.timestampMs < 5000,
			);
			if (duplicate) return prev;
			const next: SystemFailureToast = {
				id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
				title: notice.title,
				message: notice.message,
				key: notice.key,
				timestampMs: now,
			};
			return [next, ...prev].slice(0, 4);
		});
	};

	const dismissSystemFailureToast = (id: string) => {
		setSystemFailureToasts((prev) => prev.filter((item) => item.id !== id));
	};

	useIpcEvent(ipcClient.onGlobalError, pushGlobalError);
	useIpcEvent(ipcClient.onSendEmailBackgroundStatus, (payload) => {
		if (!showSendNotifications) return;
		setSendStatus(payload);
	});
	useIpcEvent(ipcClient.onAccountSyncStatus, (payload: SyncStatusEvent) => {
		if (!showSystemFailureNotifications) return;
		if (payload.status !== 'error') return;
		const accountName =
			accounts.find((item) => item.id === payload.accountId)?.display_name?.trim() ||
			accounts.find((item) => item.id === payload.accountId)?.email ||
			`Account ${payload.accountId}`;
		const errorText = String(payload.error || 'Unknown sync error').trim();
		const isAuthFailure = /(authentication|auth|password|credential|login|invalid credentials)/i.test(errorText);
		pushSystemFailureToast({
			title: isAuthFailure ? 'Authentication failed' : 'Sync failed',
			message: `${accountName}: ${errorText}`,
			key: `${isAuthFailure ? 'auth' : 'sync'}:${payload.accountId}:${errorText}`,
			accountId: isAuthFailure ? payload.accountId : undefined,
		});
	});

	useEffect(() => {
		if (!showSendNotifications && sendStatus) {
			setSendStatus(null);
		}
	}, [showSendNotifications, sendStatus]);

	useEffect(() => {
		if (!showSystemFailureNotifications && systemFailureToasts.length > 0) {
			setSystemFailureToasts([]);
		}
	}, [showSystemFailureNotifications, systemFailureToasts.length]);

	useEffect(() => {
		if (!mainNavContextMenu) return;
		const onWindowClick = () => setMainNavContextMenu(null);
		const onWindowContextMenu = () => setMainNavContextMenu(null);
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setMainNavContextMenu(null);
		};
		window.addEventListener('click', onWindowClick);
		window.addEventListener('contextmenu', onWindowContextMenu);
		window.addEventListener('keydown', onEscape);
		return () => {
			window.removeEventListener('click', onWindowClick);
			window.removeEventListener('contextmenu', onWindowContextMenu);
			window.removeEventListener('keydown', onEscape);
		};
	}, [mainNavContextMenu]);

	useEffect(() => {
		setMainNavContextMenu(null);
	}, [location.pathname, location.search]);

	useEffect(() => {
		if (!sendStatus) return;
        if (sendStatus.phase !== 'sent' && sendStatus.phase !== 'failed') return;
        const timer = window.setTimeout(() => {
            setSendStatus((prev) => (prev?.jobId === sendStatus.jobId ? null : prev));
        }, 4200);
        return () => window.clearTimeout(timer);
	}, [sendStatus]);

	useEffect(() => {
		if (systemFailureToasts.length === 0) return;
		const timers = systemFailureToasts.map((item) =>
			window.setTimeout(() => {
				dismissSystemFailureToast(item.id);
			}, 6500),
		);
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [systemFailureToasts]);

    useEffect(() => {
        const timers: number[] = [];
        const onPreview = () => {
            const jobId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const now = () => new Date().toISOString();
            setSendStatus({
                jobId,
                accountId: -1,
                phase: 'queued',
                progress: 12,
                message: 'Queued email for background send...',
                error: null,
                timestamp: now(),
            });
            timers.push(
                window.setTimeout(() => {
                    setSendStatus({
                        jobId,
                        accountId: -1,
                        phase: 'sending',
                        progress: 62,
                        message: 'Sending email...',
                        error: null,
                        timestamp: now(),
                    });
                }, 450),
            );
            timers.push(
                window.setTimeout(() => {
                    setSendStatus({
                        jobId,
                        accountId: -1,
                        phase: 'sent',
                        progress: 100,
                        message: 'Email sent successfully.',
                        error: null,
                        timestamp: now(),
                    });
                }, 1200),
            );
        };
        window.addEventListener('llamamail:preview-send-notification', onPreview);
		const onPreviewSyncFailure = () => {
			pushSystemFailureToast({
				title: 'Sync failed',
				message: 'Demo Account: Mailbox sync failed (timeout while fetching folder state).',
				key: `preview-sync-failure-${Date.now()}`,
			});
		};
		const onPreviewAuthFailure = () => {
			const accountId = accounts[0]?.id ?? 1;
			pushSystemFailureToast({
				title: 'Authentication failed',
				message: 'Demo Account: Invalid credentials. Password or authentication may have changed.',
				key: `preview-auth-failure-${Date.now()}`,
				accountId,
			});
		};
		window.addEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
		window.addEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
        return () => {
            window.removeEventListener('llamamail:preview-send-notification', onPreview);
			window.removeEventListener('llamamail:preview-sync-failure', onPreviewSyncFailure);
			window.removeEventListener('llamamail:preview-auth-failure', onPreviewAuthFailure);
            for (const timer of timers) window.clearTimeout(timer);
        };
    }, [accounts]);

	useEffect(() => {
		const onWindowError = (event: ErrorEvent) => {
			pushGlobalError({
				id: `renderer-window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message: event.message || 'Unexpected renderer error',
				detail: event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection');
			pushGlobalError({
				id: `renderer-rejection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				source: 'renderer-window',
				message,
				detail: reason instanceof Error ? reason.stack : null,
				timestamp: new Date().toISOString(),
				fatal: false,
			});
		};
		window.addEventListener('error', onWindowError);
		window.addEventListener('unhandledrejection', onUnhandledRejection);
		return () => {
			window.removeEventListener('error', onWindowError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
		};
	}, []);

	useEffect(() => {
		if (globalErrors.length === 0) return;
		const timer = window.setTimeout(() => {
			const oldest = globalErrors[globalErrors.length - 1];
			if (oldest) {
				dismissGlobalError(oldest.id);
			}
		}, 15000);
		return () => {
			window.clearTimeout(timer);
		};
	}, [globalErrors]);

	const pageTitle = useMemo(() => {
		const path = location.pathname || '/';
		if (path.startsWith('/contacts')) return 'Contacts';
		if (path.startsWith('/calendar')) return 'Calendar';
		if (path.startsWith('/cloud')) return 'Cloud';
		if (path.startsWith('/settings')) return 'Settings';
		if (path.startsWith('/debug')) return 'Debug';
		if (path.startsWith('/help')) return 'Help';
		return 'Mail';
	}, [location.pathname]);

	useEffect(() => {
		setTopNavOrder(normalizeTopNavOrder(appSettings.navRailOrder));
	}, [appSettings.navRailOrder]);

	const topNavItems = useMemo<TopNavItemDef[]>(() => {
		const all: Record<TopNavItemId, TopNavItemDef> = {
			email: {id: 'email', to: '/email', label: 'Mail', icon: <Mail size={18}/>, badgeCount: totalUnreadCount},
			contacts: {id: 'contacts', to: '/contacts', label: 'Contacts', icon: <Users size={18}/>},
			calendar: {id: 'calendar', to: '/calendar', label: 'Calendar', icon: <CalendarDays size={18}/>},
			cloud: {id: 'cloud', to: '/cloud', label: 'Cloud', icon: <Cloud size={18}/>},
		};
		return topNavOrder.map((id) => all[id]).filter(Boolean);
	}, [topNavOrder, totalUnreadCount]);
	const draggingTopNavItem = useMemo(
		() => (draggingTopNavItemId === null ? null : topNavItems.find((item) => item.id === draggingTopNavItemId) ?? null),
		[topNavItems, draggingTopNavItemId],
	);

	const persistTopNavOrder = (nextOrder: TopNavItemId[]) => {
		setTopNavOrder(nextOrder);
		setAppSettings((prev) => ({...prev, navRailOrder: nextOrder}));
		void ipcClient.updateAppSettings({navRailOrder: nextOrder}).catch(() => undefined);
	};

	const onTopNavDragStart = (event: DragStartEvent) => {
		const id = parseTopNavSortableId(String(event.active.id));
		if (!id) return;
		setDraggingTopNavItemId(id);
		const initialRect = event.active.rect.current.initial;
		if (initialRect) {
			setTopNavOverlaySize({width: initialRect.width, height: initialRect.height});
		} else {
			setTopNavOverlaySize(null);
		}
	};

	const onTopNavDragEnd = (event: DragEndEvent) => {
		const activeId = parseTopNavSortableId(String(event.active.id));
		if (!activeId) {
			setDraggingTopNavItemId(null);
			setTopNavOverlaySize(null);
			return;
		}
		const sourceIndex = topNavOrder.indexOf(activeId);
		if (sourceIndex < 0) {
			setDraggingTopNavItemId(null);
			setTopNavOverlaySize(null);
			return;
		}
		let targetIndex = sourceIndex;
		if (!event.over) {
			targetIndex = Math.max(0, topNavOrder.length - 1);
		} else if (event.over.id === 'topnav-end') {
			targetIndex = Math.max(0, topNavOrder.length - 1);
		} else {
			const overId = parseTopNavSortableId(String(event.over.id));
			if (!overId) {
				setDraggingTopNavItemId(null);
				setTopNavOverlaySize(null);
				return;
			}
			const overIndex = topNavOrder.indexOf(overId);
			if (overIndex >= 0) targetIndex = overIndex;
		}
		if (targetIndex !== sourceIndex) {
			persistTopNavOrder(arrayMove(topNavOrder, sourceIndex, targetIndex));
		}
		setDraggingTopNavItemId(null);
		setTopNavOverlaySize(null);
	};

	useEffect(() => {
		document.title = pageTitle;
	}, [pageTitle]);

	const hasUpdateIndicator =
		autoUpdatePhase === 'available' || autoUpdatePhase === 'downloading' || autoUpdatePhase === 'downloaded';
	const updateIndicatorTitle =
		autoUpdateMessage ||
		(autoUpdatePhase === 'downloaded'
			? 'Update downloaded. Open settings to install.'
			: autoUpdatePhase === 'downloading'
				? 'Update downloading. Open settings for details.'
				: 'Update available. Open settings for details.');
	const showUpdateBanner = hasUpdateIndicator;
	const updateBannerText =
		autoUpdateMessage ||
		(autoUpdatePhase === 'downloaded'
			? 'An update has been downloaded and is ready to install.'
			: autoUpdatePhase === 'downloading'
				? 'A new update is downloading in the background.'
				: 'A new update is available.');
	const useNativeTitleBar = Boolean(appSettings.useNativeTitleBar);
	const pendingRestartItems: string[] = [];
	if (appSettings.pendingHardwareAcceleration !== null) pendingRestartItems.push('Hardware acceleration');
	if (appSettings.pendingUseNativeTitleBar !== null) pendingRestartItems.push('Native titlebar');
	const hasRestartRequiredBanner = pendingRestartItems.length > 0;

	const onRestartNow = () => {
		if (restartBusy) return;
		setRestartBusy(true);
		void ipcClient.restartApp().catch(() => {
			setRestartBusy(false);
		});
	};

	const openMainNavContextMenu = (
		event: React.MouseEvent<HTMLDivElement>,
		item: {id: MainNavContextItemId; label: string; to: string},
	) => {
		event.preventDefault();
		event.stopPropagation();
		const menuWidth = 220;
		const menuHeight = item.id === 'debug' ? 92 : 56;
		const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
		const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
		setMainNavContextMenu({
			id: item.id,
			label: item.label,
			to: item.to,
			x: left,
			y: top,
		});
	};

	return (
		<div className="lm-shell flex h-screen w-screen flex-col overflow-hidden">
			{appSettingsFetched && !useNativeTitleBar && (
				<header
					className="lm-titlebar relative flex h-9 shrink-0 items-center justify-between px-2"
					style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
					onDoubleClick={() => {
						void toggleMaximize();
					}}
				>
					<div className="pointer-events-none flex min-w-0 flex-1 items-center justify-start gap-3">
						<div className="flex shrink-0 items-center gap-2 text-xs font-medium text-white/80">
							<img
								src={llamaLogo}
								alt=""
								className="h-5 w-5 object-contain contrast-125 saturate-125"
								style={{imageRendering: '-webkit-optimize-contrast'}}
								draggable={false}
							/>
							<span>{APP_NAME}</span>
							<span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
								{appVersion}
							</span>
						</div>
						<span aria-hidden className="h-3.5 w-px shrink-0 bg-white/25"/>
						<span className="block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-white/80">
							{pageTitle}
						</span>
					</div>
					<div
						className="flex w-24 shrink-0 items-center justify-end gap-1"
						style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
					>
						{hasUpdateIndicator && (
							<Button
								type="button"
								className="relative inline-flex h-7 w-7 items-center justify-center rounded text-amber-300/95 hover:bg-white/15 hover:text-amber-200"
								onClick={() => navigate('/settings/application')}
								title={updateIndicatorTitle}
								aria-label="Open update status"
							>
								<Download size={13}/>
								<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"/>
							</Button>
						)}
						<Button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
							onClick={() => void minimize()}
							title="Minimize"
							aria-label="Minimize"
						>
							<Minus size={14}/>
						</Button>
						<Button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
							onClick={() => void toggleMaximize()}
							title={isMaximized ? 'Restore' : 'Maximize'}
							aria-label={isMaximized ? 'Restore' : 'Maximize'}
						>
							{isMaximized ? <Copy size={13}/> : <Square size={13}/>}
						</Button>
						<Button
							type="button"
							className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-red-600 hover:text-white"
							onClick={() => void close()}
							title="Close"
							aria-label="Close"
						>
							<X size={14}/>
						</Button>
					</div>
				</header>
			)}
			{showUpdateBanner && (
				<div
					className="shrink-0 border-b border-amber-300 bg-amber-100 px-3 py-2 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/40 dark:text-amber-100">
					<div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
						<span className="text-sm font-medium">{updateBannerText}</span>
						<Button
							type="button"
							className="shrink-0 rounded-md border border-amber-500/60 bg-amber-200/70 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:border-amber-500/70 dark:bg-amber-700/40 dark:text-amber-100 dark:hover:bg-amber-700/60"
							onClick={() => navigate('/settings/application')}
						>
							Open update settings
						</Button>
					</div>
				</div>
			)}
			{globalErrors.length > 0 && (
				<div
					className="shrink-0 border-b border-red-300 bg-red-100 px-3 py-2 text-red-900 dark:border-red-700/70 dark:bg-red-900/35 dark:text-red-100">
					<div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2">
						{globalErrors.map((item) => (
							<div key={item.id} className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="truncate text-sm font-semibold">{item.message}</div>
									<div className="truncate text-xs opacity-80">
										{item.source} · {new Date(item.timestamp).toLocaleTimeString()}
									</div>
								</div>
								<Button
									type="button"
									className="shrink-0 rounded-md border border-red-500/60 bg-red-200/80 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-200 dark:border-red-500/70 dark:bg-red-700/40 dark:text-red-100 dark:hover:bg-red-700/60"
									onClick={() => dismissGlobalError(item.id)}
								>
									Dismiss
								</Button>
							</div>
						))}
					</div>
				</div>
			)}

				<div className="flex min-h-0 flex-1 overflow-hidden">
					<aside
						className="lm-nav-rail flex h-full w-16 shrink-0 flex-col items-center justify-between py-3">
						<DndContext
							sensors={topNavSensors}
							collisionDetection={closestCenter}
							onDragStart={onTopNavDragStart}
							onDragEnd={onTopNavDragEnd}
							onDragCancel={() => {
								setDraggingTopNavItemId(null);
								setTopNavOverlaySize(null);
							}}
						>
							<div className="relative flex w-full flex-col items-center">
								<SortableContext items={topNavSortableIds} strategy={verticalListSortingStrategy}>
									<div className="flex flex-col items-center gap-2">
										{topNavItems.map((item) => (
											<SortableTopNavItem
												key={item.id}
												item={item}
												onContextMenu={(event, navItem) =>
													openMainNavContextMenu(event, {
														id: navItem.id,
														label: navItem.label,
														to: navItem.to,
													})
												}
											/>
										))}
									</div>
								</SortableContext>
								{draggingTopNavItemId !== null && (
									<TopNavEndDrop/>
								)}
								</div>
							<DragOverlay dropAnimation={null}>
								{draggingTopNavItem && (
									<div
										style={
											topNavOverlaySize
												? {width: topNavOverlaySize.width, height: topNavOverlaySize.height}
												: undefined
										}
										className="lm-overlay rounded-lg opacity-85 shadow-xl"
									>
										<NavRailItem
											to={draggingTopNavItem.to}
											icon={draggingTopNavItem.icon}
											label={draggingTopNavItem.label}
											badgeCount={draggingTopNavItem.badgeCount}
										/>
									</div>
								)}
							</DragOverlay>
						</DndContext>
						<div className="flex w-full flex-col items-center gap-2">
							<div
								aria-hidden
							className="my-0.5 h-px w-9 bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/20"
						/>
						<div
							onContextMenu={(event) =>
								openMainNavContextMenu(event, {
									id: 'settings',
									label: 'Settings',
									to: '/settings/application',
								})
							}
						>
							<NavRailItem
								to="/settings/application"
								icon={<Settings size={16}/>}
								label="Settings"
								activePathPrefixes={['/settings']}
							/>
						</div>
						{showDebugNavItem && (
							<div
								onContextMenu={(event) =>
									openMainNavContextMenu(event, {
										id: 'debug',
										label: 'Debug',
										to: '/debug',
									})
								}
							>
								<NavRailItem to="/debug" icon={<Bug size={16}/>} label="Debug"/>
							</div>
						)}
						<div
							onContextMenu={(event) =>
								openMainNavContextMenu(event, {
									id: 'help',
									label: 'Help',
									to: '/help',
								})
							}
						>
							<NavRailItem to="/help" icon={<CircleHelp size={16}/>} label="Help"/>
						</div>
					</div>
				</aside>

				<main className="min-h-0 min-w-0 flex-1 overflow-hidden">
					<div className="flex h-full min-h-0 flex-col overflow-hidden">
						{hasRestartRequiredBanner && (
							<div className="shrink-0 border-b border-sky-300 bg-sky-100 px-3 py-2 text-sky-900 dark:border-sky-700/70 dark:bg-sky-900/40 dark:text-sky-100">
								<div className="flex w-full items-center justify-between gap-3">
									<span className="text-sm font-medium">
										Restart is required to apply: {pendingRestartItems.join(', ')}.
									</span>
									<Button
										type="button"
										className="shrink-0 rounded-md border border-sky-500/60 bg-sky-200/70 px-2.5 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-200 disabled:opacity-60 dark:border-sky-500/70 dark:bg-sky-700/40 dark:text-sky-100 dark:hover:bg-sky-700/60"
										onClick={onRestartNow}
										disabled={restartBusy}
									>
										{restartBusy ? 'Restarting...' : 'Restart now'}
									</Button>
								</div>
							</div>
						)}
						<div className="min-h-0 flex-1 overflow-hidden">
							<Routes>
								<Route path="/" element={<Navigate to="/email" replace/>}/>
								<Route path="/email" element={<MailPage/>}/>
								<Route path="/email/:accountId" element={<MailPage/>}/>
								<Route path="/email/:accountId/:folderId" element={<MailPage/>}/>
								<Route path="/email/:accountId/:folderId/:emailId" element={<MailPage/>}/>
								<Route path="/mail/*" element={<Navigate to="/email" replace/>}/>
								<Route path="/cloud" element={<CloudFilesPage/>}/>
								<Route
									path="/contacts"
									element={
										<ContactsRoute
											accountId={selectedAccountId}
											accounts={accounts}
											onSelectAccount={setSelectedAccountId}
										/>
									}
								/>
								<Route
									path="/calendar"
									element={
										<CalendarRoute
											accountId={selectedAccountId}
											accounts={accounts}
											onSelectAccount={setSelectedAccountId}
										/>
									}
								/>
								<Route path="/settings" element={<Navigate to="/settings/application" replace/>}/>
								<Route path="/settings/:tab" element={<SettingsRoute/>}/>
								<Route path="/settings/account/:accountId" element={<SettingsRoute/>}/>
								<Route
									path="/debug"
									element={showDebugNavItem ? <DebugConsolePage embedded/> : <Navigate to="/settings/developer" replace/>}
								/>
								<Route path="/help" element={<SupportPage embedded/>}/>
							</Routes>
						</div>
					</div>
				</main>
			</div>
			{showRouteOverlay && (
				<div
					className={`lm-overlay pointer-events-none fixed right-3 z-[1200] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-[var(--lm-text-secondary)] shadow-sm ${
                        sendStatus ? 'bottom-[5.25rem]' : 'bottom-3'
                    }`}>
					{`#${location.pathname}${location.search || ''}`}
				</div>
			)}
            {showSendNotifications && sendStatus && (
                <div className="lm-overlay fixed bottom-3 right-3 z-[1190] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md shadow-lg backdrop-blur">
                    <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {sendStatus.phase === 'failed' ? 'Send failed' : 'Sending email'}
                            </p>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {Math.max(0, Math.min(100, Math.round(sendStatus.progress)))}%
                            </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                            {sendStatus.error ? `${sendStatus.message} ${sendStatus.error}` : sendStatus.message}
                        </p>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200/90 dark:bg-[var(--lm-surface-progress-track-dark)]">
                        <div
                            className={`h-full transition-all duration-300 ease-out ${
                                sendStatus.phase === 'failed' ? 'bg-red-500' : 'bg-sky-500'
                            }`}
                            style={{width: `${Math.max(0, Math.min(100, sendStatus.progress))}%`}}
                        />
                    </div>
                </div>
            )}
			{showSystemFailureNotifications && systemFailureToasts.length > 0 && (
				<div
					className={`fixed right-3 z-[1188] flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col-reverse gap-2 ${
						sendStatus ? 'bottom-[6.8rem]' : 'bottom-3'
					}`}
				>
					{systemFailureToasts.map((toast) => (
						<div
							key={toast.id}
							role={toast.accountId ? 'button' : undefined}
							tabIndex={toast.accountId ? 0 : -1}
							onClick={() => {
								if (!toast.accountId) return;
								navigate(`/settings/account/${toast.accountId}`);
							}}
							onKeyDown={(event) => {
								if (!toast.accountId) return;
								if (event.key !== 'Enter' && event.key !== ' ') return;
								event.preventDefault();
								navigate(`/settings/account/${toast.accountId}`);
							}}
							className={`lm-overlay overflow-hidden rounded-md border-red-300 shadow-lg backdrop-blur dark:border-red-700/60 ${
								toast.accountId ? 'cursor-pointer' : ''
							}`}
						>
							<div className="px-3 py-2.5">
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-sm font-semibold text-red-700 dark:text-red-300">
										{toast.title}
									</p>
									<Button
										type="button"
										className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[var(--lm-surface-hover-dark)] dark:hover:text-slate-200"
										onClick={(event) => {
											event.stopPropagation();
											dismissSystemFailureToast(toast.id);
										}}
										aria-label="Dismiss sync error notification"
									>
										<X size={13}/>
									</Button>
								</div>
								<div className="mt-1 flex items-start gap-2">
									<AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400"/>
									<div className="min-w-0 flex-1">
										<p className="text-xs text-slate-700 dark:text-slate-200">{toast.message}</p>
										{toast.accountId && (
											<p className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">
												Click to open account settings
											</p>
										)}
									</div>
								</div>
							</div>
							<div className="h-1.5 w-full bg-red-500/85"/>
						</div>
					))}
				</div>
			)}
			{mainNavContextMenu && (
				<div
					ref={mainNavContextMenuRef}
					className="lm-context-menu fixed z-[1202] min-w-[220px] rounded-md p-1 shadow-xl"
					style={{left: mainNavContextMenu.x, top: mainNavContextMenu.y}}
					onClick={(event) => event.stopPropagation()}
					onContextMenu={(event) => event.preventDefault()}
				>
					<button
						type="button"
						className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-[var(--lm-text-secondary)] transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
						onClick={() => {
							navigate(mainNavContextMenu.to);
							setMainNavContextMenu(null);
						}}
					>
						Open {mainNavContextMenu.label}
					</button>
					{mainNavContextMenu.id === 'debug' && (
						<button
							type="button"
							className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-[var(--lm-text-secondary)] transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--lm-surface-active-dark)]"
							onClick={() => {
								void ipcClient.openDebugWindow();
								setMainNavContextMenu(null);
							}}
						>
							Open Debug In New Window
						</button>
					)}
				</div>
			)}
		</div>
	);
}
